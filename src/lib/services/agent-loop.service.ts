import { GeminiProvider, AgentAction } from './gemini.provider'
import { LocalBrowserService } from './local-browser.service'
import { TestDefinition, TaskResponse } from '../testing/engine'
import fs from 'fs/promises'
import path from 'path'

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
        const action = await this.gemini.decideAction(dom, JSON.stringify(test), history)
        console.log(`[AgentLoop] Gemini decided:`, action)

        // Add a delay to respect rate limits (5 seconds)
        await new Promise(resolve => setTimeout(resolve, 5000))

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
          }
        } catch (e: any) {
          result = `Error: ${e.message}`
        }

        history.push({ action, result })
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
