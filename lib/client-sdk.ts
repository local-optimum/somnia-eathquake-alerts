'use client'

import { SDK } from '@somnia-chain/streams'
import { createPublicClient, http, webSocket } from 'viem'
import { somniaTestnet } from '@/lib/chains'

/**
 * Get SDK instance for client-side data fetching (HTTP)
 * Use this for querying data, NOT for subscriptions
 * This avoids issues with closed WebSocket connections
 */
export function getClientFetchSDK() {
  if (typeof window === 'undefined') {
    throw new Error('getClientFetchSDK can only be called in browser context')
  }

  const publicClient = createPublicClient({
    chain: somniaTestnet,
    transport: http('https://dream-rpc.somnia.network'), // Public HTTP endpoint
  })

  return new SDK({
    public: publicClient,
  })
}

/**
 * Get SDK instance for client-side subscriptions (WebSocket)
 * Uses WebSocket transport for real-time updates
 * Use this ONLY for subscriptions, NOT for data fetching
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

