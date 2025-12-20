import fs from 'fs/promises'
import path from 'path'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const runId = searchParams.get('runId')
  const step = searchParams.get('step')

  if (!runId || !step) {
    return NextResponse.json({ error: 'Missing runId or step' }, { status: 400 })
  }

  const screenshotPath = path.join(process.cwd(), 'public', 'evidences', runId, `step_${step}.png`)

  try {
    const fileBuffer = await fs.readFile(screenshotPath)
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (_) {
    return NextResponse.json({ error: 'Screenshot not found' }, { status: 404 })
  }
}
