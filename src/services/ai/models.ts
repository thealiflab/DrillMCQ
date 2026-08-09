import type { AIProviderId } from '../../types/ai'

/**
 * Curated model catalog. Short on purpose — the `Custom model ID…` option in
 * `AISettings` is the escape hatch, so the list going stale is an annoyance
 * rather than a blocker.
 */

export interface ModelOption {
  id: string
  label: string
  note?: string
}

export interface ProviderMeta {
  id: AIProviderId
  label: string
  models: ModelOption[]
  defaultModel: string
  /** Shape hint for the key input. Never a real key. */
  keyPlaceholder: string
  /** Where the user gets a key. */
  keysUrl: string
  /** Extra warning shown in settings — set where browser use needs a caveat. */
  browserNote?: string
}

export const PROVIDERS: Record<AIProviderId, ProviderMeta> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    models: [
      { id: 'gpt-5', label: 'GPT-5' },
      { id: 'gpt-5-mini', label: 'GPT-5 mini', note: 'Cheaper, good enough for verification' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
    ],
    defaultModel: 'gpt-5-mini',
    keyPlaceholder: 'sk-…',
    keysUrl: 'https://platform.openai.com/api-keys',
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', note: 'Fast and cheap' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    ],
    defaultModel: 'gemini-2.5-flash',
    keyPlaceholder: 'AIza…',
    keysUrl: 'https://aistudio.google.com/apikey',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    models: [
      { id: 'claude-opus-5', label: 'Claude Opus 5', note: 'Most capable' },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', note: 'Fast and cheap' },
    ],
    defaultModel: 'claude-sonnet-5',
    keyPlaceholder: 'sk-ant-…',
    keysUrl: 'https://console.anthropic.com/settings/keys',
    browserNote:
      'Anthropic requires an explicit opt-in header for requests made straight from a ' +
      'browser, which DrillMCQ sends for you. Your key still travels from this page to ' +
      'api.anthropic.com, so prefer a key scoped to this use and avoid "remember on this ' +
      'device" on a shared computer.',
  },
}

export const PROVIDER_LIST: ProviderMeta[] = [
  PROVIDERS.openai,
  PROVIDERS.gemini,
  PROVIDERS.anthropic,
]

export function defaultModelFor(provider: AIProviderId): string {
  return PROVIDERS[provider].defaultModel
}

export function isCatalogModel(provider: AIProviderId, model: string): boolean {
  return PROVIDERS[provider].models.some((m) => m.id === model)
}
