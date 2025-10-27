# Data Streams Issue Report: Multiple Items Not Persisting

**Date:** October 27, 2025  
**Reporter:** Oliver Smith  
**Project:** Real-time Earthquake Alerts (Somnia Testnet)  
**Severity:** Critical - Blocking Production Use

---

## Executive Summary

When publishing multiple data items with unique IDs using `setAndEmitEvents()`, only the **last item** persists on-chain, despite all transactions being confirmed successfully. This occurs even when publishing items individually with sequential transaction confirmations.

**Expected Behavior:** 45 unique earthquake records stored on-chain  
**Actual Behavior:** Only 1 earthquake record stored on-chain  
**Impact:** Prevents use of Data Streams for append-only log patterns

---

## Environment

- **Network:** Somnia Testnet
- **Chain ID:** 50312
- **RPC:** `https://dream-rpc.somnia.network`
- **SDK Version:** `@somnia-chain/streams@0.7.2`
- **Viem Version:** `2.37.13`
- **Node Version:** `20.19.2`

**Contract Addresses:**
- Data Streams Contract: `0xCe083187451f5DcBfA868e08569273a03Bb0d2de`
- Publisher Address: `0x68589FE21E85619afd2226dE29e6Ee27639E535d`
- Schema ID: `0xd79014e183884ff56e0960dc24b272d294b1061ea53c6f67494887a9cf5c3a11`

---

## Detailed Description

### Schema Definition

```typescript
const EARTHQUAKE_SCHEMA = `string earthquakeId, string location, uint16 magnitude, uint32 depth, int32 latitude, int32 longitude, uint64 timestamp, string url`
```

Registered successfully on-chain.

### Publishing Approach

We attempted **three different publishing strategies**, all with the same result:

#### Attempt 1: Batch Publishing (All at Once)

```typescript
// Prepare 45 data streams with unique IDs
const dataStreams = [
  {
    id: toHex('tx2025vcggzv', { size: 32 }),  // Unique ID
    schemaId: EARTHQUAKE_SCHEMA_ID,
    data: encodedEarthquake1
  },
  {
    id: toHex('tx2025vcgocd', { size: 32 }),  // Different unique ID
    schemaId: EARTHQUAKE_SCHEMA_ID,
    data: encodedEarthquake2
  },
  // ... 43 more unique items
]

const eventStreams = [/* corresponding events */]

// Publish all at once
const txHash = await sdk.streams.setAndEmitEvents(dataStreams, eventStreams)
```

**Result:** Transaction confirmed, but only 1 item stored on-chain.

---

#### Attempt 2: Individual Publishing (Sequential)

```typescript
// Publish each earthquake individually
for (let i = 0; i < dataStreams.length; i++) {
  const txHash = await sdk.streams.setAndEmitEvents(
    [dataStreams[i]],   // Single item
    [eventStreams[i]]   // Single event
  )
  
  console.log(`Published ${i + 1}/45: ${txHash}`)
}
```

**Result:** All 45 transactions confirmed, but only 1 item stored on-chain.

---

#### Attempt 3: Individual Publishing WITH Confirmation Waits

```typescript
const publicClient = getPublicClient()

for (let i = 0; i < dataStreams.length; i++) {
  const txHash = await sdk.streams.setAndEmitEvents(
    [dataStreams[i]],
    [eventStreams[i]]
  )
  
  // Wait for each transaction to be mined before sending next
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash as `0x${string}`,
    timeout: 30_000
  })
  
  console.log(`Confirmed ${i + 1}/45 - Status: ${receipt.status}`)
}
```

**Result:** All 45 transactions confirmed with `status: "success"`, but only 1 item stored on-chain.

---

## Evidence

### Oracle Terminal Output (Excerpt)

```
📍 M2.5 - 37 km WSW of Mentone, Texas
   ID: tx2025vcggzv
   Hex ID: 0x747832303235766367677a760000000000000000000000000000000000000000

📍 M2.2 - 37 km WSW of Mentone, Texas
   ID: tx2025vcgocd
   Hex ID: 0x7478323032357663676f63640000000000000000000000000000000000000000

[... 43 more unique earthquakes with unique hex IDs ...]

📤 Publishing earthquakes to blockchain ONE AT A TIME...

   📝 Publishing 1/45...
   ⏳ Waiting for confirmation: 0x4ce6d40181dd8368f6bd10ecaf0ed1aa7be55b7c6e2626de7814e674012abc0d
   ✅ Confirmed 1/45 - Status: success

   📝 Publishing 2/45...
   ⏳ Waiting for confirmation: 0xb06a86fb94fa59d8baf5c205ef9674e139f6e7ee60c19a8a29fd9af3a343403c
   ✅ Confirmed 2/45 - Status: success

[... continues for all 45 items ...]

   📝 Publishing 45/45...
   ⏳ Waiting for confirmation: 0xbd5a9ecbdf5ff2d641564344a0c79909594cae706a09f109216e6778a2b73cd9
   ✅ Confirmed 45/45 - Status: success

✅ Successfully published 45/45 earthquakes!
⏱️  Sync completed in 39986ms
```

### On-Chain Verification

Using the SDK's `totalPublisherDataForSchema()` method:

```typescript
const total = await sdk.streams.totalPublisherDataForSchema(
  EARTHQUAKE_SCHEMA_ID,
  PUBLISHER_ADDRESS
)

console.log(`Total earthquakes on-chain: ${total}`)
// Output: Total earthquakes on-chain: 1
```

Using `getAllPublisherDataForSchema()`:

```typescript
const allData = await sdk.streams.getAllPublisherDataForSchema(
  EARTHQUAKE_SCHEMA_ID,
  PUBLISHER_ADDRESS
)

console.log(`Items returned: ${allData?.length || 0}`)
// Output: Items returned: 1

// Decoding the single item shows it's the LAST earthquake published:
// ID: ci41320984
// Location: 12 km SSE of Anza, CA
// (This was earthquake #45 of 45 in the batch)
```

---

## Observations

1. **All transactions succeed:** Every `setAndEmitEvents()` call returns a transaction hash and confirms successfully.

2. **Unique IDs are different:** Each earthquake has a genuinely unique ID (we've verified the hex conversions are distinct).

3. **Only the last item persists:** When reading back, we only get the final earthquake published in the sequence.

4. **Events fire correctly:** WebSocket subscribers receive notifications for every published earthquake (45 events), but `ethCalls` bundled with the events also return only 1 earthquake.

5. **Pattern matches docs:** Our implementation follows the "Append-Only Log" pattern from the Data Streams documentation:

   > ```typescript
   > // Write with unique ID (timestamp-based)
   > const logId = toHex(`log-${Date.now()}`, { size: 32 })
   > 
   > await sdk.streams.setAndEmitEvents(
   >   [{
   >     id: logId,
   >     schemaId: LOG_SCHEMA_ID,
   >     data: encodeLog({ ... })
   >   }],
   >   [{ id: 'LogAdded', argumentTopics: [], data: '0x' }]
   > )
   > ```

---

## Questions for Somnia Team

### 1. Is This Expected Behavior?

Does Data Streams support storing multiple items with different IDs under the same schema and publisher, or is it designed only for single-state patterns (like the canvas example)?

### 2. Are We Using the Wrong Storage Key?

The storage key appears to be `(schemaId, publisher, dataId)`. We're providing unique `dataId` values for each earthquake. Should we be using a different approach?

### 3. Is There a Contract Limitation?

Is there a maximum number of items per schema/publisher? Or does the contract only support a single value per `(schemaId, publisher)` pair regardless of `dataId`?

### 4. Should We Use Read-Modify-Write Pattern Instead?

Should append-only data be stored as a single complex state object (e.g., `bytes earthquakeData` containing an array of all earthquakes) that we read → modify → write atomically?

Example from Somnia Place canvas pattern:
```typescript
// Read current state
const currentData = await sdk.streams.getByKey(...)
const pixels = decodePixels(currentData)

// Modify
pixels.push(newPixel)

// Write entire state
await sdk.streams.setAndEmitEvents([{
  id: CANVAS_ID,  // Same ID every time
  schemaId: CANVAS_SCHEMA_ID,
  data: encodePixels(pixels)  // All pixels
}])
```

### 5. Transaction Receipt Misleading?

If the data isn't actually being stored, why do the transactions succeed with `status: "success"`? Should we expect failures or reverts for invalid storage patterns?

---

## Requested Support

1. **Clarification on intended use:** Is Data Streams designed for append-only logs with multiple unique records, or only for single-state read-modify-write patterns?

2. **Architecture guidance:** What's the recommended pattern for storing a growing list of events (like earthquake alerts, chat messages, transaction logs)?

3. **Bug investigation:** If multiple unique items *should* persist, this appears to be a contract or SDK bug that needs investigation.

4. **Documentation update:** If our understanding is wrong, the docs should clarify the limitations more explicitly, as the "Append-Only Log" example suggests our approach should work.

---

## Workaround Considered

If Data Streams only supports single-state patterns, we could refactor to:

1. **New Schema:**
   ```typescript
   const SCHEMA = `bytes earthquakeData, uint64 lastUpdate`
   ```

2. **Encoding:**
   ```typescript
   // Encode all earthquakes as tuple array
   const encodedData = encodeAbiParameters([
     {
       name: 'earthquakes',
       type: 'tuple[]',
       components: [
         { name: 'earthquakeId', type: 'string' },
         { name: 'location', type: 'string' },
         { name: 'magnitude', type: 'uint16' },
         // ... other fields
       ]
     }
   ], [earthquakesArray])
   ```

3. **Read-Modify-Write:**
   ```typescript
   // Read current list
   const current = await sdk.streams.getByKey(...)
   const earthquakes = decodeEarthquakeList(current)
   
   // Add new ones
   earthquakes.push(...newEarthquakes)
   
   // Write entire list
   await sdk.streams.setAndEmitEvents([{
     id: GLOBAL_EARTHQUAKE_STATE_ID,  // Always same ID
     schemaId: EARTHQUAKE_SCHEMA_ID,
     data: encodeEarthquakeList(earthquakes)
   }])
   ```

However, this has significant drawbacks:
- High gas costs (rewriting entire state on every update)
- Race conditions (multiple publishers would conflict)
- Complexity (managing state size limits)
- Performance (decoding large arrays)

---

## Complete Code Repository

Full reproduction code available at:
**https://github.com/local-optimum/somnia-eathquake-alerts**

Key files:
- Oracle: `app/api/cron/sync-earthquakes/route.ts`
- Schema: `lib/constants.ts`
- Encoding: `lib/earthquake-encoding.ts`
- Check script: `scripts/check-onchain-data.ts`

---

## Contact Information

**Developer:** Oliver Smith  
**GitHub:** @local-optimum  
**Project:** Somnia Earthquake Alerts Demo

**Availability:** Please advise on the correct approach so we can complete this demonstration project showcasing Data Streams' real-time capabilities.

---

## Appendix: Full Transaction Hashes (Sample)

```
Earthquake 1/45:
  TX: 0x4ce6d40181dd8368f6bd10ecaf0ed1aa7be55b7c6e2626de7814e674012abc0d
  ID: tx2025vcggzv
  Status: success

Earthquake 2/45:
  TX: 0xb06a86fb94fa59d8baf5c205ef9674e139f6e7ee60c19a8a29fd9af3a343403c
  ID: tx2025vcgocd
  Status: success

[... 43 more ...]

Earthquake 45/45:
  TX: 0xbd5a9ecbdf5ff2d641564344a0c79909594cae706a09f109216e6778a2b73cd9
  ID: ci41320984
  Status: success
```

All transactions can be verified on the Somnia Testnet explorer.

