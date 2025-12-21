import { GoogleGenerativeAI } from '@google/generative-ai'

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
    cookies?: Array<Record<string, unknown>>
  latitude?: number
  longitude?: number
  assertionType?: 'visible' | 'hidden' | 'enabled' | 'disabled' | 'text' | 'value'
  expectedValue?: string
  path?: string
}

export class GeminiProvider {
    private genAI: GoogleGenerativeAI
    private model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey)
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  }

    async generateResponse(prompt: string, context: Record<string, unknown>): Promise<string> {
    const chat = this.model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: JSON.stringify(context) }],
        },
      ],
    })

    const result = await chat.sendMessage(prompt)
    return result.response.text()
  }

    async decideAction(dom: string, goal: string, history: Array<Record<string, unknown>>): Promise<AgentAction | AgentAction[]> {
    const prompt = `
      You are a browser automation agent.
      Goal: ${goal}
      
      Current DOM Snapshot:
      ${dom}
      
      History:
      ${JSON.stringify(history)}
      
      Decide the next action(s). You can return a SINGLE action object OR an ARRAY of action objects to be executed in sequence.
      Return ONLY a JSON object or JSON array with the following structure:
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

    let responseText: string;
    const maxRetries = 5
    let retryCount = 0
    const baseDelay = 5000 // Increased to 5 seconds

    while (retryCount < maxRetries) {
      try {
        const result = await this.model.generateContent(prompt)
        responseText = result.response.text()
        break; // Exit loop on successful response
      } catch (error: unknown) {
        // Check for 429 error (rate limit)
        // The Gemini API might return a 429 status directly or embed it in the error message.
        if (error instanceof Error && (error.message?.includes('429') || (error as { status?: number }).status === 429)) {
          retryCount++
          if (retryCount === maxRetries) {
            console.error(`[GeminiProvider] Max retries (${maxRetries}) exceeded for 429 error.`)
            throw error // Re-throw if max retries reached
          }

          const delay = baseDelay * Math.pow(2, retryCount - 1)
          console.log(`[GeminiProvider] Rate limit hit. Retrying in ${delay}ms... (Attempt ${retryCount}/${maxRetries})`)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        throw error // Re-throw other types of errors immediately
      }
    }

      // If the loop completes without breaking, it means max retries were exceeded for a 429 error
      // and the last `throw error` would have been executed.
      // This line should theoretically not be reached if an error occurred or responseText was set.
      if (!responseText) {
        throw new Error('Failed to get a response from Gemini after multiple retries.')
      }

    try {
      // Clean up markdown code blocks if present
      let cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim()

      // Sometimes the model adds text after the JSON, so we try to find the last closing brace/bracket
      const lastBrace = cleanJson.lastIndexOf('}')
      const lastBracket = cleanJson.lastIndexOf(']')

      if (lastBrace > -1 || lastBracket > -1) {
        const endIndex = Math.max(lastBrace, lastBracket)
        cleanJson = cleanJson.substring(0, endIndex + 1)
      }

      return JSON.parse(cleanJson)
    } catch (_) {
      console.error('Failed to parse Gemini response:', responseText)
      // Try to extract the reason from the response text
      const reasonMatch = responseText.match(/"reason":\s*"([^"]+)"/i)
      const extractedReason = reasonMatch ? reasonMatch[1] : responseText.substring(0, 200)
      return { action: 'fail', reason: extractedReason || 'Invalid JSON response from Gemini' }
    }
  }
}
