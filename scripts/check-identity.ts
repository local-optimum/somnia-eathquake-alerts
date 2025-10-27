import { SDK } from '@somnia-chain/streams'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { somniaTestnet } from '@/lib/chains'
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
  console.log('🔍 Checking wallet identity...')
  console.log('Oracle address:', ORACLE_ACCOUNT.address)
  
  try {
    // Try to get all identities
    const identities = await sdk.streams.getAllIdentities()
    console.log('All identities:', identities)
    
    // Check if our address has an identity
    const hasIdentity = identities.includes(ORACLE_ACCOUNT.address)
    
    if (!hasIdentity) {
      console.log('\n⚠️  Wallet does not have an identity!')
      console.log('Creating wallet identity...')
      
      const txHash = await sdk.streams.createWalletIdentity()
      console.log('✅ Identity created! TX:', txHash)
    } else {
      console.log('\n✅ Wallet already has an identity!')
    }
  } catch (error) {
    console.error('Error checking identity:', error)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Error:', error)
    process.exit(1)
  })

