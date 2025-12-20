'use client'

import { useEffect, useState } from 'react'

interface LivePreviewProps {
  runId: number
  isRunning: boolean
  selectedStep?: number | null
}

export function LivePreview({ runId, isRunning, selectedStep }: LivePreviewProps) {
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [step, setStep] = useState<number | null>(null)
  const [totalSteps, setTotalSteps] = useState<number>(0)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [isPaused, setIsPaused] = useState<boolean>(false)
  const [isToggling, setIsToggling] = useState<boolean>(false)
  const [devtoolsUrl, setDevtoolsUrl] = useState<string | null>(null)
  const [remoteError, setRemoteError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'preview' | 'interactive'>('preview')
  const remoteDebugBase = (process.env.NEXT_PUBLIC_REMOTE_DEBUG_URL || 'http://localhost:9222').replace(/\/$/, '')

  useEffect(() => {
    if (viewMode === 'interactive') {
      return
    }

    if (selectedStep !== undefined && selectedStep !== null) {
      setScreenshot(`/api/screenshot?runId=${runId}&step=${selectedStep}`)
      setStep(selectedStep)
      return
    }

    const fetchLatestScreenshot = async () => {
      try {
        const response = await fetch(`/api/screenshot/latest?runId=${runId}`)
        const data = await response.json()

        if (data.screenshot) {
          setScreenshot(data.screenshot + `&t=${Date.now()}`) // Cache busting
          setStep(data.step)
          setTotalSteps(data.totalSteps)
          setLastUpdate(new Date())
        }
      } catch (error) {
        console.error('Error fetching screenshot:', error)
      }
    }

    // Initial fetch
    fetchLatestScreenshot()

    // Poll every 2 seconds while running, or just once if not running
    if (isRunning) {
      const interval = setInterval(fetchLatestScreenshot, 2000)
      return () => clearInterval(interval)
    }
  }, [runId, isRunning, selectedStep, viewMode])

  useEffect(() => {
    const fetchPauseState = async () => {
      try {
        const response = await fetch('/api/agent/control')
        const data = await response.json()
        setIsPaused(Boolean(data.paused))
        setViewMode(Boolean(data.paused) ? 'interactive' : 'preview')
      } catch (error) {
        console.error('Error fetching pause state:', error)
      }
    }

    fetchPauseState()
  }, [])

  useEffect(() => {
    if (viewMode !== 'interactive') {
      setDevtoolsUrl(null)
      return
    }

    const fetchDevtoolsTarget = async () => {
      try {
        const response = await fetch(`${remoteDebugBase}/json/list`)
        if (!response.ok) {
          throw new Error('DevTools endpoint unavailable')
        }

        const targets = await response.json()
        const pageTarget = targets.find((target: any) => target.type === 'page') || targets[0]

        if (pageTarget?.devtoolsFrontendUrl) {
          setDevtoolsUrl(`${remoteDebugBase}${pageTarget.devtoolsFrontendUrl}`)
          setRemoteError(null)
        } else {
          setRemoteError('No DevTools target available yet')
        }
      } catch (error: any) {
        console.error('Error connecting to DevTools:', error)
        setRemoteError(error.message || 'Unable to reach DevTools endpoint')
      }
    }

    fetchDevtoolsTarget()
    const interval = setInterval(fetchDevtoolsTarget, 5000)

    return () => clearInterval(interval)
  }, [viewMode, remoteDebugBase])

  const togglePause = async (paused: boolean) => {
    setIsToggling(true)
    setRemoteError(null)

    try {
      const response = await fetch('/api/agent/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused }),
      })

      if (!response.ok) {
        throw new Error('Failed to update agent state')
      }

      const data = await response.json()
      setIsPaused(Boolean(data.paused))
      setViewMode(Boolean(data.paused) ? 'interactive' : 'preview')
    } catch (error: any) {
      console.error('Error toggling agent state:', error)
      setRemoteError(error.message || 'Unable to change agent state')
    } finally {
      setIsToggling(false)
    }
  }

  if (!screenshot && viewMode !== 'interactive') {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">
            {isRunning ? 'Waiting for screenshots...' : 'Loading screenshots...'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-gray-800 text-white px-4 py-2 rounded-t-lg flex justify-between items-center">
        <div className="flex items-center gap-2">
          {isRunning && (
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          )}
          <span className="text-sm font-medium">
            {isRunning ? 'Live Preview' : 'Final Screenshot'} - Step {step !== null ? step + 1 : '?'} / {totalSteps}
            {isPaused && ' (Paused for control)'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <button
              className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={isToggling}
              onClick={() => togglePause(!isPaused)}
            >
              {isPaused ? 'Release Control' : 'Take Control'}
            </button>
          )}
          <span className="text-xs text-gray-400">Updated: {lastUpdate.toLocaleTimeString()}</span>
        </div>
      </div>
      {viewMode === 'interactive' ? (
        <div className="flex-1 bg-black rounded-b-lg overflow-hidden relative">
          {devtoolsUrl ? (
            <iframe src={devtoolsUrl} className="w-full h-full border-0" title="Remote DevTools" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-gray-300 text-sm">
                {remoteError || 'Waiting for remote browser to expose DevTools...'}
              </p>
            </div>
          )}
          <div className="absolute bottom-2 right-2 text-xs text-gray-300 bg-gray-800/80 px-2 py-1 rounded">
            Connected via {remoteDebugBase}
          </div>
        </div>
      ) : (
        <div className="flex-1 bg-white rounded-b-lg overflow-auto p-4">
          <div className="relative w-full h-full">
            <img
              src={screenshot ?? undefined}
              alt={`Screenshot step ${step ?? 0}`}
              className="w-full h-auto border border-gray-300 rounded shadow-lg"
            />
          </div>
        </div>
      )}
      {remoteError && viewMode === 'interactive' && (
        <div className="text-red-600 text-xs px-4 py-2 bg-red-50 border-t border-red-200">
          {remoteError}
        </div>
      )}
    </div>
  )
}
