import { PencilIcon, Play, Trash } from 'lucide-react'
import Link from 'next/link'
import { Fragment, useMemo } from 'react'

import type { TTest } from '@/app/suite/[suiteId]/test/[testId]/loader'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import { Polling } from '../Polling'
import { PageHeader } from '../shared/PageHeader'
import { RunStatusIcon } from '../shared/RunStatusIcon'
import { SectionHeader } from '../shared/SectionHeader'
import { formatDate } from '../shared/utils'
import { Button } from '../ui/button'

export function TestDetails({
  test,
  runTest,
  deleteTest,
}: {
  test: TTest
  runTest: (_: FormData) => Promise<void>
  deleteTest: (_: FormData) => Promise<void>
}) {
  const poll = useMemo(() => test.runs.some((run) => run.status === 'pending'), [test.runs])

  return (
    <Fragment>
      {/* Header */}
      <PageHeader
        title={test.label}
        subtitle={`Suite ID: ${test.suiteId} | Test ID: ${test.id}`}
        back={{ href: `/suite/${test.suiteId}`, label: 'Back to Suite' }}
        actions={[{ link: `/suite/${test.suiteId}/test/${test.id}/edit`, label: 'Edit' }]}
      />

      {/* Steps */}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <SectionHeader
            title="Steps"
            actions={[
              <Link href={`/suite/${test.suiteId}/test/${test.id}/edit`} key="edit-steps-link">
                <Button variant="outline" size="icon">
                  <PencilIcon className="w-4 h-4" />
                </Button>
              </Link>,

              <form action={deleteTest} key="delete-test-form">
                <Button variant="destructive" size="icon">
                  <Trash className="w-4 h-4" />
                </Button>
              </form>,
            ]}
          />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {test.steps.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="">
                    No steps found
                  </TableCell>
                </TableRow>
              )}

              {test.steps.map((step) => (
                <TableRow key={step.id}>
                  <TableCell className="font-medium flex items-center gap-2">{step.order}</TableCell>
                  <TableCell>{step.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>

            {test.evaluation && (
              <TableFooter>
                <TableRow>
                  <TableCell>Eval</TableCell>
                  <TableCell>
                    <p className="break-words">{test.evaluation}</p>
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>

        {/* Runs */}

        <div>
          <SectionHeader
            title="Runs"
            actions={[
              <form action={runTest} key="run-test-form">
                <Button>
                  <Play className="w-4 h-4" />
                  Run Test
                </Button>
              </form>,
            ]}
          />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>Performed At</TableHead>
                <TableHead>{/* Actions */}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {test.runs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="">
                    No runs found
                  </TableCell>
                </TableRow>
              )}
              {test.runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="font-medium flex items-center gap-2">
                    <RunStatusIcon status={run.status} />
                    Run #{run.id}
                  </TableCell>
                  <TableCell suppressHydrationWarning>{formatDate(run.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/suite/${test.suiteId}/test/${test.id}/run/${run.id}`}
                      className="text-sm text-gray-500"
                    >
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Polling poll={poll} />
    </Fragment>
  )
}
