# 🌍 Real-Time Earthquake Monitor

A real-time global earthquake monitoring system powered by **Somnia Data Streams**. Fetches earthquake data from USGS, publishes it to the Somnia blockchain, and displays it on an interactive 2D world map with animations and timeline controls.

![Earthquake Monitor Demo](https://img.shields.io/badge/Powered%20by-Somnia%20Data%20Streams-red)

## ✨ Features

- 🔴 **Real-time earthquake monitoring** from USGS
- 🗺️ **Interactive 2D world map** with pulsing markers (magnitude-based colors)
- ⏰ **Timeline scrubber** with playback controls (1x-60x speed)
- 📊 **Live stats dashboard** (total, max magnitude, average)
- 🔔 **Browser notifications** for significant earthquakes (M4.5+)
- ⛓️ **On-chain data storage** via Somnia Data Streams
- 📡 **WebSocket subscriptions** for instant updates
- 🎨 **Dark theme** with glass morphism UI

## 🏗️ Architecture

```
USGS API (off-chain)
    ↓
Oracle Service (Vercel Cron - every 60s)
    ↓
Somnia Data Streams (on-chain)
    ↓
WebSocket Subscription
    ↓
Frontend (Next.js + Leaflet)
```

## 📋 Prerequisites

- Node.js 18+
- Somnia testnet wallet with STT tokens (for oracle)
- [Get testnet tokens](https://faucet.somnia.network)

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/local-optimum/somnia-earthquake-alerts.git
cd earthquake-alerts
npm install
```

### 2. Environment Setup

Copy `.env.example` to `.env.local` and fill in:

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

# Use dev secret for local testing
CRON_SECRET=dev-secret
```

### 3. Register Schema

This only needs to be done once:

```bash
npm run register-schema
```

Copy the output values to your `.env.local`:
- `NEXT_PUBLIC_EARTHQUAKE_SCHEMA_ID`
- `NEXT_PUBLIC_PUBLISHER_ADDRESS`

### 4. Start Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

### 5. Test Oracle Sync

In a separate terminal, manually trigger the oracle:

```bash
# Run once
npm run dev-sync

# Or run continuously (every 30 seconds)
npm run dev-sync:watch
```

This will fetch earthquakes from USGS and publish them to the blockchain.

## 📦 Data Schema

Earthquakes are stored on-chain with this schema:

```solidity
string earthquakeId    // USGS earthquake ID
string location        // Human-readable location
uint16 magnitude       // Magnitude * 10 (e.g., 4.5 → 45)
uint32 depth           // Depth in km * 10
int32 latitude         // Lat * 1,000,000 (fixed-point)
int32 longitude        // Lng * 1,000,000 (fixed-point)
uint64 timestamp       // Unix timestamp (ms)
string url             // Link to USGS details
```

## 🔧 Configuration

### Magnitude Threshold

Adjust in `app/api/cron/sync-earthquakes/route.ts`:

```typescript
const MIN_MAGNITUDE = 2.0  // Lower for more data, higher for less
```

**Recommended values:**
- `1.0+` - Hundreds per hour (very busy)
- `2.0+` - 100-200 per day (good activity) ⭐ **Current**
- `2.5+` - 50-100 per day (moderate)
- `4.0+` - 5-20 per day (major events only)

### Polling Frequency

Local development:
```bash
npm run dev-sync:watch  # Every 30 seconds
```

Vercel Cron (production):
```json
// vercel.json
"crons": [{
  "path": "/api/cron/sync-earthquakes",
  "schedule": "*/1 * * * *"  // Every 60 seconds (Vercel minimum)
}]
```

## 🧪 Testing

### Test Oracle Locally

1. Ensure `.env.local` is configured
2. Start dev server: `npm run dev`
3. Run oracle: `npm run dev-sync:watch`
4. Watch the console for earthquake syncs
5. Check the frontend at http://localhost:3000

### Test Frontend Subscriptions

1. Open browser console: `F12`
2. Watch for WebSocket connection: `✅ Subscribed to EarthquakeDetected events`
3. Trigger oracle sync: `npm run dev-sync`
4. Watch for: `🔔 New earthquake event received!`
5. See new markers appear on map

### Expected Console Output

**Oracle:**
```
🔄 Starting earthquake sync...
📥 Fetching from USGS API...
📊 USGS returned 87 earthquakes
🆕 Found 3 new earthquakes to publish
  📍 M2.3 - 10 km S of Redlands, CA
     Time: 2025-10-27T10:23:45.000Z
📤 Publishing to Somnia blockchain...
✅ Published! TX: 0x...
```

**Frontend:**
```
📥 Fetching initial earthquakes from blockchain...
📊 Loaded 42 earthquakes from blockchain
🔔 Setting up earthquake WebSocket subscription...
✅ Subscribed to EarthquakeDetected events
🔔 New earthquake event received!
🆕 New earthquake detected: { magnitude: 2.3, location: "..." }
```

## 🚢 Deployment (Vercel)

### 1. Push to GitHub

```bash
git add .
git commit -m "feat: earthquake alerts app"
git push origin main
```

### 2. Deploy to Vercel

1. Import project in [Vercel](https://vercel.com/new)
2. Add environment variables from `.env.local`
3. Deploy!

### 3. Verify Cron Job

1. Go to Vercel Dashboard → Project → Cron Jobs
2. Check that `/api/cron/sync-earthquakes` is scheduled
3. Monitor executions in the Logs tab

## 📚 Project Structure

```
earthquake-alerts/
├── app/
│   ├── api/cron/sync-earthquakes/
│   │   └── route.ts              # Oracle service (USGS → Blockchain)
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Main dashboard
├── components/
│   ├── EarthquakeMap.tsx         # Leaflet map with pulsing markers
│   └── Timeline.tsx              # Timeline scrubber with playback
├── hooks/
│   └── useEarthquakes.ts         # WebSocket subscription hook
├── lib/
│   ├── chains.ts                 # Somnia testnet config
│   ├── constants.ts              # Schema + magnitude thresholds
│   ├── earthquake-encoding.ts    # Encode/decode utilities
│   └── sdk.ts                    # Somnia SDK helpers
├── scripts/
│   ├── register-earthquake-schema.ts  # One-time schema registration
│   └── dev-sync.ts                    # Manual oracle trigger
├── types/
│   └── earthquake.ts             # TypeScript interfaces
└── vercel.json                   # Cron job configuration
```

## 🐛 Troubleshooting

### No earthquakes showing

1. Check oracle is running: `npm run dev-sync`
2. Verify schema ID in `.env.local` matches registered schema
3. Check console for errors
4. Ensure wallet has STT tokens

### WebSocket not connecting

1. Verify `NEXT_PUBLIC_WSS_URL` in `.env.local`
2. Check browser console for connection errors
3. Ensure firewall allows WebSocket connections

### Schema registration fails

1. Verify wallet has STT tokens
2. Check private key format (should be 66 characters: `0x` + 64 hex)
3. Ensure using viem's built-in `somniaTestnet` chain

### Map not loading

1. Ensure Leaflet CSS is imported in `app/layout.tsx`
2. Check that dynamic import is working (no SSR)
3. Clear browser cache and reload

## 📖 Learn More

- [Somnia Data Streams Documentation](https://docs.somnia.network)
- [USGS Earthquake API](https://earthquake.usgs.gov/fdsnws/event/1/)
- [Viem Documentation](https://viem.sh)
- [Leaflet Documentation](https://leafletjs.com/)

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

## 📄 License

MIT License - feel free to use this project as a learning resource or template for your own Somnia Data Streams applications.

---

Built with ❤️ using [Somnia Data Streams](https://somnia.network)
