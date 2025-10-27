import { SDK, SchemaEncoder } from '@somnia-chain/streams'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { somniaTestnet } from '@/lib/chains'
import { EARTHQUAKE_SCHEMA } from '@/lib/constants'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const ORACLE_ACCOUNT = privateKeyToAccount(
  process.env.ORACLE_PRIVATE_KEY as `0x${string}`
)

const sdk = new SDK({
  public: createPublicClient({
    chain: somniaTestnet,
    transport: http(process.env.RPC_URL)
  }),
  wallet: createWalletClient({
    chain: somniaTestnet,
    account: ORACLE_ACCOUNT,
    transport: http(process.env.RPC_URL)
  })
})

async function main() {
  console.log('🔧 Registering earthquake schema...')
  console.log('Oracle address:', ORACLE_ACCOUNT.address)
  
  // Compute schema ID
  const schemaId = await sdk.streams.computeSchemaId(EARTHQUAKE_SCHEMA)
  console.log('Schema ID:', schemaId)
  
  // Check if already registered
  const isRegistered = await sdk.streams.isDataSchemaRegistered(schemaId)
  
  if (isRegistered) {
    console.log('✅ Schema already registered!')
  } else {
    console.log('📝 Registering schema...')
    
    const txHash = await sdk.streams.registerDataSchemas([{
      schema: EARTHQUAKE_SCHEMA,
      parentSchemaId: '0x0000000000000000000000000000000000000000000000000000000000000000'
    }])
    
    console.log('✅ Schema registered! TX:', txHash)
  }
  
  // Register event schema
  console.log('📝 Registering event schema...')
  
  const eventTxHash = await sdk.streams.registerEventSchemas(
    ['EarthquakeDetected'],
    [{
      params: [
        { name: 'magnitude', paramType: 'uint16', isIndexed: true }
      ],
      eventTopic: 'EarthquakeDetected(uint16 indexed magnitude)'
    }]
  )
  
  console.log('✅ Event registered! TX:', eventTxHash)
  
  console.log('\n📋 Add these to your .env.local:')
  console.log(`NEXT_PUBLIC_EARTHQUAKE_SCHEMA_ID=${schemaId}`)
  console.log(`NEXT_PUBLIC_PUBLISHER_ADDRESS=${ORACLE_ACCOUNT.address}`)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Error:', error)
    process.exit(1)
  })

