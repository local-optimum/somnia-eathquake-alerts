/**
 * Test getLastPublishedDataForSchema
 * 
 * This script tests the v0.9.1 getLastPublishedDataForSchema function
 * to see what data format it returns.
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { SDK } from '@somnia-chain/streams'
import { createPublicClient, http, encodeFunctionData, decodeFunctionResult } from 'viem'
import { somniaTestnet } from '../lib/chains'
import { decodeEarthquake } from '../lib/earthquake-encoding'

config({ path: resolve(process.cwd(), '.env.local') })

const EARTHQUAKE_SCHEMA_ID = process.env.NEXT_PUBLIC_EARTHQUAKE_SCHEMA_ID as `0x${string}`
const PUBLISHER_ADDRESS = process.env.NEXT_PUBLIC_PUBLISHER_ADDRESS as `0x${string}`

async function main() {
  console.log('🧪 Testing getLastPublishedDataForSchema...\n')
  console.log('Schema ID:', EARTHQUAKE_SCHEMA_ID)
  console.log('Publisher:', PUBLISHER_ADDRESS)
  console.log('')

  // Create SDK
  const publicClient = createPublicClient({
    chain: somniaTestnet,
    transport: http('https://dream-rpc.somnia.network'),
  })

  const sdk = new SDK({
    public: publicClient,
  })

  // Get protocol info
  console.log('📋 Getting protocol info...')
  const protocolInfo = await sdk.streams.getSomniaDataStreamsProtocolInfo()
  
  if (!protocolInfo || protocolInfo instanceof Error) {
    throw new Error('Failed to get protocol info')
  }
  
  console.log('✅ Protocol address:', protocolInfo.address)
  console.log('')

  // Test 1: Call getLastPublishedDataForSchema directly via SDK
  console.log('🔬 Test 1: SDK method (if available)...')
  try {
    // @ts-ignore - method might exist
    const lastData = await sdk.streams.getLastPublishedDataForSchema?.(
      EARTHQUAKE_SCHEMA_ID,
      PUBLISHER_ADDRESS
    )
    console.log('✅ SDK method result:')
    console.log('   Type:', typeof lastData)
    console.log('   Value:', lastData)
    console.log('')
  } catch (error) {
    console.log('❌ SDK method not available or failed:', (error as Error).message)
    console.log('')
  }

  // Test 2: Call via encodeFunctionData (like in ethCall)
  console.log('🔬 Test 2: Via encodeFunctionData (ethCall simulation)...')
  
  const callData = encodeFunctionData({
    abi: protocolInfo.abi,
    functionName: 'getLastPublishedDataForSchema',
    args: [EARTHQUAKE_SCHEMA_ID, PUBLISHER_ADDRESS]
  })
  
  console.log('📤 Call data:', callData.slice(0, 20) + '...')
  
  // Simulate the eth_call
  const rawResult = await publicClient.call({
    to: protocolInfo.address as `0x${string}`,
    data: callData
  })
  
  console.log('📥 Raw result:', rawResult?.data)
  console.log('   Length:', rawResult?.data?.length, 'bytes')
  console.log('')

  if (rawResult?.data) {
    // Decode the result
    console.log('🔓 Decoding result...')
    const decoded = decodeFunctionResult({
      abi: protocolInfo.abi,
      functionName: 'getLastPublishedDataForSchema',
      data: rawResult.data
    }) as readonly `0x${string}`[]
    
    console.log('✅ Decoded result:')
    console.log('   Type:', typeof decoded)
    console.log('   Is Array:', Array.isArray(decoded))
    console.log('   Length:', decoded?.length)
    console.log('')
    
    if (decoded && Array.isArray(decoded)) {
      console.log('📦 Array contents:')
      decoded.forEach((item, i) => {
        console.log(`   [${i}]:`, item)
        console.log(`        Length: ${item?.length} bytes`)
      })
      console.log('')
      
      // Try to decode first earthquake
      if (decoded.length > 0 && decoded[0] && decoded[0] !== '0x') {
        console.log('🔍 Attempting to decode first earthquake...')
        try {
          const quake = decodeEarthquake(decoded[0])
          console.log('✅ Successfully decoded earthquake:')
          console.log('   ID:', quake.earthquakeId)
          console.log('   Location:', quake.location)
          console.log('   Magnitude:', quake.magnitude)
          console.log('   Depth:', quake.depth, 'km')
          console.log('   Lat/Lon:', quake.latitude, ',', quake.longitude)
          console.log('   Time:', new Date(quake.timestamp).toISOString())
          console.log('   URL:', quake.url)
        } catch (error) {
          console.error('❌ Failed to decode:', (error as Error).message)
        }
      } else {
        console.warn('⚠️  First element is empty or missing')
      }
    }
  }

  // Test 3: Check total count for comparison
  console.log('')
  console.log('📊 For comparison: Total earthquakes on-chain...')
  const total = await sdk.streams.totalPublisherDataForSchema(
    EARTHQUAKE_SCHEMA_ID,
    PUBLISHER_ADDRESS
  )
  console.log('   Total:', total?.toString())

  console.log('')
  console.log('✨ Test complete!')
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  })

