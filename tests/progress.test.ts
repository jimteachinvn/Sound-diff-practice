import assert from "node:assert/strict";
import test from "node:test";
import { emptyState, recordAttempt, type Attempt } from "../lib/mastery.ts";
import { contrastEvidence, earnedBadges, familyEvidence, weeklyGoal } from "../lib/progress.ts";

const base: Attempt = {
  id: "a", at: "2026-10-05T09:00:00.000Z", familyId: "ea", contrastId: "ea:e~i-long",
  itemId: "question-a", mode: "sort", selectedId: "e", correctId: "e", correct: true, latencyMs: 1000
};

test("repeated sorting never produces delayed independent mastery", () => {
  const attempts = Array.from({ length: 8 }, (_, index) => ({ ...base, id: String(index), itemId: `sort:${index}` }));
  assert.equal(contrastEvidence(attempts, base.contrastId).independentlyConfirmed, false);
  assert.equal(familyEvidence(attempts, "ea").confirmed, 0);
});

test("a later, new independent question confirms a contrast and a wrong answer resets it", () => {
  const first = { ...base, mode: "odd" as const };
  const later = { ...first, id: "b", at: "2026-10-06T10:00:00.000Z", itemId: "question-b" };
  assert.equal(contrastEvidence([first, later], base.contrastId).independentlyConfirmed, true);
  assert.equal(contrastEvidence([first, { ...later, itemId: first.itemId }], base.contrastId).independentlyConfirmed, false);
  assert.equal(contrastEvidence([first, { ...later, at: "2026-10-05T10:00:00.000Z" }], base.contrastId).independentlyConfirmed, false);
  assert.equal(contrastEvidence([first, later, { ...later, id: "c", at: "2026-10-07T10:00:00.000Z", correct: false }], base.contrastId).independentlyConfirmed, false);
});

test("weekly goal requires three distinct answers on each of two study days", () => {
  const monday = Array.from({ length: 3 }, (_, index) => ({ ...base, id: `m${index}`, itemId: `m${index}` }));
  const tuesday = Array.from({ length: 3 }, (_, index) => ({ ...base, id: `t${index}`, itemId: `t${index}`, at: "2026-10-06T09:00:00.000Z" }));
  assert.equal(weeklyGoal([...monday, ...tuesday.slice(0, 2)], new Date("2026-10-07T09:00:00.000Z")).completed, 1);
  const reached = weeklyGoal([...monday, ...tuesday], new Date("2026-10-07T09:00:00.000Z"));
  assert.equal(reached.completed, 2);
  const state = [...monday, ...tuesday].reduce(recordAttempt, emptyState);
  assert.ok(earnedBadges(state, new Date("2026-10-07T09:00:00.000Z")).includes("weekly-goal"));
  assert.ok(earnedBadges(state, new Date("2026-10-15T09:00:00.000Z")).includes("weekly-goal"), "earned badges remain earned in later weeks");
});

test("exploration badge needs three actual practice formats", () => {
  const sort = { ...base, id: "sort" };
  const choose = { ...base, id: "odd", mode: "odd" as const };
  const exam = { ...base, id: "exam", mode: "exam" as const };
  const listen = { ...base, id: "listen", mode: "listen" as const };
  assert.ok(!earnedBadges([sort, choose, exam].reduce(recordAttempt, emptyState)).includes("three-modes"));
  assert.ok(earnedBadges([sort, choose, listen].reduce(recordAttempt, emptyState)).includes("three-modes"));
});

test("earned delayed recall badge stays earned after a later mistake", () => {
  const first = { ...base, mode: "odd" as const };
  const later = { ...first, id: "b", at: "2026-10-06T10:00:00.000Z", itemId: "question-b" };
  const missed = { ...later, id: "c", at: "2026-10-07T10:00:00.000Z", correct: false };
  assert.ok(earnedBadges([first, later, missed].reduce(recordAttempt, emptyState)).includes("durable-sound"));
  assert.equal(contrastEvidence([first, later, missed], base.contrastId).independentlyConfirmed, false);
});
