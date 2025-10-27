import { SDK } from '@somnia-chain/streams'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { somniaTestnet } from 'viem/chains'

/**
 * Server-side SDK utilities for Somnia Data Streams
 */

// Public client for reading (HTTP)
export function getPublicClient() {
  const RPC_URL = process.env.RPC_URL!
  return createPublicClient({
    chain: somniaTestnet,
    transport: http(RPC_URL),
  })
}

// Wallet client for writing (server-side only)
export function getWalletClient() {
  const RPC_URL = process.env.RPC_URL!
  let ORACLE_PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY?.trim()
  
  if (!ORACLE_PRIVATE_KEY || ORACLE_PRIVATE_KEY === '0x0000000000000000000000000000000000000000000000000000000000000000') {
    throw new Error('ORACLE_PRIVATE_KEY not configured or still using placeholder value. Please set a valid private key in .env.local')
  }
  
  // Ensure it starts with 0x
  if (!ORACLE_PRIVATE_KEY.startsWith('0x')) {
    ORACLE_PRIVATE_KEY = `0x${ORACLE_PRIVATE_KEY}`
  }
  
  // Validate format (should be 0x + 64 hex characters)
  if (!/^0x[0-9a-fA-F]{64}$/.test(ORACLE_PRIVATE_KEY)) {
    throw new Error(
      `Invalid ORACLE_PRIVATE_KEY format. Expected 66 characters (0x + 64 hex digits), got ${ORACLE_PRIVATE_KEY.length} characters. ` +
      `Make sure your private key in .env.local has no quotes, spaces, or extra characters.`
    )
  }
  
  const account = privateKeyToAccount(ORACLE_PRIVATE_KEY as `0x${string}`)
  return createWalletClient({
    chain: somniaTestnet,
    account,
    transport: http(RPC_URL),
  })
}

// SDK instance for server-side operations (writing + reading)
export function getSDK() {
  return new SDK({
    public: getPublicClient(),
    wallet: getWalletClient(),
  })
}

