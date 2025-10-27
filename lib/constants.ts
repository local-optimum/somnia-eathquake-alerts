export const EARTHQUAKE_SCHEMA = `string earthquakeId, string location, uint16 magnitude, uint32 depth, int32 latitude, int32 longitude, uint64 timestamp, string url` as const

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

