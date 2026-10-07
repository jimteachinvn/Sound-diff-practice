import assert from "node:assert/strict";
import test from "node:test";
import type { Attempt } from "../lib/mastery.ts";
import { reportSummary } from "../lib/report.ts";

const base: Attempt = {
  id: "a", at: "2026-10-05T09:00:00.000Z", familyId: "ea", contrastId: "ea:e~i-long",
  itemId: "a", mode: "listen", selectedId: "e", correctId: "e", correct: true, latencyMs: 1000
};

test("report counts real answers while reserving mastery for delayed independent questions", () => {
  const attempts: Attempt[] = [
    base,
    { ...base, id: "b", itemId: "b", correct: false },
    { ...base, id: "c", itemId: "c", mode: "sort" },
    { ...base, id: "d", itemId: "d", at: "2026-10-06T09:00:00.000Z", mode: "odd" },
    { ...base, id: "e", itemId: "e", at: "2026-10-06T10:00:00.000Z", mode: "odd" },
    { ...base, id: "f", itemId: "f", at: "2026-10-06T11:00:00.000Z", mode: "odd" }
  ];
  const report = reportSummary(attempts, new Date("2026-10-06T12:00:00.000Z"));
  const ea = report.families.find((family) => family.id === "ea");
  assert.equal(report.studyDays, 2);
  assert.equal(report.weekly.completed, 2);
  assert.equal(report.confirmed, 0);
  assert.equal(ea?.answers, 6);
  assert.equal(ea?.correct, 5);
  assert.equal(ea?.weeks.at(-1)?.count, 6);
  assert.equal(ea?.weeks.at(-1)?.endDay, "2026-10-06");
});
