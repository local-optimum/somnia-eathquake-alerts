/**
 * Development Earthquake Sync Script
 * 
 * This script manually triggers the earthquake sync for local testing.
 * In production, Vercel Cron will call the API route automatically.
 * 
 * Usage:
 *   npx tsx scripts/dev-sync.ts          # Run once
 *   npx tsx scripts/dev-sync.ts --watch  # Run every 30 seconds
 *   npx tsx scripts/dev-sync.ts --force  # Force refresh (fetch last 24 hours)
 */

import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const FORCE_REFRESH = process.argv.includes('--force')

async function syncEarthquakes() {
  console.log('\n' + '='.repeat(60))
  console.log(`🔄 Triggering earthquake sync${FORCE_REFRESH ? ' (FORCE REFRESH)' : ''}...`)
  console.log('='.repeat(60))
  
  try {
    // Call the local API route
    const url = `http://localhost:3000/api/cron/sync-earthquakes${FORCE_REFRESH ? '?force=true' : ''}`
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.CRON_SECRET}`
      }
    })
    
    const data = await response.json()
    
    if (response.ok) {
      console.log('✅ Sync successful!')
      console.log(`   New earthquakes: ${data.newQuakes}`)
      console.log(`   Total fetched: ${data.totalFetched}`)
      console.log(`   Duration: ${data.duration}ms`)
      
      if (data.txHash) {
        console.log(`   TX Hash: ${data.txHash}`)
      }
      
      if (data.earthquakes && data.earthquakes.length > 0) {
        console.log('\n📋 New earthquakes:')
        data.earthquakes.forEach((eq: any) => {
          console.log(`   • M${eq.magnitude.toFixed(1)} - ${eq.location}`)
          console.log(`     ${eq.time}`)
        })
      }
    } else {
      console.error('❌ Sync failed!')
      console.error('   Status:', response.status)
      console.error('   Error:', data.error)
    }
  } catch (error) {
    console.error('❌ Request failed:', error)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const watchMode = args.includes('--watch') || args.includes('-w')
  
  if (watchMode) {
    console.log('👀 Watch mode enabled - syncing every 30 seconds')
    console.log('Press Ctrl+C to stop\n')
    
    // Run immediately
    await syncEarthquakes()
    
    // Then run every 30 seconds
    setInterval(syncEarthquakes, 30000)
  } else {
    // Run once
    await syncEarthquakes()
    process.exit(0)
  }
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})

