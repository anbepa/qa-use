import OpenAI from 'openai'
import type { BrowserContext } from 'playwright'

export interface AgentAction {
  action: 'click' | 'type' | 'wait' | 'done' | 'fail' | 'reload' | 'open_tab' | 'switch_tab' | 'close_tab' | 'go_back' | 'go_forward' | 'dblclick' | 'hover' | 'check' | 'uncheck' | 'fill' | 'press' | 'select_option' | 'upload_file' | 'mouse_move' | 'mouse_down' | 'mouse_up' | 'mouse_click' | 'mouse_wheel' | 'keyboard_type' | 'keyboard_press' | 'keyboard_down' | 'keyboard_up' | 'evaluate' | 'add_cookies' | 'clear_cookies' | 'set_geolocation' | 'assert' | 'save_auth'
  selector?: string
  text?: string
  reason?: string
  url?: string
  tabIndex?: number
  value?: string | string[]
  key?: string
  files?: string | string[]
  x?: number
  y?: number
  deltaX?: number
  deltaY?: number
  script?: string
  cookies?: Parameters<BrowserContext['addCookies']>[0]
  latitude?: number
  longitude?: number
  assertionType?: 'visible' | 'hidden' | 'enabled' | 'disabled' | 'text' | 'value'
  expectedValue?: string
  path?: string
}

export class DeepSeekProvider {
  private openai: OpenAI
  public suggestedDelay: number = 2000 // Default 2s, updated based on API response

  constructor(apiKey: string) {
    this.openai = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey: apiKey,
    })
  }

  async generateResponse(prompt: string, context: Record<string, unknown>): Promise<string> {
    const completion = await this.openai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: `Context: ${JSON.stringify(context)}\n\nPrompt: ${prompt}` }
      ],
      model: 'deepseek-chat',
    })
    return completion.choices[0].message.content || ''
  }

  async decideAction(dom: string, goal: string, history: Array<Record<string, unknown>>): Promise<AgentAction | AgentAction[]> {
    const prompt = `
      You are a browser automation agent.
      Goal: ${goal}
      
      Current Browser Snapshot (Simplified):
      ${dom}
      
      Note: Use selectors like '[data-mcp-ref="123"]' to target elements by their ID in brackets.
      
      History:
      ${history.map((h, i) => {
      const item = h as { action?: { action: string; reason?: string }; result?: string }
      if (i < history.length - 5) {
        return `Step ${i + 1}: ${item.action?.action || 'unknown'} ${item.action?.reason || ''} -> ${item.result || 'No result'}`
      }
      return JSON.stringify(h)
    }).join('\n')}
      
      Decide the next action. Return ONLY A SINGLE action object.
      Return ONLY a JSON object with the following structure:
      {
        "action": "click" | "type" | "wait" | "done" | "fail" | "reload" | "open_tab" | "switch_tab" | "close_tab" | "go_back" | "go_forward" | "dblclick" | "hover" | "check" | "uncheck" | "fill" | "press" | "select_option" | "upload_file" | "mouse_move" | "mouse_down" | "mouse_up" | "mouse_click" | "mouse_wheel" | "keyboard_type" | "keyboard_press" | "keyboard_down" | "keyboard_up" | "evaluate" | "add_cookies" | "clear_cookies" | "set_geolocation" | "assert" | "save_auth",
        "selector": "css selector (if needed)",
        "text": "text to type (if needed)",
        "url": "url to open (for open_tab)",
        "tabIndex": number (for switch_tab),
        "value": "value for fill/select/assert",
        "key": "key for press",
        "files": "path to files for upload",
        "x": number, "y": number, "deltaX": number, "deltaY": number,
        "script": "javascript to evaluate",
        "cookies": "array of cookies",
        "latitude": number, "longitude": number,
        "assertionType": "visible" | "hidden" | "enabled" | "disabled" | "text" | "value",
        "expectedValue": "expected value for assertion",
        "path": "path to save auth state (for save_auth)",
        "reason": "reason for this action"
      }
    `

    let responseText: string = ''
    const maxRetries = 5
    let retryCount = 0
    const baseDelay = 5000

    while (retryCount < maxRetries) {
      try {
        const completion = await this.openai.chat.completions.create({
          messages: [
            { role: 'system', content: 'You are a helpful browser automation assistant that returns only valid JSON.' },
            { role: 'user', content: prompt }
          ],
          model: 'deepseek-chat',
          response_format: { type: 'json_object' }
        })

        responseText = completion.choices[0].message.content || ''

        // Update suggested delay based on successful response (low delay when no rate-limit)
        this.suggestedDelay = 1500
        break
      } catch (error: unknown) {
        const openAIError = error as { status?: number; headers?: Record<string, string> };
        if (openAIError.status === 429) {
          retryCount++

          // Check for retry-after header
          const retryAfter = openAIError.headers?.['retry-after']
          const delay = retryAfter
            ? parseInt(retryAfter) * 1000
            : baseDelay * Math.pow(2, retryCount - 1)

          // Update suggested delay for future requests
          this.suggestedDelay = Math.min(delay, 8000)

          if (retryCount >= maxRetries) throw error
          console.log(`[DeepSeekProvider] Rate limit hit. Retrying in ${Math.round(delay / 1000)}s... (Attempt ${retryCount}/${maxRetries})`)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        throw error
      }
    }

    if (!responseText) {
      throw new Error('Failed to get a response from DeepSeek after multiple retries.')
    }

    try {
      return JSON.parse(responseText)
    } catch (_) {
      console.error('Failed to parse DeepSeek response:', responseText)
      return { action: 'fail', reason: 'Invalid JSON response from DeepSeek' }
    }
  }
}
