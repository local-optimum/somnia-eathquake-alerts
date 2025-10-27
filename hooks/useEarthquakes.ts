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
      // Fetch all earthquake data published by our oracle
      const allData = await sdk.streams.getAllPublisherDataForSchema(
        EARTHQUAKE_SCHEMA_ID,
        PUBLISHER_ADDRESS
      )
      
      if (!allData || allData.length === 0) {
        console.log('📭 No earthquakes found on-chain yet')
        console.log('   Waiting for oracle to publish data...')
        return []
      }
      
      // Decode all earthquakes
      const earthquakes: Earthquake[] = []
      
      for (const data of allData) {
        try {
          const quake = decodeEarthquake(data as `0x${string}`)
          
          // Filter by minimum magnitude
          if (quake.magnitude >= minMagnitude) {
            earthquakes.push(quake)
          }
        } catch (error) {
          console.warn('Failed to decode earthquake:', error)
        }
      }
      
      console.log(`📊 Loaded ${earthquakes.length} earthquakes from blockchain`)
      console.log(`   (filtered for magnitude ${minMagnitude}+)`)
      
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
      onData: (data: any) => {
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
      onError: (error: any) => {
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

