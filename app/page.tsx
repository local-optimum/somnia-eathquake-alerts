'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useEarthquakes } from '@/hooks/useEarthquakes'
import { Timeline } from '@/components/Timeline'
import type { Earthquake } from '@/types/earthquake'

// Dynamically import map to avoid SSR issues with Leaflet
const EarthquakeMap = dynamic(
  () => import('@/components/EarthquakeMap').then(mod => mod.EarthquakeMap),
  { ssr: false, loading: () => <div className="h-full flex items-center justify-center">Loading map...</div> }
)

export default function Home() {
  const [earthquakes, setEarthquakes] = useState<Earthquake[]>([])
  const [timeRangeStart, setTimeRangeStart] = useState(Date.now() - 24 * 60 * 60 * 1000)
  const [timeRangeEnd, setTimeRangeEnd] = useState(Date.now())
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(10)
  const [isLoading, setIsLoading] = useState(true)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  
  // Track when component is mounted (client-side only)
  useEffect(() => {
    setIsMounted(true)
  }, [])
  
  // Callback for updating full earthquake list (from WebSocket ethCalls)
  const handleEarthquakesUpdate = useCallback((quakes: Earthquake[]) => {
    console.log(`📊 Earthquake list updated via WebSocket: ${quakes.length} total`)
    console.log('   Sample earthquakes:', quakes.slice(0, 3).map(q => ({
      mag: q.magnitude.toFixed(1),
      location: q.location.slice(0, 30),
      time: new Date(q.timestamp).toISOString()
    })))
    
    // Only update if we're getting a reasonable number of earthquakes
    // This prevents the WebSocket from overwriting a good initial fetch with partial data
    if (quakes.length >= 40) {
      console.log('   ✅ Accepting WebSocket update (sufficient data)')
      setEarthquakes(quakes)
    } else {
      console.warn(`   ⚠️ Ignoring WebSocket update - only ${quakes.length} earthquakes (expected 40+)`)
      console.warn('   This suggests getAllPublisherDataForSchema via ethCalls is returning partial data')
    }
  }, [])
  
  // Callback for new earthquakes (real-time notifications)
  const handleNewEarthquake = useCallback((quake: Earthquake) => {
    console.log('🆕 New earthquake detected:', quake)
    
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
  
  // Debug: Log visible quakes calculation
  useEffect(() => {
    if (earthquakes.length > 0) {
      console.log('📊 Visibility Debug:')
      console.log('  Total earthquakes:', earthquakes.length)
      console.log('  Time range:', {
        start: new Date(timeRangeStart).toISOString(),
        end: new Date(timeRangeEnd).toISOString(),
        windowHours: ((timeRangeEnd - timeRangeStart) / (1000 * 60 * 60)).toFixed(1)
      })
      console.log('  Visible quakes:', visibleQuakes.length)
      
      if (visibleQuakes.length < earthquakes.length) {
        console.log('  ⚠️ Some earthquakes are outside the visible range!')
        const invisible = earthquakes.filter(q => q.timestamp < timeRangeStart || q.timestamp > timeRangeEnd)
        console.log('  Invisible quakes:', invisible.length, invisible.map(q => ({
          mag: q.magnitude.toFixed(1),
          time: new Date(q.timestamp).toISOString(),
          beforeStart: q.timestamp < timeRangeStart,
          afterEnd: q.timestamp > timeRangeEnd
        })))
      }
    }
  }, [earthquakes, timeRangeStart, timeRangeEnd, visibleQuakes.length])
  
  const maxMagnitude = earthquakes.length > 0
    ? Math.max(...earthquakes.map(q => q.magnitude))
    : 0
  
  const avgMagnitude = earthquakes.length > 0
    ? earthquakes.reduce((sum, q) => sum + q.magnitude, 0) / earthquakes.length
    : 0
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-red-900/20 to-gray-900 text-white p-4">
      {/* Header */}
      <header className="mb-6">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">
              🌍 Real-Time Earthquake Monitor
            </h1>
            <p className="text-gray-400">
              Powered by Somnia Data Streams • Data from USGS
            </p>
          </div>
          
          {/* Notification toggle - only render on client */}
          {isMounted && !notificationsEnabled && typeof window !== 'undefined' && 'Notification' in window && (
            <button
              onClick={requestNotifications}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg transition-colors flex items-center gap-2"
            >
              🔔 Enable Alerts
            </button>
          )}
          
          {isMounted && notificationsEnabled && (
            <div className="text-green-400 flex items-center gap-2">
              ✅ Notifications enabled
            </div>
          )}
        </div>
      </header>
      
      {/* Stats bar */}
      <div className="max-w-[1800px] mx-auto mb-6 grid grid-cols-4 gap-4">
        <div className="glass-strong rounded-lg p-4 text-center">
          <div className="text-3xl font-bold">{earthquakes.length}</div>
          <div className="text-sm text-gray-400">Total Earthquakes</div>
        </div>
        
        <div className="glass-strong rounded-lg p-4 text-center">
          <div className="text-3xl font-bold">{visibleQuakes.length}</div>
          <div className="text-sm text-gray-400">In Current View</div>
        </div>
        
        <div className="glass-strong rounded-lg p-4 text-center">
          <div className="text-3xl font-bold">M{maxMagnitude.toFixed(1)}</div>
          <div className="text-sm text-gray-400">Max Magnitude</div>
        </div>
        
        <div className="glass-strong rounded-lg p-4 text-center">
          <div className="text-3xl font-bold">M{avgMagnitude.toFixed(1)}</div>
          <div className="text-sm text-gray-400">Average Magnitude</div>
        </div>
      </div>
      
      {/* Main content */}
      <div className="max-w-[1800px] mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-320px)]">
        {/* Map - takes up 2 columns */}
        <div className="lg:col-span-2 h-full">
          {!isMounted || isLoading ? (
            <div className="glass-strong rounded-xl h-full flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin text-6xl mb-4">🌍</div>
                <p className="text-xl">Loading earthquake data...</p>
              </div>
            </div>
          ) : (
            <EarthquakeMap
              earthquakes={earthquakes}
              timeRangeStart={timeRangeStart}
              timeRangeEnd={timeRangeEnd}
            />
          )}
        </div>
        
        {/* Sidebar */}
        <div className="space-y-6 h-full overflow-y-auto">
          {/* Timeline controls */}
          <Timeline
            earthquakes={earthquakes}
            onTimeRangeChange={handleTimeRangeChange}
            isPlaying={isPlaying}
            onPlayPauseToggle={() => setIsPlaying(!isPlaying)}
            playbackSpeed={playbackSpeed}
            onSpeedChange={setPlaybackSpeed}
          />
          
          {/* Recent earthquakes list */}
          <div className="glass-strong rounded-xl p-4">
            <h3 className="font-bold text-lg mb-3">Recent Activity</h3>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {visibleQuakes.slice(0, 10).map(quake => (
                <div
                  key={quake.earthquakeId}
                  className="bg-gray-800/50 rounded-lg p-3 hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-start justify-between mb-1">
                    <span className="font-bold text-lg">
                      M{quake.magnitude.toFixed(1)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(quake.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300">{quake.location}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Depth: {quake.depth.toFixed(1)} km
                  </p>
                </div>
              ))}
              
              {visibleQuakes.length === 0 && (
                <p className="text-center text-gray-500 py-8">
                  No earthquakes in selected time range
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <footer className="max-w-[1800px] mx-auto mt-6 text-center text-sm text-gray-500">
        <p>
          Built with Somnia Data Streams • Earthquake data from{' '}
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
