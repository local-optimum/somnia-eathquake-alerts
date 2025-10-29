# ethCalls Limitation: Static Arguments at Subscription Time

**Date:** October 28, 2025  
**Project:** Earthquake Alerts Demo (Somnia Data Streams)  
**Severity:** Medium - Limits zero-fetch use case for growing datasets  
**Status:** ✅ RESOLVED IN v0.9.1 🎉

---

## 🎉 RESOLUTION (SDK v0.9.1)

**The Somnia team delivered a perfect solution!** SDK v0.9.1 introduces:

### New Features

1. **`getLastPublishedDataForSchema(schemaId, publisher)`**
   - Always returns the LATEST published data
   - No dynamic index needed!
   - Perfect for time-series/append-only data
   
2. **`SchemaEncoder.decode(data)`**
   - Proper decoding method now exists in SDK
   - Clean, simple API
   
3. **`getBetweenRange` without multicall3**
   - Uses new contract view function
   - No longer requires multicall3
   - Works on all chains!

### The Working Pattern (v0.9.1+)

```typescript
// Get protocol info
const protocolInfo = await sdk.streams.getSomniaDataStreamsProtocolInfo()

// Create encoder
const schemaEncoder = new SchemaEncoder(EARTHQUAKE_SCHEMA)

// Subscribe with ethCall that gets LATEST data
await sdk.streams.subscribe({
  somniaStreamsEventId: 'EarthquakeDetected',
  ethCalls: [{
    to: protocolInfo.address,
    data: encodeFunctionData({
      abi: protocolInfo.abi,
      functionName: 'getLastPublishedDataForSchema',
      args: [schemaId, publisher]
    })
  }],
  onData: (data) => {
    // Decode latest earthquake from ethCall
    const lastPublishedData = decodeFunctionResult({
      abi: protocolInfo.abi,
      functionName: 'getLastPublishedDataForSchema',
      data: data.result.simulationResults[0]
    })
    
    // Decode with SchemaEncoder
    const decoded = schemaEncoder.decode(lastPublishedData)
    
    // Process earthquake - it came bundled with the event!
    const quake = parseEarthquake(decoded)
    addToUI(quake)
    
    // ZERO additional fetches! 🚀
  }
})
```

### Result

✅ TRUE zero-fetch pattern achieved!  
✅ No static argument limitations  
✅ No index tracking needed  
✅ No multicall3 workarounds  
✅ Clean, simple code  
✅ Works perfectly for time-series data  

**This is exactly what ethCalls was designed for!**

---

## Original Issue (For Historical Reference)

---

## Executive Summary

While building a real-time earthquake monitoring system, we discovered that **ethCall arguments are encoded statically at subscription creation time**, making it impossible to achieve true "zero additional fetches" for dynamically growing datasets where each event represents a new record at an incrementing index.

This limits the effectiveness of the ethCalls pattern for time-series/append-only data streams, which are a primary use case for Data Streams.

---

## The Use Case

**Goal:** Real-time earthquake monitoring where:
- Oracle publishes earthquakes to Data Streams as they occur
- Each earthquake is stored at an incremental index (0, 1, 2, ...)
- Each publish triggers an `EarthquakeDetected` event
- Frontend receives event + earthquake data bundled via ethCall (zero extra fetches)

**Expected Pattern:**
```typescript
// Track which index we've processed
let currentIndex = BigInt(0)

// Subscribe with ethCall to get earthquake at currentIndex
await sdk.streams.subscribe({
  somniaStreamsEventId: 'EarthquakeDetected',
  ethCalls: [{
    to: contractAddress,
    data: encodeFunctionData({
      functionName: 'getAtIndex',
      args: [schemaId, publisher, currentIndex] // ← We want this to be DYNAMIC
    })
  }],
  onData: (data) => {
    // Decode earthquake from ethCall result
    const quake = decodeEarthquake(data.result.simulationResults[0])
    
    // Process it
    addToUI(quake)
    
    // Increment for next event
    currentIndex++  // ← This doesn't update the ethCall!
  }
})
```

---

## The Problem

### What We Discovered

**ethCall arguments are encoded once at subscription creation time and remain static for the lifetime of the subscription.**

This means:
1. When we create the subscription, `currentIndex = 81`
2. The ethCall is encoded with `getAtIndex(..., 81)`
3. **Every subsequent event** uses the same encoded call: `getAtIndex(..., 81)`
4. Even though we increment `currentIndex` in our code, the ethCall still requests index 81
5. For new earthquakes at index 82, 83, 84... the ethCall returns `0x` (empty data)

### Error Encountered

```
AbiDecodingZeroDataError: Cannot decode zero data ("0x") with ABI parameters.
```

This happens because `getAtIndex(schemaId, publisher, 81)` returns empty when called for the 82nd, 83rd, 84th earthquake events.

---

## Why This Is a Limitation

### Primary Use Case Affected: Time-Series Data

Data Streams is designed for real-time, append-only data (IoT sensors, financial feeds, **earthquake alerts**, game events, etc.). These all follow the pattern:

```
Event 1 → Record at index 0
Event 2 → Record at index 1  
Event 3 → Record at index 2
...
Event N → Record at index N-1
```

For this pattern, we **need** the ethCall to fetch `index = N-1` (the latest), but we can't because the index is hardcoded at subscription time.

### ethCalls Value Proposition Diminished

The marketing pitch for ethCalls is:
> "Bundle on-chain data with events for **zero additional RPC calls** and instant reactivity"

But for growing datasets, we're **forced** to make an additional fetch inside `onData`:

```typescript
onData: async (data) => {
  // ethCall gives us total count (static call, always works)
  const total = decodeTotalCount(data.result.simulationResults[0])
  
  // But we MUST fetch the actual data separately 😞
  const newData = await sdk.streams.getBetweenRange(schemaId, publisher, currentIndex, total - 1n)
  
  // Process new data...
  currentIndex = total
}
```

This defeats the "zero additional fetches" promise for this use case.

---

## Current Workaround

We're using a **hybrid pattern**:

1. **ethCall** returns `totalPublisherDataForSchema` (always works, fast)
2. **Compare** `totalOnChain` vs `currentIndex` to detect new records
3. **If new data exists**, call `sdk.streams.getBetweenRange(currentIndex, totalOnChain - 1)` to fetch only NEW records
4. **Update** `currentIndex = totalOnChain`

### Code Implementation

```typescript
await sdk.streams.subscribe({
  somniaStreamsEventId: 'EarthquakeDetected',
  ethCalls: [{
    // Get total count (this works because no dynamic args needed)
    to: contractAddress,
    data: encodeFunctionData({
      functionName: 'totalPublisherDataForSchema',
      args: [schemaId, publisher]
    })
  }],
  onData: async (data) => {
    // Decode total from ethCall
    const [totalOnChain] = decodeAbiParameters(
      [{ name: 'total', type: 'uint256' }],
      data.result.simulationResults[0]
    )
    
    // Check if new data exists
    if (totalOnChain <= currentIndex) {
      return // No new records
    }
    
    // UNAVOIDABLE FETCH: Get new records
    const newData = await sdk.streams.getBetweenRange(
      schemaId,
      publisher,
      currentIndex,
      totalOnChain - BigInt(1)
    )
    
    // Process new records
    for (const record of newData) {
      const quake = decodeEarthquake(record)
      addToUI(quake)
    }
    
    currentIndex = totalOnChain
  }
})
```

### Performance Impact

- **Good:** Only fetches NEW records (typically 1 per event)
- **Bad:** Still requires 1 RPC call per event (not "zero fetches")
- **Worse than naive approach?** No - better than refetching all 80+ records
- **But:** Not as good as promised "zero fetches"

---

## Potential Solutions

### Option 1: Dynamic ethCall Arguments

Allow ethCall arguments to be **computed at event time** instead of subscription time.

**Possible API:**
```typescript
ethCalls: [{
  to: contractAddress,
  data: (eventData, context) => {
    // Access to subscription-scoped state
    return encodeFunctionData({
      functionName: 'getAtIndex',
      args: [schemaId, publisher, context.currentIndex]
    })
  }
}]
```

**Pros:**
- Enables true zero-fetch pattern for growing datasets
- Maintains all benefits of ethCalls
- Backward compatible (static data still works)

**Cons:**
- More complex implementation
- Requires maintaining per-subscription state
- Potential security considerations (what can access `context`?)

---

### Option 2: Event Payload Enrichment

Allow events to carry **indexed parameters** that can be used in ethCalls.

**Example:**
```solidity
event EarthquakeDetected(bytes32 indexed schemaId, address indexed publisher, uint256 newIndex);
```

**Then:**
```typescript
ethCalls: [{
  to: contractAddress,
  data: encodeFunctionData({
    functionName: 'getAtIndex',
    args: [
      '{{schemaId}}',      // ← Replaced with event param
      '{{publisher}}',     // ← Replaced with event param  
      '{{newIndex}}'       // ← Replaced with event param
    ]
  })
}]
```

**Pros:**
- Clean declarative syntax
- Publisher controls what data is available
- Natural fit with Solidity events

**Cons:**
- Requires event schema changes
- Template syntax might be complex
- Limited to data in event parameters

---

### Option 3: Built-in "Latest Record" Helper

Add a contract function specifically for this pattern:

```solidity
function getLatestPublisherData(bytes32 schemaId, address publisher) 
    returns (bytes[] memory)
{
    uint256 total = totalPublisherDataForSchema(schemaId, publisher);
    if (total == 0) return new bytes[](0);
    return getAtIndex(schemaId, publisher, total - 1);
}
```

**Usage:**
```typescript
ethCalls: [{
  to: contractAddress,
  data: encodeFunctionData({
    functionName: 'getLatestPublisherData',  // ← Always returns newest record
    args: [schemaId, publisher]
  })
}]
```

**Pros:**
- Simple, works with current SDK
- No breaking changes
- Solves 80% of the use case

**Cons:**
- Only returns 1 record (what if multiple published between events?)
- Doesn't solve the general "dynamic args" problem
- Adds another contract function

---

### Option 4: Client-Side Caching with Smart Subscriptions

SDK maintains a **local cache** of records and automatically fetches missing ones:

```typescript
await sdk.streams.subscribeWithAutoFetch({
  somniaStreamsEventId: 'EarthquakeDetected',
  schemaId,
  publisher,
  onData: (newRecords) => {
    // SDK handles: detecting new records, fetching them, deduping
    // We just get the new data!
    newRecords.forEach(addToUI)
  }
})
```

**Pros:**
- Best developer experience
- SDK handles all complexity
- Could use IndexedDB for persistence

**Cons:**
- Significant SDK complexity
- Requires local state management
- Breaks "thin client" philosophy
- Still needs fetches (just hidden from developer)

---

## Impact Assessment

### Who This Affects

**High Impact:**
- IoT/sensor data streams (temperature, pressure, location)
- Financial data feeds (trades, price updates)  
- Gaming leaderboards and event logs
- Real-time alerts (earthquakes, weather, security)
- Any append-only time-series data

**Low Impact:**
- Key-value stores with static keys
- Reference data that updates in-place
- Small datasets that can be refetched cheaply

### Business Impact

- **Marketing:** Can't claim "zero fetches" for primary use case
- **Performance:** Additional latency per event (1 RPC call)
- **Developer Experience:** Workaround is non-obvious, requires explanation
- **Adoption:** May discourage use of ethCalls for time-series data

---

## Recommendations

### Short Term (For Current SDK)

1. **Document the limitation** clearly in ethCalls docs
2. **Provide the workaround pattern** as a best practice (as shown above)
3. **Consider Option 3** (`getLatestPublisherData`) - easiest to implement

### Medium Term (Next SDK Release)

1. **Implement Option 1 or Option 2** for dynamic arguments
2. **Benchmark performance** impact of dynamic encoding
3. **Provide migration guide** for existing users

### Long Term (Future Consideration)

1. **Explore Option 4** as a "premium" developer experience
2. **Consider specialized subscription types** for different data patterns:
   - `subscribeToKeyValue()` - current pattern works great
   - `subscribeToTimeSeries()` - auto-handles growing datasets
   - `subscribeToStream()` - high-frequency data with batching

---

## Additional Issue: multicall3 Not Available

**Status:** ✅ RESOLVED IN v0.9.1

`getBetweenRange` in v0.9.1+ now uses a new contract view function instead of multicall3. This resolves the issue completely - `getBetweenRange` now works on all chains without requiring multicall3 deployment!

---

## Testing Notes

### How to Reproduce

1. Set up Data Streams schema with append-only data
2. Publish multiple records to incrementing indices
3. Subscribe with ethCall using `getAtIndex(schemaId, publisher, N)` where N is hardcoded
4. Publish a new record at index N+1
5. Observe ethCall returns `0x` and decoding fails

### Workaround Verification

Our current implementation successfully:
- ✅ Detects new records via `totalPublisherDataForSchema` ethCall
- ✅ Fetches only NEW records with `getBetweenRange(currentIndex, total-1)`  
- ✅ Handles multiple records published between events
- ✅ Maintains correct `currentIndex` state
- ✅ No duplicate processing

But it **does not** achieve zero additional fetches.

---

## Related Discussion

This issue came up while implementing the **Earthquake Alerts** demo, which showcases Somnia Data Streams for real-time global earthquake monitoring. The demo is designed to highlight the value of ethCalls for instant reactivity, but we had to implement a workaround that diminishes that value proposition.

**Demo Links:**
- Live: [earthquake-alerts.vercel.app]
- Repo: [github.com/local-optimum/somnia-earthquake-alerts]

---

## Conclusion

ethCalls are powerful for **static or keyed data**, but the **static argument encoding** limits their effectiveness for **growing, indexed datasets** (time-series data), which is a primary use case for Data Streams.

We recommend implementing **dynamic ethCall arguments** (Option 1) or **event payload enrichment** (Option 2) to unlock the full zero-fetch promise for time-series data streams.

---

**Questions?**  
Happy to discuss implementation approaches, provide more examples, or help test any proposed solutions!

