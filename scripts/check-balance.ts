import { createPublicClient, http, formatEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { somniaTestnet } from '@/lib/chains'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const ORACLE_ACCOUNT = privateKeyToAccount(
  process.env.ORACLE_PRIVATE_KEY as `0x${string}`
)

const client = createPublicClient({
  chain: somniaTestnet,
  transport: http(process.env.RPC_URL)
})

async function main() {
  console.log('🔍 Checking wallet balance...')
  console.log('Address:', ORACLE_ACCOUNT.address)
  
  const balance = await client.getBalance({
    address: ORACLE_ACCOUNT.address
  })
  
  console.log('Balance:', formatEther(balance), 'STT')
  
  if (balance === 0n) {
    console.log('\n⚠️  Wallet has zero balance!')
    console.log('You need to fund this wallet with Somnia testnet tokens (STT)')
    console.log('Please visit the Somnia faucet to get testnet tokens')
  } else {
    console.log('\n✅ Wallet has funds!')
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Error:', error)
    process.exit(1)
  })

