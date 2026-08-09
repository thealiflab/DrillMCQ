/**
 * Copy shown next to every block of AI-generated content.
 *
 * Lives in a `.ts` rather than a `.tsx` so exporting a constant alongside a
 * component doesn't trip `react-refresh/only-export-components`.
 */

export const AI_DISCLAIMER =
  'AI explanations and answer checks can be wrong. Treat them as a second opinion, ' +
  'not the final word — verify against your source material.'

export const AI_UNCERTAIN_NOTE = 'The AI was not confident about this one.'

/** Privacy note shown in settings, next to the API key field. */
export const AI_KEY_PRIVACY_NOTE =
  'Your API key is sent straight from this browser to the AI provider you choose. ' +
  'DrillMCQ has no server, so it never receives or stores your key.'
