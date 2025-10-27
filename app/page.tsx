'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useEarthquakes } from '@/hooks/useEarthquakes'
import { Timeline } from '@/components/Timeline'
import { MAGNITUDE_COLORS, MAGNITUDE_THRESHOLDS } from '@/lib/constants'
import type { Earthquake } from '@/types/earthquake'

// Dynamically import map to avoid SSR issues with Leaflet
const EarthquakeMap = dynamic(
  () => import('@/components/EarthquakeMap').then(mod => mod.EarthquakeMap),
  { ssr: false, loading: () => <div className="h-full flex items-center justify-center">Loading map...</div> }
)

// Helper to get magnitude color
function getMagnitudeColor(magnitude: number): string {
  if (magnitude >= MAGNITUDE_THRESHOLDS.EXTREME) return MAGNITUDE_COLORS.EXTREME
  if (magnitude >= MAGNITUDE_THRESHOLDS.SEVERE) return MAGNITUDE_COLORS.SEVERE
  if (magnitude >= MAGNITUDE_THRESHOLDS.STRONG) return MAGNITUDE_COLORS.STRONG
  if (magnitude >= MAGNITUDE_THRESHOLDS.MODERATE) return MAGNITUDE_COLORS.MODERATE
  return MAGNITUDE_COLORS.MINOR
}

export default function Home() {
  const [earthquakes, setEarthquakes] = useState<Earthquake[]>([])
  const [timeRangeStart, setTimeRangeStart] = useState(Date.now() - 24 * 60 * 60 * 1000)
  const [timeRangeEnd, setTimeRangeEnd] = useState(Date.now())
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(10)
  const [newEarthquakeForPan, setNewEarthquakeForPan] = useState<Earthquake | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [jumpToTime, setJumpToTime] = useState<number | null>(null)
  
  // Track when component is mounted (client-side only)
  useEffect(() => {
    setIsMounted(true)
  }, [])
  
  // Callback for updating full earthquake list (from WebSocket ethCalls)
  const handleEarthquakesUpdate = useCallback((quakes: Earthquake[]) => {
    setEarthquakes(quakes)
  }, [])
  
  // Callback for new earthquakes (real-time notifications)
  const handleNewEarthquake = useCallback((quake: Earthquake) => {
    console.log('🆕 New earthquake detected:', quake)
    
    // Don't auto-pan to new earthquakes - let user control the view
    // Only pan when they explicitly click on an earthquake in Recent Activity
    
    // Send browser notification for significant earthquakes
    if (notificationsEnabled && quake.magnitude >= 4.5) {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(`M${quake.magnitude.toFixed(1)} Earthquake`, {
          body: quake.location,
          icon: '/earthquake-icon.png',
          tag: quake.earthquakeId
        })
      }
    }
  }, [notificationsEnabled])
  
  // Subscribe to earthquakes
  const { fetchInitialQuakes } = useEarthquakes({
    onNewEarthquake: handleNewEarthquake,
    onEarthquakesUpdate: handleEarthquakesUpdate,
    minMagnitude: 2.0
  })
  
  // Load initial data
  useEffect(() => {
    console.log('🚀 Starting initial earthquake fetch...')
    fetchInitialQuakes().then(quakes => {
      console.log(`✅ Initial fetch complete: ${quakes.length} earthquakes loaded`)
      if (quakes.length > 0) {
        // Debug: Show timestamp info
        const now = Date.now()
        const timestamps = quakes.map(q => ({
          id: q.earthquakeId.slice(0, 10),
          mag: q.magnitude.toFixed(1),
          location: q.location.slice(0, 30),
          timestamp: q.timestamp,
          hoursAgo: ((now - q.timestamp) / (1000 * 60 * 60)).toFixed(1)
        }))
        console.table(timestamps)
        
        const recentQuakes = quakes.filter(q => q.timestamp >= now - 24 * 60 * 60 * 1000)
        console.log(`🕐 Earthquakes in last 24h: ${recentQuakes.length}`)
      }
      setEarthquakes(quakes)
      setIsLoading(false)
    }).catch(err => {
      console.error('❌ Initial fetch failed:', err)
      setIsLoading(false)
    })
  }, [fetchInitialQuakes])
  
  // Handle timeline changes
  const handleTimeRangeChange = useCallback((start: number, end: number) => {
    setTimeRangeStart(start)
    setTimeRangeEnd(end)
  }, [])
  
  // Handle play/pause toggle (memoized to prevent React render errors)
  const handlePlayPauseToggle = useCallback(() => {
    setIsPlaying(prev => !prev)
  }, [])
  
  // Handle clicking on an earthquake in Recent Activity
  const handleEarthquakeClick = useCallback((quake: Earthquake) => {
    // Stop playback if playing
    setIsPlaying(false)
    // Jump timeline to this earthquake's time
    setJumpToTime(quake.timestamp)
    // Pan map to this earthquake
    setNewEarthquakeForPan(quake)
    // Reset jump after a brief delay
    setTimeout(() => setJumpToTime(null), 100)
  }, [])
  
  // Request notification permission
  const requestNotifications = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        setNotificationsEnabled(true)
      }
    }
  }
  
  // Calculate stats
  const visibleQuakes = earthquakes.filter(q => 
    q.timestamp >= timeRangeStart && 
    q.timestamp <= timeRangeEnd
  )
  
  // Recent Activity always shows earthquakes relative to "now", not scrubber position
  const now = Date.now()
  const activityWindow = 24 * 60 * 60 * 1000 // Always show last 24 hours in activity list
  const recentActivityQuakes = earthquakes.filter(q => 
    q.timestamp >= (now - activityWindow) && 
    q.timestamp <= now
  )
  
  const maxMagnitude = earthquakes.length > 0
    ? Math.max(...earthquakes.map(q => q.magnitude))
    : 0
  
  const avgMagnitude = earthquakes.length > 0
    ? earthquakes.reduce((sum, q) => sum + q.magnitude, 0) / earthquakes.length
    : 0
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-red-900/20 to-gray-900 text-white p-4">
      {/* Header */}
      <header className="mb-4 sm:mb-6">
        <div className="max-w-[1800px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2">
              🌍 Real-Time Earthquake Monitor
            </h1>
            <p className="text-sm sm:text-base text-gray-400">
              Powered by Somnia Data Streams • Data from USGS
            </p>
          </div>
          
          {/* Notification toggle - only render on client */}
          {isMounted && !notificationsEnabled && typeof window !== 'undefined' && 'Notification' in window && (
            <button
              onClick={requestNotifications}
              className="px-3 py-2 sm:px-4 text-sm sm:text-base bg-yellow-600 hover:bg-yellow-700 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              🔔 Enable Alerts
            </button>
          )}
          
          {isMounted && notificationsEnabled && (
            <div className="text-green-400 flex items-center gap-2 text-sm sm:text-base">
              ✅ Notifications enabled
            </div>
          )}
        </div>
      </header>
      
      {/* Stats bar */}
      <div className="max-w-[1800px] mx-auto mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="glass-strong rounded-lg p-3 sm:p-4 text-center">
          <div className="text-2xl sm:text-3xl font-bold">{earthquakes.length}</div>
          <div className="text-xs sm:text-sm text-gray-400">Total Earthquakes</div>
        </div>
        
        <div className="glass-strong rounded-lg p-3 sm:p-4 text-center">
          <div className="text-2xl sm:text-3xl font-bold">{visibleQuakes.length}</div>
          <div className="text-xs sm:text-sm text-gray-400">In Current View</div>
        </div>
        
        <div className="glass-strong rounded-lg p-3 sm:p-4 text-center">
          <div className="text-2xl sm:text-3xl font-bold">M{maxMagnitude.toFixed(1)}</div>
          <div className="text-xs sm:text-sm text-gray-400">Max Magnitude</div>
        </div>
        
        <div className="glass-strong rounded-lg p-3 sm:p-4 text-center">
          <div className="text-2xl sm:text-3xl font-bold">M{avgMagnitude.toFixed(1)}</div>
          <div className="text-xs sm:text-sm text-gray-400">Average Magnitude</div>
        </div>
      </div>
      
      {/* Main content */}
      <div className="max-w-[1800px] mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-[calc(100vh-320px)]">
        {/* Map - takes up 2 columns */}
        <div className="lg:col-span-2 h-[400px] lg:h-full">
          {!isMounted || isLoading ? (
            <div className="glass-strong rounded-xl h-full flex items-center justify-center">
              <div className="text-center">
                <div className="animate-pulse text-6xl mb-4">📊</div>
                <p className="text-xl">Loading earthquake data...</p>
              </div>
            </div>
          ) : (
            <EarthquakeMap
              earthquakes={earthquakes}
              timeRangeStart={timeRangeStart}
              timeRangeEnd={timeRangeEnd}
              newEarthquake={newEarthquakeForPan}
              onPanComplete={() => setNewEarthquakeForPan(null)}
            />
          )}
        </div>
        
        {/* Sidebar */}
        <div className="flex flex-col gap-6 lg:h-full lg:overflow-hidden">
          {/* Timeline controls */}
          <Timeline
            earthquakes={earthquakes}
            onTimeRangeChange={handleTimeRangeChange}
            isPlaying={isPlaying}
            onPlayPauseToggle={handlePlayPauseToggle}
            playbackSpeed={playbackSpeed}
            onSpeedChange={setPlaybackSpeed}
            jumpToTime={jumpToTime}
          />
          
          {/* Recent earthquakes list - fills remaining space */}
          <div className="glass-strong rounded-xl p-4 flex flex-col lg:flex-1 lg:min-h-0">
            <h3 className="font-bold text-lg mb-3 flex-shrink-0">
              Recent Activity (Last 24h)
              <span className="ml-2 text-sm text-gray-400 font-normal">
                ({recentActivityQuakes.length})
              </span>
            </h3>
            <div className="space-y-2 overflow-y-auto lg:flex-1 max-h-[500px] lg:max-h-none">
              {recentActivityQuakes.map(quake => (
                <button
                  key={quake.earthquakeId}
                  onClick={() => handleEarthquakeClick(quake)}
                  className="w-full bg-gray-800/50 rounded-lg p-3 hover:bg-gray-700 transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-1">
                    <span className="font-bold text-lg">
                      M<span style={{ color: getMagnitudeColor(quake.magnitude) }}>
                        {quake.magnitude.toFixed(1)}
                      </span>
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(quake.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300">{quake.location}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Depth: {quake.depth.toFixed(1)} km • Click to view
                  </p>
                </button>
              ))}
              
              {recentActivityQuakes.length === 0 && (
                <p className="text-center text-gray-500 py-8">
                  No earthquakes in the last 24 hours
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <footer className="max-w-[1800px] mx-auto mt-6 text-center text-xs sm:text-sm text-gray-500">
        <p>
          Built by{' '}
          <a
            href="https://github.com/local-optimum"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            local-optimum
          </a>
          {' '}with{' '}
          <a
            href="https://datastreams.somnia.network/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 hover:underline"
          >
            Somnia Data Streams
          </a>
          {' • '}Earthquake data from{' '}
          <a
            href="https://earthquake.usgs.gov/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-red-400 hover:underline"
          >
            USGS
          </a>
        </p>
      </footer>
    </div>
  )
}
