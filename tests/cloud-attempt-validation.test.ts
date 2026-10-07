import assert from "node:assert/strict";
import test from "node:test";
import { checkCloudAnswer } from "../lib/cloud-attempt-validation.ts";
import { generateOdd, contrastId } from "../lib/exercises.ts";
import { wordsFor } from "../lib/content.ts";

test("cloud answer validation reconstructs approved 3:1 items and correctness", () => {
  const item = generateOdd("ea", () => 0.37);
  const selected = item.options.find((word) => word.id !== item.oddId)!;
  const attempt = {
    id: "123e4567-e89b-42d3-a456-426614174000", at: new Date().toISOString(), itemId: item.id,
    familyId: item.familyId, contrastId: item.contrastId, mode: "odd",
    selectedId: selected.id, correctId: selected.id, correct: true,
    latencyMs: 1000,
    itemSnapshot: { itemId: item.id, familyId: item.familyId,
      contrastId: item.contrastId, version: 1, oddId: item.oddId,
      options: item.options.map((word) => ({ id: word.id })) }
  };
  const checked = checkCloudAnswer(attempt);
  assert.equal(checked?.isCorrect, false);
  assert.equal(checked?.correctId, item.oddId);
  assert.equal(checkCloudAnswer({ ...attempt, itemId: "invented" }), null);
  assert.equal(checkCloudAnswer({ ...attempt, at: new Date(Date.now() + 10 * 60 * 1000).toISOString() }), null);
  assert.ok(checkCloudAnswer({ ...attempt, at: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString() }), "Older offline answers remain uploadable; receivedAt controls mastery");
  assert.equal(checkCloudAnswer({ ...attempt, itemSnapshot: { ...attempt.itemSnapshot,
    options: [attempt.itemSnapshot.options[0], attempt.itemSnapshot.options[0],
      attempt.itemSnapshot.options[1], attempt.itemSnapshot.options[2]] } }), null);
});

test("cloud answer validation checks exploratory word and outcome against approved content", () => {
  const word = wordsFor("ea")[0];
  const other = word.outcomeId === "e" ? "i-long" : "e";
  const attempt = {
    id: "123e4567-e89b-42d3-a456-426614174001", at: new Date().toISOString(), itemId: `listen:${word.id}`,
    familyId: "ea", contrastId: contrastId("ea", word.outcomeId, other),
    mode: "listen", selectedId: other, correctId: other, correct: true, latencyMs: 500
  };
  const checked = checkCloudAnswer(attempt);
  assert.equal(checked?.isCorrect, false);
  assert.equal(checked?.correctId, word.outcomeId);
  assert.equal(checkCloudAnswer({ ...attempt, selectedId: "invented" }), null);
});
