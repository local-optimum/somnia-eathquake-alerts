'use client'

import { useEffect, useRef, useCallback } from 'react'
import { encodeFunctionData, decodeAbiParameters } from 'viem'
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
    let currentIndex = BigInt(0) // Track which earthquakes we've already fetched
    
    // Safety fallback: catch up on missed earthquakes after disconnect using getBetweenRange
    const refetchAndMerge = async () => {
      console.log('🔄 Catching up on missed earthquakes after disconnect...')
      
      try {
        const fetchSdk = getClientFetchSDK()
        
        // Get current total on-chain
        const totalOnChain = await fetchSdk.streams.totalPublisherDataForSchema(
          EARTHQUAKE_SCHEMA_ID,
          PUBLISHER_ADDRESS
        )
        
        if (!totalOnChain || totalOnChain <= currentIndex) {
          console.log('✅ No missed earthquakes during disconnect')
          lastFetchTime = Date.now()
          return
        }
        
        console.log(`📥 Fetching missed earthquakes: index ${currentIndex} to ${totalOnChain - BigInt(1)}`)
        
        // Fetch missed earthquakes
        const missedData = await fetchSdk.streams.getBetweenRange(
          EARTHQUAKE_SCHEMA_ID,
          PUBLISHER_ADDRESS,
          currentIndex,
          totalOnChain - BigInt(1)
        )
        
        if (!missedData || missedData instanceof Error || missedData.length === 0) {
          console.warn('⚠️  getBetweenRange returned no data or error')
          lastFetchTime = Date.now()
          return
        }
        
        // Decode and filter
        const missedQuakes: Earthquake[] = []
        for (const encodedData of missedData) {
          try {
            let quake: Earthquake
            if (typeof encodedData === 'string') {
              quake = decodeEarthquake(encodedData as `0x${string}`)
            } else {
              const decoded = encodedData as Array<{ value: { value: unknown } }>
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
            if (quake.magnitude >= minMagnitude) {
              missedQuakes.push(quake)
            }
          } catch (error) {
            console.error('❌ Failed to decode missed earthquake:', error)
          }
        }
        
        // Merge with existing
        const existingIds = new Set(currentEarthquakes.map(q => q.earthquakeId))
        const newQuakes = missedQuakes.filter(q => !existingIds.has(q.earthquakeId))
        
        if (newQuakes.length > 0) {
          console.log(`✅ Caught up: ${newQuakes.length} missed earthquake(s)`)
          currentEarthquakes = [...currentEarthquakes, ...newQuakes].sort((a, b) => b.timestamp - a.timestamp)
          onEarthquakesUpdateRef.current(currentEarthquakes)
        }
        
        // Update currentIndex to latest
        currentIndex = totalOnChain
        console.log(`✅ Updated currentIndex to ${currentIndex}`)
        lastFetchTime = Date.now()
      } catch (error) {
        console.error('❌ Failed to catch up on missed earthquakes:', error)
        lastFetchTime = Date.now()
      }
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
        
        // Subscribe to EarthquakeDetected events
        const sub = await sdk.streams.subscribe({
          somniaStreamsEventId: 'EarthquakeDetected',
          // ethCalls: Bundle earthquake data with the event for instant updates!
          ethCalls: [
            // Get the earthquake at currentIndex (the one that triggered this event)
            {
              to: '0xCe083187451f5DcBfA868e08569273a03Bb0d2de',
              data: encodeFunctionData({
                abi: [{
                  name: 'getAtIndex',
                  type: 'function',
                  stateMutability: 'view',
                  inputs: [
                    { name: 'schemaId', type: 'bytes32' },
                    { name: 'publisher', type: 'address' },
                    { name: 'index', type: 'uint256' }
                  ],
                  outputs: [{ name: '', type: 'bytes[]' }]
                }],
                functionName: 'getAtIndex',
                args: [EARTHQUAKE_SCHEMA_ID, PUBLISHER_ADDRESS, currentIndex]
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
              
              // Decode the bytes[] from getAtIndex ethCall
              const [bytesArray] = decodeAbiParameters(
                [{ name: 'data', type: 'bytes[]' }],
                result.simulationResults[0]
              ) as [readonly `0x${string}`[]]
              
              if (!bytesArray || bytesArray.length === 0) {
                console.warn('⚠️  ethCall returned empty data')
                return
              }
              
              console.log(`✅ Received earthquake at index ${currentIndex} from ethCall (zero extra fetches!)`)
              
              // Decode the single earthquake
              const encodedData = bytesArray[0]
              let quake: Earthquake
              
              if (typeof encodedData === 'string') {
                quake = decodeEarthquake(encodedData as `0x${string}`)
              } else {
                // Already decoded by SDK
                const decoded = encodedData as Array<{ value: { value: unknown } }>
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
              
              // Filter by magnitude
              if (quake.magnitude < minMagnitude) {
                console.log(`ℹ️  Earthquake filtered out: M${quake.magnitude} < ${minMagnitude}`)
                currentIndex++ // Still increment index
                return
              }
              
              if (!isSubscribed) {
                console.warn(`⚠️  Received earthquake but isSubscribed=${isSubscribed}, ignoring`)
                return
              }
              
              // Check if already exists (shouldn't happen, but safety check)
              const existingIds = new Set(currentEarthquakes.map(q => q.earthquakeId))
              if (existingIds.has(quake.earthquakeId)) {
                console.log(`ℹ️  Earthquake ${quake.earthquakeId} already in list (duplicate)`)
                currentIndex++
                return
              }
              
              // Add the new earthquake
              currentEarthquakes = [...currentEarthquakes, quake].sort((a, b) => b.timestamp - a.timestamp)
              currentIndex++ // Increment for next event
              
              console.log(`📊 New earthquake added: M${quake.magnitude.toFixed(1)} - ${quake.location}`)
              console.log(`✅ Updated currentIndex to ${currentIndex}, total earthquakes: ${currentEarthquakes.length}`)
              
              onEarthquakesUpdateRef.current(currentEarthquakes)
              onNewEarthquakeRef.current(quake)
              previousCountRef.current = currentEarthquakes.length
            } catch (error) {
              console.error('❌ Failed to process ethCall result:', error)
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
    fetchInitialQuakes().then(async quakes => {
      currentEarthquakes = quakes
      isInitialized = true
      console.log(`📋 Initialized with ${currentEarthquakes.length} earthquakes, now setting up WebSocket...`)
      
      // Set currentIndex to the total count so we only fetch NEW earthquakes via events
      try {
        const initSdk = getClientFetchSDK()
        const total = await initSdk.streams.totalPublisherDataForSchema(
          EARTHQUAKE_SCHEMA_ID,
          PUBLISHER_ADDRESS
        )
        currentIndex = total || BigInt(0)
        console.log(`✅ Set currentIndex to ${currentIndex}`)
      } catch {
        console.warn('⚠️  Failed to get total count, currentIndex remains 0')
      }
      
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

