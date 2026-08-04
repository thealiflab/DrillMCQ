import { describe, expect, it } from 'vitest'
import type { QuizQuestion, QuizSession, QuizSettings } from '../types/quiz'
import {
  computeResult,
  isAnswerCorrect,
  isMultiAnswer,
  normalizeQuestion,
  parseQuizJson,
  toggleOption,
} from './quiz'

const settings: QuizSettings = {
  shuffleQuestions: false,
  shuffleOptions: false,
  timerMinutes: 0,
  categories: [],
}

/** "Which are operating systems?" — A and C are correct, B and D are not. */
const multi: QuizQuestion = {
  id: 1,
  question: 'Which of the following are operating systems?',
  options: ['Windows', 'Python', 'Linux', 'Java'],
  correctAnswers: ['Windows', 'Linux'],
}

const single: QuizQuestion = {
  id: 2,
  question: 'Capital of France?',
  options: ['Paris', 'Rome'],
  correctAnswers: ['Paris'],
}

function sessionWith(questions: QuizQuestion[], answers: Record<number, string[]>): QuizSession {
  return {
    questions,
    answers,
    drafts: {},
    currentIndex: 0,
    status: 'finished',
    startedAt: 0,
    timerMinutes: 0,
    attemptId: 'attempt_1',
    settings,
  }
}

describe('single vs multiple answer detection', () => {
  it('derives the mode from the number of correct answers', () => {
    expect(isMultiAnswer(single)).toBe(false)
    expect(isMultiAnswer(multi)).toBe(true)
  })
})

describe('answer validation', () => {
  // The exact truth table required for correct answers A and C.
  it('accepts only the complete correct set', () => {
    expect(isAnswerCorrect(multi, ['Windows', 'Linux'])).toBe(true)
    expect(isAnswerCorrect(multi, ['Linux', 'Windows'])).toBe(true) // order is irrelevant
    expect(isAnswerCorrect(multi, ['Windows'])).toBe(false) // incomplete
    expect(isAnswerCorrect(multi, ['Linux'])).toBe(false) // incomplete
    expect(isAnswerCorrect(multi, ['Windows', 'Python', 'Linux'])).toBe(false) // one extra
    expect(isAnswerCorrect(multi, ['Python', 'Linux'])).toBe(false) // one wrong
    expect(isAnswerCorrect(multi, ['Windows', 'Python'])).toBe(false) // one wrong
    expect(isAnswerCorrect(multi, [])).toBe(false)
    expect(isAnswerCorrect(multi, undefined)).toBe(false)
  })

  it('still works for single-answer questions', () => {
    expect(isAnswerCorrect(single, ['Paris'])).toBe(true)
    expect(isAnswerCorrect(single, ['Rome'])).toBe(false)
    expect(isAnswerCorrect(single, ['Paris', 'Rome'])).toBe(false)
  })

  it('toggles an option without mutating', () => {
    const selected = ['Windows']
    expect(toggleOption(selected, 'Linux')).toEqual(['Windows', 'Linux'])
    expect(toggleOption(['Windows', 'Linux'], 'Windows')).toEqual(['Linux'])
    expect(selected).toEqual(['Windows'])
  })
})

describe('scoring', () => {
  it('counts a partially correct multi-answer question as incorrect', () => {
    const result = computeResult(
      sessionWith([multi, single], { 1: ['Windows'], 2: ['Paris'] }),
    )
    expect(result.correct).toBe(1)
    expect(result.incorrect).toBe(1)
    expect(result.unanswered).toBe(0)
    expect(result.percentage).toBe(50)
  })

  it('keeps the totals accurate across a mixed quiz', () => {
    // 10 alternating single/multi questions, all answered: 8 right, 2 wrong.
    const questions = Array.from({ length: 10 }, (_, i) => ({
      ...(i % 2 === 0 ? multi : single),
      id: i + 1,
    }))
    const answers: Record<number, string[]> = {}
    for (const q of questions) answers[q.id] = [...q.correctAnswers]
    answers[9] = ['Windows'] // multi, incomplete — only one of the two correct
    answers[10] = ['Rome'] // single, wrong

    const result = computeResult(sessionWith(questions, answers))
    expect(result.total).toBe(10)
    expect(result.correct).toBe(8)
    expect(result.incorrect).toBe(2)
    expect(result.unanswered).toBe(0)
    expect(result.percentage).toBe(80)
  })

  it('counts an unanswered question as skipped, not incorrect', () => {
    const result = computeResult(sessionWith([multi, single], { 2: ['Paris'] }))
    expect(result.correct).toBe(1)
    expect(result.incorrect).toBe(0)
    expect(result.unanswered).toBe(1)
  })
})

describe('backward compatibility', () => {
  it('widens a legacy correctAnswer string', () => {
    const upgraded = normalizeQuestion({
      id: 1,
      question: 'Capital of France?',
      options: ['Paris', 'Rome'],
      correctAnswer: 'Paris',
    })
    expect(upgraded.correctAnswers).toEqual(['Paris'])
    expect(upgraded).not.toHaveProperty('correctAnswer')
    expect(isMultiAnswer(upgraded)).toBe(false)
  })

  it('leaves an already-current question alone', () => {
    expect(normalizeQuestion(multi)).toEqual(multi)
  })
})

describe('JSON import', () => {
  const options = '["Python", "HTML", "Java", "CSS"]'

  it('accepts correctAnswers arrays', () => {
    const result = parseQuizJson(
      `[{ "id": 1, "question": "Languages?", "options": ${options}, "correctAnswers": ["Python", "Java"] }]`,
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.questions[0].correctAnswers).toEqual(['Python', 'Java'])
  })

  it('still accepts a legacy correctAnswer string', () => {
    const result = parseQuizJson(
      `[{ "id": 1, "question": "Languages?", "options": ${options}, "correctAnswer": "Python" }]`,
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.questions[0].correctAnswers).toEqual(['Python'])
  })

  it('rejects an answer that is not one of the options', () => {
    const result = parseQuizJson(
      `[{ "id": 1, "question": "Languages?", "options": ${options}, "correctAnswers": ["Python", "Ruby"] }]`,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Ruby')
  })

  it('rejects an empty or duplicated answer list', () => {
    const empty = parseQuizJson(
      `[{ "id": 1, "question": "Languages?", "options": ${options}, "correctAnswers": [] }]`,
    )
    expect(empty.ok).toBe(false)

    const dupe = parseQuizJson(
      `[{ "id": 1, "question": "Languages?", "options": ${options}, "correctAnswers": ["Python", "Python"] }]`,
    )
    expect(dupe.ok).toBe(false)
    if (!dupe.ok) expect(dupe.error).toContain('twice')
  })

  it('rejects a question with no answer at all', () => {
    const result = parseQuizJson(`[{ "id": 1, "question": "Languages?", "options": ${options} }]`)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('correctAnswers')
  })
})
