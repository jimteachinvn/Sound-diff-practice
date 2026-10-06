import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { occurrences } from "../lib/content.ts";

const root = resolve("public/audio/words");
const pilotManifest = JSON.parse(await readFile(resolve("data/audio/pilot-manifest.json"), "utf8"));
const expansionManifest = JSON.parse(await readFile(resolve("data/audio/approved-expansion-manifest.json"), "utf8"));
const expected = new Set(occurrences.map((item) => item.word));
const actual = new Set((await readdir(root)).filter((name) => name.endsWith(".mp3")).map((name) => name.slice(0, -4)));
const declared = new Set([...pilotManifest.words, ...expansionManifest.records.map((record) => record.word)]);
const difference = (left, right) => [...left].filter((word) => !right.has(word));

if ([pilotManifest, expansionManifest].some((manifest) => manifest.voice !== "en-GB-Chirp3-HD-Aoede" || manifest.accent !== "en-GB") ||
    expansionManifest.status !== "approved_for_exercises") {
  throw new Error("The audio manifest names an unexpected voice or accent");
}
if (declared.size !== pilotManifest.words.length + expansionManifest.records.length || actual.size !== expected.size ||
    difference(expected, actual).length || difference(actual, expected).length ||
    difference(expected, declared).length || difference(declared, expected).length) {
  throw new Error(`Audio coverage mismatch: missing ${difference(expected, actual)}, extra ${difference(actual, expected)}`);
}

const expansionRecords = new Map(expansionManifest.records.map((record) => [record.word, record]));
for (const word of expected) {
  const path = resolve(root, `${word}.mp3`);
  const info = await stat(path);
  const bytes = await readFile(path);
  const mp3Header = bytes.subarray(0, 3).toString() === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (!info.isFile() || info.size < 1000 || !mp3Header) throw new Error(`Invalid MP3: ${word}`);
  const record = expansionRecords.get(word);
  if (record && (record.status !== "approved_for_exercises" ||
      !["not_recorded", "confirmed"].includes(record.individualListeningReview) ||
      (record.individualListeningReview === "confirmed" && (!record.listenedAt || !record.reviewer)) ||
      bytes.length !== record.bytes || createHash("sha256").update(bytes).digest("hex") !== record.sha256)) {
    throw new Error(`Approved expansion audio hash mismatch: ${word}`);
  }
}

console.log(`Verified ${expected.size} approved MP3 files for ${occurrences.length} word occurrences.`);
