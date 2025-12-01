import { chromium, Browser, Page, BrowserContext } from 'playwright'
import fs from 'fs/promises'
import path from 'path'

export class LocalBrowserService {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null

  async launch(headless: boolean = true) {
    const ignoreHTTPSErrors = process.env.IGNORE_HTTPS_ERRORS === 'true'
    console.log(`[LocalBrowser] Launching with ignoreHTTPSErrors: ${ignoreHTTPSErrors} (env value: ${process.env.IGNORE_HTTPS_ERRORS})`)

    this.browser = await chromium.launch({ headless })
    this.context = await this.browser.newContext({ ignoreHTTPSErrors })
    this.page = await this.context.newPage()
  }

  async goto(url: string) {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.goto(url, { waitUntil: 'networkidle' })
    // Wait a bit more for dynamic content
    await this.page.waitForTimeout(2000)
  }

  async click(selector: string) {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.click(selector)
  }

  async type(selector: string, text: string) {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.fill(selector, text)
  }

  async waitFor(selector: string) {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.waitForSelector(selector)
  }

  async extractDOM(): Promise<string> {
    if (!this.page) throw new Error('Browser not initialized')

    try {
      // Wait for page to be fully loaded
      await this.page.waitForLoadState('domcontentloaded', { timeout: 10000 })
      await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
        console.log('[LocalBrowser] Network idle timeout, proceeding anyway')
      })

      // Additional wait for dynamic content
      await this.page.waitForTimeout(1000)

      // Simplified DOM extraction for LLM consumption
      const dom = await this.page.evaluate(() => {
        // Try to get body content first
        const body = document.body
        if (!body || !body.innerHTML || body.innerHTML.trim().length === 0) {
          // Fallback to full document if body is empty
          return document.documentElement.outerHTML
        }

        // Remove scripts, styles, etc. to reduce token count
        const clone = body.cloneNode(true) as HTMLElement
        const scripts = clone.querySelectorAll('script, style, svg, path, noscript')
        scripts.forEach(el => el.remove())

        return clone.innerHTML || document.documentElement.outerHTML
      })

      console.log(`[LocalBrowser] Extracted DOM length: ${dom.length}`)

      if (dom.length === 0) {
        console.error('[LocalBrowser] WARNING: Extracted DOM is empty!')
        // Try to get page URL for debugging
        const url = await this.page.url()
        console.error(`[LocalBrowser] Current URL: ${url}`)
      }

      return dom
    } catch (error) {
      console.error('[LocalBrowser] Error extracting DOM:', error)
      // Return empty string instead of throwing to allow the agent to continue
      return ''
    }
  }

  async screenshot(path: string) {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.screenshot({ path, fullPage: true })
  }

  async close() {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
      this.context = null
      this.page = null
    }
  }
}
