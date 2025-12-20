import { NextResponse } from 'next/server'
import { AgentControlService } from '@/lib/services/agent-control.service'

export async function GET() {
  return NextResponse.json({ paused: AgentControlService.isPaused() })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (typeof body.paused !== 'boolean') {
      return NextResponse.json({ error: 'paused must be a boolean' }, { status: 400 })
    }

    AgentControlService.setPaused(body.paused)

    return NextResponse.json({ paused: AgentControlService.isPaused() })
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
