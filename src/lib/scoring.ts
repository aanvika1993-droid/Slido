export const QUIZ_BASE_POINTS = 500;
export const QUIZ_SPEED_POINTS = 500;

/** Correct answers earn 500 points plus up to 500 more for answering quickly. */
export function quizScore(correct: boolean, remainingMs: number, limitMs: number): number {
  if (!correct) return 0;
  const fraction = limitMs > 0 ? Math.min(1, Math.max(0, remainingMs / limitMs)) : 0;
  return Math.round(QUIZ_BASE_POINTS + QUIZ_SPEED_POINTS * fraction);
}
