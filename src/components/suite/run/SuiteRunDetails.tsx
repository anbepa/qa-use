import Link from 'next/link'
import { Fragment, useMemo } from 'react'

import type { TSuiteRun } from '@/app/suite/[suiteId]/run/[suiteRunId]/loader'
import { Polling } from '@/components/Polling'
import { PageHeader } from '@/components/shared/PageHeader'
import { RunStatusBadge } from '@/components/shared/RunStatusBadge'
import { RunStatusIcon } from '@/components/shared/RunStatusIcon'
import { SectionHeader } from '@/components/shared/SectionHeader'
import { formatDate } from '@/components/shared/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { DeepRequired } from '@/lib/types'

export function SuiteRunDetails({ run }: { run: TSuiteRun }) {
  const { nOfPassingTests, nOfFailedTests } = useMemo(() => {
    return run.testRuns.reduce(
      (acc, testRun) => {
        if (testRun.status === 'passed') acc.nOfPassingTests++
        else if (testRun.status === 'failed') acc.nOfFailedTests++
        return acc
      },
      { nOfPassingTests: 0, nOfFailedTests: 0 },
    )
  }, [run.testRuns])

  const liveViews = useMemo(
    () =>
      run.testRuns
        .map((testRun) => ({
          id: testRun.id,
          label: testRun.test.label,
          status: testRun.status,
          liveUrl: testRun.liveUrl,
        }))
        .filter((testRun): testRun is DeepRequired<typeof testRun> => testRun.liveUrl != null),
    [run.testRuns],
  )

  return (
    <Fragment>
      <PageHeader
        title={`Suite Run #${run.id}`}
        subtitle={run.suite.name}
        back={{ href: `/suite/${run.suite.id}`, label: 'Back to Suite' }}
      />

      <SectionHeader
        title="Test Runs"
        actions={[
          <p key="test-runs-status" className="text-gray-500 text-sm font-medium ml-4">
            {nOfPassingTests} passed, {nOfFailedTests} failed
          </p>,
          <RunStatusBadge key="test-runs-status-badge" status={run.status} />,
        ]}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Test</TableHead>
            <TableHead>Ran At</TableHead>
            <TableHead>{/* Actions */}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {run.testRuns.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="">
                No test runs found...
              </TableCell>
            </TableRow>
          )}
          {run.testRuns.map((testRun) => (
            <TableRow key={testRun.id}>
              <TableCell className="font-medium flex items-center gap-2">
                <RunStatusIcon status={testRun.status} />
                {testRun.test.label}
              </TableCell>
              <TableCell suppressHydrationWarning>{formatDate(testRun.createdAt)}</TableCell>
              <TableCell className="text-right">
                <Link href={`/suite/${run.suite.id}/test/${testRun.testId}/run/${testRun.id}`}>View</Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <SectionHeader title="Live View" actions={[]} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {liveViews.map((liveView) => (
          <Link
            key={liveView.id}
            href={`/suite/${run.suite.id}/test/${liveView.id}/run/${liveView.id}`}
            className="block col-span-1 w-full relative border border-gray-300 rounded-xs overflow-hidden"
          >
            <iframe src={liveView.liveUrl} className="w-full h-auto" style={{ aspectRatio: '1280/1050' }} />

            <div className="absolute bottom-0 right-0 p-2 bg-white flex items-center gap-2 rounded-tl-xs">
              <RunStatusIcon status={liveView.status} />
              <span className="text-sm font-medium">{liveView.label}</span>
            </div>
          </Link>
        ))}
      </div>

      <Polling poll={run.status === 'running' || run.status === 'pending'} />
    </Fragment>
  )
}
