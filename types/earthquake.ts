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

