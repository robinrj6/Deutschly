export type Sm2State = {
  repetitionCount: number;
  intervalDays: number;
  easeFactor: number;
  nextReviewAt: Date | null;
};

export type Sm2Result = {
  repetitionCount: number;
  intervalDays: number;
  easeFactor: number;
  nextReviewAt: Date;
};

function clampEaseFactor(value: number) {
  return Math.max(1.3, Math.min(3.0, value));
}

export function nextSm2State(current: Sm2State, quality: number, now = new Date()): Sm2Result {
  const q = Math.max(0, Math.min(5, quality));
  let { repetitionCount, intervalDays, easeFactor } = current;

  if (q < 3) {
    repetitionCount = 0;
    intervalDays = 1;
    easeFactor = clampEaseFactor(easeFactor - 0.2);
  } else {
    if (repetitionCount === 0) {
      intervalDays = 1;
    } else if (repetitionCount === 1) {
      intervalDays = 6;
    } else {
      intervalDays = Math.max(1, Math.round(intervalDays * easeFactor));
    }

    repetitionCount += 1;
    easeFactor = clampEaseFactor(easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  }

  const nextReviewAt = new Date(now);
  nextReviewAt.setUTCDate(nextReviewAt.getUTCDate() + Math.max(1, intervalDays));
  nextReviewAt.setUTCHours(0, 0, 0, 0);

  return {
    repetitionCount,
    intervalDays,
    easeFactor,
    nextReviewAt,
  };
}
