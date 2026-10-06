import { familyById, wordsFor, type WordOccurrence } from "./content.ts";

export type OddItem = {
  id: string;
  familyId: string;
  contrastId: string;
  options: WordOccurrence[];
  oddId: string;
  version: 1;
};

export type SortItem = {
  familyId: string;
  words: WordOccurrence[];
  outcomeIds: string[];
};

export type WordExposure = Record<string, { count: number; lastTurn: number }>;

export function contrastId(familyId: string, left: string, right: string): string {
  return `${familyId}:${[left, right].sort().join("~")}`;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function pick<T>(items: T[], count: number, random: () => number): T[] {
  return shuffle(items, random).slice(0, count);
}

/** Revisit familiar words occasionally, after a gap; a new word remains the default. */
export function pickPracticeWords(pool: WordOccurrence[], count: number, random: () => number, exposure: WordExposure = {}, turn = 0): WordOccurrence[] {
  const remaining = [...pool];
  const selected: WordOccurrence[] = [];
  while (selected.length < count && remaining.length) {
    const unseen = remaining.filter((word) => !exposure[word.id]);
    const spaced = remaining.filter((word) => exposure[word.id] && turn - exposure[word.id].lastTurn >= 4)
      .sort((a, b) => (exposure[a.id].count - exposure[b.id].count) || (exposure[a.id].lastTurn - exposure[b.id].lastTurn));
    const recent = remaining.filter((word) => exposure[word.id] && turn - exposure[word.id].lastTurn < 4);
    const candidates = spaced.length && (!unseen.length || random() < 0.25) ? spaced
      : unseen.length ? unseen : spaced.length ? spaced : recent;
    const choice = candidates === spaced ? pick(spaced.slice(0, Math.max(1, Math.ceil(spaced.length / 2))), 1, random)[0] : pick(candidates, 1, random)[0];
    selected.push(choice);
    remaining.splice(remaining.findIndex((word) => word.id === choice.id), 1);
  }
  return selected;
}

export function validateOdd(item: OddItem): boolean {
  if (item.options.length !== 4 || new Set(item.options.map((word) => word.id)).size !== 4) return false;
  if (!item.options.every((word) => word.familyId === item.familyId && word.accent === "en-GB" && word.status === "approved" && word.word.slice(word.start, word.end).length > 0)) return false;
  const groups = new Map<string, number>();
  for (const word of item.options) groups.set(word.outcomeId, (groups.get(word.outcomeId) ?? 0) + 1);
  if (groups.size !== 2 || ![...groups.values()].sort().every((count, index) => count === [1, 3][index])) return false;
  const odd = item.options.find((word) => word.id === item.oddId);
  if (!odd || groups.get(odd.outcomeId) !== 1) return false;
  const other = item.options.find((word) => word.outcomeId !== odd.outcomeId);
  return !!other && item.contrastId === contrastId(item.familyId, odd.outcomeId, other.outcomeId);
}

export function generateOdd(familyId: string, random: () => number = Math.random, requestedContrast?: string, exposure: WordExposure = {}, turn = 0): OddItem {
  const family = familyById(familyId);
  const pool = wordsFor(familyId);
  const candidates: Array<{ majority: string; minority: string }> = [];
  for (const majority of family.outcomes) for (const minority of family.outcomes) {
    if (majority.id !== minority.id && pool.filter((word) => word.outcomeId === majority.id).length >= 3 && pool.some((word) => word.outcomeId === minority.id)) {
      if (!requestedContrast || requestedContrast === contrastId(familyId, majority.id, minority.id)) candidates.push({ majority: majority.id, minority: minority.id });
    }
  }
  if (!candidates.length) throw new Error(`No safe 3:1 question for ${familyId}`);
  const pair = candidates[Math.floor(random() * candidates.length)];
  const majority = pickPracticeWords(pool.filter((word) => word.outcomeId === pair.majority), 3, random, exposure, turn);
  const minority = pickPracticeWords(pool.filter((word) => word.outcomeId === pair.minority), 1, random, exposure, turn)[0];
  const options = shuffle([...majority, minority], random);
  const item: OddItem = {
    id: `${familyId}:${options.map((word) => word.id).sort().join("|")}`,
    familyId,
    contrastId: contrastId(familyId, pair.majority, pair.minority),
    options,
    oddId: minority.id,
    version: 1
  };
  if (!validateOdd(item)) throw new Error("Generator produced an invalid question");
  return item;
}

export function generateSort(familyId: string, random: () => number = Math.random, exposure: WordExposure = {}, turn = 0): SortItem {
  const family = familyById(familyId);
  const pool = wordsFor(familyId);
  const words = shuffle(family.outcomes.flatMap((outcome) => pickPracticeWords(pool.filter((word) => word.outcomeId === outcome.id), 2, random, exposure, turn)), random);
  if (words.length !== family.outcomes.length * 2) throw new Error(`Not enough approved words to sort for ${familyId}`);
  return { familyId, words, outcomeIds: family.outcomes.map((outcome) => outcome.id) };
}

export function highlighted(word: WordOccurrence): { before: string; target: string; after: string } {
  return { before: word.word.slice(0, word.start), target: word.word.slice(word.start, word.end), after: word.word.slice(word.end) };
}
