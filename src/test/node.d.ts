/**
 * The narrowest possible slice of Node's API, for tests only.
 *
 * `src/utils/appearance.test.ts` asserts that `index.css` still backs every
 * appearance option, which means reading the stylesheet as text. Importing it
 * with Vite's `?raw` doesn't work: Vitest stubs CSS imports and hands back an
 * empty string, so the assertions would pass vacuously — worse than no test.
 *
 * Declared here rather than adding `@types/node` to the project: this is the
 * only Node API any test needs, and pulling in the full typings for one call
 * would be a poor trade.
 */
declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: 'utf8'): string
}
