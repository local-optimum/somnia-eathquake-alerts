'use client'

import { useEffect, useRef, useCallback } from 'react'
import { encodeFunctionData, decodeAbiParameters } from 'viem'
import { EARTHQUAKE_SCHEMA_ID, PUBLISHER_ADDRESS } from '@/lib/constants'
import { decodeEarthquake } from '@/lib/earthquake-encoding'
import { getClientSDK } from '@/lib/client-sdk'
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
   */
  const fetchInitialQuakes = useCallback(async () => {
    console.log('📥 Fetching initial earthquakes from blockchain...')
    
    const sdk = getClientSDK()
    
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
   */
  useEffect(() => {
    console.log('🔔 Setting up earthquake WebSocket subscription with ethCalls...')
    
    const sdk = getClientSDK()
    
    let subscription: { unsubscribe: () => void } | undefined
    let isSubscribed = false
    let currentEarthquakes: Earthquake[] = []
    
    // Initialize with current earthquakes from initial fetch
    fetchInitialQuakes().then(quakes => {
      currentEarthquakes = quakes
      console.log(`📋 Initialized WebSocket with ${currentEarthquakes.length} earthquakes from initial fetch`)
    })
    
    // Subscribe to EarthquakeDetected events
    sdk.streams.subscribe({
      somniaStreamsEventId: 'EarthquakeDetected',
      // ethCalls: Bundle earthquake data with the event for instant updates!
      // This eliminates the need for a separate fetch, reducing latency from 200-500ms to <50ms
      ethCalls: [{
        to: '0xCe083187451f5DcBfA868e08569273a03Bb0d2de', // Data Streams contract address
        data: encodeFunctionData({
          abi: [{
            name: 'getAllPublisherDataForSchema',
            type: 'function',
            stateMutability: 'view',
            inputs: [
              { name: 'schemaId', type: 'bytes32' },
              { name: 'publisher', type: 'address' }
            ],
            outputs: [{ name: '', type: 'bytes[]' }]
          }],
          functionName: 'getAllPublisherDataForSchema',
          args: [EARTHQUAKE_SCHEMA_ID, PUBLISHER_ADDRESS]
        })
      }],
      onlyPushChanges: false,
      onData: (data: unknown) => {
        console.log('🔔 New earthquake event received with bundled data!')
        
        try {
          // Extract the ethCall simulation result
          const { result } = data as { result?: { simulationResults?: readonly `0x${string}`[] } }
          
          if (result?.simulationResults && result.simulationResults.length > 0) {
            const rawResult = result.simulationResults[0]
            
            // Decode the bytes[] array returned by getAllPublisherDataForSchema
            const [bytesArray] = decodeAbiParameters(
              [{ name: 'data', type: 'bytes[]' }],
              rawResult
            ) as [readonly `0x${string}`[]]
            
            if (bytesArray && bytesArray.length > 0) {
              console.log(`📦 Received ${bytesArray.length} earthquakes from ethCall`)
              
              // Decode all earthquakes
              const earthquakes: Earthquake[] = []
              
              for (const encodedData of bytesArray) {
                try {
                  const quake = decodeEarthquake(encodedData)
                  if (quake.magnitude >= minMagnitude) {
                    earthquakes.push(quake)
                  }
                } catch (error) {
                  console.error('❌ Failed to decode earthquake from ethCall:', error)
                  console.error('   Data:', encodedData?.slice(0, 100) + '...') // Show first 100 chars
                }
              }
              
              // Sort by timestamp (newest first)
              earthquakes.sort((a, b) => b.timestamp - a.timestamp)
              
              console.log(`🔍 Decoded ${earthquakes.length} new earthquakes from event`)
              console.log('🔍 Sample:', earthquakes.slice(0, 3).map(q => ({
                id: q.earthquakeId.slice(0, 10),
                mag: q.magnitude.toFixed(1),
                location: q.location.slice(0, 30)
              })))
              
              if (earthquakes.length > 0 && isSubscribed) {
                // MERGE new earthquakes with existing ones instead of replacing
                const existingIds = new Set(currentEarthquakes.map(q => q.earthquakeId))
                const newQuakes = earthquakes.filter(q => !existingIds.has(q.earthquakeId))
                
                if (newQuakes.length > 0) {
                  console.log(`✨ Found ${newQuakes.length} truly new earthquake(s)`)
                  currentEarthquakes = [...currentEarthquakes, ...newQuakes].sort((a, b) => b.timestamp - a.timestamp)
                  
                  console.log(`📤 Updating state with ${currentEarthquakes.length} total earthquakes`)
                  onEarthquakesUpdateRef.current(currentEarthquakes)
                  
                  // Notify about the newest earthquake
                  console.log(`🔔 New: M${newQuakes[0].magnitude.toFixed(1)} - ${newQuakes[0].location}`)
                  onNewEarthquakeRef.current(newQuakes[0])
                  previousCountRef.current = currentEarthquakes.length
                } else {
                  console.log('ℹ️  No new earthquakes (all already in list)')
                }
              } else {
                console.warn('⚠️  No earthquakes decoded from ethCall result')
              }
            }
          }
        } catch (error) {
          console.error('❌ Failed to process ethCall result:', error)
          // Fallback to refetch if ethCall fails
          console.log('🔄 Falling back to manual fetch...')
          fetchInitialQuakes().then(quakes => {
            if (quakes.length > 0 && isSubscribed) {
              onEarthquakesUpdateRef.current(quakes)
              if (quakes.length > previousCountRef.current) {
                onNewEarthquakeRef.current(quakes[0])
                previousCountRef.current = quakes.length
              }
            }
          })
        }
      },
      onError: (error: Error) => {
        console.error('❌ Subscription error:', error)
      }
    }).then(sub => {
      subscription = sub
      isSubscribed = true
      console.log('✅ Subscribed to EarthquakeDetected events (with ethCalls for zero-latency)')
    }).catch(error => {
      console.error('❌ Failed to subscribe:', error)
    })
    
    // Cleanup on unmount
    return () => {
      if (subscription) {
        isSubscribed = false
        subscription.unsubscribe()
        console.log('🔕 Unsubscribed from earthquakes')
      }
    }
  }, [fetchInitialQuakes, minMagnitude])
  
  return { fetchInitialQuakes }
}

