import { eq, inArray } from 'drizzle-orm'
import { NonRetriableError, RetryAfterError } from 'inngest'

import { db } from '../db/db'
import * as schema from '../db/schema'
import { resend } from '../resend/client'
import { SuiteFailedEmail } from '../resend/emails/SuiteFailedEmail'
import type { TestDefinition } from '../testing/engine'
import { getTaskPrompt, getTaskResponse, RESPONSE_JSON_SCHEMA } from '../testing/engine'
import { ExhaustiveSwitchCheck } from '../types'
import { inngest } from './client'
import { AgentLoopService } from '../services/agent-loop.service'

// Functions -----------------------------------------------------------------

/**
 * Utility function to test the Inngest connection.
 */
export const helloWorld = inngest.createFunction(
  {
    id: 'hello-world',
  },
  { event: 'hello' },
  async ({ step, event }) => {
    await step.run('hello', async () => {
      if (event.data.name) {
        return `Hello, ${event.data.name}!`
      }

      return 'Hello, world!'
    })
  },
)

/**
 * Performs a single test run.
 */
export const runTest = inngest.createFunction(
  {
    id: 'run-test',
    onFailure: async ({ event, step }) => {
      const testRunId = event.data.event.data.testRunId

      await step.run('update-test-run-status', async () => {
        await db.update(schema.testRun).set({ status: 'failed' }).where(eq(schema.testRun.id, testRunId))
      })
    },
  },
  { event: 'test/run' },
  async ({ step, event }) => {
    const testRunId = event.data.testRunId

    await step.run(`run-test-agent-${testRunId}`, _runTestAgent, { testRunId })

    await step.run(`finalize-test-run`, _finalizeTestRun, { testRunId })
  },
)

/**
 * Runs a test suite.
 */
export const runTestSuite = inngest.createFunction(
  {
    id: 'run-test-suite',
    onFailure: async ({ event, step }) => {
      const suiteRunId = event.data.event.data.suiteRunId

      await step.run('update-suite-run-status', async () => {
        await db.update(schema.suiteRun).set({ status: 'failed' }).where(eq(schema.suiteRun.id, suiteRunId))
        await db.update(schema.testRun).set({ status: 'failed' }).where(eq(schema.testRun.suiteRunId, suiteRunId))
      })
    },
  },
  { event: 'test-suite/run' },
  async ({ step, event }) => {
    const testRunIds = await step.run('get-test-run-ids', async () => {
      const dbTestRuns = await db.query.testRun.findMany({
        where: eq(schema.testRun.suiteRunId, event.data.suiteRunId),
        columns: {
          id: true,
        },
      })

      return dbTestRuns.map((testRun) => testRun.id)
    })

    await Promise.all(
      testRunIds.map((testRunId) => step.run(`run-test-agent-${testRunId}`, _runTestAgent, { testRunId })),
    )

    await step.run(`finalize-suite-run`, _finalizeSuiteRun, { suiteId: event.data.suiteRunId, testRunIds })

    await step.run(`send-suite-notification`, _sendSuiteNotification, { suiteRunId: event.data.suiteRunId })
  },
)

// Steps ---------------------------------------------------------------------

/**
 * Run the test agent locally using Gemini and Playwright.
 */
async function _runTestAgent({ testRunId }: { testRunId: number }) {
  const dbTestRun = await db.query.testRun.findFirst({
    where: eq(schema.testRun.id, testRunId),
    with: {
      test: {
        with: {
          suite: true,
          steps: true,
        },
      },
      testRunSteps: true,
    },
  })

  if (!dbTestRun) {
    throw new NonRetriableError(`Test run not found: ${testRunId}`)
  }

  // Update status to running
  await db
    .update(schema.testRun)
    .set({
      status: 'running',
      startedAt: new Date(),
    })
    .where(eq(schema.testRun.id, dbTestRun.id))

  if (dbTestRun.suiteRunId) {
    await db
      .update(schema.suiteRun)
      .set({
        status: 'running',
      })
      .where(eq(schema.suiteRun.id, dbTestRun.suiteRunId))
  }

  const definition: TestDefinition = {
    evaluation: dbTestRun.test.evaluation,
    label: dbTestRun.test.label,
    steps: dbTestRun.test.steps.map((step) => ({
      id: step.id,
      label: `${step.order}`,
      description: step.description,
    })),
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new NonRetriableError('GEMINI_API_KEY is not set')
  }

  const agent = new AgentLoopService(apiKey, Number(process.env.MAX_AGENT_STEPS) || 30)
  const result = await agent.run(definition, testRunId)

  // Update final status
  if (result.status === 'pass') {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.testRun)
        .set({
          finishedAt: new Date(),
          status: 'passed',
          error: null,
        })
        .where(eq(schema.testRun.id, dbTestRun.id))

      await tx
        .update(schema.testRunStep)
        .set({
          status: 'passed',
        })
        .where(eq(schema.testRunStep.testRunId, dbTestRun.id))
    })
  } else {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.testRun)
        .set({
          finishedAt: new Date(),
          status: 'failed',
          error: result.error,
        })
        .where(eq(schema.testRun.id, dbTestRun.id))

      // Mark all steps as failed for now, or implement granular step status if AgentLoop supports it
      // For now, we just mark the run as failed.
    })
  }

  return result
}

async function _finalizeTestRun({ testRunId }: { testRunId: number }) {
  const dbTestRun = await db.query.testRun.findFirst({
    where: eq(schema.testRun.id, testRunId),
  })

  if (!dbTestRun) {
    throw new NonRetriableError(`Test run not found: ${testRunId}`)
  }

  const hasFailed = dbTestRun.status === 'failed'

  await db
    .update(schema.testRun)
    .set({
      status: hasFailed ? 'failed' : 'passed',
      finishedAt: new Date(),
    })
    .where(eq(schema.testRun.id, testRunId))

  return { hasFailed }
}

async function _finalizeSuiteRun({ suiteId, testRunIds }: { suiteId: number; testRunIds: number[] }) {
  const dbTestRuns = await db.query.testRun.findMany({ where: inArray(schema.suiteRun.id, testRunIds) })

  const hasFailed = dbTestRuns.some((result) => result.status === 'failed')

  await db
    .update(schema.suiteRun)
    .set({
      status: hasFailed ? 'failed' : 'passed',
      finishedAt: new Date(),
    })
    .where(eq(schema.suiteRun.id, suiteId))

  return { hasFailed }
}

async function _sendSuiteNotification({ suiteRunId }: { suiteRunId: number }) {
  const dbSuiteRun = await db.query.suiteRun.findFirst({
    where: eq(schema.suiteRun.id, suiteRunId),
    with: {
      suite: true,
      testRuns: {
        with: {
          test: true,
        },
      },
    },
  })

  if (!dbSuiteRun) {
    throw new NonRetriableError(`Suite run not found: ${suiteRunId}`)
  }

  if (dbSuiteRun.status !== 'failed' || dbSuiteRun.suite.notificationsEmailAddress == null) {
    // NOTE: We don't send notifications for successful runs or if no email address is set.
    return { sent: false }
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL
  if (resend == null || !fromEmail) {
    throw new NonRetriableError('Resend is not configured!')
  }

  const res = await resend.emails.send({
    from: fromEmail,
    to: dbSuiteRun.suite.notificationsEmailAddress,
    subject: `Suite ${dbSuiteRun.suite.name} Failed (#${suiteRunId})`,
    react: (
      <SuiteFailedEmail
        suiteId={dbSuiteRun.suite.id}
        suiteName={dbSuiteRun.suite.name}
        suiteStartedAt={dbSuiteRun.createdAt}
        suiteFinishedAt={dbSuiteRun.createdAt}
        runs={dbSuiteRun.testRuns.map((testRun) => ({
          runId: testRun.id,
          runName: testRun.test.label,
          runStatus: testRun.status,
          runStartedAt: testRun.createdAt,
          runFinishedAt: testRun.finishedAt,
        }))}
      />
    ),
  })

  if (res.error) {
    console.error(res)
    throw new Error(`Failed to send email: ${JSON.stringify(res.error)}`)
  }

  return { sent: true }
}
