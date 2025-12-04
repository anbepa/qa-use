import { GeminiProvider, AgentAction } from './gemini.provider'
import { LocalBrowserService } from './local-browser.service'
import { TestDefinition, TaskResponse } from '../testing/engine'
import fs from 'fs/promises'
import path from 'path'
import { db } from '../db/db'
import * as schema from '../db/schema'
import { eq } from 'drizzle-orm'

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

    // Start video recording if enabled (TODO: check env)
    const headless = process.env.HEADLESS !== 'false'
    await this.browser.launch(headless)

    try {
      // Extract URL from test steps (look for "ir a" or "navigate to" patterns)
      const urlStep = test.steps.find(s =>
        s.description.toLowerCase().includes('ir a') ||
        s.description.toLowerCase().includes('navigate to') ||
        s.description.toLowerCase().includes('https://') ||
        s.description.toLowerCase().includes('http://')
      )

      let initialUrl = 'about:blank'
      if (urlStep) {
        // Try to extract URL from description
        const urlMatch = urlStep.description.match(/(https?:\/\/[^\s]+)/i)
        if (urlMatch) {
          initialUrl = urlMatch[1]
        } else {
          // Try to extract domain from text like "ir a google.com"
          const domainMatch = urlStep.description.match(/(?:ir a|navigate to)\s+([a-z0-9.-]+\.[a-z]{2,})/i)
          if (domainMatch) {
            initialUrl = `https://${domainMatch[1]}`
          }
        }
      }

      console.log(`[AgentLoop] Navigating to initial URL: ${initialUrl}`)
      await this.browser.goto(initialUrl)

      let stepCount = 0
      console.log(`[AgentLoop] Starting run ${runId} with max steps ${this.maxSteps}`)

      while (stepCount < this.maxSteps) {
        console.log(`[AgentLoop] Step ${stepCount}: Extracting DOM...`)

        // Wait a bit before extracting DOM to ensure page is stable
        await new Promise(resolve => setTimeout(resolve, 1000))

        const dom = await this.browser.extractDOM()
        console.log(`[AgentLoop] DOM extracted (length: ${dom.length})`)

        // If DOM is empty and this is the first step, the navigation might have failed
        if (dom.length === 0 && stepCount === 0) {
          console.error(`[AgentLoop] DOM is empty after navigation. Navigation may have failed.`)
          return {
            status: 'failing',
            steps: [],
            error: 'Navigation failed: DOM is empty after initial page load'
          }
        }

        // Take screenshot for the step
        const screenshotPath = path.join(evidencePath, `step_${stepCount}.png`)
        await this.browser.screenshot(screenshotPath)
        console.log(`[AgentLoop] Screenshot saved to ${screenshotPath}`)

        console.log(`[AgentLoop] Asking Gemini...`)
        const decision = await this.gemini.decideAction(dom, JSON.stringify(test), history)
        const actions = Array.isArray(decision) ? decision : [decision]
        console.log(`[AgentLoop] Gemini decided on ${actions.length} actions:`, actions)

        // Add a delay to respect rate limits (5 seconds)
        await new Promise(resolve => setTimeout(resolve, 5000))

        let batchResult = 'Success'

        for (const action of actions) {
          if (action.action === 'done') {
            return { status: 'pass', steps: [], error: null }
          }

          if (action.action === 'fail') {
            return { status: 'failing', steps: [], error: action.reason || 'Agent failed' }
          }

          let result = 'Success'
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
                // Always save to the default location so it's automatically loaded next time
                const authPath = path.join(process.cwd(), 'data', 'auth.json')
                // Ensure directory exists
                await fs.mkdir(path.dirname(authPath), { recursive: true })
                await this.browser.saveStorageState(authPath)
                break
            }
          } catch (e: any) {
            result = `Error: ${e.message}`
            batchResult = result // Mark batch as failed if one action fails
            // Optionally break here if we want to stop execution on first error
            // break 
          }

          history.push({ action, result })
        }

        // Update step status in database
        try {
          // Update the test run step status based on the current step count
          // We need to find the testRunStep that corresponds to this step
          const testRunSteps = await db.query.testRunStep.findMany({
            where: eq(schema.testRunStep.testRunId, runId),
            with: {
              testStep: true
            }
          })

          // Find the step that matches the current stepCount (by order)
          const currentTestRunStep = testRunSteps.find((trs: any) => trs.testStep.order === stepCount + 1)

          if (currentTestRunStep) {
            await db
              .update(schema.testRunStep)
              .set({
                status: batchResult.includes('Error') ? 'failed' : 'passed',
              })
              .where(eq(schema.testRunStep.id, currentTestRunStep.id))
          }
        } catch (dbError) {
          console.error('[AgentLoop] Failed to update step status:', dbError)
        }

        stepCount++
      }

      return { status: 'failing', steps: [], error: 'Max steps reached' }
    } catch (e: any) {
      return { status: 'failing', steps: [], error: e.message }
    } finally {
      await this.browser.close()
    }
  }
}
