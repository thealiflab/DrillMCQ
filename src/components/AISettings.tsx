import { useEffect, useId, useRef, useState } from 'react'
import type { UseAI } from '../hooks/useAI'
import { isCatalogModel, PROVIDER_LIST, PROVIDERS } from '../services/ai/models'
import { AI_KEY_PRIVACY_NOTE } from './aiDisclaimer'

interface AISettingsProps {
  ai: UseAI
  onClose: () => void
}

const CUSTOM_MODEL = '__custom__'

/**
 * Settings for the optional AI assistant, as a modal so it is reachable from
 * every screen without adding a branch to `App`'s render precedence.
 *
 * Mirrors `ConfirmDialog`'s mechanics — backdrop click, capture-phase Escape,
 * Tab trap — but focuses the provider select rather than a cancel button,
 * since nothing here is destructive.
 */
export function AISettings({ ai, onClose }: AISettingsProps) {
  const titleId = useId()
  const providerId = useId()
  const modelId = useId()
  const customModelId = useId()
  const keyId = useId()
  const rememberId = useId()

  const panelRef = useRef<HTMLDivElement>(null)
  const providerRef = useRef<HTMLSelectElement>(null)
  const [showKey, setShowKey] = useState(false)

  const meta = PROVIDERS[ai.config.provider]
  const usingCustomModel = ai.config.customModel || !isCatalogModel(ai.config.provider, ai.config.model)

  useEffect(() => {
    providerRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select',
      )
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="animate-fade-slide-in max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold">
            🤖 AI assistant
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI settings"
            className="rounded-lg px-2 py-1 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Optional. Bring your own API key to check answers and explain them. Everything
          works without it.
        </p>

        <div className="mt-5 space-y-5">
          {/* Enable */}
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={ai.config.enabled}
              onChange={(e) => ai.setEnabled(e.target.checked)}
              className="mt-0.5 size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700"
            />
            <span>
              <span className="font-medium">Enable the AI assistant</span>
              <span className="block text-slate-500 dark:text-slate-400">
                Adds optional AI actions to importing and to the results screen.
              </span>
            </span>
          </label>

          {/* Provider */}
          <div className="space-y-1.5">
            <label htmlFor={providerId} className="block text-sm font-medium">
              Provider
            </label>
            <select
              id={providerId}
              ref={providerRef}
              value={ai.config.provider}
              onChange={(e) => ai.setProvider(e.target.value as typeof ai.config.provider)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900"
            >
              {PROVIDER_LIST.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <label htmlFor={modelId} className="block text-sm font-medium">
              Model
            </label>
            <select
              id={modelId}
              value={usingCustomModel ? CUSTOM_MODEL : ai.config.model}
              onChange={(e) => {
                if (e.target.value === CUSTOM_MODEL) ai.setModel(ai.config.model, true)
                else ai.setModel(e.target.value, false)
              }}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900"
            >
              {meta.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                  {model.note !== undefined ? ` — ${model.note}` : ''}
                </option>
              ))}
              <option value={CUSTOM_MODEL}>Custom model ID…</option>
            </select>
            {usingCustomModel && (
              <input
                id={customModelId}
                type="text"
                value={ai.config.model}
                onChange={(e) => ai.setModel(e.target.value, true)}
                placeholder="Exact model id from your provider"
                aria-label="Custom model ID"
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm shadow-sm outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900"
              />
            )}
          </div>

          {/* API key */}
          <div className="space-y-1.5">
            <label htmlFor={keyId} className="block text-sm font-medium">
              API key
            </label>
            <div className="flex gap-2">
              <input
                id={keyId}
                type={showKey ? 'text' : 'password'}
                value={ai.apiKey}
                onChange={(e) => ai.setApiKey(e.target.value)}
                placeholder={meta.keyPlaceholder}
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm shadow-sm outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="shrink-0 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {AI_KEY_PRIVACY_NOTE}{' '}
              <a
                href={meta.keysUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Get a {meta.label} key
              </a>
            </p>
          </div>

          {/* Remember opt-in */}
          <label className="flex items-start gap-3 text-sm">
            <input
              id={rememberId}
              type="checkbox"
              checked={ai.config.rememberKey}
              onChange={(e) => ai.setRememberKey(e.target.checked)}
              className="mt-0.5 size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700"
            />
            <span>
              <span className="font-medium">Remember this key on this device</span>
              <span className="block text-slate-500 dark:text-slate-400">
                Off by default. When off, the key is kept in memory only and is gone when you
                reload. When on, it is stored in this browser in plain text — avoid it on a
                shared computer.
              </span>
            </span>
          </label>

          {meta.browserNote !== undefined && (
            <p
              role="note"
              className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
            >
              {meta.browserNote}
            </p>
          )}

          {/* Connection test */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void ai.testConnection()}
              disabled={ai.busy || ai.apiKey.trim() === ''}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ai.connectionStatus === 'testing' ? 'Testing…' : 'Test connection'}
            </button>
            {ai.connectionStatus === 'ok' && (
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
                ✓ Connected
              </span>
            )}
            {ai.connectionStatus === 'failed' && (
              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
                ✗ Failed
              </span>
            )}
            {ai.apiKey !== '' && (
              <button
                type="button"
                onClick={ai.forgetKey}
                className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Clear API key
              </button>
            )}
          </div>

          {ai.error !== null && (
            <div
              role="alert"
              className="animate-fade-slide-in rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400"
            >
              {ai.error.message}
            </div>
          )}

          <p className="border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            {ai.requestCount === 0
              ? 'No AI requests made this session.'
              : `AI requests this session: ${ai.requestCount}. You pay your provider directly for these.`}
            {ai.keyPersisted && ' Your key is stored on this device.'}
          </p>
        </div>
      </div>
    </div>
  )
}
