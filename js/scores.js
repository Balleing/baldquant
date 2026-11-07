// Score bands match the scanner dashboard legend: 70+, 40-69, under 40.
const STRONG_SCORE = 70;
const MEDIUM_SCORE = 40;

export function scoreBand(score) {
  if (score >= STRONG_SCORE) return 'good';
  if (score >= MEDIUM_SCORE) return 'warn';
  return 'bad';
}

// Skewed low on purpose: most graduations are weak, a few are strong.
export function randomScore() {
  return Math.round(12 + Math.pow(Math.random(), 1.5) * 84);
}
