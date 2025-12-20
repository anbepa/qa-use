import fs from 'fs/promises'
import path from 'path'
import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page, SetCookieParam } from 'playwright'

export class LocalBrowserService {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null

    async launch(headless: boolean = true) {
    const ignoreHTTPSErrors = true // Forced as per user request
    console.log(`[LocalBrowser] Launching with ignoreHTTPSErrors: ${ignoreHTTPSErrors}`)

    const args = [
      '--incognito',
      '--ignore-certificate-errors',
      '--ignore-certificate-errors-spki-list', // Helps with some specific cert errors
      '--no-sandbox', // Often needed in Docker/CI
      '--disable-setuid-sandbox',
      '--remote-debugging-port=9222',
      '--remote-debugging-address=0.0.0.0'
    ]
    console.log(`[LocalBrowser] Launching chromium with args: ${JSON.stringify(args)}`)

    this.browser = await chromium.launch({
      headless,
      args
    })

    const authPath = path.join(process.cwd(), 'data', 'auth.json')
      let storageState: string | undefined
    try {
      await fs.access(authPath)
      console.log(`[LocalBrowser] Found auth state at ${authPath}, loading...`)
      storageState = authPath
    } catch {
      console.log('[LocalBrowser] No auth state found, starting fresh session')
    }

    this.context = await this.browser.newContext({
      ignoreHTTPSErrors,
      storageState // Inject saved state if available
    })
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

  async reload() {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.reload({ waitUntil: 'networkidle' })
  }

  async openNewTab(url?: string) {
    if (!this.context) throw new Error('Browser context not initialized')
    this.page = await this.context.newPage()
    if (url) {
      await this.goto(url)
    }
  }

  async closeCurrentTab() {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.close()
    // Switch to the last open page if available
    const pages = this.context?.pages() || []
    if (pages.length > 0) {
      this.page = pages[pages.length - 1]
    } else {
      this.page = null
    }
  }

  async switchToTab(index: number) {
    if (!this.context) throw new Error('Browser context not initialized')
    const pages = this.context.pages()
    if (index >= 0 && index < pages.length) {
      this.page = pages[index]
    } else {
      throw new Error(`Tab index ${index} out of bounds (total tabs: ${pages.length})`)
    }
  }

  // Navigation
  async goBack() {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.goBack({ waitUntil: 'networkidle' })
  }

  async goForward() {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.goForward({ waitUntil: 'networkidle' })
  }

  // Interaction
  async dblclick(selector: string) {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.dblclick(selector)
  }

  async hover(selector: string) {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.hover(selector)
  }

  async check(selector: string) {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.check(selector)
  }

  async uncheck(selector: string) {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.uncheck(selector)
  }

  async fill(selector: string, value: string) {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.fill(selector, value)
  }

  async press(selector: string, key: string) {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.press(selector, key)
  }

  async selectOption(selector: string, values: string | string[]) {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.selectOption(selector, values)
  }

  async setInputFiles(selector: string, files: string | string[]) {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.setInputFiles(selector, files)
  }

  async focus(selector: string) {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.focus(selector)
  }

  // Mouse
  async mouseMove(x: number, y: number) {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.mouse.move(x, y)
  }

  async mouseDown() {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.mouse.down()
  }

  async mouseUp() {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.mouse.up()
  }

  async mouseClick(x: number, y: number) {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.mouse.click(x, y)
  }

  async mouseWheel(deltaX: number, deltaY: number) {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.mouse.wheel(deltaX, deltaY)
  }

  // Keyboard
  async keyboardType(text: string) {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.keyboard.type(text)
  }

  async keyboardPress(key: string) {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.keyboard.press(key)
  }

  async keyboardDown(key: string) {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.keyboard.down(key)
  }

  async keyboardUp(key: string) {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.keyboard.up(key)
  }

  // Context & Cookies
    async addCookies(cookies: SetCookieParam[]) {
    if (!this.context) throw new Error('Browser context not initialized')
    await this.context.addCookies(cookies)
  }

  async clearCookies() {
    if (!this.context) throw new Error('Browser context not initialized')
    await this.context.clearCookies()
  }

  async setGeolocation(latitude: number, longitude: number) {
    if (!this.context) throw new Error('Browser context not initialized')
    await this.context.setGeolocation({ latitude, longitude })
    await this.context.grantPermissions(['geolocation'])
  }

  // JS Evaluation
  async evaluate(script: string) {
    if (!this.page) throw new Error('Browser not initialized')
    return await this.page.evaluate(script)
  }

  // Assertions (Expects)
  async assertElement(selector: string, assertionType: 'visible' | 'hidden' | 'enabled' | 'disabled' | 'text' | 'value', expectedValue?: string) {
    if (!this.page) throw new Error('Browser not initialized')
    const locator = this.page.locator(selector)

    switch (assertionType) {
      case 'visible':
        if (!(await locator.isVisible())) throw new Error(`Expected element ${selector} to be visible`)
        break
      case 'hidden':
        if (await locator.isVisible()) throw new Error(`Expected element ${selector} to be hidden`)
        break
      case 'enabled':
        if (!(await locator.isEnabled())) throw new Error(`Expected element ${selector} to be enabled`)
        break
      case 'disabled':
        if (await locator.isEnabled()) throw new Error(`Expected element ${selector} to be disabled`)
        break
      case 'text':
        const text = await locator.textContent()
        if (!text?.includes(expectedValue || '')) throw new Error(`Expected element ${selector} to contain text "${expectedValue}", found "${text}"`)
        break
      case 'value':
        const value = await locator.inputValue()
        if (value !== expectedValue) throw new Error(`Expected element ${selector} to have value "${expectedValue}", found "${value}"`)
        break
    }
  }

  async saveStorageState(path: string) {
    if (!this.context) throw new Error('Browser context not initialized')
    await this.context.storageState({ path })
    console.log(`[LocalBrowser] Storage state saved to ${path}`)
  }

  async loadStorageState(path: string) {
    // This is typically done at context creation, but we can also add cookies/storage to existing context if needed
    // However, Playwright recommends doing it at context creation. 
    // For now, we'll assume this is called manually or we restart context.
    // But since we want to persist session across runs, we should modify launch() to check for a default auth file.
    console.log(`[LocalBrowser] Loading storage state from ${path}`)
    const state = JSON.parse(await fs.readFile(path, 'utf-8'))
    if (this.context) {
      await this.context.addCookies(state.cookies)
      // LocalStorage needs to be added via script injection usually or context option
      // But adding cookies is often enough for session persistence.
    }
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
