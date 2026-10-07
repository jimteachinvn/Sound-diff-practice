import assert from "node:assert/strict";
import test from "node:test";
import { FamilyAttemptSync } from "../lib/family-sync.ts";
import type { Attempt } from "../lib/mastery.ts";

const answers = (count: number): Attempt[] => Array.from({ length: count }, (_, index) => ({
  id: String(index), at: "2026-10-06T00:00:00.000Z", familyId: "ea", contrastId: "ea:e:i-long", itemId: String(index), mode: "listen", selectedId: "e", correctId: "e", correct: true, latencyMs: 1000
}));

test("family sync serializes overlapping saves and uploads only unacknowledged batches", async () => {
  const history = answers(501);
  const stored = new Map(history.slice(0, 1).map((answer) => [answer.id, answer]));
  const batches: number[] = [];
  let active = 0;
  let refreshes = 0;
  const queue = new FamilyAttemptSync(history.slice(0, 1), async (batch) => {
    assert.equal(active++, 0);
    await Promise.resolve();
    batches.push(batch.length);
    batch.forEach((answer) => stored.set(answer.id, answer));
    active--;
    return batch;
  }, async () => { refreshes++; return [...stored.values()]; });
  await Promise.all([queue.synchronize(history.slice(0, 401)), queue.synchronize(history)]);
  assert.deepEqual(batches, [200, 200, 100]);
  assert.equal(refreshes, 2);
  await queue.synchronize(history);
  assert.equal(refreshes, 2);
});

test("family sync retries failed uploads without acknowledging missing answers", async () => {
  const history = answers(2);
  let fail = true;
  const uploads: number[] = [];
  const queue = new FamilyAttemptSync([], async (batch) => {
    uploads.push(batch.length);
    if (fail) { fail = false; throw new Error("offline"); }
    return batch;
  }, async () => history);
  await assert.rejects(queue.synchronize(history));
  assert.deepEqual(await queue.synchronize(history), history);
  assert.deepEqual(uploads, [2, 2]);
});

test("family sync retries a failed canonical refresh without reuploading saved answers", async () => {
  const history = answers(1);
  let uploads = 0;
  let refreshes = 0;
  const queue = new FamilyAttemptSync([], async (batch) => { uploads++; return batch; }, async () => {
    if (++refreshes === 1) throw new Error("connection lost after saving");
    return history;
  });
  await assert.rejects(queue.synchronize(history));
  assert.deepEqual(await queue.synchronize(history), history);
  assert.equal(uploads, 1);
  assert.equal(refreshes, 2);
});

test("a rejected cached answer is retained for review without blocking newer answers", async () => {
  const history = answers(2);
  const batches: string[][] = [];
  const stored: Attempt[] = [];
  const queue = new FamilyAttemptSync([], async (batch) => {
    batches.push(batch.map((answer) => answer.id));
    const accepted = batch.filter((answer) => answer.id !== "0");
    stored.push(...accepted);
    return { attempts: accepted, rejected: batch.filter((answer) => answer.id === "0").map((answer) => answer.id) };
  }, async () => stored);
  await queue.synchronize(history.slice(0, 1));
  await queue.synchronize(history);
  assert.deepEqual(batches, [["0"], ["1"]]);
  assert.equal(queue.hasRejected, true);
});
