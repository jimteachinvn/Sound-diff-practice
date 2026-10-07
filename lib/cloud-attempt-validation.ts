import { families, occurrences, type WordOccurrence } from "./content.ts";
import { contrastId, validateOdd, type OddItem } from "./exercises.ts";
import type { Attempt } from "./mastery.ts";

const wordsById = new Map(occurrences.map((word) => [word.id, word]));
const familiesById = new Map(families.map((family) => [family.id, family]));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CheckedAnswer = {
  id: string;
  at: string;
  itemId: string;
  itemSnapshot: Record<string, unknown>;
  soundFamilyId: string;
  contrastId: string;
  mode: Attempt["mode"];
  selectedId: string;
  correctId: string;
  isCorrect: boolean;
  latencyMs: number;
};

function plainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function canonicalWord(id: unknown): WordOccurrence | null {
  return typeof id === "string" ? wordsById.get(id) ?? null : null;
}
function canonicalSnapshot(item: OddItem): Record<string, unknown> {
  return { itemId: item.id, familyId: item.familyId, contrastId: item.contrastId,
    version: item.version, oddId: item.oddId,
    options: item.options.map((word) => ({ id: word.id, word: word.word,
      outcomeId: word.outcomeId, start: word.start, end: word.end })) };
}

export function checkCloudAnswer(value: unknown, nowMs = Date.now()): CheckedAnswer | null {
  if (!plainObject(value) || typeof value.id !== "string" || !uuid.test(value.id) ||
      typeof value.at !== "string" ||
      typeof value.itemId !== "string" || typeof value.familyId !== "string" ||
      typeof value.contrastId !== "string" || typeof value.selectedId !== "string" ||
      typeof value.latencyMs !== "number" || !Number.isInteger(value.latencyMs) ||
      value.latencyMs < 0 || value.latencyMs > 3600000) return null;
  const time = new Date(value.at);
  if (!Number.isFinite(time.getTime()) || time.toISOString() !== value.at ||
      time.getTime() > nowMs + 5 * 60 * 1000 ||
      time.getTime() < 0) return null;
  const family = familiesById.get(value.familyId);
  if (!family) return null;

  if (value.mode === "odd" || value.mode === "exam") {
    const snapshot = value.itemSnapshot;
    if (!plainObject(snapshot) || snapshot.version !== 1 ||
        !Array.isArray(snapshot.options) || snapshot.options.length !== 4 ||
        snapshot.itemId !== value.itemId || snapshot.familyId !== value.familyId ||
        snapshot.contrastId !== value.contrastId) return null;
    const options = snapshot.options.map((option: unknown) => plainObject(option) ? canonicalWord(option.id) : null);
    if (options.some((option) => !option)) return null;
    const words = options as WordOccurrence[];
    const item: OddItem = { id: value.itemId, familyId: value.familyId,
      contrastId: value.contrastId, options: words, oddId: String(snapshot.oddId), version: 1 };
    if (item.id !== `${item.familyId}:${words.map((word) => word.id).sort().join("|")}` ||
        !validateOdd(item) || !words.some((word) => word.id === value.selectedId)) return null;
    return { id: value.id, at: value.at, itemId: item.id, itemSnapshot: canonicalSnapshot(item),
      soundFamilyId: item.familyId, contrastId: item.contrastId, mode: value.mode,
      selectedId: value.selectedId, correctId: item.oddId,
      isCorrect: value.selectedId === item.oddId, latencyMs: value.latencyMs };
  }

  if (value.mode !== "sort" && value.mode !== "listen") return null;
  if (!value.itemId.startsWith(`${value.mode}:`)) return null;
  const word = canonicalWord(value.itemId.slice(value.mode.length + 1));
  if (!word || word.familyId !== value.familyId ||
      !family.outcomes.some((outcome) => outcome.id === value.selectedId)) return null;
  const contrasted = value.selectedId === word.outcomeId
    ? family.outcomes.some((outcome) => outcome.id !== word.outcomeId &&
      value.contrastId === contrastId(word.familyId, word.outcomeId, outcome.id))
    : value.contrastId === contrastId(word.familyId, word.outcomeId, value.selectedId);
  if (!contrasted) return null;
  return { id: value.id, at: value.at, itemId: value.itemId, itemSnapshot: { itemId: value.itemId },
    soundFamilyId: word.familyId, contrastId: value.contrastId, mode: value.mode,
    selectedId: value.selectedId, correctId: word.outcomeId,
    isCorrect: value.selectedId === word.outcomeId, latencyMs: value.latencyMs };
}
