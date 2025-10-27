'use client'

import { SDK } from '@somnia-chain/streams'
import { createPublicClient, webSocket } from 'viem'
import { somniaTestnet } from '@/lib/chains'

/**
 * Get SDK instance for client-side subscriptions
 * Uses WebSocket transport for real-time updates
 * 
 * NOTE: webSocket() is called without parameters to use the chain's
 * default webSocket URL. This is required for SDK subscriptions to work properly.
 */
export function getClientSDK() {
  if (typeof window === 'undefined') {
    throw new Error('getClientSDK can only be called in browser context')
  }

  console.log('🔌 Creating client SDK with WebSocket from chain definition')

  const publicClient = createPublicClient({
    chain: somniaTestnet,
    transport: webSocket(), // Let it use chain's default webSocket URL
  })

  return new SDK({
    public: publicClient,
  })
}

