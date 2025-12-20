'use client'

import { CopyPlus } from 'lucide-react'
import Link from 'next/link'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import type { TSuite } from '../../app/suite/[suiteId]/loader'
import { Button } from '../ui/button'

/**
 * Shows a list of tests in a suite.
 */
export function TestsTab({
  suite,
  suiteId,

  duplicate,
  }: {
    suite: TSuite
    suiteId: number

    duplicate: (testId: number, _: FormData) => void
  }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Test</TableHead>
          <TableHead>{/* Actions */}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {suite.tests.length === 0 && (
          <TableRow>
            <TableCell colSpan={3} className="">
              No tests found...
            </TableCell>
          </TableRow>
        )}

        {suite.tests.map((test) => (
          <TestRow key={test.id} test={test} suiteId={suiteId} duplicate={duplicate} />
        ))}
      </TableBody>
    </Table>
  )
}

const TestRow = ({
  test,
  suiteId,
  duplicate,
}: {
  test: TSuite['tests'][number]
  suiteId: number
  duplicate: (testId: number, _: FormData) => void
}) => {
  const action = duplicate.bind(null, test.id)

  return (
    <TableRow key={test.id}>
      <TableCell>{test.label}</TableCell>
      <TableCell className="text-right flex justify-end gap-1">
        <form action={action}>
          <Button variant="ghost" type="submit" className="-my-2">
            <CopyPlus className="size-3.5" />
          </Button>
        </form>
        <Link href={`/suite/${suiteId}/test/${test.id}`}>View</Link>
      </TableCell>
    </TableRow>
  )
}
