# 🌍 Global Earthquake Monitor

Real-time global earthquake monitoring powered by **Somnia Data Streams**.

## Features

- 🌐 **Real-time earthquake tracking** from USGS data
- 🗺️ **Interactive 2D map** with Leaflet (dark theme)
- ⏪ **Timeline scrubber** to rewind through history
- 🎮 **Playback controls** (play/pause, speed adjustment)
- 🔔 **Browser notifications** for significant quakes (M4.5+)
- 📊 **Live statistics** and earthquake feed
- ⚡ **WebSocket push notifications** (zero polling!)

## Tech Stack

- **Next.js 14** (App Router)
- **Somnia Data Streams SDK v0.7.0** (on-chain data streaming)
- **Viem** (blockchain interactions)
- **Leaflet + react-leaflet** (interactive mapping)
- **Tailwind CSS** (styling)

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Copy `env.example` to `.env.local` and fill in your values:

```bash
cp env.example .env.local
```

Required variables:
- `ORACLE_PRIVATE_KEY` - Private key for oracle wallet (will publish earthquake data)
- `CRON_SECRET` - Random secret for cron authentication (generate with `openssl rand -base64 32`)

The following will be populated after schema registration:
- `NEXT_PUBLIC_EARTHQUAKE_SCHEMA_ID`
- `NEXT_PUBLIC_PUBLISHER_ADDRESS`

### 3. Register Schemas

Register the earthquake data schema and event schema on-chain:

```bash
npm run register-schema
```

This will output the schema ID and publisher address - add these to your `.env.local`.

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Architecture

```
USGS API (every 60s)
  → Oracle Service (Vercel Cron)
    → Somnia Blockchain (Data Streams)
      → WebSocket Push
        → Frontend (Real-time updates)
```

## Project Structure

```
├── app/
│   ├── api/cron/sync-earthquakes/  # Oracle service (to be created)
│   ├── layout.tsx                   # Root layout
│   └── page.tsx                     # Main page (to be created)
├── components/
│   ├── EarthquakeMap.tsx           # Leaflet map (to be created)
│   └── Timeline.tsx                # Timeline scrubber (to be created)
├── hooks/
│   └── useEarthquakes.ts           # Data subscription hook (to be created)
├── lib/
│   ├── chains.ts                   # Somnia chain config ✅
│   ├── constants.ts                # Schema and constants ✅
│   └── earthquake-encoding.ts      # Encode/decode utilities (to be created)
├── scripts/
│   └── register-earthquake-schema.ts  # Schema registration (to be created)
├── types/
│   └── earthquake.ts               # TypeScript types ✅
└── vercel.json                     # Cron configuration ✅
```

## Why Somnia Data Streams?

This demo showcases the key benefits of Somnia Data Streams:

- **⚡ Real-time Push**: WebSocket notifications mean zero polling, instant updates
- **🔗 Composability**: Any app can subscribe to earthquake data we publish
- **🔒 Transparency**: All earthquake events are verifiable on-chain
- **📈 Scalability**: Infinite users can subscribe, cost stays constant
- **💰 Efficient**: One oracle serves unlimited apps

## License

MIT

---

Built with ❤️ to demonstrate [Somnia Data Streams](https://somnia.network)
