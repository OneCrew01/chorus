import { daysBetween } from './dates.js';

const MIN_TOKEN_LEN = 3;

export function normalizeTitle(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Exact match, or WHOLE-TOKEN containment. Never raw substring: "cat" must not
// find "catalog". Spec §7.3 — no fuzzy matching, at all, ever.
export function titlesMatch(a, b) {
  const na = normalizeTitle(a), nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (short.length < MIN_TOKEN_LEN) return false;

  const shortTokens = short.split(' ');
  const longTokens = long.split(' ');
  if (shortTokens.some(t => t.length < MIN_TOKEN_LEN)) return false;

  // Every token of the shorter title must appear as a whole token of the longer.
  return shortTokens.every(t => longTokens.includes(t));
}

export function findPromotionCandidate(task, tasks, log) {
  if (task.recurrence_type !== 'none') return null;

  const priors = tasks.filter(t =>
    t.id !== task.id && t.recurrence_type === 'none' && titlesMatch(t.title, task.title)
  );
  if (priors.length === 0) return null;

  const priorIds = new Set(priors.map(t => t.id));
  const priorDates = log
    .filter(e => priorIds.has(e.task_id))
    .map(e => e.completed_at)
    .sort();
  if (priorDates.length === 0) return null;

  const thisDate = log.filter(e => e.task_id === task.id).map(e => e.completed_at).sort().pop();
  const gap = daysBetween(priorDates[priorDates.length - 1], thisDate);

  return {
    matchTaskId: priors[priors.length - 1].id,
    priorCount: priorDates.length,
    suggestedIntervalDays: Math.max(1, gap)
  };
}
