export type Attempt = {
  id: string;
  at: string;
  receivedAt?: string;
  pendingCloud?: boolean;
  familyId: string;
  contrastId: string;
  itemId: string;
  mode: "odd" | "sort" | "listen" | "exam";
  selectedId: string;
  correctId: string;
  correct: boolean;
  latencyMs: number;
  itemSnapshot?: unknown;
};

export type Mastery = {
  contrastId: string;
  alpha: number;
  beta: number;
  exposures: number;
  recent: boolean[];
  intervalDays: number;
  dueAt: string;
  lastReviewedAt: string;
  lapses: number;
};

export type LearningState = { attempts: Attempt[]; mastery: Record<string, Mastery> };
export const emptyState: LearningState = { attempts: [], mastery: {} };
const intervals = [1, 2, 4, 7, 14, 30];

// Cloud receipt time proves spacing; occurrence time remains for activity charts.
export function evidenceTime(attempt: Attempt): string {
  return attempt.receivedAt && Number.isFinite(Date.parse(attempt.receivedAt)) ? attempt.receivedAt : attempt.at;
}

export function mergeLearningStates(left: LearningState, right: LearningState): LearningState {
  const unique = new Map([...left.attempts, ...right.attempts].map((attempt) => [attempt.id, attempt]));
  return [...unique.values()].sort((a, b) => evidenceTime(a).localeCompare(evidenceTime(b)) || a.id.localeCompare(b.id)).reduce(recordAttempt, emptyState);
}

export function wordExposure(attempts: Attempt[]): Record<string, { count: number; lastTurn: number }> {
  const exposure: Record<string, { count: number; lastTurn: number }> = {};
  attempts.forEach((attempt, turn) => {
    let ids: string[] = [];
    if (attempt.mode === "odd" || attempt.mode === "exam") {
      const snapshot = attempt.itemSnapshot;
      if (snapshot && typeof snapshot === "object" && "options" in snapshot && Array.isArray(snapshot.options)) {
        ids = snapshot.options.flatMap((option: unknown) => option && typeof option === "object" && "id" in option && typeof option.id === "string" ? [option.id] : []);
      }
    } else if (attempt.itemId.startsWith(`${attempt.mode}:`)) ids = [attempt.itemId.slice(attempt.mode.length + 1)];
    for (const id of new Set(ids)) {
      const previous = exposure[id];
      exposure[id] = { count: (previous?.count ?? 0) + 1, lastTurn: turn };
    }
  });
  return exposure;
}

export function recordAttempt(state: LearningState, attempt: Attempt): LearningState {
  if (state.attempts.some((existing) => existing.id === attempt.id)) return state;
  const previous = state.mastery[attempt.contrastId] ?? {
    contrastId: attempt.contrastId, alpha: 1, beta: 1, exposures: 0,
    recent: [], intervalDays: 0, dueAt: attempt.at, lastReviewedAt: attempt.at, lapses: 0
  };
  const weight = attempt.mode === "exam" ? 0.75 : attempt.mode === "sort" ? 0.7 : 1;
  const date = new Date(evidenceTime(attempt));
  const independent = attempt.mode === "odd" || attempt.mode === "exam";
  const previousDue = new Date(previous.dueAt).getTime();
  const dueReview = previous.exposures === 0 || date.getTime() >= previousDue;
  const nextInterval = attempt.correct && independent
    ? dueReview ? intervals[Math.min(intervals.length - 1, intervals.indexOf(previous.intervalDays) + 1)] : previous.intervalDays
    : attempt.correct ? previous.intervalDays : 1;
  if (attempt.correct && independent) {
    if (!dueReview) date.setTime(previousDue);
    else date.setUTCDate(date.getUTCDate() + nextInterval);
  } else if (independent) {
    date.setUTCDate(date.getUTCDate() + 1);
  } else if (previous.exposures === 0) {
    date.setUTCDate(date.getUTCDate() + 1);
  } else {
    const nextDay = date.getTime() + 24 * 60 * 60 * 1000;
    date.setTime(attempt.correct ? previousDue : Math.min(previousDue, nextDay));
  }
  const mastery: Mastery = {
    ...previous,
    alpha: previous.alpha + (attempt.correct ? weight : 0),
    beta: previous.beta + (attempt.correct ? 0 : weight),
    exposures: previous.exposures + 1,
    recent: [...previous.recent, attempt.correct].slice(-8),
    intervalDays: nextInterval,
    dueAt: date.toISOString(),
    lastReviewedAt: evidenceTime(attempt),
    lapses: previous.lapses + (attempt.correct ? 0 : 1)
  };
  return { attempts: [...state.attempts, attempt], mastery: { ...state.mastery, [attempt.contrastId]: mastery } };
}

export function masteryScore(mastery: Mastery): number {
  const all = mastery.alpha / (mastery.alpha + mastery.beta);
  const recent = mastery.recent.length ? mastery.recent.filter(Boolean).length / mastery.recent.length : 0.5;
  return Math.round(100 * (0.65 * all + 0.35 * recent));
}

export function dueContrasts(state: LearningState, now = new Date()): string[] {
  return Object.values(state.mastery)
    .filter((item) => new Date(item.dueAt).getTime() <= now.getTime())
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
    .map((item) => item.contrastId);
}

export const storageKey = "sound-families:v1";

export function loadState(scope?: string): LearningState {
  if (typeof window === "undefined") return emptyState;
  try {
    const saved = window.localStorage.getItem(scope ? `${storageKey}:${scope}` : storageKey);
    if (!saved) return emptyState;
    const parsed: unknown = JSON.parse(saved);
    if (typeof parsed !== "object" || !parsed || !("attempts" in parsed) || !Array.isArray(parsed.attempts)) return emptyState;
    const attempts = parsed.attempts.filter((item): item is Attempt =>
      typeof item === "object" && item !== null &&
      typeof item.id === "string" && typeof item.at === "string" && !Number.isNaN(Date.parse(item.at)) &&
      typeof item.familyId === "string" && typeof item.contrastId === "string" &&
      typeof item.itemId === "string" && typeof item.selectedId === "string" &&
      typeof item.correctId === "string" && typeof item.correct === "boolean" &&
      typeof item.latencyMs === "number" && Number.isFinite(item.latencyMs) &&
      ["odd", "sort", "listen", "exam"].includes(item.mode)
    );
    return attempts.sort((a, b) => evidenceTime(a).localeCompare(evidenceTime(b)) || a.id.localeCompare(b.id)).reduce(recordAttempt, emptyState);
  } catch { /* A damaged local cache must not break practice. */ }
  return emptyState;
}

export function saveState(state: LearningState, scope?: string): boolean {
  if (typeof window === "undefined") return false;
  try { window.localStorage.setItem(scope ? `${storageKey}:${scope}` : storageKey, JSON.stringify(state)); return true; }
  catch { return false; }
}
