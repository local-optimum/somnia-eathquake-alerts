import { SchemaEncoder } from '@somnia-chain/streams'
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

