import { describe, expect, it } from 'vitest'
import type { QuizQuestion, QuizSession, QuizSettings } from '../types/quiz'
import {
  computeResult,
  isAnswerCorrect,
  isMultiAnswer,
  isQuestionLocked,
  isRevealed,
  normalizePassPercentage,
  normalizeQuestion,
  parseQuizJson,
  questionsNeededToPass,
  toggleOption,
} from './quiz'

const settings: QuizSettings = {
  shuffleQuestions: false,
  shuffleOptions: false,
  timerMinutes: 0,
  categories: [],
  passPercentage: 70,
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

function sessionWith(
  questions: QuizQuestion[],
  answers: Record<number, string[]>,
  revealed: number[] = [],
  passPercentage = settings.passPercentage,
): QuizSession {
  return {
    questions,
    answers,
    drafts: {},
    revealed,
    currentIndex: 0,
    status: 'finished',
    startedAt: 0,
    timerMinutes: 0,
    attemptId: 'attempt_1',
    settings: { ...settings, passPercentage },
  }
}

describe('single vs multiple answer detection', () => {
  it('derives the mode from the number of correct answers', () => {
    expect(isMultiAnswer(single)).toBe(false)
    expect(isMultiAnswer(multi)).toBe(true)
  })
})

describe('checking an answer mid-quiz', () => {
  it('reports only the questions the user actually revealed', () => {
    const session = sessionWith([single, multi], { 2: ['Paris'] }, [2])
    expect(isRevealed(session, 2)).toBe(true)
    expect(isRevealed(session, 1)).toBe(false)
  })

  it('freezes a single-answer question once revealed, and not before', () => {
    const answers = { 2: ['Rome'] }
    expect(isQuestionLocked(sessionWith([single], answers), single)).toBe(false)
    expect(isQuestionLocked(sessionWith([single], answers, [2]), single)).toBe(true)
  })

  it('keeps a committed multi-answer question locked even without a reveal', () => {
    // This is what a session written before "Check Answer" existed looks like.
    const session = sessionWith([multi], { 1: ['Windows'] })
    expect(isRevealed(session, 1)).toBe(false)
    expect(isQuestionLocked(session, multi)).toBe(true)
  })

  it('leaves an unanswered question open', () => {
    expect(isQuestionLocked(sessionWith([multi], {}), multi)).toBe(false)
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

describe('pass / fail threshold', () => {
  /** 10 questions, `correct` of them answered right. */
  function sessionScoring(correct: number, passPercentage: number): QuizSession {
    const questions = Array.from({ length: 10 }, (_, i) => ({ ...single, id: i + 1 }))
    const answers: Record<number, string[]> = {}
    questions.forEach((q, i) => {
      answers[q.id] = i < correct ? ['Paris'] : ['Rome']
    })
    return sessionWith(questions, answers, [], passPercentage)
  }

  it('passes exactly at the threshold', () => {
    const result = computeResult(sessionScoring(7, 70))
    expect(result.percentage).toBe(70)
    expect(result.passed).toBe(true)
    expect(result.passPercentage).toBe(70)
  })

  it('fails one question below the threshold', () => {
    const result = computeResult(sessionScoring(6, 70))
    expect(result.percentage).toBe(60)
    expect(result.passed).toBe(false)
  })

  it('judges each run against its own stored threshold', () => {
    expect(computeResult(sessionScoring(8, 90)).passed).toBe(false)
    expect(computeResult(sessionScoring(8, 50)).passed).toBe(true)
  })

  it('passes everything at a threshold of 0, including an empty quiz', () => {
    expect(computeResult(sessionScoring(0, 0)).passed).toBe(true)
    expect(computeResult(sessionWith([], {}, [], 0)).passed).toBe(true)
    expect(computeResult(sessionWith([], {}, [], 1)).passed).toBe(false)
  })

  it('repairs a threshold that is missing, out of range, or fractional', () => {
    expect(normalizePassPercentage(undefined)).toBe(70)
    expect(normalizePassPercentage('80')).toBe(70)
    expect(normalizePassPercentage(NaN)).toBe(70)
    expect(normalizePassPercentage(-5)).toBe(0)
    expect(normalizePassPercentage(140)).toBe(100)
    expect(normalizePassPercentage(66.6)).toBe(67)
  })

  it('promises a pass count that matches how the score is actually rounded', () => {
    // 2/3 rounds to 67%, which clears a 66% mark — a ceil of the raw ratio
    // would have demanded all three.
    expect(questionsNeededToPass(3, 66)).toBe(2)
    expect(questionsNeededToPass(3, 68)).toBe(3)
    expect(questionsNeededToPass(10, 70)).toBe(7)
    expect(questionsNeededToPass(10, 0)).toBe(0)
    expect(questionsNeededToPass(0, 70)).toBe(0)
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
