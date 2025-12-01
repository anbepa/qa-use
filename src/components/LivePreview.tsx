'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

interface LivePreviewProps {
  runId: number
  isRunning: boolean
}

export function LivePreview({ runId, isRunning }: LivePreviewProps) {
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [step, setStep] = useState<number | null>(null)
  const [totalSteps, setTotalSteps] = useState<number>(0)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  useEffect(() => {
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
  }, [runId, isRunning])

  if (!screenshot) {
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
          </span>
        </div>
        <span className="text-xs text-gray-400">
          Updated: {lastUpdate.toLocaleTimeString()}
        </span>
      </div>
      <div className="flex-1 bg-white rounded-b-lg overflow-auto p-4">
        <div className="relative w-full h-full">
          <img
            src={screenshot}
            alt={`Screenshot step ${step}`}
            className="w-full h-auto border border-gray-300 rounded shadow-lg"
          />
        </div>
      </div>
    </div>
  )
}
