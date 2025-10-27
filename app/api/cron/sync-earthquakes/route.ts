import { NextRequest } from 'next/server'
import { toHex } from 'viem'
import { getSDK, getPublicClient } from '@/lib/sdk'
import { EARTHQUAKE_SCHEMA_ID } from '@/lib/constants'
import { encodeEarthquake, transformUSGSToSchema } from '@/lib/earthquake-encoding'
import type { USGSResponse, Earthquake } from '@/types/earthquake'

// USGS API endpoint - fetches earthquakes from the last day for better coverage
// Options: all_hour.geojson, all_day.geojson, all_week.geojson
const USGS_API = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'

// Minimum magnitude threshold (2.0 for more data, 2.5 for less)
// Adjust this to control data volume:
// - 1.0+: Hundreds per hour (very busy)
// - 2.0+: ~100-200 per day (good activity)
// - 2.5+: ~50-100 per day (moderate)
// - 4.0+: ~5-20 per day (major events only)
const MIN_MAGNITUDE = 2.0

// Track last processed earthquake to avoid duplicates
// In production, you'd want to use a database for this
let lastProcessedId: string | null = null
// Start 1 hour in the past on first run to get recent earthquakes
let lastProcessedTime: number = Date.now() - (60 * 60 * 1000)

/**
 * Vercel Cron Job: Syncs earthquake data from USGS to Somnia blockchain
 * Runs every 60 seconds (Vercel's minimum interval)
 * 
 * Protected by Vercel Cron secret for security
 */
export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sets this automatically)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // Allow forcing a full refresh (fetches last 24 hours)
  const { searchParams } = new URL(request.url)
  const forceRefresh = searchParams.get('force') === 'true'
  
  if (forceRefresh) {
    console.log('🔄 FORCE REFRESH: Resetting to fetch last 24 hours')
    lastProcessedTime = Date.now() - (24 * 60 * 60 * 1000)
    lastProcessedId = null
  }
  
  const startTime = Date.now()
  console.log('🔄 Starting earthquake sync...')
  console.log('Time:', new Date().toISOString())
  console.log('Min magnitude:', MIN_MAGNITUDE)
  console.log('Last processed:', new Date(lastProcessedTime).toISOString())
  
  try {
    const sdk = getSDK()
    
    // Step 1: Fetch from USGS
    console.log('📥 Fetching from USGS API...')
    const response = await fetch(USGS_API, {
      headers: {
        'User-Agent': 'Somnia-Earthquake-Alerts/1.0'
      }
    })
    
    if (!response.ok) {
      throw new Error(`USGS API error: ${response.status} ${response.statusText}`)
    }
    
    const data: USGSResponse = await response.json()
    console.log(`📊 USGS returned ${data.features.length} earthquakes`)
    console.log(`   Generated at: ${new Date(data.metadata.generated).toISOString()}`)
    
    // Step 2: Filter new earthquakes
    const newQuakes = data.features
      .filter(quake => {
        // Filter by magnitude
        if (quake.properties.mag < MIN_MAGNITUDE) return false
        
        // Filter by time - use < instead of <= to catch earthquakes with same timestamp
        if (quake.properties.time < lastProcessedTime) return false
        
        // Skip the last processed ID specifically (handles same-timestamp case)
        if (lastProcessedId && quake.id === lastProcessedId) return false
        
        return true
      })
      .sort((a, b) => a.properties.time - b.properties.time) // Oldest first
    
    console.log(`   After filtering: ${newQuakes.length} new earthquakes`)
    if (newQuakes.length > 0 && newQuakes.length < 5) {
      newQuakes.forEach(q => {
        console.log(`   - ${q.id}: M${q.properties.mag} at ${new Date(q.properties.time).toISOString()}`)
      })
    }
    
    if (newQuakes.length === 0) {
      console.log('✅ No new earthquakes since last check')
      return Response.json({ 
        success: true, 
        newQuakes: 0,
        totalFetched: data.features.length,
        minMagnitude: MIN_MAGNITUDE,
        lastCheck: new Date(lastProcessedTime).toISOString(),
        duration: Date.now() - startTime
      })
    }
    
    console.log(`🆕 Found ${newQuakes.length} new earthquakes to publish`)
    
    // Step 3: Transform and prepare for blockchain
    const dataStreams = []
    const eventStreams = []
    
    for (const usgsQuake of newQuakes) {
      const quake = transformUSGSToSchema(usgsQuake)
      
      console.log(`  📍 M${quake.magnitude.toFixed(1)} - ${quake.location}`)
      console.log(`     Time: ${new Date(quake.timestamp).toISOString()}`)
      console.log(`     ID: ${quake.earthquakeId}`)
      
      // Prepare data stream (stores earthquake data)
      const hexId = toHex(quake.earthquakeId, { size: 32 })
      console.log(`     Hex ID: ${hexId}`)
      
      dataStreams.push({
        id: hexId,
        schemaId: EARTHQUAKE_SCHEMA_ID,
        data: encodeEarthquake(quake)
      })
      
      // Prepare event stream (triggers WebSocket notifications)
      eventStreams.push({
        id: 'EarthquakeDetected',
        argumentTopics: [
          toHex(Math.floor(quake.magnitude * 10), { size: 32 })
        ],
        data: '0x' as `0x${string}`
      })
    }
    
    // Step 4: Publish to blockchain ONE AT A TIME
    // Data Streams KV store pattern: Each unique ID should be written separately
    // Batch writes seem to only persist the last item, so we write individually
    console.log('📤 Publishing earthquakes to blockchain ONE AT A TIME...')
    
    const publicClient = getPublicClient()
    const txHashes: string[] = []
    
    for (let i = 0; i < dataStreams.length; i++) {
      try {
        const eq = newQuakes[i]
        console.log(`   📝 Publishing ${i + 1}/${dataStreams.length}: ${eq.id} (M${eq.properties.mag})`)
        console.log(`      Data ID: ${dataStreams[i].id}`)
        
        const txHash = await sdk.streams.setAndEmitEvents(
          [dataStreams[i]],  // Single earthquake
          [eventStreams[i]]   // Single event
        )
        
        console.log(`   ⏳ Waiting for confirmation: ${txHash}`)
        
        // CRITICAL: Wait for transaction to be mined before sending next one
        // This prevents nonce conflicts and ensures all earthquakes are stored
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash as `0x${string}`,
          timeout: 30_000 // 30 second timeout
        })
        
        txHashes.push(txHash as string)
        console.log(`   ✅ Confirmed ${i + 1}/${dataStreams.length} - Status: ${receipt.status}`)
        
      } catch (error) {
        console.error(`   ❌ Failed to publish earthquake ${i + 1}:`, error)
        // Continue with next earthquake even if one fails
      }
    }
    
    console.log(`✅ Successfully published ${txHashes.length}/${dataStreams.length} earthquakes!`)
    
    // Update tracking (remember the most recent earthquake)
    const mostRecent = newQuakes[newQuakes.length - 1]
    lastProcessedId = mostRecent.id
    lastProcessedTime = mostRecent.properties.time
    
    const duration = Date.now() - startTime
    console.log(`⏱️  Sync completed in ${duration}ms`)
    
    return Response.json({
      success: true,
      newQuakes: newQuakes.length,
      published: txHashes.length,
      totalFetched: data.features.length,
      minMagnitude: MIN_MAGNITUDE,
      txHashes,
      duration,
      earthquakes: newQuakes.map(q => ({
        id: q.id,
        magnitude: q.properties.mag,
        location: q.properties.place,
        time: new Date(q.properties.time).toISOString()
      }))
    })
    
  } catch (error) {
    console.error('❌ Sync failed:', error)
    
    return Response.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      },
      { status: 500 }
    )
  }
}

