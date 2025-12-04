'use client'

import { CheckCircle, Monitor } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { LivePreview as LivePreviewComponent } from '@/components/LivePreview'

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
  const [selectedStep, setSelectedStep] = useState<number | null>(null)

  const actions = useMemo(() => {
    const actions = [{ link: `/suite/${run.test.suiteId}/test/${run.test.id}`, label: 'View Test' }]

    if (publicShareUrl) {
      actions.push({ link: publicShareUrl, label: 'View Agent' })
    }

    return actions
  }, [run.test.suiteId, run.test.id, publicShareUrl])

  const back = useMemo(() => {
    // ... existing back logic
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
              {[...testRunSteps]
                .sort((a, b) => a.testStep.order - b.testStep.order)
                .map((trs, index) => (
                  <TableRow
                    key={trs.id}
                    className={`cursor-pointer hover:bg-gray-50 ${selectedStep === index ? 'bg-blue-50' : ''}`}
                    onClick={() => setSelectedStep(index)}
                  >
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

          <LivePreview liveUrl={liveUrl} status={status} sharedUrl={publicShareUrl} selectedStep={selectedStep} />
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
  selectedStep
}: {
  liveUrl: string | null | undefined
  status: TRunStatus
  sharedUrl: string | null | undefined
  selectedStep: number | null
}) {
  // Extract runId from the parent component context
  // This is a workaround - ideally we'd pass runId as a prop
  const runIdMatch = typeof window !== 'undefined' ? window.location.pathname.match(/\/run\/(\d+)/) : null
  const runId = runIdMatch ? parseInt(runIdMatch[1], 10) : null

  return (
    <div
      className="w-full flex flex-col items-center justify-center relative overflow-hidden border border-gray-300 rounded-xs"
      style={{ aspectRatio: '1280/1050', minHeight: '400px' }}
    >
      {selectedStep !== null && runId ? (
        <LivePreviewComponent runId={runId} isRunning={false} selectedStep={selectedStep} />
      ) : status === 'running' && runId ? (
        <LivePreviewComponent runId={runId} isRunning={true} />
      ) : status === 'pending' || status === 'running' ? (
        <TestRunPlaceholder />
      ) : (
        <TestFinishedPlaceholder sharedUrl={sharedUrl} runId={runId} />
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
        <p className="text-sm">Preview will appear when test is running</p>
      </div>
    </Fragment>
  )
}

function TestFinishedPlaceholder({ sharedUrl, runId }: { sharedUrl: string | null | undefined; runId: number | null }) {
  return (
    <Fragment>
      {runId ? (
        <div className="w-full h-full">
          <LivePreviewComponent runId={runId} isRunning={false} />
        </div>
      ) : (
        <>
          <CheckCircle className="w-12 h-12 mb-4 text-gray-300" />
          <div className="text-center">
            <p className="font-medium mb-2">Test completed</p>

            {sharedUrl && (
              <a href={sharedUrl} className="text-blue-500 hover:text-blue-700" target="_blank">
                View Agent Run
              </a>
            )}
          </div>
        </>
      )}
    </Fragment>
  )
}
