'use client'

import { AlertCircle, Play, ShieldCheck, ShieldOff, Square } from 'lucide-react'
import { type ComponentType, useCallback, useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export type ControlState = 'HUMAN_CONTROL' | 'AI_PENDING' | 'AI_EXECUTING'

interface ControlSnapshot {
  state: ControlState
  lastAction: string
  lastUpdated: string
  actor: 'human' | 'ai'
  currentAction?: string | null
  message?: string
}

interface LivePreviewProps {
  liveUrl?: string | null
  title?: string
}

const DEFAULT_LIVE_URL =
  process.env.NEXT_PUBLIC_LIVE_PREVIEW_URL ?? 'http://localhost:7900/?resize=scale&autoconnect=1&view_only=0'

const stateLabels: Record<ControlState, string> = {
  HUMAN_CONTROL: '🔴 Control Humano',
  AI_PENDING: '🤖 IA Pendiente',
  AI_EXECUTING: '⚡ IA Ejecutando',
}

const stateDescriptions: Record<ControlState, string> = {
  HUMAN_CONTROL: 'El humano tiene control absoluto. La IA está bloqueada hasta nueva autorización.',
  AI_PENDING: 'La IA solo analiza en modo lectura y espera autorización para ejecutar.',
  AI_EXECUTING:
    'La IA ejecuta una única acción atómica. Cualquier interrupción humana revierte a control humano.',
}

const buttonOrder: ControlState[] = ['HUMAN_CONTROL', 'AI_PENDING', 'AI_EXECUTING']

export function LivePreview({ liveUrl, title = 'Live Preview (noVNC en tiempo real)' }: LivePreviewProps) {
  const [snapshot, setSnapshot] = useState<ControlSnapshot>({
    state: 'HUMAN_CONTROL',
    lastAction: 'init',
    lastUpdated: new Date().toISOString(),
    actor: 'human',
  })
  const [error, setError] = useState<string | null>(null)
  const resolvedUrl = useMemo(() => liveUrl ?? DEFAULT_LIVE_URL, [liveUrl])

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/live-control', { cache: 'no-store' })
      if (!res.ok) {
        throw new Error('No se pudo obtener el estado de control')
      }
      const data = (await res.json()) as ControlSnapshot
      setSnapshot(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    }
  }, [])

  const postAction = useCallback(
    async (action: string) => {
      try {
        const res = await fetch('/api/live-control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? 'No se pudo aplicar la acción')
        }

        await fetchState()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido')
      }
    },
    [fetchState]
  )

  useEffect(() => {
    fetchState()
    const id = setInterval(fetchState, 1500)
    return () => clearInterval(id)
  }, [fetchState])

  const actions: { label: string; action: string; icon: ComponentType<{ className?: string }>; intent: ControlState }[] = [
    {
      label: 'Tomar control (humano)',
      action: 'human_takeover',
      icon: ShieldCheck,
      intent: 'HUMAN_CONTROL',
    },
    {
      label: 'Ceder control a IA',
      action: 'request_ai',
      icon: Play,
      intent: 'AI_PENDING',
    },
    {
      label: 'Autorizar acción IA',
      action: 'approve_ai_action',
      icon: ShieldOff,
      intent: 'AI_EXECUTING',
    },
    {
      label: 'Interrumpir IA',
      action: 'interrupt',
      icon: Square,
      intent: 'HUMAN_CONTROL',
    },
  ]

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex flex-col gap-2 rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Badge
              className="text-xs"
              variant={snapshot.state === 'HUMAN_CONTROL' ? 'default' : snapshot.state === 'AI_PENDING' ? 'secondary' : 'outline'}
            >
              {stateLabels[snapshot.state]}
            </Badge>
            <span className="text-sm text-gray-500">Última acción: {snapshot.lastAction}</span>
          </div>
          <span className="text-xs text-gray-400">Actualizado: {new Date(snapshot.lastUpdated).toLocaleTimeString()}</span>
        </div>

        <p className="text-sm text-gray-700">{stateDescriptions[snapshot.state]}</p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {buttonOrder.map((key) =>
            actions
              .filter((item) => item.intent === key)
              .map(({ label, action, icon: Icon }) => (
                <Button
                  key={action}
                  variant={key === 'HUMAN_CONTROL' ? 'default' : 'outline'}
                  onClick={() => postAction(action)}
                  className="w-full justify-start gap-2"
                  disabled={snapshot.state === 'AI_EXECUTING' && action === 'request_ai'}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              ))
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}


      </div>

      <div className="relative w-full overflow-hidden rounded-md border border-gray-200 shadow-sm" style={{ aspectRatio: '1280/900' }}>
        {resolvedUrl ? (
          <iframe
            src={resolvedUrl}
            className="w-full h-full"
            allowFullScreen
            title={title}
            style={{ minHeight: '500px' }}
          />
        ) : (
          <div className="flex h-full min-h-[500px] flex-col items-center justify-center gap-2 bg-gray-50">
            <AlertCircle className="h-6 w-6 text-gray-400" />
            <p className="text-sm text-gray-600 text-center px-4">
              Configura NEXT_PUBLIC_LIVE_PREVIEW_URL o provee un liveUrl para conectar con el contenedor de navegador real.
            </p>
          </div>
        )}

        <div className="absolute left-2 bottom-2 flex items-center gap-2 rounded bg-white/80 px-2 py-1 text-xs text-gray-700 shadow">
          <span>Sesión compartida</span>
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" aria-hidden />
          <span>VNC/noVNC en tiempo real</span>
        </div>
      </div>
    </div>
  )
}
