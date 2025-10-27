import { defineChain } from 'viem'

export const somniaTestnet = defineChain({
  id: 50311,
  name: 'Somnia Testnet',
  network: 'somnia-testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Somnia',
    symbol: 'STT',
  },
  rpcUrls: {
    default: {
      http: ['https://dream-rpc.somnia.network'],
      webSocket: ['wss://dream-rpc.somnia.network'] // Use wss:// for production
    },
    public: {
      http: ['https://dream-rpc.somnia.network'],
      webSocket: ['wss://dream-rpc.somnia.network']
    }
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://somnia.network' }
  },
  // Force legacy transactions (not EIP-1559)
  fees: undefined
})

