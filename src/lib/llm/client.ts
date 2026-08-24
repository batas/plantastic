import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Anthropic } from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { getConfig, getPhotosDir, maskSecret, type LlmProvider } from '@/lib/settings'
import type { Photo } from '@/lib/db/schema'

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  ollama: 'llava',
  litellm: 'gpt-4o-mini',
}

export function resolveLlm(provider?: LlmProvider): { provider: LlmProvider; model: string } {
  const cfg = getConfig()
  const selected = provider ?? cfg.llm?.provider ?? 'ollama'
  const model = cfg.llm?.model || DEFAULT_MODELS[selected]
  return { provider: selected, model }
}

function requireApiKey(provider: LlmProvider): string {
  const apiKey = getConfig().llm?.apiKey ?? ''
  if (!apiKey && provider !== 'ollama') {
    throw new Error(`Brak klucza API dla providera ${provider}. Skonfiguruj go w ustawieniach.`)
  }
  return apiKey
}

export interface ChatImage {
  data: string
  mime: string
}

export interface ChatOptions {
  system?: string
  prompt: string
  images?: ChatImage[]
  maxTokens?: number
  /** request strict JSON output (openai-compatible providers) */
  json?: boolean
}

export interface ChatResult {
  text: string
  truncated: boolean
  provider: LlmProvider
  model: string
}

export async function chat(opts: ChatOptions, provider?: LlmProvider): Promise<ChatResult> {
  const { provider: p, model } = resolveLlm(provider)
  const apiKey = requireApiKey(p)
  console.log(`[llm] ${p}: model=${model} apiKey=${maskSecret(apiKey)}`)
  if (p === 'anthropic') return chatAnthropic(model, apiKey, opts)
  return chatOpenAiCompatible(p, model, apiKey, opts)
}

type AnthropicContent = Anthropic.ContentBlockParam[]
type OpenAiContent = OpenAI.Chat.Completions.ChatCompletionContentPart[]

async function chatAnthropic(model: string, apiKey: string, opts: ChatOptions): Promise<ChatResult> {
  const client = new Anthropic({ apiKey })
  const content: AnthropicContent = [{ type: 'text', text: opts.prompt }]
  for (const img of opts.images ?? []) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: img.mime as 'image/png' | 'image/jpeg' | 'image/webp', data: img.data },
    })
  }
  const res = await client.messages.create({
    model,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: [{ role: 'user', content }],
  })
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
  return { text, truncated: res.stop_reason === 'max_tokens', provider: 'anthropic', model }
}

async function chatOpenAiCompatible(provider: LlmProvider, model: string, apiKey: string, opts: ChatOptions): Promise<ChatResult> {
  const cfg = getConfig()
  if (provider === 'litellm') {
    return chatLiteLLM(model, apiKey, opts)
  }
  const baseURL = provider === 'ollama' ? cfg.llm?.baseUrl ?? 'http://localhost:11434/v1' : undefined
  const client = new OpenAI({ apiKey: provider === 'ollama' ? 'ollama' : apiKey, baseURL })
  const content: OpenAiContent = [{ type: 'text', text: opts.prompt }]
  for (const img of opts.images ?? []) {
    content.push({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.data}` } })
  }
  const res = await client.chat.completions.create({
    model,
    messages: [
      ...(opts.system ? [{ role: 'system' as const, content: opts.system }] : []),
      { role: 'user' as const, content },
    ],
    max_tokens: opts.maxTokens ?? 4096,
    ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
  })
  const choice = res.choices[0]
  return {
    text: choice?.message?.content ?? '',
    truncated: choice?.finish_reason === 'length',
    provider,
    model,
  }
}

async function chatLiteLLM(model: string, apiKey: string, opts: ChatOptions): Promise<ChatResult> {
  const base = (getConfig().llm?.baseUrl ?? 'http://localhost:4000').replace(/\/+$/, '')
  const messages: unknown[] = [
    ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
    {
      role: 'user',
      content: [
        { type: 'text', text: opts.prompt },
        ...(opts.images ?? []).map((img) => ({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.data}` } })),
      ],
    },
  ]
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'x-litellm-api-key': apiKey,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: opts.maxTokens ?? 4096,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`LiteLLM ${res.status}: ${err.slice(0, 300)}`)
  }
  const data = (await res.json()) as Record<string, unknown>
  const choice = Array.isArray(data.choices) ? (data.choices[0] as Record<string, unknown>) : undefined
  const message = choice?.message as Record<string, unknown> | undefined
  return {
    text: String(message?.content ?? ''),
    truncated: choice?.finish_reason === 'length',
    provider: 'litellm',
    model,
  }
}

const EXT_MIME: Record<string, string> = { png: 'image/png', webp: 'image/webp' }

export function readImageAsBase64(photoPath: string): ChatImage {
  const abs = path.join(getPhotosDir(), photoPath)
  const buf = readFileSync(abs)
  const ext = photoPath.split('.').pop()?.toLowerCase() ?? 'jpg'
  const mime = EXT_MIME[ext] ?? 'image/jpeg'
  return { data: buf.toString('base64'), mime }
}

export function photosToImages(photos: Pick<Photo, 'path'>[], limit: number): ChatImage[] {
  return photos.slice(0, limit).map((p) => readImageAsBase64(p.path))
}

/** Extract the first {...} JSON block from an LLM answer; returns null when absent/unparsable. */
export function parseJsonLoose<T>(text: string): T | null {
  const cleaned = text.replace(/```json|```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T
  } catch {
    return null
  }
}
