import fs from 'fs/promises'
import path from 'path'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const runId = searchParams.get('runId')

  if (!runId) {
    return NextResponse.json({ error: 'Missing runId' }, { status: 400 })
  }

  const evidencePath = path.join(process.cwd(), 'public', 'evidences', runId)

  try {
    const files = await fs.readdir(evidencePath)
    const pngFiles = files.filter(f => f.endsWith('.png')).sort()

    if (pngFiles.length === 0) {
      return NextResponse.json({ screenshot: null, step: null })
    }

    const latestScreenshot = pngFiles[pngFiles.length - 1]
    const stepMatch = latestScreenshot.match(/step_(\d+)\.png/)
    const step = stepMatch ? stepMatch[1] : '0'

    return NextResponse.json({
      screenshot: `/api/screenshot?runId=${runId}&step=${step}`,
      step: parseInt(step),
      totalSteps: pngFiles.length,
    })
  } catch (_error) {
    return NextResponse.json({ screenshot: null, step: null })
  }
}
