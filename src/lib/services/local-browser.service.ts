import fs from 'fs/promises'
import path from 'path'
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright'

export class LocalBrowserService {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null

  async launch(headless: boolean = true) {
    const ignoreHTTPSErrors = process.env.IGNORE_HTTPS_ERRORS !== 'false'
    const wsEndpoint = process.env.BROWSER_WS_ENDPOINT
    const devtoolsBase = process.env.BROWSER_DEVTOOLS_WS

    console.log(`[LocalBrowser] Launching with ignoreHTTPSErrors: ${ignoreHTTPSErrors}`)

    let connected = false

    if (devtoolsBase) {
      const normalizedBase = devtoolsBase.replace(/^ws(s?):\/\//, 'http$1://')
      const versionUrl = normalizedBase.endsWith('/json/version')
        ? normalizedBase
        : `${normalizedBase.replace(/\/$/, '')}/json/version`

      try {
        if (!normalizedBase.startsWith('http')) {
          throw new Error('Not an HTTP endpoint, skipping fetch')
        }
        console.log(`[LocalBrowser] Resolving DevTools endpoint from ${versionUrl}`)
        const response = await fetch(versionUrl)

        if (response.ok) {
          const payload = (await response.json()) as { webSocketDebuggerUrl?: string }
          let devtoolsWs = payload.webSocketDebuggerUrl

          if (devtoolsWs) {
            const host = new URL(normalizedBase).hostname
            const port = new URL(normalizedBase).port || '9222'
            devtoolsWs = devtoolsWs.replace(/localhost:\d+/, `${host}:${port}`)

            console.log(`[LocalBrowser] Connecting over CDP to ${devtoolsWs}`)
            this.browser = await chromium.connectOverCDP(devtoolsWs)
            connected = true
          }
        }
      } catch (_) {
        console.warn('[LocalBrowser] Could not resolve DevTools via URL, falling back to direct WS')
      }
    }

    if (!connected && wsEndpoint) {
      console.log(`[LocalBrowser] Connecting to remote browser at ${wsEndpoint}`)
      try {
        if (wsEndpoint.startsWith('ws')) {
          this.browser = await chromium.connectOverCDP(wsEndpoint)
        } else {
          this.browser = await chromium.connect(wsEndpoint)
        }
        connected = true
      } catch (_) {
        console.error('[LocalBrowser] direct connection failed:', _)
      }
    }

    if (!connected) {
      const args = [
        '--incognito',
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-spki-list',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
      console.log(`[LocalBrowser] Launching local chromium with args: ${JSON.stringify(args)}`)
      this.browser = await chromium.launch({
        headless,
        args
      })
    }

    const authPath = path.join(process.cwd(), 'data', 'auth.json')
    let storageState: string | undefined = undefined
    try {
      await fs.access(authPath)
      console.log(`[LocalBrowser] Found auth state at ${authPath}, loading...`)
      storageState = authPath
    } catch {
      console.log('[LocalBrowser] No auth state found, starting fresh session')
    }

    if (!this.browser) {
      throw new Error('Browser failed to launch or connect')
    }

    this.context = await this.browser.newContext({
      ignoreHTTPSErrors,
      storageState
    })
    this.page = await this.context.newPage()
  }

  async goto(url: string) {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.goto(url, { waitUntil: 'networkidle' })
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
      await this.page.waitForLoadState('domcontentloaded', { timeout: 10000 })
      // Reduced networkidle timeout to 5s to avoid being blocked by persistent trackers
      await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
        console.log('[LocalBrowser] Network idle timeout (5s), proceeding with current DOM')
      })

      await this.page.waitForTimeout(1000)

      const dom = await this.page.evaluate(() => {
        const body = document.body
        if (!body) return document.documentElement.outerHTML

        const clone = body.cloneNode(true) as HTMLElement

        // 1. Remove non-visible elements and heavy noise
        const noise = clone.querySelectorAll('script, style, svg, path, noscript, head, iframe, footer, nav, link, meta')
        noise.forEach(el => el.remove())

        // 2. Remove comments
        const iterator = document.createNodeIterator(clone, NodeFilter.SHOW_COMMENT)
        let node;
        while (node = iterator.nextNode()) {
          node.parentElement?.removeChild(node)
        }

        // 3. Clean attributes to save massive space/tokens
        const allElements = clone.querySelectorAll('*')
        allElements.forEach(el => {
          // Keep only essential attributes for automation
          const essential = ['id', 'class', 'name', 'type', 'value', 'href', 'placeholder', 'role', 'title']
          Array.from(el.attributes).forEach(attr => {
            if (!essential.includes(attr.name)) {
              el.removeAttribute(attr.name)
            }
          })

          // Remove hidden elements from the decision tree
          const style = window.getComputedStyle(el)
          if (style.display === 'none' || style.visibility === 'hidden') {
            el.remove()
          }
        })

        return clone.innerHTML.replace(/\s+/g, ' ').trim()
      })

      console.log(`[LocalBrowser] Extracted DOM length: ${dom.length}`)
      return dom
    } catch (error) {
      console.error('[LocalBrowser] Error extracting DOM:', error)
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
    if (url) await this.goto(url)
  }

  async closeCurrentTab() {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.close()
    const pages = this.context?.pages() || []
    this.page = pages.length > 0 ? pages[pages.length - 1] : null
  }

  async switchToTab(index: number) {
    if (!this.context) throw new Error('Browser context not initialized')
    const pages = this.context.pages()
    if (index >= 0 && index < pages.length) {
      this.page = pages[index]
    } else {
      throw new Error(`Tab index ${index} out of bounds`)
    }
  }

  async goBack() {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.goBack({ waitUntil: 'networkidle' })
  }

  async goForward() {
    if (!this.page) throw new Error('Browser not initialized')
    await this.page.goForward({ waitUntil: 'networkidle' })
  }

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

  async addCookies(cookies: Parameters<BrowserContext['addCookies']>[0]) {
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

  async evaluate(script: string) {
    if (!this.page) throw new Error('Browser not initialized')
    return await this.page.evaluate(script)
  }

  async assertElement(selector: string, assertionType: 'visible' | 'hidden' | 'enabled' | 'disabled' | 'text' | 'value', expectedValue?: string) {
    if (!this.page) throw new Error('Browser not initialized')
    const locator = this.page.locator(selector)
    switch (assertionType) {
      case 'visible':
        if (!(await locator.isVisible())) throw new Error(`Expected visible`)
        break
      case 'hidden':
        if (await locator.isVisible()) throw new Error(`Expected hidden`)
        break
      case 'enabled':
        if (!(await locator.isEnabled())) throw new Error(`Expected enabled`)
        break
      case 'disabled':
        if (await locator.isEnabled()) throw new Error(`Expected disabled`)
        break
      case 'text':
        const text = await locator.textContent()
        if (!text?.includes(expectedValue || '')) throw new Error(`Expected text`)
        break
      case 'value':
        const value = await locator.inputValue()
        if (value !== expectedValue) throw new Error(`Expected value`)
        break
    }
  }

  async saveStorageState(path: string) {
    if (!this.context) throw new Error('Browser context not initialized')
    await this.context.storageState({ path })
  }

  async loadStorageState(path: string) {
    const state = JSON.parse(await fs.readFile(path, 'utf-8'))
    if (this.context) await this.context.addCookies(state.cookies)
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
