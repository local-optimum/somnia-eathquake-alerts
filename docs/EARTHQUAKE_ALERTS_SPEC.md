# Earthquake Alerts - Engineering Specification
## Real-Time Global Earthquake Monitoring with Somnia Data Streams

**Target Audience:** Junior Developer  
**Estimated Time:** 6-8 hours (1 day)  
**Difficulty:** Beginner-Friendly  
**Starting Point:** Clean Next.js project (no template cloning needed!)  

---

## 📋 Project Overview

### What We're Building
A real-time earthquake monitoring system that:
1. Fetches earthquake data from USGS API every 60 seconds (oracle/cron job)
2. Publishes new earthquakes to Somnia blockchain via Data Streams
3. Displays earthquakes on an interactive 2D world map
4. Shows radiating pulse animations (size based on magnitude)
5. **Timeline scrubber** - Rewind through time to see historical earthquakes
6. Playback controls (play/pause, speed adjustment)
7. Sends browser notifications for significant quakes (magnitude 4.5+)

### Why This Demonstrates Data Streams Value
- **Push vs Poll**: Users get instant notifications via WebSocket, no polling needed
- **Composability**: Any app can subscribe to earthquake data we publish
- **Transparency**: All earthquake events verifiable on-chain
- **Scalability**: Infinite users can subscribe, cost stays constant

### 📝 Note About This Spec
This guide uses a **clean start approach** - you'll create a fresh Next.js project and build everything from scratch following this spec. All code is provided, so you just need to copy and understand what each piece does. No cloning templates, no deleting unused code - just clean, focused development!

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│              USGS Earthquake API                     │
│     (Free, real-time earthquake data)               │
└─────────────────────────────────────────────────────┘
                       ↓
              Poll every 60 seconds
                       ↓
┌─────────────────────────────────────────────────────┐
│            Oracle Service (Vercel Cron)             │
│                                                      │
│  1. Fetch recent earthquakes (last hour)           │
│  2. Filter new ones (magnitude 2.5+)                │
│  3. Encode to schema format                         │
│  4. Publish to Data Streams (setAndEmitEvents)     │
└─────────────────────────────────────────────────────┘
                       ↓
              Transaction to blockchain
                       ↓
┌─────────────────────────────────────────────────────┐
│           Somnia Blockchain                         │
│        Data Streams Smart Contract                  │
│                                                      │
│  Schema: EARTHQUAKE_SCHEMA_ID                       │
│  Publisher: 0xYourOracleAddress                     │
│  Data: { quake1, quake2, quake3, ... }             │
│                                                      │
│  Event: EarthquakeDetected(magnitude)               │
└─────────────────────────────────────────────────────┘
                       ↓
            WebSocket push (wss://)
                       ↓
┌─────────────────────────────────────────────────────┐
│              Client Application                      │
│         (Next.js + React + Leaflet Map)             │
│                                                      │
│  - 2D world map (Leaflet/Mapbox)                    │
│  - Earthquake markers at lat/lon                    │
│  - Radiating pulse animations                       │
│  - Timeline scrubber (rewind through history)       │
│  - Playback controls (play/pause/speed)             │
│  - Real-time WebSocket subscription                 │
│  - Browser notifications                            │
└─────────────────────────────────────────────────────┘
```

---

## 📊 Data Schema Design

### Earthquake Schema
```typescript
export const EARTHQUAKE_SCHEMA = `
  string earthquakeId,
  string location,
  uint16 magnitude,
  uint32 depth,
  int32 latitude,
  int32 longitude,
  uint64 timestamp,
  string url
`
```

### Field Specifications

| Field | Type | Description | Example | Storage Format |
|-------|------|-------------|---------|----------------|
| `earthquakeId` | `string` | USGS unique ID | `"us7000m9zx"` | Raw string |
| `location` | `string` | Human-readable location | `"12 km E of Ridgecrest, CA"` | Raw string |
| `magnitude` | `uint16` | Earthquake magnitude * 10 | `52` | `5.2` → `52` |
| `depth` | `uint32` | Depth in meters | `10000` | `10 km` → `10000 m` |
| `latitude` | `int32` | Latitude * 1,000,000 | `35451200` | `35.4512°` → `35451200` |
| `longitude` | `int32` | Longitude * 1,000,000 | `-117653400` | `-117.6534°` → `-117653400` |
| `timestamp` | `uint64` | Unix timestamp (ms) | `1729800000000` | Raw USGS timestamp |
| `url` | `string` | USGS detail page | `"https://earthquake.usgs.gov/earthquakes/..."` | Raw URL |

**Why these formats?**
- **Magnitude * 10**: Preserves one decimal (5.2 becomes 52), avoids floats
- **Coordinates * 1,000,000**: Preserves 6 decimal precision, uses integers
- **Depth in meters**: More precise than kilometers, still integer

---

## 🔧 Implementation Guide

### Part 1: Project Setup (15 minutes)

#### Step 1.1: Create Clean Next.js Project
```bash
# Navigate to where you want to create the project (e.g., your projects folder)
cd ~/projects  # or wherever you keep your code

# Create new Next.js project with TypeScript and Tailwind
# This will create a NEW directory called 'earthquake-alerts'
npx create-next-app@latest earthquake-alerts \
  --typescript \
  --tailwind \
  --app \
  --no-src-dir \
  --import-alias "@/*"

# Enter the new project directory
cd earthquake-alerts

# Install core dependencies
npm install @somnia-chain/streams viem dotenv

# Install map and visualization dependencies
npm install leaflet react-leaflet
npm install -D @types/leaflet tsx
```

**Important Notes:**
- `create-next-app` will **create a new directory** called `earthquake-alerts` for you
- Don't run it inside an existing project directory
- If you get an error about the directory not being empty, you're in the wrong location

**Why start clean?**
- Earthquake alerts is fundamentally different from Somnia Place
- No wallet connection needed (oracle writes, users just view)
- Simpler architecture = faster development
- The spec provides all the code you need!

#### Step 1.1b: Optional - Copy Useful Files (if you have Somnia Place)

If you have access to the Somnia Place repo, you can copy these files to save time:

```bash
# If Somnia Place is in a sibling directory:
# ../streams-place/

# Copy Somnia chain configuration (saves typing)
mkdir -p lib
cp ../streams-place/lib/chains.ts lib/chains.ts

# Copy useful Tailwind utilities (glass effects)
# Open ../streams-place/app/globals.css
# Copy the custom utility classes (.glass, .glass-strong, etc.)
# Paste into your app/globals.css after Tailwind imports
```

**That's it!** Only copy what's useful. Everything else is built from scratch following this spec.

#### Step 1.2: Environment Setup
Create `.env.local`:
```bash
# Somnia RPC
RPC_URL=https://dream-rpc.somnia.network
WSS_URL=wss://dream-rpc.somnia.network

# Oracle wallet (create new wallet for this project)
ORACLE_PRIVATE_KEY=0x...your-private-key

# Schema ID (will be computed after registration)
NEXT_PUBLIC_EARTHQUAKE_SCHEMA_ID=

# Publisher address (your oracle wallet address)
NEXT_PUBLIC_PUBLISHER_ADDRESS=
```

#### Step 1.3: Create Chain Configuration

Create `lib/chains.ts` (or copy from Somnia Place):
```typescript
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
  }
})
```

#### Step 1.4: Create Constants
Create `lib/constants.ts`:
```typescript

export const EARTHQUAKE_SCHEMA = `
  string earthquakeId,
  string location,
  uint16 magnitude,
  uint32 depth,
  int32 latitude,
  int32 longitude,
  uint64 timestamp,
  string url
` as const

export const EARTHQUAKE_SCHEMA_ID = process.env.NEXT_PUBLIC_EARTHQUAKE_SCHEMA_ID as `0x${string}`
export const PUBLISHER_ADDRESS = process.env.NEXT_PUBLIC_PUBLISHER_ADDRESS as `0x${string}`

// Magnitude thresholds for notifications
export const MAGNITUDE_THRESHOLDS = {
  MINOR: 2.5,      // Don't notify
  LIGHT: 4.0,      // Optional notify
  MODERATE: 4.5,   // Always notify
  STRONG: 6.0,     // Urgent notify
  MAJOR: 7.0,      // Critical notify
  GREAT: 8.0       // Emergency notify
} as const

// Magnitude colors for visualization
export const MAGNITUDE_COLORS = {
  MINOR: '#4ade80',      // Green
  LIGHT: '#facc15',      // Yellow
  MODERATE: '#fb923c',   // Orange
  STRONG: '#f87171',     // Red
  MAJOR: '#dc2626',      // Dark red
  GREAT: '#991b1b'       // Very dark red
} as const
```

#### Step 1.5: Enhance Tailwind Styles

Update `app/globals.css` to add glass morphism effects:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Dark background */
body {
  background: #030712;
  color: white;
}

/* Glass morphism utilities */
@layer utilities {
  .glass {
    background: rgba(17, 24, 39, 0.5);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(75, 85, 99, 0.3);
  }
  
  .glass-strong {
    background: rgba(17, 24, 39, 0.8);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(75, 85, 99, 0.5);
  }
  
  .gradient-text {
    background: linear-gradient(to right, #ef4444, #f97316);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
}

/* Leaflet map dark theme overrides */
.leaflet-container {
  background: #1f2937;
}

.leaflet-popup-content-wrapper {
  background: #1f2937;
  color: white;
  border-radius: 0.5rem;
}

.leaflet-popup-tip {
  background: #1f2937;
}
```

---

### Part 2: Type Definitions (10 minutes)

Create `types/earthquake.ts`:
```typescript
export interface Earthquake {
  earthquakeId: string
  location: string
  magnitude: number        // Real magnitude (5.2)
  depth: number           // Depth in km
  latitude: number        // Real latitude (35.4512)
  longitude: number       // Real longitude (-117.6534)
  timestamp: number       // Unix timestamp in ms
  url: string
}

export interface USGSEarthquake {
  id: string
  properties: {
    mag: number
    place: string
    time: number
    url: string
  }
  geometry: {
    coordinates: [number, number, number] // [lon, lat, depth]
  }
}

export interface USGSResponse {
  type: string
  features: USGSEarthquake[]
  metadata: {
    generated: number
    count: number
  }
}
```

---

### Part 3: Schema Registration (30 minutes)

Create `scripts/register-earthquake-schema.ts`:
```typescript
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
```

**Run it:**
```bash
# Add to package.json scripts
{
  "scripts": {
    "register-schema": "tsx scripts/register-earthquake-schema.ts"
  }
}

# Execute
npm run register-schema

# Copy the output and update .env.local
```

---

### Part 4: Encoding/Decoding Utilities (20 minutes)

Create `lib/earthquake-encoding.ts`:
```typescript
import { SchemaEncoder } from '@somnia-chain/streams'
import { decodeAbiParameters } from 'viem'
import { EARTHQUAKE_SCHEMA } from './constants'
import type { Earthquake, USGSEarthquake } from '@/types/earthquake'

const encoder = new SchemaEncoder(EARTHQUAKE_SCHEMA)

/**
 * Convert USGS earthquake to our schema format
 */
export function transformUSGSToSchema(usgsQuake: USGSEarthquake): Earthquake {
  const [lon, lat, depthKm] = usgsQuake.geometry.coordinates
  
  return {
    earthquakeId: usgsQuake.id,
    location: usgsQuake.properties.place,
    magnitude: usgsQuake.properties.mag,
    depth: depthKm,
    latitude: lat,
    longitude: lon,
    timestamp: usgsQuake.properties.time,
    url: usgsQuake.properties.url
  }
}

/**
 * Encode earthquake data for blockchain storage
 */
export function encodeEarthquake(quake: Earthquake): `0x${string}` {
  return encoder.encodeData([
    { name: 'earthquakeId', value: quake.earthquakeId, type: 'string' },
    { name: 'location', value: quake.location, type: 'string' },
    { name: 'magnitude', value: Math.floor(quake.magnitude * 10).toString(), type: 'uint16' },
    { name: 'depth', value: Math.floor(quake.depth * 1000).toString(), type: 'uint32' },
    { name: 'latitude', value: Math.floor(quake.latitude * 1000000).toString(), type: 'int32' },
    { name: 'longitude', value: Math.floor(quake.longitude * 1000000).toString(), type: 'int32' },
    { name: 'timestamp', value: quake.timestamp.toString(), type: 'uint64' },
    { name: 'url', value: quake.url, type: 'string' }
  ])
}

/**
 * Decode blockchain data back to earthquake
 */
export function decodeEarthquake(data: `0x${string}`): Earthquake {
  const decoded = encoder.decode(data)
  
  return {
    earthquakeId: decoded[0].value as string,
    location: decoded[1].value as string,
    magnitude: (Number(decoded[2].value) / 10),
    depth: (Number(decoded[3].value) / 1000),
    latitude: (Number(decoded[4].value) / 1000000),
    longitude: (Number(decoded[5].value) / 1000000),
    timestamp: Number(decoded[6].value),
    url: decoded[7].value as string
  }
}

/**
 * Get magnitude color
 */
export function getMagnitudeColor(magnitude: number): string {
  if (magnitude >= 8.0) return '#991b1b' // Great
  if (magnitude >= 7.0) return '#dc2626' // Major
  if (magnitude >= 6.0) return '#f87171' // Strong
  if (magnitude >= 4.5) return '#fb923c' // Moderate
  if (magnitude >= 4.0) return '#facc15' // Light
  return '#4ade80' // Minor
}

/**
 * Get magnitude label
 */
export function getMagnitudeLabel(magnitude: number): string {
  if (magnitude >= 8.0) return 'Great'
  if (magnitude >= 7.0) return 'Major'
  if (magnitude >= 6.0) return 'Strong'
  if (magnitude >= 4.5) return 'Moderate'
  if (magnitude >= 4.0) return 'Light'
  return 'Minor'
}
```

---

### Part 5: Oracle Service - Cron Job (45 minutes)

Create `app/api/cron/sync-earthquakes/route.ts`:
```typescript
import { NextRequest } from 'next/server'
import { SDK, SchemaEncoder, toHex } from '@somnia-chain/streams'
import { createPublicClient, createWalletClient, http, encodePacked } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { somniaTestnet } from '@/lib/chains'
import { EARTHQUAKE_SCHEMA, EARTHQUAKE_SCHEMA_ID } from '@/lib/constants'
import { encodeEarthquake, transformUSGSToSchema } from '@/lib/earthquake-encoding'
import type { USGSResponse, Earthquake } from '@/types/earthquake'

const USGS_API = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson'
const MIN_MAGNITUDE = 2.5 // Only track magnitude 2.5+

// Oracle wallet
const ORACLE_ACCOUNT = privateKeyToAccount(
  process.env.ORACLE_PRIVATE_KEY as `0x${string}`
)

// SDK instance
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

// Track last processed earthquake (in-memory, resets on redeploy)
let lastProcessedId: string | null = null

/**
 * Vercel Cron: Runs every 60 seconds
 * Protected by Vercel Cron secret
 */
export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sets this automatically)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  console.log('🔄 Starting earthquake sync...')
  console.log('Time:', new Date().toISOString())
  
  try {
    // Step 1: Fetch from USGS
    const response = await fetch(USGS_API)
    if (!response.ok) {
      throw new Error(`USGS API error: ${response.status}`)
    }
    
    const data: USGSResponse = await response.json()
    console.log(`📊 USGS returned ${data.features.length} earthquakes`)
    
    // Step 2: Filter new earthquakes
    const newQuakes = data.features
      .filter(quake => 
        quake.properties.mag >= MIN_MAGNITUDE &&
        (lastProcessedId === null || quake.id !== lastProcessedId)
      )
      .sort((a, b) => a.properties.time - b.properties.time) // Oldest first
    
    if (newQuakes.length === 0) {
      console.log('✅ No new earthquakes')
      return Response.json({ 
        success: true, 
        newQuakes: 0,
        totalFetched: data.features.length
      })
    }
    
    console.log(`🆕 Found ${newQuakes.length} new earthquakes`)
    
    // Step 3: Transform and publish
    const dataStreams = []
    const eventStreams = []
    
    for (const usgsQuake of newQuakes) {
      const quake = transformUSGSToSchema(usgsQuake)
      
      console.log(`  📍 M${quake.magnitude.toFixed(1)} - ${quake.location}`)
      
      // Prepare data stream
      dataStreams.push({
        id: toHex(quake.earthquakeId, { size: 32 }),
        schemaId: EARTHQUAKE_SCHEMA_ID,
        data: encodeEarthquake(quake)
      })
      
      // Prepare event stream
      eventStreams.push({
        id: 'EarthquakeDetected',
        argumentTopics: [
          toHex(Math.floor(quake.magnitude * 10), { size: 32 })
        ],
        data: '0x'
      })
    }
    
    // Step 4: Publish to blockchain (atomic)
    console.log('📤 Publishing to blockchain...')
    const txHash = await sdk.streams.setAndEmitEvents(dataStreams, eventStreams)
    console.log('✅ Published! TX:', txHash)
    
    // Update last processed ID
    lastProcessedId = newQuakes[newQuakes.length - 1].id
    
    return Response.json({
      success: true,
      newQuakes: newQuakes.length,
      totalFetched: data.features.length,
      txHash,
      earthquakes: newQuakes.map(q => ({
        id: q.id,
        magnitude: q.properties.mag,
        location: q.properties.place
      }))
    })
    
  } catch (error) {
    console.error('❌ Sync failed:', error)
    return Response.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
```

---

### Part 6: Vercel Cron Configuration (5 minutes)

Create `vercel.json` in project root:
```json
{
  "crons": [
    {
      "path": "/api/cron/sync-earthquakes",
      "schedule": "* * * * *"
    }
  ]
}
```

**Note:** Vercel's minimum interval is 1 minute. For local testing, use a different approach (see Part 10).

Generate a cron secret:
```bash
# Add to .env.local
CRON_SECRET=$(openssl rand -base64 32)
echo "CRON_SECRET=$CRON_SECRET"
```

---

### Part 7: Frontend - Data Hook (30 minutes)

Create `hooks/useEarthquakes.ts`:
```typescript
import { useEffect, useRef, useCallback } from 'react'
import { SDK } from '@somnia-chain/streams'
import { createPublicClient, webSocket } from 'viem'
import { somniaTestnet } from '@/lib/chains'
import { EARTHQUAKE_SCHEMA_ID, PUBLISHER_ADDRESS } from '@/lib/constants'
import { decodeEarthquake } from '@/lib/earthquake-encoding'
import type { Earthquake } from '@/types/earthquake'

interface UseEarthquakesProps {
  onNewEarthquake: (quake: Earthquake) => void
  minMagnitude?: number
}

export function useEarthquakes({ onNewEarthquake, minMagnitude = 2.5 }: UseEarthquakesProps) {
  const onNewEarthquakeRef = useRef(onNewEarthquake)
  
  useEffect(() => {
    onNewEarthquakeRef.current = onNewEarthquake
  }, [onNewEarthquake])
  
  // Fetch initial earthquakes
  const fetchInitialQuakes = useCallback(async () => {
    console.log('📥 Fetching initial earthquakes...')
    
    const sdk = new SDK({
      public: createPublicClient({
        chain: somniaTestnet,
        transport: webSocket(process.env.NEXT_PUBLIC_WSS_URL || 'wss://dream-rpc.somnia.network')
      })
    })
    
    try {
      const allData = await sdk.streams.getAllPublisherDataForSchema(
        EARTHQUAKE_SCHEMA_ID,
        PUBLISHER_ADDRESS
      )
      
      if (!allData || allData.length === 0) {
        console.log('📭 No earthquakes found on-chain yet')
        return []
      }
      
      // Decode all earthquakes
      const earthquakes: Earthquake[] = []
      
      for (const data of allData) {
        try {
          const quake = decodeEarthquake(data as `0x${string}`)
          
          if (quake.magnitude >= minMagnitude) {
            earthquakes.push(quake)
          }
        } catch (error) {
          console.warn('Failed to decode earthquake:', error)
        }
      }
      
      console.log(`📊 Loaded ${earthquakes.length} earthquakes from blockchain`)
      return earthquakes.sort((a, b) => b.timestamp - a.timestamp) // Newest first
      
    } catch (error) {
      console.error('❌ Failed to fetch earthquakes:', error)
      return []
    }
  }, [minMagnitude])
  
  // Subscribe to new earthquakes
  useEffect(() => {
    console.log('🔔 Subscribing to earthquake events...')
    
    const sdk = new SDK({
      public: createPublicClient({
        chain: somniaTestnet,
        transport: webSocket(process.env.NEXT_PUBLIC_WSS_URL || 'wss://dream-rpc.somnia.network')
      })
    })
    
    let subscription: { unsubscribe: () => void } | undefined
    
    sdk.streams.subscribe(
      'EarthquakeDetected',
      [],
      (data: any) => {
        console.log('🔔 New earthquake event received:', data)
        
        // The event doesn't contain the full data, we need to fetch it
        // In a production app, you'd use ethCalls to bundle the data with the event
        // For simplicity, we'll just trigger a re-fetch
        fetchInitialQuakes().then(quakes => {
          if (quakes.length > 0) {
            onNewEarthquakeRef.current(quakes[0]) // Most recent
          }
        })
      },
      (error) => {
        console.error('❌ Subscription error:', error)
      }
    ).then(sub => {
      subscription = sub
      console.log('✅ Subscribed to earthquakes')
    })
    
    return () => {
      if (subscription) {
        subscription.unsubscribe()
        console.log('🔕 Unsubscribed from earthquakes')
      }
    }
  }, [fetchInitialQuakes])
  
  return { fetchInitialQuakes }
}
```

---

### Part 8A: Frontend - Timeline Component (30 minutes)

Create `components/Timeline.tsx`:
```typescript
'use client'

import { useState, useEffect } from 'react'
import type { Earthquake } from '@/types/earthquake'

interface TimelineProps {
  earthquakes: Earthquake[]
  onTimeRangeChange: (startTime: number, endTime: number) => void
  isPlaying: boolean
  onPlayPauseToggle: () => void
  playbackSpeed: number
  onSpeedChange: (speed: number) => void
}

export function Timeline({
  earthquakes,
  onTimeRangeChange,
  isPlaying,
  onPlayPauseToggle,
  playbackSpeed,
  onSpeedChange
}: TimelineProps) {
  const [currentTime, setCurrentTime] = useState(Date.now())
  const [timeWindow, setTimeWindow] = useState(24 * 60 * 60 * 1000) // 24 hours in ms
  
  // Calculate time range
  const minTime = earthquakes.length > 0 
    ? Math.min(...earthquakes.map(q => q.timestamp))
    : Date.now() - 7 * 24 * 60 * 60 * 1000 // 7 days ago
  
  const maxTime = Date.now()
  
  // Auto-play effect
  useEffect(() => {
    if (!isPlaying) return
    
    const interval = setInterval(() => {
      setCurrentTime(prev => {
        const next = prev + (1000 * playbackSpeed) // Move forward by speed
        if (next > maxTime) {
          onPlayPauseToggle() // Stop at end
          return maxTime
        }
        return next
      })
    }, 50) // Update every 50ms for smooth animation
    
    return () => clearInterval(interval)
  }, [isPlaying, playbackSpeed, maxTime, onPlayPauseToggle])
  
  // Notify parent of time range changes
  useEffect(() => {
    onTimeRangeChange(currentTime - timeWindow, currentTime)
  }, [currentTime, timeWindow, onTimeRangeChange])
  
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value)
    setCurrentTime(value)
  }
  
  const handleWindowChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTimeWindow(parseInt(e.target.value))
  }
  
  const handleReset = () => {
    setCurrentTime(maxTime)
  }
  
  // Format time for display
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  // Calculate percentage for visual indicator
  const percentage = ((currentTime - minTime) / (maxTime - minTime)) * 100
  
  return (
    <div className="glass-strong rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-lg">Timeline</h3>
        
        {/* Time window selector */}
        <select
          value={timeWindow}
          onChange={handleWindowChange}
          className="bg-gray-800 rounded px-3 py-1 text-sm"
        >
          <option value={60 * 60 * 1000}>Last Hour</option>
          <option value={6 * 60 * 60 * 1000}>Last 6 Hours</option>
          <option value={24 * 60 * 60 * 1000}>Last 24 Hours</option>
          <option value={7 * 24 * 60 * 60 * 1000}>Last 7 Days</option>
          <option value={30 * 24 * 60 * 60 * 1000}>Last 30 Days</option>
        </select>
      </div>
      
      {/* Timeline slider */}
      <div className="relative mb-4">
        <input
          type="range"
          min={minTime}
          max={maxTime}
          value={currentTime}
          onChange={handleSliderChange}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
          style={{
            background: `linear-gradient(to right, #ef4444 0%, #ef4444 ${percentage}%, #374151 ${percentage}%, #374151 100%)`
          }}
        />
        
        {/* Time markers */}
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{formatTime(minTime)}</span>
          <span className="font-bold text-white">{formatTime(currentTime)}</span>
          <span>{formatTime(maxTime)}</span>
        </div>
      </div>
      
      {/* Controls */}
      <div className="flex items-center justify-between gap-4">
        {/* Play/Pause */}
        <button
          onClick={onPlayPauseToggle}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          {isPlaying ? (
            <>⏸️ Pause</>
          ) : (
            <>▶️ Play</>
          )}
        </button>
        
        {/* Speed control */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Speed:</span>
          <div className="flex gap-1">
            {[1, 5, 10, 30, 60].map(speed => (
              <button
                key={speed}
                onClick={() => onSpeedChange(speed)}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  playbackSpeed === speed
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
        
        {/* Reset to now */}
        <button
          onClick={handleReset}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
        >
          ⏮️ Reset to Now
        </button>
      </div>
      
      {/* Stats */}
      <div className="mt-4 pt-4 border-t border-gray-700 flex justify-between text-sm">
        <div>
          <span className="text-gray-400">Earthquakes in view: </span>
          <span className="font-bold text-white">
            {earthquakes.filter(q => 
              q.timestamp >= (currentTime - timeWindow) && 
              q.timestamp <= currentTime
            ).length}
          </span>
        </div>
        <div>
          <span className="text-gray-400">Total: </span>
          <span className="font-bold text-white">{earthquakes.length}</span>
        </div>
      </div>
    </div>
  )
}
```

---

### Part 8B: Frontend - Map Component (45 minutes)

First, add Leaflet CSS to `app/layout.tsx`:
```typescript
import 'leaflet/dist/leaflet.css'
```

Create `components/EarthquakeMap.tsx`:
```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import type { Earthquake } from '@/types/earthquake'
import { getMagnitudeColor, getMagnitudeLabel } from '@/lib/earthquake-encoding'
import 'leaflet/dist/leaflet.css'

interface EarthquakeMapProps {
  earthquakes: Earthquake[]
}

/**
 * Pulsing animation component for markers
 */
function PulsingMarker({ earthquake }: { earthquake: Earthquake }) {
  const [pulseRadius, setPulseRadius] = useState(0)
  
  useEffect(() => {
    const interval = setInterval(() => {
      setPulseRadius(prev => (prev + 1) % 30) // Pulse from 0 to 30
    }, 50)
    
    return () => clearInterval(interval)
  }, [])
  
  const baseRadius = Math.max(5, earthquake.magnitude * 2) // Bigger for stronger quakes
  const color = getMagnitudeColor(earthquake.magnitude)
  
  return (
    <>
      {/* Core marker */}
      <CircleMarker
        center={[earthquake.latitude, earthquake.longitude]}
        radius={baseRadius}
        pathOptions={{
          fillColor: color,
          fillOpacity: 0.8,
          color: '#fff',
          weight: 2
        }}
      >
        <Popup>
          <div className="text-sm">
            <div className="font-bold text-lg" style={{ color }}>
              M{earthquake.magnitude.toFixed(1)}
            </div>
            <div className="font-semibold">{earthquake.location}</div>
            <div className="text-gray-600 mt-1">
              {new Date(earthquake.timestamp).toLocaleString()}
            </div>
            <div className="text-gray-600">
              Depth: {earthquake.depth.toFixed(1)} km
            </div>
            <div className="mt-2">
              <span className="px-2 py-1 rounded text-xs font-medium" style={{ 
                backgroundColor: color, 
                color: '#fff' 
              }}>
                {getMagnitudeLabel(earthquake.magnitude)}
              </span>
            </div>
            <a 
              href={earthquake.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-xs mt-2 block"
            >
              View on USGS →
            </a>
          </div>
        </Popup>
      </CircleMarker>
      
      {/* Pulsing ring */}
      <CircleMarker
        center={[earthquake.latitude, earthquake.longitude]}
        radius={baseRadius + pulseRadius}
        pathOptions={{
          fillColor: color,
          fillOpacity: Math.max(0, 0.3 - (pulseRadius / 100)),
          color: color,
          weight: 2,
          opacity: Math.max(0, 0.5 - (pulseRadius / 60))
        }}
      />
    </>
  )
}

/**
 * Auto-fit bounds when earthquakes change
 */
function FitBounds({ earthquakes }: { earthquakes: Earthquake[] }) {
  const map = useMap()
  
  useEffect(() => {
    if (earthquakes.length === 0) return
    
    const bounds = earthquakes.map(q => [q.latitude, q.longitude] as [number, number])
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 6 })
  }, [earthquakes, map])
  
  return null
}

/**
 * Main map component
 */
export function EarthquakeMap({ earthquakes }: EarthquakeMapProps) {
  const mapRef = useRef<any>(null)
  
  return (
    <div className="w-full h-full bg-gray-950 rounded-xl overflow-hidden">
      <MapContainer
        ref={mapRef}
        center={[20, 0]} // Center of world
        zoom={2}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
        {/* Base map layer (dark theme) */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        
        {/* Auto-fit to show all earthquakes */}
        <FitBounds earthquakes={earthquakes} />
        
        {/* Earthquake markers */}
        {earthquakes.map(quake => (
          <PulsingMarker key={quake.earthquakeId} earthquake={quake} />
        ))}
      </MapContainer>
    </div>
  )
}
```

---

### Part 9: Frontend - Main Page (30 minutes)

Update `app/page.tsx`:
```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Timeline } from '@/components/Timeline'
import { useEarthquakes } from '@/hooks/useEarthquakes'
import type { Earthquake } from '@/types/earthquake'
import { getMagnitudeColor, getMagnitudeLabel } from '@/lib/earthquake-encoding'

// Dynamically import map to avoid SSR issues with Leaflet
const EarthquakeMap = dynamic(
  () => import('@/components/EarthquakeMap').then(mod => ({ default: mod.EarthquakeMap })),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full"><div className="animate-spin text-4xl">🌍</div></div> }
)

export default function Home() {
  const [earthquakes, setEarthquakes] = useState<Earthquake[]>([])
  const [filteredQuakes, setFilteredQuakes] = useState<Earthquake[]>([])
  const [loading, setLoading] = useState(true)
  
  // Timeline state
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(10)
  const [timeRange, setTimeRange] = useState({ start: Date.now() - 24 * 60 * 60 * 1000, end: Date.now() })
  
  // Handle new earthquake
  const handleNewEarthquake = useCallback((quake: Earthquake) => {
    console.log('🆕 New earthquake detected:', quake)
    
    // Add to list (avoid duplicates)
    setEarthquakes(prev => {
      const exists = prev.find(q => q.earthquakeId === quake.earthquakeId)
      if (exists) return prev
      
      return [quake, ...prev].sort((a, b) => b.timestamp - a.timestamp)
    })
    
    // Show notification for significant quakes
    if (quake.magnitude >= 4.5 && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(`🚨 Earthquake M${quake.magnitude.toFixed(1)}`, {
          body: quake.location,
          icon: '/earthquake-icon.png',
          vibrate: [200, 100, 200]
        })
      }
    }
    
    // Play sound
    const audio = new Audio('/alert.mp3')
    audio.play().catch(e => console.warn('Could not play sound:', e))
  }, [])
  
  // Subscribe to earthquakes
  const { fetchInitialQuakes } = useEarthquakes({
    onNewEarthquake: handleNewEarthquake,
    minMagnitude: 2.5
  })
  
  // Load initial data
  useEffect(() => {
    fetchInitialQuakes().then(quakes => {
      setEarthquakes(quakes)
      setLoading(false)
    })
  }, [fetchInitialQuakes])
  
  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])
  
  // Filter earthquakes by time range
  useEffect(() => {
    const filtered = earthquakes.filter(q => 
      q.timestamp >= timeRange.start && q.timestamp <= timeRange.end
    )
    setFilteredQuakes(filtered)
  }, [earthquakes, timeRange])
  
  // Handle timeline controls
  const handleTimeRangeChange = useCallback((start: number, end: number) => {
    setTimeRange({ start, end })
  }, [])
  
  const handlePlayPauseToggle = useCallback(() => {
    setIsPlaying(prev => !prev)
  }, [])
  
  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackSpeed(speed)
  }, [])
  
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
            🌍 Global Earthquake Monitor
          </h1>
          <p className="text-gray-400 mt-1">
            Real-time earthquake tracking powered by Somnia Data Streams • {isPlaying ? '▶️ Playing' : '⏸️ Paused'}
          </p>
        </div>
      </header>
      
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map + Timeline */}
          <div className="lg:col-span-2 space-y-4">
            {/* Map */}
            <div className="glass-strong rounded-xl overflow-hidden" style={{ height: '600px' }}>
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="animate-spin text-6xl mb-4">🌍</div>
                    <p>Loading earthquakes...</p>
                  </div>
                </div>
              ) : (
                <EarthquakeMap earthquakes={filteredQuakes} />
              )}
            </div>
            
            {/* Timeline */}
            {!loading && (
              <Timeline
                earthquakes={earthquakes}
                onTimeRangeChange={handleTimeRangeChange}
                isPlaying={isPlaying}
                onPlayPauseToggle={handlePlayPauseToggle}
                playbackSpeed={playbackSpeed}
                onSpeedChange={handleSpeedChange}
              />
            )}
            
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="glass p-4 rounded-lg text-center">
                <div className="text-3xl font-bold text-red-500">
                  {filteredQuakes.length}
                </div>
                <div className="text-sm text-gray-400">Showing / {earthquakes.length} Total</div>
              </div>
              
              <div className="glass p-4 rounded-lg text-center">
                <div className="text-3xl font-bold text-orange-500">
                  {filteredQuakes.filter(q => q.magnitude >= 4.5).length}
                </div>
                <div className="text-sm text-gray-400">Moderate+ in View</div>
              </div>
              
              <div className="glass p-4 rounded-lg text-center">
                <div className="text-3xl font-bold text-yellow-500">
                  {filteredQuakes[0] ? `M${filteredQuakes[0].magnitude.toFixed(1)}` : '--'}
                </div>
                <div className="text-sm text-gray-400">Strongest in View</div>
              </div>
            </div>
          </div>
          
          {/* Recent list */}
          <div className="lg:col-span-1">
            <div className="glass-strong rounded-xl p-4 h-full">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                Earthquakes in Timeline
              </h2>
              
              <div className="space-y-3 overflow-y-auto" style={{ maxHeight: '680px' }}>
                {filteredQuakes.slice(0, 50).map(quake => (
                  <div 
                    key={quake.earthquakeId}
                    className="p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors cursor-pointer"
                    onClick={() => window.open(quake.url, '_blank')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span 
                            className="text-lg font-bold"
                            style={{ color: getMagnitudeColor(quake.magnitude) }}
                          >
                            M{quake.magnitude.toFixed(1)}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-700">
                            {getMagnitudeLabel(quake.magnitude)}
                          </span>
                        </div>
                        
                        <p className="text-sm text-gray-300 mt-1 truncate">
                          {quake.location}
                        </p>
                        
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(quake.timestamp).toLocaleString()}
                        </p>
                        
                        <p className="text-xs text-gray-600 mt-1">
                          Depth: {quake.depth.toFixed(1)} km
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                
                {earthquakes.length === 0 && !loading && (
                  <p className="text-center text-gray-500 py-8">
                    No earthquakes recorded yet.<br/>
                    Waiting for seismic activity...
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <footer className="border-t border-gray-800 mt-12 py-6">
        <div className="container mx-auto px-4 text-center text-gray-500 text-sm">
          <p>Data provided by USGS • Powered by Somnia Data Streams</p>
          <p className="mt-2">
            Real-time push notifications • Zero polling • Infinite scalability
          </p>
        </div>
      </footer>
    </main>
  )
}
```

---

### Part 10: Local Development & Testing (20 minutes)

#### Testing the Oracle Locally

Since Vercel cron doesn't run locally, create a dev script:

Create `scripts/dev-sync.ts`:
```typescript
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

async function runSync() {
  console.log('🔄 Running sync...')
  
  try {
    const { stdout } = await execAsync(
      'curl http://localhost:3000/api/cron/sync-earthquakes -H "Authorization: Bearer dev-secret"'
    )
    console.log(stdout)
  } catch (error) {
    console.error('Error:', error)
  }
}

// Run immediately
runSync()

// Then run every 60 seconds
setInterval(runSync, 60000)

console.log('👀 Watching for earthquakes every 60 seconds...')
console.log('Press Ctrl+C to stop')
```

Update `.env.local` for development:
```bash
# Use dev secret for local testing
CRON_SECRET=dev-secret
```

Run both:
```bash
# Terminal 1: Next.js dev server
npm run dev

# Terminal 2: Dev sync script
tsx scripts/dev-sync.ts
```

#### Manual Testing

Test the oracle endpoint manually:
```bash
curl http://localhost:3000/api/cron/sync-earthquakes \
  -H "Authorization: Bearer dev-secret"
```

---

### Part 11: Deployment (15 minutes)

#### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Set environment variables
vercel env add ORACLE_PRIVATE_KEY
vercel env add RPC_URL
vercel env add WSS_URL
vercel env add NEXT_PUBLIC_EARTHQUAKE_SCHEMA_ID
vercel env add NEXT_PUBLIC_PUBLISHER_ADDRESS
vercel env add CRON_SECRET

# Deploy
vercel --prod
```

#### Verify Deployment

1. Visit your deployment URL
2. Check Vercel dashboard → Cron Jobs
3. Verify cron is running (should show executions every minute)
4. Check logs for successful syncs

---

## 🧪 Testing Checklist

### Oracle Testing
- [ ] Cron job runs every 60 seconds
- [ ] Fetches from USGS successfully
- [ ] Filters magnitude 2.5+ earthquakes
- [ ] Encodes data correctly
- [ ] Publishes to blockchain
- [ ] Emits events
- [ ] Handles API errors gracefully
- [ ] Doesn't duplicate earthquakes

### Frontend Testing
- [ ] Map renders correctly with dark theme
- [ ] Earthquakes appear at correct lat/lon
- [ ] Markers pulse/animate smoothly
- [ ] Popup shows on marker click with full details
- [ ] Map auto-fits bounds to show all earthquakes
- [ ] Timeline slider works smoothly
- [ ] Time window selector changes visible earthquakes
- [ ] Play/pause button works
- [ ] Playback speed controls work (1x, 5x, 10x, 30x, 60x)
- [ ] Reset to now button works
- [ ] Stats show filtered vs total earthquakes
- [ ] Recent list shows only earthquakes in timeline
- [ ] WebSocket connects successfully
- [ ] Receives real-time updates
- [ ] Notifications work (for magnitude 4.5+)
- [ ] Responsive on mobile

### Performance Testing
- [ ] Map renders smoothly
- [ ] Handles 100+ earthquakes without lag
- [ ] Timeline playback is smooth
- [ ] WebSocket doesn't disconnect
- [ ] No memory leaks during long playback sessions

---

## 📊 Expected Results

### Oracle Behavior
- Runs every 60 seconds
- Typically finds 0-3 new earthquakes per run
- ~50 earthquakes per day globally (magnitude 2.5+)
- Gas cost: ~$0.0001 per write (~$0.14/month)

### User Experience
- Map loads in <2 seconds
- Earthquakes appear within 60-120 seconds of real event
- Notifications for significant quakes (<2 second delay)
- Smooth pulsing animations on markers
- Timeline allows rewinding through history
- Playback speeds: 1x, 5x, 10x, 30x, 60x
- Time windows: Last hour, 6 hours, 24 hours, 7 days, 30 days
- Works great on mobile and desktop

---

## 🐛 Common Issues & Solutions

### Issue: "Schema not registered"
**Solution:** Run `npm run register-schema` again, verify schema ID in `.env.local`

### Issue: Cron job not running
**Solution:** Check Vercel dashboard → Cron Jobs tab, verify `vercel.json` is in root, redeploy

### Issue: WebSocket disconnects
**Solution:** Verify `WSS_URL` uses `wss://` not `ws://`, check Somnia RPC status

### Issue: Map not rendering
**Solution:** Ensure Leaflet CSS is imported in `app/layout.tsx`, check browser console for errors, verify component is dynamically imported with `{ ssr: false }`

### Issue: Earthquakes not appearing
**Solution:** 
1. Check if oracle is running (check logs)
2. Verify earthquakes exist on-chain: `npm run check-data`
3. Check browser console for decoding errors

### Issue: "Unauthorized" error in cron
**Solution:** Verify `CRON_SECRET` matches in `.env.local` and Vercel settings

---

## 🚀 Enhancements (Optional)

### 1. Add ethCalls for Zero Latency
Instead of fetching after event, bundle data with event:

```typescript
// In subscribe:
sdk.streams.subscribe(
  'EarthquakeDetected',
  [{
    to: DATA_STREAMS_CONTRACT,
    data: encodeFunctionData({
      abi: streamsAbi,
      functionName: 'getByKey',
      args: [EARTHQUAKE_SCHEMA_ID, PUBLISHER_ADDRESS, earthquakeId]
    })
  }],
  (data) => {
    const quake = decodeEarthquake(data.result.simulationResults[0])
    handleNewEarthquake(quake)
  }
)
```

### 2. Add Magnitude Filters
Let users filter by magnitude:

```typescript
const [minMagnitude, setMinMagnitude] = useState(2.5)
const filteredQuakes = earthquakes.filter(q => q.magnitude >= minMagnitude)
```

### 3. Add Historical Charts
Show earthquake frequency over time using Chart.js

### 4. Add Push Notifications
Integrate with Firebase Cloud Messaging for mobile notifications

### 5. Add Sound Effects
Different sounds for different magnitudes

---

## 📚 Resources

- **USGS API Docs**: https://earthquake.usgs.gov/fdsnws/event/1/
- **Three.js Docs**: https://threejs.org/docs/
- **React Three Fiber**: https://docs.pmnd.rs/react-three-fiber
- **Somnia Data Streams**: https://docs.somnia.network/data-streams

---

## ✅ Definition of Done

Your earthquake alerts app is complete when:

1. ✅ Schema is registered on Somnia
2. ✅ Oracle cron job runs every 60 seconds
3. ✅ Earthquakes are published to blockchain
4. ✅ 2D map renders with dark theme
5. ✅ Earthquake markers appear at correct locations
6. ✅ Markers pulse and animate
7. ✅ Popups show on marker click
8. ✅ Timeline component works (slider, play/pause, speed controls)
9. ✅ Time window selector filters earthquakes
10. ✅ Stats show filtered vs total earthquakes
11. ✅ Recent list shows only earthquakes in timeline
12. ✅ Real-time updates work
13. ✅ Notifications work for significant quakes
14. ✅ App is deployed to Vercel
15. ✅ Cron is running in production

**Congratulations! You've built a real-time earthquake monitoring system with timeline rewind!** 🎉

---

## 🎓 What You Learned

- Setting up an oracle service to bridge off-chain → on-chain
- Publishing data to Somnia Data Streams (append-only pattern)
- Emitting events for real-time subscribers
- Building WebSocket subscriptions in React
- Visualizing geospatial data with Leaflet maps
- Creating interactive timeline controls with playback
- Filtering time-series data efficiently
- Deploying serverless cron jobs to Vercel
- Handling real-time updates efficiently

This pattern works for ANY frequently-updated data source. You now have the foundation to build weather alerts, sports scores, flight tracking, and more!

