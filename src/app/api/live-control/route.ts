import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { type ControlState } from '@/components/LivePreview'

interface ControlStateSnapshot {
  state: ControlState
  lastAction: string
  lastUpdated: string
  actor: 'human' | 'ai'
  currentAction?: string | null
  message?: string
}

const sessionState: ControlStateSnapshot = {
  state: 'HUMAN_CONTROL',
  lastAction: 'init',
  lastUpdated: new Date().toISOString(),
  actor: 'human',
}

const transitions: Record<
  string,
  (_: ControlStateSnapshot) => { next: ControlStateSnapshot; ok: boolean; error?: string }
> = {
  human_takeover: (state) => ({
    next: { ...state, state: 'HUMAN_CONTROL', actor: 'human', lastAction: 'human_takeover' },
    ok: true,
  }),
  request_ai: (state) => {
    if (state.state !== 'HUMAN_CONTROL') {
      return { next: state, ok: false, error: 'Solo se puede solicitar IA desde HUMAN_CONTROL' }
    }

    return {
      next: { ...state, state: 'AI_PENDING', actor: 'human', lastAction: 'request_ai' },
      ok: true,
    }
  },
  approve_ai_action: (state) => {
    if (state.state !== 'AI_PENDING') {
      return { next: state, ok: false, error: 'Solo se puede autorizar desde AI_PENDING' }
    }

    return {
      next: {
        ...state,
        state: 'AI_EXECUTING',
        actor: 'ai',
        lastAction: 'approve_ai_action',
        message: 'IA ejecutando acción atómica aprobada',
      },
      ok: true,
    }
  },
  reject_ai_action: (state) => {
    if (state.state !== 'AI_PENDING') {
      return { next: state, ok: false, error: 'Solo se puede rechazar desde AI_PENDING' }
    }

    return {
      next: { ...state, state: 'HUMAN_CONTROL', actor: 'human', lastAction: 'reject_ai_action', message: undefined },
      ok: true,
    }
  },
  interrupt: (state) => ({
    next: { ...state, state: 'HUMAN_CONTROL', actor: 'human', lastAction: 'interrupt' },
    ok: true,
  }),
  ai_step_done: (state) => ({
    next: { ...state, state: 'HUMAN_CONTROL', actor: 'human', lastAction: 'ai_step_done' },
    ok: true,
  }),
}

type ApplyActionResult =
  | { ok: true; snapshot: ControlStateSnapshot }
  | { ok: false; error: string }

const applyAction = (action: string): ApplyActionResult => {
  const transition = transitions[action]
  if (!transition) {
    return { ok: false, error: 'Acción no soportada' }
  }

  const result = transition(sessionState)
  if (!result.ok) return { ok: false, error: result.error ?? 'Transición inválida' }

  sessionState.state = result.next.state
  sessionState.actor = result.next.actor
  sessionState.lastAction = result.next.lastAction
  sessionState.lastUpdated = new Date().toISOString()
  sessionState.currentAction = result.next.currentAction
  sessionState.message = result.next.message

  return { ok: true, snapshot: sessionState }
}

export async function GET() {
  return NextResponse.json(sessionState)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const action = body?.action as string | undefined

  if (!action) {
    return NextResponse.json({ error: 'Se requiere una acción' }, { status: 400 })
  }

  const result = applyAction(action)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json(result.snapshot)
}
