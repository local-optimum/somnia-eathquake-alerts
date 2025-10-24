# Somnia Data Streams - Complete Reference
## LLM-Optimized Documentation with Real-World Learnings

**Version:** 1.0  
**Last Updated:** October 2025  
**Status:** Production-tested patterns  

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [SDK Setup](#sdk-setup)
3. [Schemas](#schemas)
4. [Writing Data](#writing-data)
5. [Reading Data](#reading-data)
6. [Subscriptions & Real-Time](#subscriptions--real-time)
7. [Events](#events)
8. [Complete Patterns](#complete-patterns)
9. [Common Gotchas](#common-gotchas)
10. [Architecture Patterns](#architecture-patterns)

---

## Core Concepts

### What is Somnia Data Streams?

**Somnia Data Streams** is an on-chain data storage and streaming protocol that enables:
- **Structured data storage** on the blockchain (like a database)
- **Real-time event notifications** via WebSocket (push, not poll)
- **Composability** - any app can read any published data
- **Reactivity** - updates push to all subscribers instantly

### Key-Value Store Pattern

Data Streams operates as a **key-value store**:
```
Storage Key = (schemaId, publisher, dataId)
Storage Value = encoded data
```

**Critical:** Writing with the same key **overwrites** previous data. To append, you must:
1. Read current state
2. Modify it
3. Write entire updated state

### Three Main Operations

1. **Write** (`set`, `setAndEmitEvents`) - Store data on-chain
2. **Read** (`getByKey`, `getAllPublisherDataForSchema`) - Retrieve data
3. **Subscribe** (`subscribe`) - Listen for real-time updates

---

## SDK Setup

### Installation

```bash
npm install @somnia-chain/streams viem
```

### Client Types

You need **two different clients**:

#### 1. Server-Side SDK (Read + Write)
```typescript
import { SDK } from '@somnia-chain/streams'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { somniaTestnet } from '@/lib/chains'

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`)

const sdk = new SDK({
  public: createPublicClient({
    chain: somniaTestnet,
    transport: http(process.env.RPC_URL)
  }),
  wallet: createWalletClient({
    chain: somniaTestnet,
    account,
    transport: http(process.env.RPC_URL)
  })
})

// Can: read + write
```

#### 2. Client-Side SDK (Read + Subscribe Only)
```typescript
import { SDK } from '@somnia-chain/streams'
import { createPublicClient, webSocket } from 'viem'
import { somniaTestnet } from '@/lib/chains'

const sdk = new SDK({
  public: createPublicClient({
    chain: somniaTestnet,
    transport: webSocket(process.env.NEXT_PUBLIC_WSS_URL!) // Must be wss:// for HTTPS
  })
})

// Can: read + subscribe
// Cannot: write (no wallet)
```

### Chain Configuration

**Critical:** Use `wss://` for production (HTTPS sites require secure WebSocket):

```typescript
// lib/chains.ts
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
      webSocket: ['wss://dream-rpc.somnia.network'] // wss:// not ws://
    },
    public: {
      http: ['https://dream-rpc.somnia.network'],
      webSocket: ['wss://dream-rpc.somnia.network']
    }
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://somnia.network' }
  }
})
```

---

## Schemas

### What is a Schema?

A **schema** defines the structure of your data (like a database table definition).

```typescript
const SCHEMA = `uint64 timestamp, string message, address sender`
```

**Rules:**
- Comma-separated field definitions
- Format: `type fieldName`
- Standard Solidity types (uint, int, string, address, bytes, bool, arrays)
- Can include structs/tuples

### Registering a Schema

**Must register before writing data:**

```typescript
import { SDK, zeroBytes32 } from '@somnia-chain/streams'

const SCHEMA = `uint64 timestamp, string message, address sender`

// Compute schema ID (deterministic)
const schemaId = await sdk.streams.computeSchemaId(SCHEMA)
console.log('Schema ID:', schemaId) // 0x1a2b3c...

// Check if already registered
const isRegistered = await sdk.streams.isDataSchemaRegistered(schemaId)

if (!isRegistered) {
  // Register it
  const txHash = await sdk.streams.registerDataSchemas([{
    schema: SCHEMA,
    parentSchemaId: zeroBytes32 // Use zeroBytes32 for root schemas
  }])
  
  console.log('Registered! TX:', txHash)
}
```

### Schema Best Practices

#### ✅ DO:
```typescript
// Use specific types
const GOOD = `uint64 timestamp, uint256 priceUSD, address token`

// Use integers for decimals
const GOOD = `uint256 priceUSD` // Store $45.50 as 4550 (cents)

// Use int32 for coordinates
const GOOD = `int32 latitude` // Store 35.4512° as 35451200 (x 1M)
```

#### ❌ DON'T:
```typescript
// Avoid floats (not supported)
const BAD = `float price` // ❌ No float type

// Don't use vague types
const BAD = `uint256 value` // ❌ Value of what?

// Don't forget field names
const BAD = `uint256, string` // ❌ Missing names
```

---

## Writing Data

### Encoding Data

Use `SchemaEncoder`:

```typescript
import { SchemaEncoder } from '@somnia-chain/streams'

const SCHEMA = `uint64 timestamp, string message, address sender`
const encoder = new SchemaEncoder(SCHEMA)

const encodedData = encoder.encodeData([
  { name: 'timestamp', value: Date.now().toString(), type: 'uint64' },
  { name: 'message', value: 'Hello, world!', type: 'string' },
  { name: 'sender', value: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb', type: 'address' }
])

// Returns: 0x00000... (hex-encoded data)
```

**Important:**
- Values must be **strings**
- Order must match schema
- Use `.toString()` for numbers

### Simple Write (No Events)

```typescript
import { toHex } from 'viem'

const txHash = await sdk.streams.set([{
  id: toHex('my-data-key', { size: 32 }), // Must be bytes32
  schemaId: SCHEMA_ID,
  data: encodedData
}])

console.log('Data written! TX:', txHash)
```

### Write + Emit Event (Recommended)

**Use this for real-time updates:**

```typescript
const txHash = await sdk.streams.setAndEmitEvents(
  // Data streams (storage)
  [{
    id: toHex('my-data-key', { size: 32 }),
    schemaId: SCHEMA_ID,
    data: encodedData
  }],
  // Event streams (notifications)
  [{
    id: 'MessageSent', // Event name (must be registered)
    argumentTopics: [senderAddress], // Indexed args for filtering
    data: '0x' // Additional event data (optional)
  }]
)
```

**Why `setAndEmitEvents`?**
- Atomic operation (data + event in one transaction)
- Guarantees consistency
- Triggers WebSocket subscribers instantly

### Read-Modify-Write Pattern

**Critical pattern for updating complex state:**

```typescript
// Example: Adding a pixel to a canvas

// 1. Read current state
const currentData = await sdk.streams.getByKey(
  CANVAS_SCHEMA_ID,
  PUBLISHER_ADDRESS,
  CANVAS_DATA_ID
)

let pixels: Pixel[] = []

if (currentData && currentData.length > 0) {
  // Decode existing pixels
  const [canvasBytes] = decodeAbiParameters(
    [{ name: 'canvasData', type: 'bytes' }],
    currentData[0]
  )
  
  const [existingPixels] = decodeAbiParameters(
    [{ name: 'pixels', type: 'tuple[]', components: [...] }],
    canvasBytes
  )
  
  pixels = existingPixels as Pixel[]
}

// 2. Modify state
const newPixel = { x: 10, y: 20, color: 5, timestamp: Date.now(), placer: userAddress }
pixels.push(newPixel)

// 3. Write entire updated state
const updatedData = encodeCanvasState(pixels)

await sdk.streams.setAndEmitEvents(
  [{ id: CANVAS_DATA_ID, schemaId: CANVAS_SCHEMA_ID, data: updatedData }],
  [{ id: 'PixelPlaced', argumentTopics: [], data: '0x' }]
)
```

**Why this pattern?**
- Data Streams is a KV store, not a database
- You can't "append" - you must overwrite
- Read → Modify → Write ensures consistency

---

## Reading Data

### Read by Key (Single Item)

```typescript
const data = await sdk.streams.getByKey(
  SCHEMA_ID,
  PUBLISHER_ADDRESS,
  toHex('my-data-key', { size: 32 })
)

if (data && data.length > 0) {
  const decoded = decodeData(data[0])
  console.log('Data:', decoded)
} else {
  console.log('No data found')
}
```

### Read All Publisher Data (Common Pattern)

```typescript
// Get ALL data published under this schema by this publisher
const allData = await sdk.streams.getAllPublisherDataForSchema(
  SCHEMA_ID,
  PUBLISHER_ADDRESS
)

if (!allData || allData.length === 0) {
  console.log('No data found')
  return []
}

// Decode all items
const decoded = allData.map(item => decodeData(item))
console.log(`Found ${decoded.length} items`)
```

### Read with Retry (Production Pattern)

**Blockchain reads can be flaky - always retry:**

```typescript
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      if (i === maxRetries - 1) throw error
      
      console.warn(`Attempt ${i + 1} failed, retrying in ${delayMs}ms...`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
  
  throw new Error('Max retries exceeded')
}

// Usage
const data = await fetchWithRetry(() =>
  sdk.streams.getAllPublisherDataForSchema(SCHEMA_ID, PUBLISHER_ADDRESS)
)
```

### Count Items

```typescript
const count = await sdk.streams.totalPublisherDataForSchema(
  SCHEMA_ID,
  PUBLISHER_ADDRESS
)

console.log(`Publisher has ${count} items`)
```

---

## Subscriptions & Real-Time

### Basic Subscription

```typescript
const subscription = await sdk.streams.subscribe(
  'MessageSent', // Event name
  [],            // ethCalls (explained below)
  (data) => {
    // Called when event fires
    console.log('New message received!', data)
  },
  (error) => {
    // Called on error
    console.error('Subscription error:', error)
  }
)

// Clean up when done
subscription.unsubscribe()
```

### Subscription with ethCalls (CRITICAL PATTERN)

**This is the "secret sauce" of Data Streams - zero extra round-trips:**

```typescript
import { encodeFunctionData } from 'viem'

const subscription = await sdk.streams.subscribe(
  'PixelPlaced',
  [
    // ethCall: Fetch canvas state automatically with each event
    {
      to: DATA_STREAMS_CONTRACT_ADDRESS,
      data: encodeFunctionData({
        abi: streamsAbi,
        functionName: 'getAllPublisherDataForSchema',
        args: [CANVAS_SCHEMA_ID, PUBLISHER_ADDRESS]
      })
    }
  ],
  (data) => {
    console.log('Event received:', data)
    
    // ethCall results bundled with event!
    const { result, simulationResults } = data
    
    if (simulationResults && simulationResults.length > 0) {
      const canvasState = decodeCanvasState(simulationResults[0])
      updateCanvas(canvasState) // Instant update, zero extra queries!
    }
  }
)
```

**Why ethCalls?**
- Traditional: Event fires → Fetch data → 2 round-trips, 200-500ms
- With ethCalls: Event fires with data bundled → 1 round-trip, <50ms
- **This is what makes Data Streams fast**

### React Hook Pattern

```typescript
// hooks/useDataStream.ts
import { useEffect, useRef } from 'react'
import { SDK } from '@somnia-chain/streams'
import { createPublicClient, webSocket } from 'viem'

export function useDataStream(
  eventName: string,
  onData: (data: any) => void
) {
  const onDataRef = useRef(onData)
  
  useEffect(() => {
    onDataRef.current = onData
  }, [onData])
  
  useEffect(() => {
    const sdk = new SDK({
      public: createPublicClient({
        chain: somniaTestnet,
        transport: webSocket(process.env.NEXT_PUBLIC_WSS_URL!)
      })
    })
    
    let subscription: { unsubscribe: () => void } | undefined
    
    sdk.streams.subscribe(
      eventName,
      [],
      (data) => onDataRef.current(data),
      (error) => console.error('Stream error:', error)
    ).then(sub => {
      subscription = sub
      console.log(`✅ Subscribed to ${eventName}`)
    })
    
    return () => {
      if (subscription) {
        subscription.unsubscribe()
        console.log(`🔕 Unsubscribed from ${eventName}`)
      }
    }
  }, [eventName])
}

// Usage in component
function MyComponent() {
  useDataStream('MessageSent', (data) => {
    console.log('New message:', data)
  })
}
```

---

## Events

### Registering Event Schemas

**Must register before emitting:**

```typescript
const eventTxHash = await sdk.streams.registerEventSchemas(
  ['MessageSent'], // Event names
  [{
    params: [
      { name: 'sender', paramType: 'address', isIndexed: true },
      { name: 'timestamp', paramType: 'uint64', isIndexed: false }
    ],
    eventTopic: 'MessageSent(address indexed sender, uint64 timestamp)'
  }]
)
```

**Event Topic Format:**
```
EventName(type1 indexed param1, type2 param2, ...)
```

**Indexed params** can be used for filtering:
```typescript
// Subscribe only to messages from specific sender
sdk.streams.subscribe(
  'MessageSent',
  [],
  (data) => {
    // Only messages from this sender
  },
  undefined,
  {
    argumentTopics: [senderAddress] // Filter by indexed param
  }
)
```

### Emitting Events (Without Writing Data)

```typescript
// Just notify, don't store anything
const txHash = await sdk.streams.emitEvents([{
  id: 'MessageSent',
  argumentTopics: [senderAddress],
  data: encodePacked(['uint64'], [timestamp])
}])
```

**Use case:** Notifications without state changes (e.g., "user logged in")

---

## Complete Patterns

### Pattern 1: Simple Key-Value Store

```typescript
// Write
await sdk.streams.set([{
  id: toHex('user:123', { size: 32 }),
  schemaId: USER_SCHEMA_ID,
  data: encodeUser({ name: 'Alice', score: 100 })
}])

// Read
const userData = await sdk.streams.getByKey(
  USER_SCHEMA_ID,
  PUBLISHER_ADDRESS,
  toHex('user:123', { size: 32 })
)
```

**Good for:** User profiles, configuration, static data

---

### Pattern 2: Append-Only Log

```typescript
// Write with unique ID (timestamp-based)
const logId = toHex(`log-${Date.now()}`, { size: 32 })

await sdk.streams.setAndEmitEvents(
  [{
    id: logId,
    schemaId: LOG_SCHEMA_ID,
    data: encodeLog({ message: 'Event occurred', timestamp: Date.now() })
  }],
  [{
    id: 'LogAdded',
    argumentTopics: [],
    data: '0x'
  }]
)

// Read all logs
const allLogs = await sdk.streams.getAllPublisherDataForSchema(
  LOG_SCHEMA_ID,
  PUBLISHER_ADDRESS
)
```

**Good for:** Event logs, transaction history, audit trails

---

### Pattern 3: Single Global State (Canvas/Game State)

```typescript
// Use a constant data ID
const STATE_ID = toHex('global-state', { size: 32 })

// Read-Modify-Write
async function updateState(modification: (current: State) => State) {
  // 1. Read
  const currentData = await sdk.streams.getByKey(
    STATE_SCHEMA_ID,
    PUBLISHER_ADDRESS,
    STATE_ID
  )
  
  let currentState = currentData ? decodeState(currentData[0]) : getDefaultState()
  
  // 2. Modify
  const newState = modification(currentState)
  
  // 3. Write
  await sdk.streams.setAndEmitEvents(
    [{
      id: STATE_ID,
      schemaId: STATE_SCHEMA_ID,
      data: encodeState(newState)
    }],
    [{
      id: 'StateUpdated',
      argumentTopics: [],
      data: '0x'
    }]
  )
}

// Usage
await updateState((current) => {
  current.score += 10
  return current
})
```

**Good for:** Game state, collaborative editors, shared canvases

---

### Pattern 4: Oracle (Off-Chain → On-Chain)

```typescript
// Fetch from external API, publish to blockchain
async function syncOracleData() {
  // 1. Fetch from API
  const externalData = await fetch('https://api.example.com/data').then(r => r.json())
  
  // 2. Transform to schema format
  const transformed = transformToSchema(externalData)
  
  // 3. Publish to blockchain
  await sdk.streams.setAndEmitEvents(
    [{
      id: toHex(`data-${Date.now()}`, { size: 32 }),
      schemaId: ORACLE_SCHEMA_ID,
      data: encodeOracleData(transformed)
    }],
    [{
      id: 'OracleUpdated',
      argumentTopics: [],
      data: '0x'
    }]
  )
}

// Run as cron job (Vercel cron, AWS Lambda, etc.)
```

**Good for:** Price feeds, weather data, sports scores, any external data

---

## Common Gotchas

### 1. WebSocket Transport Required for Subscriptions

❌ **Wrong:**
```typescript
const sdk = new SDK({
  public: createPublicClient({
    transport: http(RPC_URL) // Can't subscribe with HTTP!
  })
})

await sdk.streams.subscribe(...) // Will fail
```

✅ **Correct:**
```typescript
const sdk = new SDK({
  public: createPublicClient({
    transport: webSocket(WSS_URL) // WebSocket required
  })
})

await sdk.streams.subscribe(...) // Works!
```

---

### 2. Production Must Use wss:// Not ws://

❌ **Wrong (will fail on HTTPS sites):**
```typescript
webSocket('ws://dream-rpc.somnia.network') // Insecure WebSocket
```

✅ **Correct:**
```typescript
webSocket('wss://dream-rpc.somnia.network') // Secure WebSocket
```

**Error:** "An insecure WebSocket connection may not be initiated from a page loaded over HTTPS"

---

### 3. Reading from Wrong Publisher Address

❌ **Wrong (common bug in Somnia Place):**
```typescript
// Reading from user's wallet instead of server/oracle address
const data = await sdk.streams.getAllPublisherDataForSchema(
  SCHEMA_ID,
  userWalletAddress // Wrong! This is empty
)
```

✅ **Correct:**
```typescript
// Read from the address that WROTE the data
const data = await sdk.streams.getAllPublisherDataForSchema(
  SCHEMA_ID,
  SERVER_WALLET_ADDRESS // The account that published the data
)
```

**In Somnia Place bug:** User's wallet was used for reads, causing empty canvas. Server wallet must be used since server publishes the data.

---

### 4. ethCall Result Decoding (Multi-Layer)

❌ **Wrong (common mistake):**
```typescript
sdk.streams.subscribe('Event', [ethCall], (data) => {
  const decoded = decodeAbiParameters([...], data.result.simulationResults[0])
  // Might fail - wrong layer!
})
```

✅ **Correct (3-layer decoding for complex schemas):**
```typescript
sdk.streams.subscribe('Event', [ethCall], (data) => {
  const rawResult = data.result.simulationResults[0]
  
  // Layer 1: bytes[] (contract return value)
  const [bytesArray] = decodeAbiParameters(
    [{ name: 'data', type: 'bytes[]' }],
    rawResult
  )
  
  if (bytesArray.length > 0) {
    // Layer 2: Schema wrapper (bytes canvasData, uint64 lastUpdate)
    const [canvasDataBytes, lastUpdate] = decodeAbiParameters(
      [
        { name: 'canvasData', type: 'bytes' },
        { name: 'lastUpdate', type: 'uint64' }
      ],
      bytesArray[0]
    )
    
    // Layer 3: Actual data (tuple[] of pixels)
    const [pixels] = decodeAbiParameters(
      [{
        name: 'pixels',
        type: 'tuple[]',
        components: [
          { name: 'x', type: 'uint32' },
          { name: 'y', type: 'uint32' },
          { name: 'color', type: 'uint8' },
          { name: 'timestamp', type: 'uint64' },
          { name: 'placer', type: 'address' }
        ]
      }],
      canvasDataBytes
    )
    
    // Now you have the actual data!
    updateCanvas(pixels)
  }
})
```

**Why 3 layers?**
- Layer 1: Smart contract returns `bytes[]` for all data queries
- Layer 2: Your schema wrapper (if you wrapped data in a struct)
- Layer 3: Your actual data array

---

### 5. Schema Must Be Registered Before Writing

❌ **Wrong:**
```typescript
await sdk.streams.set([...]) // Will revert if schema not registered
```

✅ **Correct:**
```typescript
// First: Register schema (once)
const schemaId = await sdk.streams.computeSchemaId(SCHEMA)
const isRegistered = await sdk.streams.isDataSchemaRegistered(schemaId)

if (!isRegistered) {
  await sdk.streams.registerDataSchemas([{
    schema: SCHEMA,
    parentSchemaId: zeroBytes32
  }])
}

// Then: Write data
await sdk.streams.set([...])
```

---

### 6. Values Must Be Strings in encodeData

❌ **Wrong:**
```typescript
encoder.encodeData([
  { name: 'timestamp', value: Date.now(), type: 'uint64' } // Number!
])
```

✅ **Correct:**
```typescript
encoder.encodeData([
  { name: 'timestamp', value: Date.now().toString(), type: 'uint64' } // String!
])
```

---

### 7. Data IDs Must Be bytes32

❌ **Wrong:**
```typescript
await sdk.streams.set([{
  id: 'my-data', // String won't work
  schemaId: SCHEMA_ID,
  data: encodedData
}])
```

✅ **Correct:**
```typescript
import { toHex } from 'viem'

await sdk.streams.set([{
  id: toHex('my-data', { size: 32 }), // Converts to bytes32
  schemaId: SCHEMA_ID,
  data: encodedData
}])
```

---

## Architecture Patterns

### Serverless Read + Write Pattern

**Best for:** Production apps with user writes

```
┌─────────────────────────────────────────────┐
│              Client (Browser)                │
│                                              │
│  - Read: Direct blockchain (SDK)            │
│  - Subscribe: WebSocket to blockchain       │
│  - Write: POST to API route                 │
└─────────────────────────────────────────────┘
                  ↓ (POST /api/write)
┌─────────────────────────────────────────────┐
│         API Route (Server Wallet)           │
│                                              │
│  1. Validate user input                     │
│  2. Read current state (if needed)          │
│  3. Apply modification                      │
│  4. Write to blockchain (server signs)      │
└─────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│            Somnia Blockchain                │
└─────────────────────────────────────────────┘
```

**Why?**
- Client can't safely hold private key
- Server controls writes, prevents abuse
- Client gets instant updates via WebSocket

**Code:**
```typescript
// Client: Request write
async function placePixel(x: number, y: number, color: number) {
  const response = await fetch('/api/place-pixel', {
    method: 'POST',
    body: JSON.stringify({ x, y, color })
  })
  
  return response.json()
}

// Server: API route
export async function POST(request: Request) {
  const { x, y, color } = await request.json()
  
  // Validate
  if (x < 0 || x >= 100) return Response.json({ error: 'Invalid x' }, { status: 400 })
  
  // Read current state
  const currentPixels = await readCanvasState()
  
  // Modify
  currentPixels.push({ x, y, color, timestamp: Date.now() })
  
  // Write (server wallet signs)
  const txHash = await sdk.streams.setAndEmitEvents([...], [...])
  
  return Response.json({ success: true, txHash })
}
```

---

### Oracle Pattern (External Data → Blockchain)

**Best for:** Publishing real-world data (prices, weather, sports)

```
┌─────────────────────────────────────────────┐
│         External API (CoinGecko, etc.)      │
└─────────────────────────────────────────────┘
                  ↓ (Fetch every 30s)
┌─────────────────────────────────────────────┐
│        Cron Job (Vercel Cron/Lambda)        │
│                                              │
│  1. Fetch from API                          │
│  2. Transform to schema format              │
│  3. Detect changes                          │
│  4. Publish to blockchain                   │
└─────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│            Somnia Blockchain                │
└─────────────────────────────────────────────┘
                  ↓ (WebSocket push)
┌─────────────────────────────────────────────┐
│         Client Apps (Many!)                 │
│  - Price tracker                            │
│  - Alert app                                │
│  - Trading bot                              │
│  - Portfolio manager                        │
└─────────────────────────────────────────────┘
```

**Why?**
- One oracle serves infinite apps
- Apps don't need API keys
- Network effects (more apps = more value)

---

### Fully Client-Side Pattern (Read-Only)

**Best for:** Dashboards, analytics, viewers

```
┌─────────────────────────────────────────────┐
│              Client (Browser)                │
│                                              │
│  - Read: Direct blockchain queries          │
│  - Subscribe: WebSocket for updates         │
│  - No writes (read-only app)                │
└─────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│            Somnia Blockchain                │
│        (Data published by others)           │
└─────────────────────────────────────────────┘
```

**Why?**
- Simplest architecture
- No backend needed
- Zero infrastructure costs
- Perfect for analytics dashboards

---

## Performance Best Practices

### 1. Use ethCalls to Eliminate Extra Queries

❌ **Slow (2 round-trips):**
```typescript
sdk.streams.subscribe('Event', [], async (data) => {
  // Event fires → then fetch data separately
  const fullData = await sdk.streams.getByKey(...) // Extra query!
  updateUI(fullData)
})
```

✅ **Fast (1 round-trip):**
```typescript
sdk.streams.subscribe('Event', [ethCall], (data) => {
  // Event fires with data already bundled
  const fullData = decodeEthCallResult(data.result.simulationResults[0])
  updateUI(fullData) // Instant!
})
```

**Latency:** 200-500ms → <50ms

---

### 2. Batch Writes

❌ **Slow (multiple transactions):**
```typescript
await sdk.streams.set([{ id: id1, ... }])
await sdk.streams.set([{ id: id2, ... }])
await sdk.streams.set([{ id: id3, ... }])
```

✅ **Fast (one transaction):**
```typescript
await sdk.streams.set([
  { id: id1, ... },
  { id: id2, ... },
  { id: id3, ... }
])
```

---

### 3. Read Once, Subscribe for Updates

❌ **Inefficient (constant polling):**
```typescript
setInterval(async () => {
  const data = await sdk.streams.getAllPublisherDataForSchema(...)
  updateUI(data)
}, 5000) // Polls every 5 seconds
```

✅ **Efficient (read once + subscribe):**
```typescript
// Initial load
const initialData = await sdk.streams.getAllPublisherDataForSchema(...)
updateUI(initialData)

// Then subscribe for updates
sdk.streams.subscribe('DataUpdated', [ethCall], (data) => {
  updateUI(decodeEthCallResult(data))
})
```

---

### 4. Client-Side Caching

```typescript
const cache = new Map<string, any>()

async function getCachedData(key: string) {
  if (cache.has(key)) {
    return cache.get(key)
  }
  
  const data = await sdk.streams.getByKey(...)
  cache.set(key, data)
  
  return data
}

// Invalidate on updates
sdk.streams.subscribe('DataUpdated', [], () => {
  cache.clear() // Or selective invalidation
})
```

---

## Quick Reference

### SDK Methods

| Method | Purpose | Requires Wallet? |
|--------|---------|------------------|
| `registerDataSchemas` | Register schema | ✅ Yes |
| `computeSchemaId` | Get schema ID | ❌ No |
| `isDataSchemaRegistered` | Check if registered | ❌ No |
| `set` | Write data | ✅ Yes |
| `emitEvents` | Emit events only | ✅ Yes |
| `setAndEmitEvents` | Write + emit (atomic) | ✅ Yes |
| `getByKey` | Read single item | ❌ No |
| `getAllPublisherDataForSchema` | Read all items | ❌ No |
| `totalPublisherDataForSchema` | Count items | ❌ No |
| `subscribe` | Real-time updates | ❌ No (needs WSS) |

### Common Imports

```typescript
import { SDK, SchemaEncoder, zeroBytes32 } from '@somnia-chain/streams'
import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  webSocket,
  toHex,
  encodeFunctionData,
  decodeAbiParameters,
  encodePacked
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
```

---

## Example: Complete Flow

Here's a complete example showing all concepts:

```typescript
// 1. Setup
const SCHEMA = `uint64 timestamp, string message`
const encoder = new SchemaEncoder(SCHEMA)

// 2. Register schema (once)
const schemaId = await sdk.streams.computeSchemaId(SCHEMA)
if (!(await sdk.streams.isDataSchemaRegistered(schemaId))) {
  await sdk.streams.registerDataSchemas([{
    schema: SCHEMA,
    parentSchemaId: zeroBytes32
  }])
}

// 3. Register event (once)
await sdk.streams.registerEventSchemas(['MessageSent'], [{
  params: [],
  eventTopic: 'MessageSent()'
}])

// 4. Write data
const messageId = toHex(`msg-${Date.now()}`, { size: 32 })
const encodedData = encoder.encodeData([
  { name: 'timestamp', value: Date.now().toString(), type: 'uint64' },
  { name: 'message', value: 'Hello, Data Streams!', type: 'string' }
])

await sdk.streams.setAndEmitEvents(
  [{ id: messageId, schemaId, data: encodedData }],
  [{ id: 'MessageSent', argumentTopics: [], data: '0x' }]
)

// 5. Read data
const allMessages = await sdk.streams.getAllPublisherDataForSchema(
  schemaId,
  publisherAddress
)

// 6. Subscribe to updates
sdk.streams.subscribe('MessageSent', [], (data) => {
  console.log('New message!')
  // Fetch updated data or use ethCalls
})
```

---

## Troubleshooting

### "Schema not registered" error
- Run `isDataSchemaRegistered` to check
- Register with `registerDataSchemas`
- Verify schema ID in environment variables

### WebSocket disconnects
- Use `wss://` not `ws://`
- Check Somnia RPC status
- Implement reconnection logic

### ethCall results empty
- Verify contract address is correct
- Check ABI encoding is correct
- Ensure data exists on-chain first

### Data not updating
- Check publisher address is correct
- Verify schema ID matches
- Look for decoding errors in console

### "Unauthorized" in cron
- Verify `CRON_SECRET` environment variable
- Check authorization header in request

---

## Additional Resources

- **Somnia Docs**: https://docs.somnia.network
- **SDK Package**: https://www.npmjs.com/package/@somnia-chain/streams
- **Viem Docs**: https://viem.sh
- **Example Apps**: Somnia Place, Chunked

---

## Changelog

### Learnings from Somnia Place Development

1. **Fixed WebSocket URLs**: Must use `wss://` for HTTPS deployments
2. **Discovered read bug**: Must read from publisher address that WROTE the data, not user address
3. **Clarified ethCalls decoding**: Multi-layer decoding required for complex schemas
4. **Optimized read pattern**: Client-side reads with retry logic
5. **Fixed canvas corruption**: Server wallet must publish, not individual users
6. **Improved state management**: Read-Modify-Write pattern essential for complex state

These patterns are production-tested and work reliably.

---

**This reference contains everything needed to build production apps with Somnia Data Streams.**

