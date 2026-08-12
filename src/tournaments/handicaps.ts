import type { HoleInfo } from '../types/index.ts';

export const applyRoundRule = (
  value: number,
  rounding: 'nearest' | 'up' | 'down'
): number => {
  if (rounding === 'up') {
    return Math.ceil(value);
  }

  if (rounding === 'down') {
    return Math.floor(value);
  }

  return Math.round(value);
};

export const prorateHandicapByHoles = (baseHandicap: number, holes: number): number => {
  const normalizedHoles = Number.isFinite(holes) && holes > 0 ? holes : 18;
  return baseHandicap * (normalizedHoles / 18);
};

// Strokes land on the hardest holes first, following the course stroke index.
export const allocateStrokesByStrokeIndex = (
  strokes: number,
  holeDetails: HoleInfo[] | undefined,
  totalHoles: number
): Record<number, number> => {
  const byHole: Record<number, number> = {};

  if (strokes <= 0 || totalHoles <= 0) {
    return byHole;
  }

  const ranked = Array.from({ length: totalHoles }, (_, index) => ({
    hole: index + 1,
    strokeIndex: holeDetails?.[index]?.handicap,
  }));

  // Without a published stroke index the holes keep their playing order.
  const sorted = ranked.every((entry) => Number.isFinite(entry.strokeIndex))
    ? [...ranked].sort(
        (left, right) => (left.strokeIndex as number) - (right.strokeIndex as number)
      )
    : ranked;

  const cycles = Math.floor(strokes / sorted.length);
  const remainder = strokes % sorted.length;

  sorted.forEach((entry, index) => {
    const count = cycles + (index < remainder ? 1 : 0);
    if (count > 0) {
      byHole[entry.hole] = count;
    }
  });

  return byHole;
};
