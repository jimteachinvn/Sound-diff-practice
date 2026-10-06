import assert from "node:assert/strict";
import test from "node:test";
import { exampleForOutcome, families, occurrences, wordsFor } from "../lib/content.ts";
import { contrastId, generateOdd, generateSort, pickPracticeWords, validateOdd } from "../lib/exercises.ts";
import { emptyState, loadState, mergeLearningStates, recordAttempt, saveState, wordExposure } from "../lib/mastery.ts";

test("the approved inventory has valid target spans and sound groups", () => {
  assert.equal(occurrences.length, 799);
  assert.equal(new Set(occurrences.map((word) => word.word)).size, 776);
  assert.equal(wordsFor("ed-ending").length, 173);
  assert.equal(wordsFor("s-ending").length, 273);
  assert.equal(wordsFor("g").length, 63);
  assert.equal(wordsFor("g").filter((word) => word.outcomeId === "hard").length, 31);
  assert.equal(wordsFor("g").filter((word) => word.outcomeId === "soft").length, 32);
  assert.equal(wordsFor("c").length, 102);
  assert.equal(wordsFor("th").length, 35);
  assert.equal(wordsFor("ch").length, 37);
  assert.equal(wordsFor("ch").filter((word) => word.outcomeId === "tch").length, 25);
  assert.equal(wordsFor("ch").filter((word) => word.outcomeId === "k").length, 8);
  assert.equal(wordsFor("ch").filter((word) => word.outcomeId === "sh").length, 4);
  assert.ok(!wordsFor("ch").some((word) => word.word === "schedule"), "dialect-sensitive SCH target must stay out of automatic CH questions");
  assert.equal(wordsFor("ou").length, 28);
  assert.ok(!wordsFor("ou").some((word) => word.word === "you"), "reduced and strong forms should not share one automatic OU target");
  assert.ok(!wordsFor("oo").some((word) => word.word === "room"), "variable OO pronunciations must stay out of generated questions");
  assert.ok(!wordsFor("c").some((word) => word.word === "cheek"), "a /k/ elsewhere in the IPA cannot license c in ch");
  assert.ok(!wordsFor("s-ending").some((word) => word.word === "states"), "silent base e must not be highlighted as the /s/ ending");
  assert.equal(new Set(occurrences.map((word) => word.id)).size, occurrences.length);
  for (const word of occurrences) {
    const family = families.find((item) => item.id === word.familyId);
    assert.ok(family);
    assert.ok(family.outcomes.some((outcome) => outcome.id === word.outcomeId));
    const outcome = family.outcomes.find((candidate) => candidate.id === word.outcomeId)!;
    const sound = outcome.ipa.slice(1, -1);
    assert.ok(word.ipa.includes(sound), `${word.id}: ${word.ipa} does not contain ${outcome.ipa}`);
    if (word.familyId === "s-ending" || word.familyId === "ed-ending") {
      assert.ok(word.ipa.slice(0, -1).endsWith(sound), `${word.id}: ending does not match ${outcome.ipa}`);
    }
    assert.equal(word.accent, "en-GB");
    assert.ok(word.ipa.startsWith("/") && word.ipa.endsWith("/"));
    const target = word.word.slice(word.start, word.end);
    assert.ok(target.length > 0, word.id);
    assert.equal(target, word.familyId === "s-ending" ? (word.word.endsWith("es") ? "es" : "s") : word.familyId === "ed-ending" ? "ed" : word.familyId);
  }
});

test("every family can produce unique, defensible 3:1 questions and sort sets", () => {
  for (const family of families) {
    assert.ok(wordsFor(family.id).length >= 10);
    for (let left = 0; left < family.outcomes.length; left++) {
      for (let right = left + 1; right < family.outcomes.length; right++) {
        const contrast = contrastId(family.id, family.outcomes[left].id, family.outcomes[right].id);
        assert.ok(validateOdd(generateOdd(family.id, () => 0.2, contrast)), `No safe item for ${contrast}`);
      }
    }
    for (let index = 0; index < 200; index++) {
      const item = generateOdd(family.id);
      assert.ok(validateOdd(item), `${family.id} failed`);
    }
    const sort = generateSort(family.id);
    assert.equal(sort.words.length, family.outcomes.length * 2);
  }
});

test("every listening sound has an approved example in the same family and outcome", () => {
  for (const family of families) for (const outcome of family.outcomes) {
    const example = exampleForOutcome(family.id, outcome.id);
    assert.equal(example.familyId, family.id);
    assert.equal(example.outcomeId, outcome.id);
    assert.equal(example.status, "approved");
    assert.ok(outcome.hint.split(" · ").includes(example.word));
  }
});

test("a 2:2 item is rejected even if an answer is declared", () => {
  const pool = wordsFor("oo");
  const item = generateOdd("oo");
  item.options = [
    ...pool.filter((word) => word.outcomeId === "u-long").slice(0, 2),
    ...pool.filter((word) => word.outcomeId === "u-short").slice(0, 2)
  ];
  item.oddId = item.options[0].id;
  assert.equal(validateOdd(item), false);
});

test("a missed contrast becomes due sooner than repeated successful reviews", () => {
  const base = { at: "2026-09-28T00:00:00.000Z", familyId: "ea", contrastId: "ea:e~i-long", itemId: "test", mode: "odd" as const, selectedId: "a", correctId: "b", latencyMs: 2000 };
  const missed = recordAttempt(emptyState, { ...base, id: "1", correct: false });
  assert.equal(missed.mastery[base.contrastId].intervalDays, 1);
  const success1 = recordAttempt(emptyState, { ...base, id: "2", selectedId: "b", correct: true });
  const early = recordAttempt(success1, { ...base, id: "3", at: "2026-09-28T00:05:00.000Z", selectedId: "b", correct: true });
  assert.equal(early.mastery[base.contrastId].intervalDays, 1);
  assert.equal(early.mastery[base.contrastId].dueAt, success1.mastery[base.contrastId].dueAt);
  const spaced = recordAttempt(early, { ...base, id: "4", at: "2026-09-29T00:00:00.000Z", selectedId: "b", correct: true });
  assert.equal(spaced.mastery[base.contrastId].intervalDays, 2);
  assert.equal(recordAttempt(spaced, { ...base, id: "4", selectedId: "b", correct: true }).attempts.length, 3);
});

test("many correct answers on one day cannot skip spaced reviews", () => {
  let state = emptyState;
  for (let i = 0; i < 8; i++) {
    state = recordAttempt(state, { id: String(i), at: `2026-09-28T00:${String(i).padStart(2, "0")}:00.000Z`, familyId: "ea",
      contrastId: "ea:e~i-long", itemId: "test", mode: "odd", selectedId: "b", correctId: "b", correct: true, latencyMs: 1000 });
  }
  assert.equal(state.mastery["ea:e~i-long"].intervalDays, 1);
  assert.equal(state.mastery["ea:e~i-long"].dueAt, "2026-09-29T00:00:00.000Z");
  assert.equal(state.mastery["ea:e~i-long"].exposures, 8);
});

test("sorting and listening do not postpone an independent retest", () => {
  const base = { at: "2026-09-28T00:00:00.000Z", familyId: "ea", contrastId: "ea:e~i-long", itemId: "test", selectedId: "b", correctId: "b", correct: true, latencyMs: 1000 };
  const first = recordAttempt(emptyState, { ...base, id: "1", mode: "odd" });
  const dueAt = first.mastery[base.contrastId].dueAt;
  const sort = recordAttempt(first, { ...base, id: "2", at: "2026-09-29T01:00:00.000Z", mode: "sort" });
  const listen = recordAttempt(sort, { ...base, id: "3", at: "2026-09-29T02:00:00.000Z", mode: "listen" });
  assert.equal(sort.mastery[base.contrastId].dueAt, dueAt);
  assert.equal(listen.mastery[base.contrastId].dueAt, dueAt);
  assert.equal(listen.mastery[base.contrastId].intervalDays, 1);
});

test("word rotation gives new words priority, then revisits familiar ones after a gap", () => {
  const pool = wordsFor("ea").filter((word) => word.outcomeId === "e").slice(0, 3);
  const exposure = { [pool[0].id]: { count: 1, lastTurn: 0 }, [pool[1].id]: { count: 2, lastTurn: 9 } };
  assert.equal(pickPracticeWords(pool, 1, () => 0.9, exposure, 10)[0].id, pool[2].id);
  assert.equal(pickPracticeWords(pool, 1, () => 0.1, exposure, 10)[0].id, pool[0].id);
  assert.equal(new Set(pickPracticeWords(pool, 3, () => 0.1, exposure, 10).map((word) => word.id)).size, 3);
});

test("word exposure is reconstructed from saved attempt snapshots", () => {
  const word = wordsFor("ea")[0];
  const attempt = { id: "test", at: "2026-09-28T00:00:00.000Z", familyId: "ea", contrastId: "ea:e~i-long", itemId: "example", mode: "odd" as const,
    selectedId: word.id, correctId: word.id, correct: true, latencyMs: 1000, itemSnapshot: { options: [{ id: word.id }] } };
  assert.deepEqual(wordExposure([attempt, { ...attempt, id: "next", itemId: `listen:${word.id}`, mode: "listen" }])[word.id], { count: 2, lastTurn: 1 });
});

test("damaged or unavailable device storage cannot crash progress", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      localStorage: { getItem: () => JSON.stringify({ attempts: [], mastery: null }), setItem: () => { throw new Error("quota"); } }
    } });
    assert.deepEqual(loadState(), emptyState);
    assert.equal(saveState(emptyState), false);
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("student caches remain separate from guest and other accounts", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map<string, string>();
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }
    } });
    const guest = recordAttempt(emptyState, { id: "guest", at: "2026-10-01T00:00:00.000Z", familyId: "ea", contrastId: "ea:test", itemId: "a", mode: "odd", selectedId: "a", correctId: "a", correct: true, latencyMs: 1 });
    const student = recordAttempt(emptyState, { ...guest.attempts[0], id: "student", itemId: "b" });
    assert.equal(saveState(guest), true);
    assert.equal(saveState(student, "student-a"), true);
    assert.equal(loadState().attempts[0].id, "guest");
    assert.equal(loadState("student-a").attempts[0].id, "student");
    assert.deepEqual(loadState("student-b"), emptyState);
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("device merges replay unique attempts in stable order", () => {
  const first = { id: "a", at: "2026-10-01T00:00:00.000Z", familyId: "ea", contrastId: "ea:test", itemId: "q-a", mode: "odd" as const,
    selectedId: "a", correctId: "a", correct: true, latencyMs: 1 };
  const second = { ...first, id: "b", itemId: "q-b", correct: false };
  const left = recordAttempt(emptyState, second);
  const right = [first, second].reduce(recordAttempt, emptyState);
  const merged = mergeLearningStates(left, right);
  assert.deepEqual(merged.attempts.map((attempt) => attempt.id), ["a", "b"]);
  assert.equal(merged.mastery[first.contrastId].exposures, 2);
  assert.equal(merged.mastery[first.contrastId].lapses, 1);
});
