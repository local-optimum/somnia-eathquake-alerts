/**
 * Check what earthquake data is actually stored on-chain
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { getSDK } from '../lib/sdk'

config({ path: resolve(process.cwd(), '.env.local') })

// Read directly from process.env (not through constants.ts)
const EARTHQUAKE_SCHEMA_ID = process.env.NEXT_PUBLIC_EARTHQUAKE_SCHEMA_ID as `0x${string}`
const PUBLISHER_ADDRESS = process.env.NEXT_PUBLIC_PUBLISHER_ADDRESS as `0x${string}`

async function checkOnChainData() {
  console.log('\n🔍 Checking on-chain earthquake data...\n')
  console.log(`Schema ID: ${EARTHQUAKE_SCHEMA_ID}`)
  console.log(`Publisher: ${PUBLISHER_ADDRESS}\n`)
  
  if (!EARTHQUAKE_SCHEMA_ID || !PUBLISHER_ADDRESS) {
    console.log('❌ Missing environment variables in .env.local:')
    if (!EARTHQUAKE_SCHEMA_ID) console.log('   - NEXT_PUBLIC_EARTHQUAKE_SCHEMA_ID')
    if (!PUBLISHER_ADDRESS) console.log('   - NEXT_PUBLIC_PUBLISHER_ADDRESS')
    console.log('\n   Run: npm run register-schema')
    return
  }
  
  try {
    const sdk = getSDK()
    
    // Check if schema is registered
    const isRegistered = await sdk.streams.isDataSchemaRegistered(EARTHQUAKE_SCHEMA_ID)
    console.log(`Schema registered: ${isRegistered ? '✅ Yes' : '❌ No'}`)
    
    if (!isRegistered) {
      console.log('\n⚠️  Schema not registered! Run: npm run register-schema')
      return
    }
    
    // Get total count
    const total = await sdk.streams.totalPublisherDataForSchema(
      EARTHQUAKE_SCHEMA_ID,
      PUBLISHER_ADDRESS
    )
    
    console.log(`Total earthquakes on-chain: ${total}`)
    
    if (total === BigInt(0)) {
      console.log('\n⚠️  No earthquakes found on-chain!')
      console.log('   This could mean:')
      console.log('   1. The oracle hasn\'t published any earthquakes yet')
      console.log('   2. The earthquakes are stored under a different publisher address')
      console.log('   3. The earthquakes are stored under a different schema ID')
      console.log('\n   Try running: npm run dev-sync:force')
      return
    }
    
    // Fetch first few earthquakes
    console.log(`\n📊 Fetching first ${Math.min(Number(total), 5)} earthquakes...\n`)
    
    for (let i = 0; i < Math.min(Number(total), 5); i++) {
      try {
        const data = await sdk.streams.getAtIndex(
          EARTHQUAKE_SCHEMA_ID,
          PUBLISHER_ADDRESS,
          BigInt(i)
        )
        
        if (Array.isArray(data) && Array.isArray(data[0])) {
          const decoded = data[0]
          const id = String(decoded[0]?.value?.value || decoded[0]?.value || '')
          const location = String(decoded[1]?.value?.value || decoded[1]?.value || '')
          const mag = Number(decoded[2]?.value?.value || decoded[2]?.value || 0) / 10
          const timestamp = Number(decoded[6]?.value?.value || decoded[6]?.value || 0)
          
          console.log(`\nEarthquake ${i}:`)
          console.log(`  ID: ${id}`)
          console.log(`  Location: ${location}`)
          console.log(`  Magnitude: ${mag}`)
          console.log(`  Time: ${new Date(timestamp).toISOString()}`)
        } else {
          console.log(`\nEarthquake ${i}:`)
          console.log(JSON.stringify(data, null, 2))
        }
      } catch (error) {
        console.error(`  Failed to fetch earthquake ${i}:`, error)
      }
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error)
  }
}

checkOnChainData()

