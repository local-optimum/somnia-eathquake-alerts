'use client'

import { useState, useEffect } from 'react'
import type { Earthquake } from '@/types/earthquake'

interface TimelineProps {
  earthquakes: Earthquake[]
  onTimeRangeChange: (startTime: number, endTime: number) => void
  isPlaying: boolean
  onPlayPauseToggle: () => void
  playbackSpeed: number
  onSpeedChange: (speed: number) => void
}

export function Timeline({
  earthquakes,
  onTimeRangeChange,
  isPlaying,
  onPlayPauseToggle,
  playbackSpeed,
  onSpeedChange
}: TimelineProps) {
  const [isMounted, setIsMounted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [timeWindow, setTimeWindow] = useState(24 * 60 * 60 * 1000) // 24 hours in ms
  
  // Initialize time on mount to avoid hydration mismatch
  useEffect(() => {
    setCurrentTime(Date.now())
    setIsMounted(true)
  }, [])
  
  // Calculate time range (use currentTime instead of Date.now() for consistency)
  const minTime = earthquakes.length > 0 
    ? Math.min(...earthquakes.map(q => q.timestamp))
    : currentTime - 7 * 24 * 60 * 60 * 1000 // 7 days ago
  
  const maxTime = currentTime
  
  // Auto-play effect
  useEffect(() => {
    if (!isPlaying || !isMounted) return
    
    const nowTime = Date.now()
    
    const interval = setInterval(() => {
      setCurrentTime(prev => {
        const next = prev + (1000 * playbackSpeed) // Move forward by speed
        if (next > nowTime) {
          onPlayPauseToggle() // Stop at end
          return nowTime
        }
        return next
      })
    }, 50) // Update every 50ms for smooth animation
    
    return () => clearInterval(interval)
  }, [isPlaying, playbackSpeed, onPlayPauseToggle, isMounted])
  
  // Notify parent of time range changes
  useEffect(() => {
    onTimeRangeChange(currentTime - timeWindow, currentTime)
  }, [currentTime, timeWindow, onTimeRangeChange])
  
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value)
    setCurrentTime(value)
  }
  
  const handleWindowChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTimeWindow(parseInt(e.target.value))
  }
  
  const handleReset = () => {
    setCurrentTime(Date.now())
  }
  
  // Format time for display
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  // Calculate percentage for visual indicator
  const percentage = ((currentTime - minTime) / (maxTime - minTime)) * 100
  
  // Count earthquakes in current view
  const visibleQuakes = earthquakes.filter(q => 
    q.timestamp >= (currentTime - timeWindow) && 
    q.timestamp <= currentTime
  ).length
  
  // Don't render until mounted to avoid hydration mismatch
  if (!isMounted) {
    return (
      <div className="glass-strong rounded-xl p-4 h-[200px] flex items-center justify-center">
        <div className="text-gray-400">Loading timeline...</div>
      </div>
    )
  }
  
  return (
    <div className="glass-strong rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-lg">Timeline</h3>
        
        {/* Time window selector */}
        <select
          value={timeWindow}
          onChange={handleWindowChange}
          className="bg-gray-800 rounded px-3 py-1 text-sm border border-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          <option value={60 * 60 * 1000}>Last Hour</option>
          <option value={6 * 60 * 60 * 1000}>Last 6 Hours</option>
          <option value={24 * 60 * 60 * 1000}>Last 24 Hours</option>
          <option value={7 * 24 * 60 * 60 * 1000}>Last 7 Days</option>
          <option value={30 * 24 * 60 * 60 * 1000}>Last 30 Days</option>
        </select>
      </div>
      
      {/* Timeline slider */}
      <div className="relative mb-4">
        <input
          type="range"
          min={minTime}
          max={maxTime}
          value={currentTime}
          onChange={handleSliderChange}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #ef4444 0%, #ef4444 ${percentage}%, #374151 ${percentage}%, #374151 100%)`
          }}
        />
        
        {/* Time markers */}
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{formatTime(minTime)}</span>
          <span className="font-bold text-white">{formatTime(currentTime)}</span>
          <span>{formatTime(maxTime)}</span>
        </div>
      </div>
      
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Play/Pause */}
        <button
          onClick={onPlayPauseToggle}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          {isPlaying ? (
            <>⏸️ Pause</>
          ) : (
            <>▶️ Play</>
          )}
        </button>
        
        {/* Speed control */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Speed:</span>
          <div className="flex gap-1">
            {[1, 5, 10, 30, 60].map(speed => (
              <button
                key={speed}
                onClick={() => onSpeedChange(speed)}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  playbackSpeed === speed
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
        
        {/* Reset to now */}
        <button
          onClick={handleReset}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
        >
          ⏮️ Reset to Now
        </button>
      </div>
      
      {/* Stats */}
      <div className="mt-4 pt-4 border-t border-gray-700 flex justify-between text-sm">
        <div>
          <span className="text-gray-400">Earthquakes in view: </span>
          <span className="font-bold text-white">{visibleQuakes}</span>
        </div>
        <div>
          <span className="text-gray-400">Total: </span>
          <span className="font-bold text-white">{earthquakes.length}</span>
        </div>
      </div>
    </div>
  )
}

