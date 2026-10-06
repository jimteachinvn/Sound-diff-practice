import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { families, occurrences } from "../lib/content.ts";

const batchFiles = [
  "ending-batch-1.json", "expansion-batch-2.json", "g-batch-3.json",
  "ending-batch-4.json", "ch-batch-5.json", "ou-batch-6.json",
  "ending-batch-7.json", "ending-batch-8.json", "consonant-batch-9.json"
];
const batches = await Promise.all(batchFiles.map(async (name) =>
  JSON.parse(await readFile(resolve("data/approved", name), "utf8"))
));
const approved = batches.flatMap((batch) => {
  assert.equal(batch.status, "approved", "An unapproved batch was included");
  return batch.entries;
});
const live = new Map(occurrences.map((item) => [item.id, item]));
assert.equal(live.size, occurrences.length, "Duplicate live occurrence ID");
assert.equal(families.length, 11);
assert.equal(occurrences.length, 799);
assert.equal(new Set(occurrences.map((item) => item.word)).size, 776);
for (const entry of approved) {
  assert.deepEqual({ id: entry.id, familyId: entry.familyId, word: entry.word,
    ipa: entry.ipa, outcomeId: entry.outcomeId, start: entry.start, end: entry.end,
    accent: entry.accent, status: entry.status }, live.get(entry.id));
}
assert.equal(occurrences.length - approved.length, 150, "Pilot inventory changed");
console.log(`Verified ${occurrences.length} approved target occurrences across ${families.length} families and 776 live words.`);
