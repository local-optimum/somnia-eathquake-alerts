export const EARTHQUAKE_SCHEMA = `string earthquakeId, string location, uint16 magnitude, uint32 depth, int32 latitude, int32 longitude, uint64 timestamp, string url` as const

export const EARTHQUAKE_SCHEMA_ID = process.env.NEXT_PUBLIC_EARTHQUAKE_SCHEMA_ID as `0x${string}`
export const PUBLISHER_ADDRESS = process.env.NEXT_PUBLIC_PUBLISHER_ADDRESS as `0x${string}`

// Magnitude thresholds for notifications
export const MAGNITUDE_THRESHOLDS = {
  MINOR: 2.0,      // Don't notify
  MODERATE: 4.5,   // Always notify
  STRONG: 6.0,     // Urgent notify
  SEVERE: 7.0,     // Critical notify
  EXTREME: 9.0     // Apocalyptic notify (extremely rare!)
} as const

// Magnitude colors for visualization
export const MAGNITUDE_COLORS = {
  MINOR: '#4ade80',      // Green
  MODERATE: '#fb923c',   // Orange
  STRONG: '#f87171',     // Red
  SEVERE: '#a855f7',     // Purple
  EXTREME: '#ffffff'     // White (rarest, most extreme)
} as const

