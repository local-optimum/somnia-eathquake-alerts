/**
 * Earthquake Schema Registration Script
 * 
 * This script registers the earthquake data schema and event schema on the Somnia blockchain.
 * Run this once before starting the application.
 * 
 * Usage:
 *   npm run register-schema
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables FIRST
config({ path: resolve(process.cwd(), '.env.local') })

import { getSDK } from '../lib/sdk'
import { EARTHQUAKE_SCHEMA } from '../lib/constants'
import { privateKeyToAccount } from 'viem/accounts'

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const

async function main() {
  console.log('🚀 Starting schema deployment...\n')

  const sdk = getSDK()
  
  // Step 1: Compute Schema ID
  console.log('📝 Computing earthquake schema ID...')
  const schemaId = await sdk.streams.computeSchemaId(EARTHQUAKE_SCHEMA)
  console.log(`✅ Schema ID: ${schemaId}`)
  console.log(`   Schema: ${EARTHQUAKE_SCHEMA}\n`)
  
  // Step 2: Register earthquake data schema
  console.log('📤 Registering earthquake data schema on-chain...')
  try {
    const isRegistered = await sdk.streams.isDataSchemaRegistered(schemaId!)
    
    if (isRegistered) {
      console.log('⚠️  Schema already registered!\n')
    } else {
      const schemaTx = await sdk.streams.registerDataSchemas([
        {
          id: 'earthquake_event_v1',
          schema: EARTHQUAKE_SCHEMA,
          parentSchemaId: ZERO_BYTES32,
        },
      ])
      console.log(`✅ Earthquake schema registered! TX: ${schemaTx}\n`)
    }
  } catch (error) {
    const err = error as Error
    if (err.message?.includes('already registered') || 
        err.message?.includes('SchemaAlreadyRegistered')) {
      console.log('⚠️  Schema already registered!\n')
    } else {
      throw error
    }
  }
  
  // Step 3: Register Event Schema
  console.log('📤 Registering EarthquakeDetected event schema...')
  try {
    const eventTx = await sdk.streams.registerEventSchemas(
      ['EarthquakeDetected'],
      [{
        params: [
          { name: 'magnitude', paramType: 'uint16', isIndexed: true }
        ],
        eventTopic: 'EarthquakeDetected(uint16 indexed magnitude)'
      }]
    )
    console.log(`✅ Event schema registered! TX: ${eventTx}\n`)
  } catch (error) {
    const err = error as Error
    // EventSchemaAlreadyRegistered is expected and fine
    if (err.message?.includes('already registered') || 
        err.message?.includes('EventSchemaAlreadyRegistered')) {
      console.log('⚠️  Event schema already registered!\n')
    } else {
      throw error
    }
  }
  
  // Step 4: Get publisher address
  const privateKey = process.env.ORACLE_PRIVATE_KEY?.trim()
  let formattedKey = privateKey
  if (formattedKey && !formattedKey.startsWith('0x')) {
    formattedKey = `0x${formattedKey}`
  }
  
  const account = privateKeyToAccount(formattedKey as `0x${string}`)
  const publisherAddress = account.address
  
  // Output configuration
  console.log('✅ Deployment complete!\n')
  console.log('📋 Add these to your .env.local file:\n')
  console.log(`NEXT_PUBLIC_EARTHQUAKE_SCHEMA_ID=${schemaId}`)
  console.log(`NEXT_PUBLIC_PUBLISHER_ADDRESS=${publisherAddress}\n`)
}

main()
  .then(() => {
    console.log('✨ Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })

