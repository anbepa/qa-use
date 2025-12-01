import { GoogleGenerativeAI } from '@google/generative-ai'

export interface AgentAction {
  action: 'click' | 'type' | 'wait' | 'done' | 'fail'
  selector?: string
  text?: string
  reason?: string
}

export class GeminiProvider {
  private genAI: GoogleGenerativeAI
  private model: any

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey)
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  }

  async generateResponse(prompt: string, context: any): Promise<string> {
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

  async decideAction(dom: string, goal: string, history: any[]): Promise<AgentAction> {
    const prompt = `
      You are a browser automation agent.
      Goal: ${goal}
      
      Current DOM Snapshot:
      ${dom}
      
      History:
      ${JSON.stringify(history)}
      
      Decide the next action. Return ONLY a JSON object with the following structure:
      {
        "action": "click" | "type" | "wait" | "done" | "fail",
        "selector": "css selector (if needed)",
        "text": "text to type (if needed)",
        "reason": "reason for this action"
      }
    `

    let responseText: string;
    const maxRetries = 5
    let retryCount = 0
    let baseDelay = 5000 // Increased to 5 seconds

    while (retryCount < maxRetries) {
      try {
        const result = await this.model.generateContent(prompt)
        responseText = result.response.text()
        break; // Exit loop on successful response
      } catch (error: any) {
        // Check for 429 error (rate limit)
        // The Gemini API might return a 429 status directly or embed it in the error message.
        if (error.message?.includes('429') || error.status === 429) {
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
    if (!responseText!) {
      throw new Error('Failed to get a response from Gemini after multiple retries.')
    }

    try {
      // Clean up markdown code blocks if present
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim()
      return JSON.parse(cleanJson)
    } catch (e) {
      console.error('Failed to parse Gemini response:', responseText)
      return { action: 'fail', reason: 'Invalid JSON response from Gemini' }
    }
  }
}
