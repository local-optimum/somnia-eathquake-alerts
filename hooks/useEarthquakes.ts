'use client'

import { useEffect, useRef, useCallback } from 'react'
import { encodeFunctionData, decodeFunctionResult } from 'viem'
import { EARTHQUAKE_SCHEMA_ID, PUBLISHER_ADDRESS } from '@/lib/constants'
import { decodeEarthquake } from '@/lib/earthquake-encoding'
import { getClientSDK, getClientFetchSDK } from '@/lib/client-sdk'
import type { Earthquake } from '@/types/earthquake'

interface UseEarthquakesProps {
  onNewEarthquake: (quake: Earthquake) => void
  onEarthquakesUpdate: (quakes: Earthquake[]) => void
  minMagnitude?: number
}

/**
 * React hook for subscribing to earthquake data from Somnia Data Streams
 * 
 * Features:
 * - Fetches initial earthquake data from blockchain
 * - Subscribes to real-time WebSocket updates
 * - Automatically filters by minimum magnitude
 * - Calls onNewEarthquake callback when new data arrives
 */
export function useEarthquakes({ onNewEarthquake, onEarthquakesUpdate, minMagnitude = 2.0 }: UseEarthquakesProps) {
  const onNewEarthquakeRef = useRef(onNewEarthquake)
  const onEarthquakesUpdateRef = useRef(onEarthquakesUpdate)
  const previousCountRef = useRef(0)
  
  // Keep callback refs up to date
  useEffect(() => {
    onNewEarthquakeRef.current = onNewEarthquake
    onEarthquakesUpdateRef.current = onEarthquakesUpdate
  }, [onNewEarthquake, onEarthquakesUpdate])
  
  /**
   * Fetch all historical earthquakes from the blockchain
   * Uses HTTP transport to avoid WebSocket connection issues
   */
  const fetchInitialQuakes = useCallback(async () => {
    console.log('📥 Fetching initial earthquakes from blockchain...')
    
    const sdk = getClientFetchSDK() // Use HTTP for fetching, not WebSocket
    
    try {
      // Get total count of earthquakes published by our oracle
      const total = await sdk.streams.totalPublisherDataForSchema(
        EARTHQUAKE_SCHEMA_ID,
        PUBLISHER_ADDRESS
      )
      
      if (!total || total === BigInt(0)) {
        console.log('📭 No earthquakes found on-chain yet')
        console.log('   Waiting for oracle to publish data...')
        return []
      }
      
      console.log(`📊 Found ${total} earthquakes on-chain`)
      
      // Fetch all earthquake data by index
      const earthquakes: Earthquake[] = []
      
      for (let i = BigInt(0); i < total; i++) {
        try {
          const data = await sdk.streams.getAtIndex(
            EARTHQUAKE_SCHEMA_ID,
            PUBLISHER_ADDRESS,
            i
          )
          
          if (!data || !Array.isArray(data)) continue
          
          // SDK can return decoded data (SchemaDecodedItem[][]) or hex strings (Hex[])
          let quake: Earthquake
          
          if (data.length > 0 && typeof data[0] === 'string') {
            // It's hex-encoded data
            quake = decodeEarthquake(data[0] as `0x${string}`)
          } else {
            // It's already decoded SchemaDecodedItem[]
            // v0.8.0 SDK returns: data[0] = array of {name, type, signature, value: {name, type, value}}
            const decoded = data[0] as Array<{ value: { value: unknown } }>
            
            // Nested value access: decoded[i].value.value
            quake = {
              earthquakeId: String(decoded[0]?.value?.value || ''),
              location: String(decoded[1]?.value?.value || ''),
              magnitude: Number(decoded[2]?.value?.value || 0) / 10,
              depth: Number(decoded[3]?.value?.value || 0) / 1000,
              latitude: Number(decoded[4]?.value?.value || 0) / 1000000,
              longitude: Number(decoded[5]?.value?.value || 0) / 1000000,
              timestamp: Number(decoded[6]?.value?.value || 0),
              url: String(decoded[7]?.value?.value || '')
            }
          }
          
          // Filter by minimum magnitude
          if (quake.magnitude >= minMagnitude) {
            earthquakes.push(quake)
          }
        } catch (error) {
          console.warn(`Failed to process earthquake at index ${i}:`, error)
        }
      }
      
      console.log(`📊 Loaded ${earthquakes.length} earthquakes (filtered for magnitude ${minMagnitude}+)`)
      
      // Sort by timestamp (newest first)
      return earthquakes.sort((a, b) => b.timestamp - a.timestamp)
      
    } catch (error) {
      console.error('❌ Failed to fetch earthquakes:', error)
      return []
    }
  }, [minMagnitude])
  
  /**
   * Subscribe to real-time earthquake events WITH ethCalls
   * This bundles the latest earthquake data with the event for zero-latency updates!
   * Automatically reconnects if WebSocket closes.
   */
  useEffect(() => {
    console.log('🔔 Setting up earthquake WebSocket subscription with ethCalls...')
    
    let subscription: { unsubscribe: () => void } | undefined
    let isSubscribed = false
    let currentEarthquakes: Earthquake[] = []
    let lastFetchTime = Date.now()
    let reconnectTimeout: NodeJS.Timeout | null = null
    let isReconnecting = false
    let isInitialized = false
    
    // Safety fallback: refetch all earthquakes after disconnect and merge with current list
    const refetchAndMerge = async () => {
      console.log('🔄 Refetching all earthquakes to catch any missed during disconnect...')
      const freshQuakes = await fetchInitialQuakes()
      
      // Merge with existing, deduplicate by ID
      const existingIds = new Set(currentEarthquakes.map(q => q.earthquakeId))
      const newQuakes = freshQuakes.filter(q => !existingIds.has(q.earthquakeId))
      
      if (newQuakes.length > 0) {
        console.log(`✨ Found ${newQuakes.length} earthquake(s) that were missed!`)
        currentEarthquakes = [...currentEarthquakes, ...newQuakes].sort((a, b) => b.timestamp - a.timestamp)
        onEarthquakesUpdateRef.current(currentEarthquakes)
      } else {
        console.log('✅ No missed earthquakes')
      }
      
      lastFetchTime = Date.now()
    }
    
    // Setup subscription function (called initially and on reconnect)
    const setupSubscription = async () => {
      if (isReconnecting) return
      
      isReconnecting = true
      
      // Clean up old subscription if exists
      if (subscription) {
        try {
          subscription.unsubscribe()
          isSubscribed = false
        } catch {
          // Ignore errors during cleanup
        }
      }
      
      try {
        const sdk = getClientSDK()
        
        // Get protocol info for ethCalls
        const protocolInfoResult = await sdk.streams.getSomniaDataStreamsProtocolInfo()
        
        if (!protocolInfoResult || protocolInfoResult instanceof Error) {
          throw new Error('Failed to get protocol info')
        }
        
        const protocolInfo = protocolInfoResult
        
        // Subscribe to EarthquakeDetected events
        const sub = await sdk.streams.subscribe({
          somniaStreamsEventId: 'EarthquakeDetected',
          // ethCalls: Bundle the LATEST earthquake data with every event! (v0.9.1 feature)
          ethCalls: [
            {
              to: protocolInfo.address as `0x${string}`,
              data: encodeFunctionData({
                abi: protocolInfo.abi,
                functionName: 'getLastPublishedDataForSchema',
                args: [EARTHQUAKE_SCHEMA_ID, PUBLISHER_ADDRESS]
              })
            }
          ],
          onlyPushChanges: false,
          onData: (data: unknown) => {
            console.log('🔔 New earthquake event received with bundled data!')
            lastFetchTime = Date.now()
            
            try {
              const { result } = data as { result?: { simulationResults?: readonly `0x${string}`[] } }
              
              if (!result?.simulationResults || result.simulationResults.length === 0) {
                console.warn('⚠️  No simulationResults in event data')
                return
              }
              
              // Decode the LATEST earthquake from ethCall (v0.9.1 feature!)
              const lastPublishedData = decodeFunctionResult({
                abi: protocolInfo.abi,
                functionName: 'getLastPublishedDataForSchema',
                data: result.simulationResults[0]
              }) as readonly `0x${string}`[]
              
              console.log('🔍 lastPublishedData type:', typeof lastPublishedData)
              console.log('🔍 lastPublishedData length:', lastPublishedData?.length)
              console.log('🔍 lastPublishedData[0]:', lastPublishedData?.[0])
              console.log('🔍 lastPublishedData[0] length:', lastPublishedData?.[0]?.length)
              
              if (!lastPublishedData || lastPublishedData.length === 0) {
                console.warn('⚠️  No earthquake data in ethCall result')
                return
              }
              
              if (!lastPublishedData[0] || lastPublishedData[0] === '0x') {
                console.warn('⚠️  First element is empty (0x)')
                return
              }
              
              console.log('✅ Received latest earthquake from ethCall (ZERO additional fetches!)')
              
              // Decode earthquake data (SchemaEncoder.decode not available yet in v0.9.1)
              const quake = decodeEarthquake(lastPublishedData[0])
              
              console.log(`📊 Decoded: M${quake.magnitude.toFixed(1)} - ${quake.location}`)
              
              // Filter by magnitude
              if (quake.magnitude < minMagnitude) {
                console.log(`ℹ️  Earthquake filtered out: M${quake.magnitude} < ${minMagnitude}`)
                return
              }
              
              if (!isSubscribed) {
                console.warn(`⚠️  Received earthquake but not subscribed, ignoring`)
                return
              }
              
              // Check if already exists (dedupe by ID)
              const existingIds = new Set(currentEarthquakes.map(q => q.earthquakeId))
              if (existingIds.has(quake.earthquakeId)) {
                console.log(`ℹ️  Earthquake ${quake.earthquakeId} already in list (duplicate)`)
                return
              }
              
              // Add the new earthquake
              currentEarthquakes = [...currentEarthquakes, quake].sort((a, b) => b.timestamp - a.timestamp)
              
              console.log(`🎉 New earthquake added! Total: ${currentEarthquakes.length}`)
              
              onEarthquakesUpdateRef.current(currentEarthquakes)
              onNewEarthquakeRef.current(quake)
              previousCountRef.current = currentEarthquakes.length
            } catch (error) {
              console.error('❌ Failed to process event:', error)
            }
          },
          onError: (error: Error) => {
            console.error('❌ Subscription error:', error)
            isSubscribed = false
            
            // Attempt reconnection after 3 seconds
            console.log('🔄 Will attempt to reconnect in 3 seconds...')
            reconnectTimeout = setTimeout(() => {
              console.log('🔌 Reconnecting WebSocket...')
              setupSubscription()
            }, 3000)
          }
        })
        
        subscription = sub
        isSubscribed = true
        isReconnecting = false
        console.log('✅ Subscribed to EarthquakeDetected events (with ethCalls for zero-latency)')
        
        // After reconnection, catch up on any earthquakes we missed
        if (isInitialized) {
          console.log('🔄 Reconnected! Catching up on missed earthquakes...')
          refetchAndMerge()
        }
      } catch (error) {
        console.error('❌ Failed to subscribe:', error)
        isReconnecting = false
        
        // Retry after 5 seconds
        reconnectTimeout = setTimeout(() => {
          console.log('🔄 Retrying subscription...')
          setupSubscription()
        }, 5000)
      }
    }
    
    // Handle visibility change (tab becomes visible after being hidden)
    const handleVisibilityChange = () => {
      if (!document.hidden && isSubscribed) {
        const timeSinceLastFetch = Date.now() - lastFetchTime
        if (timeSinceLastFetch > 30000) {
          console.log('👁️ Tab became visible, checking for missed earthquakes...')
          refetchAndMerge()
        }
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    // Initialize: Fetch all earthquakes FIRST, then set up WebSocket subscription
    // This prevents race condition where WebSocket events arrive before initial fetch completes
    fetchInitialQuakes().then(quakes => {
      currentEarthquakes = quakes
      isInitialized = true
      console.log(`📋 Initialized with ${currentEarthquakes.length} earthquakes, now setting up WebSocket...`)
      
      // NOW start WebSocket subscription
      setupSubscription()
    }).catch(error => {
      console.error('❌ Failed initial fetch, setting up subscription anyway:', error)
      setupSubscription()
    })
    
    // Cleanup on unmount
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
      
      if (subscription) {
        isSubscribed = false
        subscription.unsubscribe()
        console.log('🔕 Unsubscribed from earthquakes')
      }
    }
  }, [fetchInitialQuakes, minMagnitude])
  
  return { fetchInitialQuakes }
}

