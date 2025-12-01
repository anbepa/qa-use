import { LocalBrowserService } from './lib/services/local-browser.service'
import { GeminiProvider } from './lib/services/gemini.provider'
import dotenv from 'dotenv'

dotenv.config()

async function verify() {
  console.log('Starting verification...')

  // 1. Verify LocalBrowserService
  console.log('1. Testing LocalBrowserService...')
  const browser = new LocalBrowserService()
  try {
    await browser.launch(false) // Headless=false to see it if possible, but in this env it might fail if no display. 
    // Actually, let's use true for safety in CI/headless envs.
    // But the user wanted to see it. I'll respect the env var or default to true.
    const headless = process.env.HEADLESS !== 'false'
    if (headless) await browser.launch(true)
    else await browser.launch(false)

    await browser.goto('https://example.com')
    console.log('   - Navigated to example.com')

    const dom = await browser.extractDOM()
    console.log('   - Extracted DOM length:', dom.length)

    if (dom.includes('Example Domain')) {
      console.log('   - DOM content verified')
    } else {
      console.error('   - DOM content verification failed')
    }

    await browser.screenshot('verification-screenshot.png')
    console.log('   - Screenshot taken')

  } catch (e) {
    console.error('   - LocalBrowserService failed:', e)
  } finally {
    await browser.close()
  }

  // 2. Verify GeminiProvider (only if key is present)
  if (process.env.GEMINI_API_KEY) {
    console.log('2. Testing GeminiProvider...')
    const gemini = new GeminiProvider(process.env.GEMINI_API_KEY)
    try {
      const response = await gemini.generateResponse('Hello, are you there?', {})
      console.log('   - Gemini response:', response)
    } catch (e) {
      console.error('   - GeminiProvider failed:', e)
    }
  } else {
    console.log('2. Skipping GeminiProvider test (no API KEY)')
  }

  console.log('Verification complete.')
}

verify()
