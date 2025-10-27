import { defineChain } from 'viem'

/**
 * Somnia Testnet chain configuration
 * Uses the official WebSocket endpoint for real-time subscriptions
 */
export const somniaTestnet = defineChain({
  id: 50312,
  name: 'Somnia Testnet',
  network: 'testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'STT',
    symbol: 'STT',
  },
  rpcUrls: {
    default: {
      http: ['https://dream-rpc.somnia.network'],
      webSocket: ['wss://api.infra.testnet.somnia.network/ws']
    },
    public: {
      http: ['https://dream-rpc.somnia.network'],
      webSocket: ['wss://api.infra.testnet.somnia.network/ws']
    }
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://somnia.network' }
  }
})
