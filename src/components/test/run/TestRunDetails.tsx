'use client'

import { CheckCircle, Monitor } from 'lucide-react'
import { Fragment, useEffect, useMemo, useState } from 'react'

import type { TTestRun } from '@/app/suite/[suiteId]/test/[testId]/run/[testRunId]/loader'
import { Polling } from '@/components/Polling'
import { PageHeader } from '@/components/shared/PageHeader'
import { RunStatusBadge } from '@/components/shared/RunStatusBadge'
import { RunStatusIcon } from '@/components/shared/RunStatusIcon'
import { SectionHeader } from '@/components/shared/SectionHeader'
import { formatDate } from '@/components/shared/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { TRunStatus } from '@/lib/db/schema'

export function TestRunDetails({ run }: { run: TTestRun }) {
  const { test, error, status, publicShareUrl, liveUrl, testRunSteps } = run

  const actions = useMemo(() => {
    const actions = [{ link: `/suite/${run.test.suiteId}/test/${run.test.id}`, label: 'View Test' }]

    if (publicShareUrl) {
      actions.push({ link: publicShareUrl, label: 'View Agent' })
    }

    return actions
  }, [run.test.suiteId, run.test.id, publicShareUrl])

  const back = useMemo(() => {
    if (run.suiteRunId) {
      return { href: `/suite/${run.test.suiteId}/run/${run.suiteRunId}`, label: 'Back to Suite Run' }
    }

    return { href: `/suite/${run.test.suiteId}/test/${run.test.id}`, label: 'Back to Test' }
  }, [run.suiteRunId, run.test.suiteId, run.test.id])

  return (
    <Fragment>
      {/* Header */}

      <PageHeader title={test.label} subtitle={formatDate(test.createdAt)} back={back} actions={actions} />

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="col-span-1">
          <SectionHeader
            title="Steps"
            actions={[
              //
              <RunStatusBadge key="test-runs-status-badge" status={run.status} />,
            ]}
          />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>#</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {testRunSteps.map((trs) => (
                <TableRow key={trs.id}>
                  <TableCell>
                    <RunStatusIcon status={trs.status} />
                  </TableCell>
                  <TableCell>{trs.testStep.order}</TableCell>
                  <TableCell>{trs.testStep.description}</TableCell>
                </TableRow>
              ))}

              <TableRow>
                <TableCell>
                  <RunStatusIcon status={status} />
                </TableCell>
                <TableCell></TableCell>
                <TableCell className="max-w-[300px] break-words">{test.evaluation}</TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div className="mt-5">
            <SectionHeader
              title="Result"
              actions={[<RunStatusBadge key="test-runs-status-badge" status={run.status} />]}
            />

            {run.status === 'passed' && <p className="text-green-700">Test passed</p>}

            {error && <p className="text-red-700">{error}</p>}
          </div>
        </div>

        {/* Preview */}

        <div className="col-span-1 flex flex-col">
          <SectionHeader title="Live Preview" actions={[]} />

          <LivePreview liveUrl={liveUrl} status={status} sharedUrl={publicShareUrl} />
        </div>
      </div>

      <Polling poll={status === 'running' || status === 'pending'} />
    </Fragment>
  )
}

export function LivePreview({
  liveUrl,
  status,
  sharedUrl,
}: {
  liveUrl: string | null | undefined
  status: TRunStatus
  sharedUrl: string | null | undefined
}) {
  const defaultPreviewUrl = process.env.NEXT_PUBLIC_DEFAULT_LIVE_PREVIEW_URL || 'http://localhost:3000'
  const previewUrl = liveUrl ?? sharedUrl ?? defaultPreviewUrl
  const [hasControl, setHasControl] = useState(false)
  const isLive = status === 'running' || status === 'pending'

  useEffect(() => {
    if (!isLive) {
      setHasControl(false)
    }
  }, [isLive])

  return (
    <div
      className="w-full flex flex-col items-center justify-center relative overflow-hidden border border-gray-300 rounded-xs"
      style={{ aspectRatio: '1280/1050', minHeight: '400px' }}
    >
      {previewUrl ? (
        <Fragment>
          <iframe
            src={previewUrl}
            className="w-full h-full border-0"
            title="Live test preview"
            allow="fullscreen; autoplay; clipboard-write; gamepad; display-capture; camera; microphone"
            allowFullScreen
            style={{ pointerEvents: hasControl ? 'auto' : 'none' }}
          />

          {!hasControl && (
            <div className="absolute inset-0 bg-black/30 text-white flex flex-col items-center justify-center gap-3 text-center px-6">
              <p className="text-lg font-semibold">Vista en vivo lista</p>
              <p className="text-sm max-w-xl">
                Toma el control para interactuar con el navegador en tiempo real. Cuando termines, suelta el control para que la
                ejecución automática continúe.
              </p>
              <button
                type="button"
                className="bg-white text-black px-4 py-2 rounded-sm font-medium shadow-md hover:bg-gray-100"
                onClick={() => setHasControl(true)}
              >
                Tomar control
              </button>
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline text-white/80 hover:text-white"
              >
                Abrir vista en nueva pestaña
              </a>
            </div>
          )}

          {hasControl && (
            <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-2 rounded-sm shadow flex items-center gap-2 text-sm">
              <span className="inline-flex h-2 w-2 rounded-full bg-green-500" aria-hidden />
              Control activo
              <button
                type="button"
                className="ml-3 text-blue-600 hover:text-blue-800 font-medium"
                onClick={() => setHasControl(false)}
              >
                Soltar control
              </button>
            </div>
          )}

          <div className="absolute top-4 left-4 bg-white/80 backdrop-blur px-3 py-2 rounded-sm shadow text-xs text-gray-700 flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-blue-500" aria-hidden />
            Live Preview desde {previewUrl}
            {!isLive && <span className="text-[11px] text-orange-600 font-medium">(prueba finalizada)</span>}
          </div>
        </Fragment>
      ) : isLive ? (
        <TestRunPlaceholder />
      ) : (
        <TestFinishedPlaceholder sharedUrl={sharedUrl} />
      )}
    </div>
  )
}

function TestRunPlaceholder() {
  return (
    <Fragment>
      <Monitor className="w-12 h-12 mb-4 text-gray-300" />
      <div className="text-center">
        <p className="font-medium mb-2">Live preview not available</p>
        <p className="text-sm">
          Ensure the run is active and the container is exposing port 3000 so the browser feed from Docker can load.
        </p>
      </div>
    </Fragment>
  )
}

function TestFinishedPlaceholder({ sharedUrl }: { sharedUrl: string | null | undefined }) {
  return (
    <Fragment>
      <CheckCircle className="w-12 h-12 mb-4 text-gray-300" />
      <div className="text-center">
        <p className="font-medium mb-2">Test completed</p>

        {sharedUrl && (
          <a href={sharedUrl} className="text-blue-500 hover:text-blue-700" target="_blank">
            View Agent Run
          </a>
        )}
      </div>
    </Fragment>
  )
}
