import { families } from "./content.ts";
import { contrastId } from "./exercises.ts";
import type { Attempt, LearningState } from "./mastery.ts";

export type ContrastEvidence = {
  attempts: number;
  correct: number;
  modes: number;
  independentlyConfirmed: boolean;
};

const independentModes = new Set<Attempt["mode"]>(["odd", "exam"]);

export function contrastEvidence(attempts: Attempt[], id: string): ContrastEvidence {
  const relevant = attempts.filter((attempt) => attempt.contrastId === id).sort((a, b) => a.at.localeCompare(b.at));
  const lastErrorAt = relevant.filter((attempt) => !attempt.correct).at(-1)?.at;
  const successfulChecks = relevant.filter((attempt) => attempt.correct && independentModes.has(attempt.mode) && (!lastErrorAt || attempt.at > lastErrorAt));
  const independentlyConfirmed = relevant.at(-1)?.correct === true && successfulChecks.some((first, index) =>
    successfulChecks.slice(index + 1).some((later) =>
      later.itemId !== first.itemId && new Date(later.at).getTime() - new Date(first.at).getTime() >= 20 * 60 * 60 * 1000
    )
  );
  return {
    attempts: relevant.length,
    correct: relevant.filter((attempt) => attempt.correct).length,
    modes: new Set(relevant.map((attempt) => attempt.mode)).size,
    independentlyConfirmed
  };
}

export function familyEvidence(attempts: Attempt[], familyId: string): { confirmed: number; total: number; attempted: number } {
  const outcomes = families.find((family) => family.id === familyId)?.outcomes ?? [];
  const ids = outcomes.flatMap((left, index) => outcomes.slice(index + 1).map((right) => contrastId(familyId, left.id, right.id)));
  const evidence = ids.map((id) => contrastEvidence(attempts, id));
  return {
    confirmed: evidence.filter((item) => item.independentlyConfirmed).length,
    total: ids.length,
    attempted: evidence.filter((item) => item.attempts > 0).length
  };
}

function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function weeklyGoal(attempts: Attempt[], now = new Date()): { completed: number; goal: number; days: boolean[]; nextStep: string } {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(date.getDate() + index);
    return localDay(date);
  });
  const byDay = new Map<string, Set<string>>();
  for (const attempt of attempts) {
    const date = new Date(attempt.at);
    if (Number.isNaN(date.getTime())) continue;
    const key = localDay(date);
    if (!days.includes(key)) continue;
    const seen = byDay.get(key) ?? new Set<string>();
    seen.add(attempt.itemId);
    byDay.set(key, seen);
  }
  const completedDays = days.map((key) => (byDay.get(key)?.size ?? 0) >= 3);
  const completed = completedDays.filter(Boolean).length;
  return {
    completed,
    goal: 2,
    days: completedDays,
    nextStep: completed >= 2 ? "Đã đạt mục tiêu tuần này" : "Hoàn thành ít nhất 3 câu ở một ngày học"
  };
}

export type BadgeId = "first-session" | "three-modes" | "weekly-goal" | "durable-sound";

function everConfirmedContrast(attempts: Attempt[]): boolean {
  const byContrast = new Map<string, Attempt[]>();
  for (const attempt of [...attempts].sort((a, b) => a.at.localeCompare(b.at))) {
    if (!attempt.correct) { byContrast.delete(attempt.contrastId); continue; }
    if (!independentModes.has(attempt.mode)) continue;
    const previous = byContrast.get(attempt.contrastId) ?? [];
    if (previous.some((first) => first.itemId !== attempt.itemId && new Date(attempt.at).getTime() - new Date(first.at).getTime() >= 20 * 60 * 60 * 1000)) return true;
    previous.push(attempt);
    byContrast.set(attempt.contrastId, previous);
  }
  return false;
}

export function earnedBadges(state: LearningState, now = new Date()): BadgeId[] {
  const earned: BadgeId[] = [];
  const days = new Map<string, Set<string>>();
  for (const attempt of state.attempts) {
    const key = localDay(new Date(attempt.at));
    const ids = days.get(key) ?? new Set<string>();
    ids.add(attempt.itemId);
    days.set(key, ids);
  }
  if ([...days.values()].some((items) => items.size >= 3)) earned.push("first-session");
  const practiceModes = new Set(state.attempts.map((attempt) => attempt.mode === "exam" ? "odd" : attempt.mode));
  if (practiceModes.has("sort") && practiceModes.has("listen") && practiceModes.has("odd")) earned.push("three-modes");
  const completedWeeks = new Map<string, number>();
  for (const [day, items] of days) {
    if (items.size < 3) continue;
    const date = new Date(`${day}T12:00:00`);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const monday = localDay(date);
    completedWeeks.set(monday, (completedWeeks.get(monday) ?? 0) + 1);
  }
  if ([...completedWeeks.values()].some((count) => count >= 2) || weeklyGoal(state.attempts, now).completed >= 2) earned.push("weekly-goal");
  if (everConfirmedContrast(state.attempts)) earned.push("durable-sound");
  return earned;
}
