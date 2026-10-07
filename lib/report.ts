import { families } from "./content.ts";
import type { Attempt } from "./mastery.ts";
import { familyEvidence, studyDay, weeklyGoal } from "./progress.ts";

export function reportSummary(attempts: Attempt[], now = new Date()) {
  const dayItems = new Map<string, Set<string>>();
  for (const attempt of attempts) {
    const date = new Date(attempt.at);
    if (Number.isNaN(date.getTime())) continue;
    const day = studyDay(date);
    const items = dayItems.get(day) ?? new Set<string>();
    items.add(attempt.itemId);
    dayItems.set(day, items);
  }
  const studyDays = [...dayItems.values()].filter((items) => items.size >= 3).length;
  const weekly = weeklyGoal(attempts, now);
  const rows = families.map((family) => {
    const evidence = familyEvidence(attempts, family.id);
    const answers = attempts.filter((attempt) => attempt.familyId === family.id);
    const correct = answers.filter((attempt) => attempt.correct).length;
    const weeks = Array.from({ length: 4 }, (_, index) => {
      const end = new Date(`${studyDay(now)}T17:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() - (3 - index) * 7);
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 7);
      const selected = answers.filter((attempt) => {
        const time = new Date(attempt.at).getTime();
        return time >= start.getTime() && time < end.getTime();
      });
      return { count: selected.length, correct: selected.filter((attempt) => attempt.correct).length,
        startDay: studyDay(start), endDay: studyDay(new Date(end.getTime() - 1)) };
    });
    return { id: family.id, title: family.title, grapheme: family.grapheme, ...evidence,
      answers: answers.length, correct, weeks };
  });
  return {
    studyDays, weekly,
    confirmed: rows.reduce((sum, row) => sum + row.confirmed, 0),
    contrasts: rows.reduce((sum, row) => sum + row.total, 0),
    masteredFamilies: rows.filter((row) => row.total > 0 && row.confirmed === row.total).length,
    families: rows
  };
}
