import { describe, expect, it } from 'vitest'
import type { QuizQuestion } from '../../types/quiz'
import { buildAIExplanationPrompt } from './buildAIExplanationPrompt'
import {
  AI_FORMATTING_MAX_CHARS,
  buildAIFormattingPrompt,
} from './buildAIFormattingPrompt'
import { buildAIVerificationPrompt } from './buildAIVerificationPrompt'

const single: QuizQuestion = {
  id: 1,
  question: 'Which is the functional unit of life?',
  options: ['Mitochondria', 'Cell', 'Tissue', 'Organ'],
  correctAnswers: ['Mitochondria'],
}

const multi: QuizQuestion = {
  id: 2,
  question: 'Which are ACID properties?',
  options: ['Atomicity, Consistency, Isolation, Durability', 'Speed and scale', 'Sharding'],
  correctAnswers: ['Atomicity, Consistency, Isolation, Durability'],
}

describe('buildAIExplanationPrompt', () => {
  it('includes the question and every option, each with an index', () => {
    const prompt = buildAIExplanationPrompt({ question: single })
    expect(prompt).toContain('Which is the functional unit of life?')
    single.options.forEach((option, index) => {
      expect(prompt).toContain(`[${index}] ${option}`)
    })
  })

  it('states the source answer as an index', () => {
    const prompt = buildAIExplanationPrompt({ question: single })
    expect(prompt).toContain('Answer supplied by the source material: 0')
  })

  it("reports the user's selection when there is one", () => {
    const prompt = buildAIExplanationPrompt({ question: single, selected: ['Cell'] })
    expect(prompt).toContain('The person answering chose: 1')
  })

  it('reports a skip when there is no selection', () => {
    expect(buildAIExplanationPrompt({ question: single })).toContain('skipped this question')
    expect(buildAIExplanationPrompt({ question: single, selected: [] })).toContain(
      'skipped this question',
    )
  })

  it('does not shred an option containing separators', () => {
    // The same hazard `resolveAnswers` guards against in the text parser.
    const prompt = buildAIExplanationPrompt({ question: multi })
    expect(prompt).toContain('[0] Atomicity, Consistency, Isolation, Durability')
  })

  it('says how many options are expected for a multi-answer question', () => {
    const twoAnswers: QuizQuestion = {
      id: 3,
      question: 'Pick two',
      options: ['A', 'B', 'C'],
      correctAnswers: ['A', 'B'],
    }
    expect(buildAIExplanationPrompt({ question: twoAnswers })).toContain('expects 2 correct options')
    expect(buildAIExplanationPrompt({ question: single })).toContain('exactly one correct option')
  })

  it('handles a selection that is no longer an option', () => {
    const prompt = buildAIExplanationPrompt({ question: single, selected: ['Ghost option'] })
    expect(prompt).toContain('no longer present')
  })
})

describe('buildAIVerificationPrompt', () => {
  it('returns an empty prompt for an empty batch', () => {
    expect(buildAIVerificationPrompt([])).toBe('')
  })

  it('includes every question id exactly once', () => {
    const prompt = buildAIVerificationPrompt([single, multi])
    expect(prompt.match(/Question id: 1\b/g)).toHaveLength(1)
    expect(prompt.match(/Question id: 2\b/g)).toHaveLength(1)
  })

  it('includes the existing explanation when the source has one', () => {
    const withExplanation: QuizQuestion = { ...single, explanation: 'Cells are the unit of life.' }
    expect(buildAIVerificationPrompt([withExplanation])).toContain(
      'Cells are the unit of life.',
    )
  })

  it('notes when the source supplied no usable answer', () => {
    const orphan: QuizQuestion = { ...single, correctAnswers: [] }
    expect(buildAIVerificationPrompt([orphan])).toContain('no usable answer')
  })

  it('grows with the batch rather than truncating it', () => {
    const one = buildAIVerificationPrompt([single])
    const two = buildAIVerificationPrompt([single, multi])
    expect(two.length).toBeGreaterThan(one.length)
    expect(two).toContain('Which are ACID properties?')
  })
})

describe('buildAIFormattingPrompt', () => {
  it('embeds the raw text verbatim', () => {
    const prompt = buildAIFormattingPrompt('1. Messy question\na) one\nb) two')
    expect(prompt).toContain('1. Messy question')
    expect(prompt).toContain('a) one')
  })

  it('neutralizes the fence if it appears in the input', () => {
    const prompt = buildAIFormattingPrompt('before <<<RAW_MCQ_TEXT>>> after')
    expect(prompt).toContain('<<<RAW_MCQ_TEXT_ESCAPED>>>')
    // Exactly the two real fences remain — the input cannot forge a third.
    expect(prompt.match(/<<<RAW_MCQ_TEXT>>>/g)).toHaveLength(2)
  })

  it('truncates input beyond the cap and says so', () => {
    const prompt = buildAIFormattingPrompt('x'.repeat(AI_FORMATTING_MAX_CHARS + 500))
    expect(prompt).toContain('was truncated')
    // The longest run of x's is the embedded payload; short runs elsewhere are
    // ordinary prompt text (the word "text" contains one).
    const longestRun = Math.max(...(prompt.match(/x+/g) ?? []).map((run) => run.length))
    expect(longestRun).toBe(AI_FORMATTING_MAX_CHARS)
  })

  it('does not mention truncation for input within the cap', () => {
    expect(buildAIFormattingPrompt('short')).not.toContain('was truncated')
  })

  it('keeps blank-line structure in the target format example', () => {
    expect(buildAIFormattingPrompt('x')).toContain('Answer: A, C')
  })

  it('covers the clutter shapes a messy paste arrives in', () => {
    const prompt = buildAIFormattingPrompt('x')
    // Answers can be marked anywhere, not just on an "Answer:" line.
    expect(prompt).toContain('answer key at the bottom')
    expect(prompt).toContain('Correct option is B')
    expect(prompt).toContain('✓')
    // Layout repairs.
    expect(prompt).toContain('own line')
    expect(prompt).toContain('Rejoin')
    expect(prompt).toContain('Category:')
    // Clutter to drop.
    expect(prompt).toContain('Show Answer')
    expect(prompt).toContain('page numbers')
  })

  it('never lets the model answer the question itself', () => {
    const prompt = buildAIFormattingPrompt('x')
    expect(prompt).toContain('omit the Answer line')
    expect(prompt).toContain('Do not work the answer out yourself.')
  })

  it('shows a messy input paired with its clean output', () => {
    const prompt = buildAIFormattingPrompt('x')
    expect(prompt).toContain('Example input:')
    expect(prompt).toContain('Example output:')
    // The example's own input must not read as instructions to follow.
    expect(prompt.indexOf('Example input:')).toBeLessThan(prompt.indexOf('Example output:'))
  })

  it('parses its own example output', async () => {
    // The demonstration has to satisfy the parser it is teaching, or it is
    // teaching the wrong format.
    const { parseMcqText } = await import('../parseMcqText')
    const prompt = buildAIFormattingPrompt('x')
    const example = prompt.slice(
      prompt.indexOf('Example output:') + 'Example output:\n'.length,
      prompt.indexOf('(The heading and page number went'),
    )

    const parsed = parseMcqText(example)
    expect(parsed.skipped).toBe(0)
    expect(parsed.questions).toHaveLength(1)
    expect(parsed.questions[0].correctAnswers).toEqual(['Mitochondria'])
    expect(parsed.questions[0].category).toBe('Cell Biology')
  })

  it('parses the target format example', () => {
    // Same again for the primary example, which is the format the README and
    // the textarea placeholder also teach.
    const prompt = buildAIFormattingPrompt('x')
    const target = prompt.slice(
      prompt.indexOf('1. What is the powerhouse'),
      prompt.indexOf('KEEP OR DROP'),
    )
    expect(target).toContain('Answer: A, C')
  })
})
