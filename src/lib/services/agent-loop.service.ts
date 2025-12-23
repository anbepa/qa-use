import { eq } from 'drizzle-orm'
import fs from 'fs/promises'
import path from 'path'

import { db } from '../db/db'
import * as schema from '../db/schema'
import type { TaskResponse, TestDefinition } from '../testing/engine'
import type { AgentAction } from './gemini.provider'
import { GeminiProvider } from './gemini.provider'
import { LocalBrowserService } from './local-browser.service'

export class AgentLoopService {
  private gemini: GeminiProvider
  private browser: LocalBrowserService
  private maxSteps: number

  constructor(apiKey: string, maxSteps: number = 30) {
    this.gemini = new GeminiProvider(apiKey)
    this.browser = new LocalBrowserService()
    this.maxSteps = maxSteps
  }

  async run(test: TestDefinition, runId: number): Promise<TaskResponse> {
    const history: { action: AgentAction; result: string }[] = []
    const evidencePath = path.join(process.cwd(), 'public', 'evidences', runId.toString())

    await fs.mkdir(evidencePath, { recursive: true })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const headless = (globalThis as any).process.env.HEADLESS !== 'false'
    await this.browser.launch(headless)

    try {
      let stepCount = 0
      console.log(`[AgentLoop] Starting run ${runId} with max steps ${this.maxSteps}`)
      let hasNavigated = false

      while (stepCount < this.maxSteps) {
        // --- Human-in-the-loop: Block until authorized ---
        await this.waitForControlAndPermission()

        // Handle initial navigation as part of the authorized flow
        if (!hasNavigated) {
          const urlStep = test.steps.find(s =>
            s.description.toLowerCase().includes('ir a') ||
            s.description.toLowerCase().includes('navigate to') ||
            s.description.toLowerCase().includes('https://') ||
            s.description.toLowerCase().includes('http://')
          )

          let initialUrl = 'about:blank'
          if (urlStep) {
            const urlMatch = urlStep.description.match(/(https?:\/\/[^\s]+)/i)
            if (urlMatch) {
              initialUrl = urlMatch[1]
            } else {
              const domainMatch = urlStep.description.match(/(?:ir a|navigate to)\s+([a-z0-9.-]+\.[a-z]{2,})/i)
              if (domainMatch) {
                initialUrl = `https://${domainMatch[1]}`
              }
            }
          }
          console.log(`[AgentLoop] Controlled initial navigation to: ${initialUrl}`)
          await this.browser.goto(initialUrl)
          hasNavigated = true

          // No reportStepDone here to allow continuous execution after authorization
          stepCount++
          continue
        }

        console.log(`[AgentLoop] Step ${stepCount}: Thinking...`)
        await new Promise(resolve => setTimeout(resolve, 1000))

        const dom = await this.browser.extractDOM()
        const screenshotPath = path.join(evidencePath, `step_${stepCount}.png`)
        await this.browser.screenshot(screenshotPath)

        const decision = await this.gemini.decideAction(dom, JSON.stringify(test), history)
        const actions = Array.isArray(decision) ? decision : [decision]
        const action = actions[0]

        if (action) {
          console.log(`[AgentLoop] IA Decidió: ${action.action} ${action.selector ? `en ${action.selector}` : ''} ${action.text ? `con texto "${action.text}"` : ''} ${action.reason ? `(Razón: ${action.reason})` : ''}`)
        }

        // Delay for rate limits (Increased to 8s for Free Tier safety)
        await new Promise(resolve => setTimeout(resolve, 8000))

        if (!action) {
          console.warn('[AgentLoop] Gemini returned no action.')
          stepCount++
          continue
        }

        if (action.action === 'done') {
          await this.reportStepDone(); // Reset state to pending when finished
          return { status: 'pass', steps: [], error: null }
        }
        if (action.action === 'fail') {
          await this.reportStepDone();
          return { status: 'failing', steps: [], error: action.reason || 'Agent failed' }
        }

        let actionResult = 'Success'
        try {
          switch (action.action) {
            case 'click':
              if (action.selector) await this.browser.click(action.selector)
              break
            case 'type':
              if (action.selector && action.text) await this.browser.type(action.selector, action.text)
              break
            case 'wait':
              if (action.selector) await this.browser.waitFor(action.selector)
              break
            case 'reload':
              await this.browser.reload()
              break
            case 'open_tab':
              await this.browser.openNewTab(action.url)
              break
            case 'switch_tab':
              if (action.tabIndex !== undefined) await this.browser.switchToTab(action.tabIndex)
              break
            case 'close_tab':
              await this.browser.closeCurrentTab()
              break
            case 'go_back':
              await this.browser.goBack()
              break
            case 'go_forward':
              await this.browser.goForward()
              break
            case 'dblclick':
              if (action.selector) await this.browser.dblclick(action.selector)
              break
            case 'hover':
              if (action.selector) await this.browser.hover(action.selector)
              break
            case 'check':
              if (action.selector) await this.browser.check(action.selector)
              break
            case 'uncheck':
              if (action.selector) await this.browser.uncheck(action.selector)
              break
            case 'fill':
              if (action.selector && action.value) await this.browser.fill(action.selector, action.value as string)
              break
            case 'press':
              if (action.selector && action.key) await this.browser.press(action.selector, action.key)
              break
            case 'select_option':
              if (action.selector && action.value) await this.browser.selectOption(action.selector, action.value)
              break
            case 'upload_file':
              if (action.selector && action.files) await this.browser.setInputFiles(action.selector, action.files)
              break
            case 'mouse_move':
              if (action.x !== undefined && action.y !== undefined) await this.browser.mouseMove(action.x, action.y)
              break
            case 'mouse_down':
              await this.browser.mouseDown()
              break
            case 'mouse_up':
              await this.browser.mouseUp()
              break
            case 'mouse_click':
              if (action.x !== undefined && action.y !== undefined) await this.browser.mouseClick(action.x, action.y)
              break
            case 'mouse_wheel':
              if (action.deltaX !== undefined && action.deltaY !== undefined) await this.browser.mouseWheel(action.deltaX, action.deltaY)
              break
            case 'keyboard_type':
              if (action.text) await this.browser.keyboardType(action.text)
              break
            case 'keyboard_press':
              if (action.key) await this.browser.keyboardPress(action.key)
              break
            case 'keyboard_down':
              if (action.key) await this.browser.keyboardDown(action.key)
              break
            case 'keyboard_up':
              if (action.key) await this.browser.keyboardUp(action.key)
              break
            case 'evaluate':
              if (action.script) await this.browser.evaluate(action.script)
              break
            case 'add_cookies':
              if (action.cookies) await this.browser.addCookies(action.cookies)
              break
            case 'clear_cookies':
              await this.browser.clearCookies()
              break
            case 'set_geolocation':
              if (action.latitude !== undefined && action.longitude !== undefined) await this.browser.setGeolocation(action.latitude, action.longitude)
              break
            case 'assert':
              if (action.selector && action.assertionType) await this.browser.assertElement(action.selector, action.assertionType, action.expectedValue)
              break
            case 'save_auth':
              const authPath = path.join(process.cwd(), 'data', 'auth.json')
              await fs.mkdir(path.dirname(authPath), { recursive: true })
              await this.browser.saveStorageState(authPath)
              break
          }
        } catch (e: unknown) {
          const error = e instanceof Error ? e : new Error('Unknown error')
          actionResult = `Error: ${error.message}`
        }

        history.push({ action, result: actionResult })

        // Update DB (Real-time tracking of steps)
        try {
          const testRunSteps = await db.query.testRunStep.findMany({
            where: eq(schema.testRunStep.testRunId, runId),
            with: { testStep: true }
          })
          const currentStep = testRunSteps.find((trs) => trs.testStep.order === stepCount + 1)
          if (currentStep) {
            await db.update(schema.testRunStep).set({
              status: actionResult.includes('Error') ? 'failed' : 'passed',
            }).where(eq(schema.testRunStep.id, currentStep.id))
          }
        } catch (dbError) {
          console.error('[AgentLoop] DB Update Error:', dbError)
        }

        stepCount++
        // Removed reportStepDone() from here to allow continuous AI execution
      }

      await this.reportStepDone()
      return { status: 'failing', steps: [], error: 'Max steps reached' }
    } catch (e: unknown) {
      await this.reportStepDone()
      const error = e instanceof Error ? e : new Error('Unknown error')
      return { status: 'failing', steps: [], error: error.message }
    } finally {
      await this.browser.close()
    }
  }

  private async waitForControlAndPermission() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apiBase = (globalThis as any).process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    while (true) {
      try {
        const res = await fetch(`${apiBase}/api/live-control`, {
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' }
        })
        if (res.ok) {
          const state = await res.json()
          if (state.state === 'AI_EXECUTING') return
          // Blocks if state is HUMAN_CONTROL or AI_PENDING
        } else if (res.status === 404) return
      } catch (_) {
        return
      }
      await new Promise(resolve => setTimeout(resolve, 1500))
    }
  }

  private async reportStepDone() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apiBase = (globalThis as any).process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    try {
      await fetch(`${apiBase}/api/live-control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ai_step_done' }),
      })
    } catch (_) { }
  }
}
