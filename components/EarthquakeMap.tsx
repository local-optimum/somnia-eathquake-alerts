'use client'

import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Earthquake } from '@/types/earthquake'
import { MAGNITUDE_COLORS, MAGNITUDE_THRESHOLDS } from '@/lib/constants'

interface EarthquakeMapProps {
  earthquakes: Earthquake[]
  timeRangeStart: number
  timeRangeEnd: number
}

// Helper to get color based on magnitude
function getMagnitudeColor(magnitude: number): string {
  if (magnitude >= MAGNITUDE_THRESHOLDS.EXTREME) return MAGNITUDE_COLORS.EXTREME
  if (magnitude >= MAGNITUDE_THRESHOLDS.SEVERE) return MAGNITUDE_COLORS.SEVERE
  if (magnitude >= MAGNITUDE_THRESHOLDS.STRONG) return MAGNITUDE_COLORS.STRONG
  if (magnitude >= MAGNITUDE_THRESHOLDS.MODERATE) return MAGNITUDE_COLORS.MODERATE
  return MAGNITUDE_COLORS.MINOR
}

// Helper to get radius based on magnitude
function getMagnitudeRadius(magnitude: number): number {
  return Math.pow(2, magnitude) * 1000 // Exponential scale in meters
}

// Component to auto-fit bounds ONCE on initial load
function AutoFitBounds({ earthquakes }: { earthquakes: Earthquake[] }) {
  const map = useMap()
  const hasFitBoundsRef = useRef(false)
  
  useEffect(() => {
    if (earthquakes.length === 0 || hasFitBoundsRef.current) return
    
    // Calculate bounds (coordinates already decoded in hook)
    const latitudes = earthquakes.map(q => q.latitude)
    const longitudes = earthquakes.map(q => q.longitude)
    
    const southWest: [number, number] = [Math.min(...latitudes), Math.min(...longitudes)]
    const northEast: [number, number] = [Math.max(...latitudes), Math.max(...longitudes)]
    
    // Fit map to show all earthquakes (only once)
    map.fitBounds([southWest, northEast], { padding: [50, 50], maxZoom: 4 })
    hasFitBoundsRef.current = true
  }, [map, earthquakes])
  
  return null
}

// Pulsing marker component with fade-out over 1 hour
function PulsingMarker({ earthquake, currentTime }: { earthquake: Earthquake; currentTime: number }) {
  const [pulse, setPulse] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout>()
  
  useEffect(() => {
    // Trigger pulse animation when marker appears
    setPulse(true)
    timeoutRef.current = setTimeout(() => setPulse(false), 1000)
    
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [earthquake.earthquakeId])
  
  // Coordinates are already decoded (divided by 1_000_000) in the hook
  const lat = earthquake.latitude
  const lng = earthquake.longitude
  const color = getMagnitudeColor(earthquake.magnitude)
  const radius = Math.max(5, earthquake.magnitude * 3) // Visual radius in pixels
  
  // Calculate age of earthquake relative to current viewing position
  const ageMs = currentTime - earthquake.timestamp
  const ageHours = ageMs / (1000 * 60 * 60)
  
  // Fade out over 1 hour: 1.0 at age 0, 0.0 at age 1 hour
  const fadeOpacity = Math.max(0, Math.min(1, 1 - ageHours))
  
  // Apply fade to both fill and stroke
  const baseFillOpacity = pulse ? 0.8 : 0.6
  const baseStrokeOpacity = pulse ? 1 : 0.8
  
  return (
    <CircleMarker
      center={[lat, lng]}
      radius={radius}
      pathOptions={{
        fillColor: color,
        fillOpacity: baseFillOpacity * fadeOpacity,
        color: color,
        weight: pulse ? 3 : 1,
        opacity: baseStrokeOpacity * fadeOpacity
      }}
      className={pulse ? 'animate-pulse' : ''}
    >
      <Popup>
        <div className="text-gray-900">
          <h3 className="font-bold text-lg mb-2">
            M{earthquake.magnitude.toFixed(1)} Earthquake
          </h3>
          
          <div className="space-y-1 text-sm">
            <p>
              <span className="font-semibold">Location:</span><br />
              {earthquake.location}
            </p>
            
            <p>
              <span className="font-semibold">Depth:</span> {earthquake.depth.toFixed(1)} km
            </p>
            
            <p>
              <span className="font-semibold">Time:</span><br />
              {new Date(earthquake.timestamp).toLocaleString()}
            </p>
            
            <p>
              <span className="font-semibold">Coordinates:</span><br />
              {lat.toFixed(4)}°, {lng.toFixed(4)}°
            </p>
          </div>
          
          <a
            href={earthquake.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 block text-center bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            View on USGS →
          </a>
        </div>
      </Popup>
    </CircleMarker>
  )
}

export function EarthquakeMap({ earthquakes, timeRangeStart, timeRangeEnd }: EarthquakeMapProps) {
  // Filter earthquakes within time range AND less than 1 hour old from current viewing position
  const ONE_HOUR_MS = 60 * 60 * 1000
  const visibleQuakes = earthquakes.filter(q => {
    const age = timeRangeEnd - q.timestamp
    return q.timestamp >= timeRangeStart && 
           q.timestamp <= timeRangeEnd &&
           age <= ONE_HOUR_MS // Only show earthquakes less than 1 hour old
  })
  
  // Track if map is ready
  const [mapReady, setMapReady] = useState(false)
  
  return (
    <div className="glass-strong rounded-xl overflow-hidden h-full">
      <MapContainer
        center={[20, 0]} // Start centered on equator
        zoom={2}
        style={{ height: '100%', width: '100%' }}
        whenReady={() => setMapReady(true)}
      >
        {/* Dark tile layer for dark theme */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        
        {/* Auto-fit bounds */}
        {mapReady && visibleQuakes.length > 0 && (
          <AutoFitBounds earthquakes={visibleQuakes} />
        )}
        
        {/* Render all visible earthquakes with fade-out effect */}
        {mapReady && visibleQuakes.map(quake => (
          <PulsingMarker key={quake.earthquakeId} earthquake={quake} currentTime={timeRangeEnd} />
        ))}
      </MapContainer>
      
      {/* Legend */}
      <div className="absolute bottom-4 right-4 glass-strong rounded-lg p-3 z-[1000]">
        <h4 className="font-bold text-sm mb-2">Magnitude</h4>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: MAGNITUDE_COLORS.EXTREME }} />
            <span>8.0+ Extreme</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: MAGNITUDE_COLORS.SEVERE }} />
            <span>7.0+ Severe</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: MAGNITUDE_COLORS.STRONG }} />
            <span>6.0+ Strong</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: MAGNITUDE_COLORS.MODERATE }} />
            <span>4.5+ Moderate</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: MAGNITUDE_COLORS.MINOR }} />
            <span>2.0+ Minor</span>
          </div>
        </div>
      </div>
    </div>
  )
}

