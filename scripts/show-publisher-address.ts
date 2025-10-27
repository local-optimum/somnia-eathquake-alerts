/**
 * Show the publisher address derived from ORACLE_PRIVATE_KEY
 * This address is what the oracle uses to publish earthquakes
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { privateKeyToAccount } from 'viem/accounts'

config({ path: resolve(process.cwd(), '.env.local') })

const ORACLE_PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY

if (!ORACLE_PRIVATE_KEY) {
  console.error('❌ ORACLE_PRIVATE_KEY not found in .env.local')
  process.exit(1)
}

const privateKey = ORACLE_PRIVATE_KEY.startsWith('0x') 
  ? ORACLE_PRIVATE_KEY 
  : `0x${ORACLE_PRIVATE_KEY}`

const account = privateKeyToAccount(privateKey as `0x${string}`)

console.log('\n📋 Publisher Address Information\n')
console.log('Your oracle wallet address (derived from ORACLE_PRIVATE_KEY):')
console.log(`  ${account.address}\n`)
console.log('Add this to your .env.local:')
console.log(`  NEXT_PUBLIC_PUBLISHER_ADDRESS=${account.address}\n`)

// Check if it matches
const envPublisherAddress = process.env.NEXT_PUBLIC_PUBLISHER_ADDRESS

if (envPublisherAddress) {
  if (envPublisherAddress.toLowerCase() === account.address.toLowerCase()) {
    console.log('✅ NEXT_PUBLIC_PUBLISHER_ADDRESS matches! You\'re all set.')
  } else {
    console.log('❌ MISMATCH DETECTED!')
    console.log(`   .env.local has: ${envPublisherAddress}`)
    console.log(`   Should be:      ${account.address}`)
    console.log('\n   Update NEXT_PUBLIC_PUBLISHER_ADDRESS in .env.local to match!')
  }
} else {
  console.log('⚠️  NEXT_PUBLIC_PUBLISHER_ADDRESS not set in .env.local')
  console.log('   Add the line above to your .env.local file')
}

console.log('')

