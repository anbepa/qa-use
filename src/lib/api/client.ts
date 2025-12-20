import createClient from 'openapi-fetch'

import type { paths } from '@/lib/api/v1'

export type Client = ReturnType<typeof createClient<paths>>

const baseUrl = process.env.BROWSER_USE_BASE_URL || 'https://api.browser-use.com/'
const apiKey = process.env.BROWSER_USE_API_KEY

export const client = createClient<paths>({
  baseUrl,
  headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
})
