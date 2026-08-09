import type { AIVerification, AIVerificationStatus } from '../../types/ai'
import type { QuizQuestion } from '../../types/quiz'

/**
 * Pure helpers for acting on a verification verdict.
 *
 * Accepting an AI answer is a mutation of the question bank, so it lives here
 * rather than inside `AIVerificationPanel` — that keeps the only logic that can
 * change a user's answers in the tested layer.
 */

/**
 * Replace one question's answers (and optionally its explanation) with the
 * AI's suggestion. Returns a new array; never mutates the input.
 */
export function applyVerification(
  bank: QuizQuestion[],
  verification: AIVerification,
): QuizQuestion[] {
  return bank.map((question) => {
    if (question.id !== verification.questionId) return question
    return {
      ...question,
      correctAnswers: [...verification.suggestedAnswers],
      explanation: verification.suggestedExplanation ?? question.explanation,
    }
  })
}

/** Replace one question's answers with a hand-picked set (the Edit action). */
export function applyManualAnswers(
  bank: QuizQuestion[],
  questionId: number,
  correctAnswers: string[],
): QuizQuestion[] {
  return bank.map((question) =>
    question.id === questionId ? { ...question, correctAnswers: [...correctAnswers] } : question,
  )
}

/**
 * True once the question no longer matches what was verified — the user
 * accepted the suggestion or edited the answers by hand, so the verdict is
 * history rather than an open disagreement.
 */
export function isVerificationStale(
  question: QuizQuestion,
  verification: AIVerification,
): boolean {
  const source = verification.sourceAnswers
  if (question.correctAnswers.length !== source.length) return true
  return !question.correctAnswers.every((answer) => source.includes(answer))
}

export type VerificationSummary = Record<AIVerificationStatus, number>

export function summarizeVerifications(
  verifications: Record<number, AIVerification>,
): VerificationSummary {
  const summary: VerificationSummary = { agrees: 0, disagrees: 0, uncertain: 0, invalid: 0 }
  for (const verification of Object.values(verifications)) {
    summary[verification.status]++
  }
  return summary
}

/**
 * Questions worth spending a request on when the user picks "verify questions
 * with issues": anything multi-answer (where a shredded answer line is the
 * classic parser failure) or missing an explanation.
 */
export function questionsWithIssues(questions: QuizQuestion[]): QuizQuestion[] {
  return questions.filter(
    (q) =>
      q.correctAnswers.length > 1 ||
      q.explanation === undefined ||
      q.explanation.trim() === '',
  )
}
