'use client'

import { useEffect, useRef, useCallback } from 'react'
import { SDK } from '@somnia-chain/streams'
import { createPublicClient, webSocket } from 'viem'
import { somniaTestnet } from 'viem/chains'
import { EARTHQUAKE_SCHEMA_ID, PUBLISHER_ADDRESS } from '@/lib/constants'
import { decodeEarthquake } from '@/lib/earthquake-encoding'
import type { Earthquake } from '@/types/earthquake'

interface UseEarthquakesProps {
  onNewEarthquake: (quake: Earthquake) => void
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
export function useEarthquakes({ onNewEarthquake, minMagnitude = 2.0 }: UseEarthquakesProps) {
  const onNewEarthquakeRef = useRef(onNewEarthquake)
  
  // Keep callback ref up to date
  useEffect(() => {
    onNewEarthquakeRef.current = onNewEarthquake
  }, [onNewEarthquake])
  
  /**
   * Fetch all historical earthquakes from the blockchain
   */
  const fetchInitialQuakes = useCallback(async () => {
    console.log('📥 Fetching initial earthquakes from blockchain...')
    
    const sdk = new SDK({
      public: createPublicClient({
        chain: somniaTestnet,
        transport: webSocket(process.env.NEXT_PUBLIC_WSS_URL || 'wss://dream-rpc.somnia.network')
      })
    })
    
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
          // If it's already decoded, it will be an array of objects with {name, type, value}
          // If it's hex, it will be an array with a single hex string
          
          let quake: Earthquake
          
          if (data.length > 0 && typeof data[0] === 'string') {
            // It's hex-encoded data
            quake = decodeEarthquake(data[0] as `0x${string}`)
          } else {
            // It's already decoded SchemaDecodedItem[][] 
            // The SDK returns nested arrays, so we need to flatten first
            const decoded = (data as unknown as Array<Array<{ value: string | number | bigint }>>)[0] || []
            quake = {
              earthquakeId: String(decoded[0]?.value || ''),
              location: String(decoded[1]?.value || ''),
              magnitude: Number(decoded[2]?.value || 0) / 10,
              depth: Number(decoded[3]?.value || 0) / 1000,
              latitude: Number(decoded[4]?.value || 0) / 1000000,
              longitude: Number(decoded[5]?.value || 0) / 1000000,
              timestamp: Number(decoded[6]?.value || 0),
              url: String(decoded[7]?.value || '')
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
   * Subscribe to real-time earthquake events
   */
  useEffect(() => {
    console.log('🔔 Setting up earthquake WebSocket subscription...')
    
    const sdk = new SDK({
      public: createPublicClient({
        chain: somniaTestnet,
        transport: webSocket(process.env.NEXT_PUBLIC_WSS_URL || 'wss://dream-rpc.somnia.network')
      })
    })
    
    let subscription: { unsubscribe: () => void } | undefined
    let isSubscribed = false
    
    // Subscribe to EarthquakeDetected events
    sdk.streams.subscribe({
      somniaStreamsEventId: 'EarthquakeDetected',
      ethCalls: [], // Could add ethCalls here to bundle data with event
      onlyPushChanges: false,
      onData: () => {
        console.log('🔔 New earthquake event received!')
        
        // The event tells us a new earthquake was published
        // We need to re-fetch to get the latest data
        // (In a production app, you'd use ethCalls to bundle the data)
        fetchInitialQuakes().then(quakes => {
          if (quakes.length > 0 && isSubscribed) {
            // The most recent earthquake is the new one
            onNewEarthquakeRef.current(quakes[0])
          }
        })
      },
      onError: (error: Error) => {
        console.error('❌ Subscription error:', error)
      }
    }).then(sub => {
      subscription = sub
      isSubscribed = true
      console.log('✅ Subscribed to EarthquakeDetected events')
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
  }, [fetchInitialQuakes])
  
  return { fetchInitialQuakes }
}

