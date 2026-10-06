import endingBatch from "../data/approved/ending-batch-1.json" with { type: "json" };
import expansionBatch from "../data/approved/expansion-batch-2.json" with { type: "json" };
import gBatch from "../data/approved/g-batch-3.json" with { type: "json" };
import endingBatchFour from "../data/approved/ending-batch-4.json" with { type: "json" };
import chBatch from "../data/approved/ch-batch-5.json" with { type: "json" };
import ouBatch from "../data/approved/ou-batch-6.json" with { type: "json" };
import endingBatchSeven from "../data/approved/ending-batch-7.json" with { type: "json" };
import endingBatchEight from "../data/approved/ending-batch-8.json" with { type: "json" };
import consonantBatchNine from "../data/approved/consonant-batch-9.json" with { type: "json" };

export type Outcome = { id: string; ipa: string; label: string; hint: string };
export type Family = {
  id: string;
  grapheme: string;
  title: string;
  vietnamese: string;
  kind: "rule" | "tendency" | "lexical";
  rule: string;
  outcomes: Outcome[];
};
export type WordOccurrence = {
  id: string;
  familyId: string;
  word: string;
  ipa: string;
  outcomeId: string;
  start: number;
  end: number;
  accent: "en-GB";
  status: "approved";
};

export const families: Family[] = [
  { id: "ea", grapheme: "ea", title: "Họ âm EA", vietnamese: "Cùng cách viết, ba cách đọc", kind: "tendency", rule: "EA thường được đọc /iː/, nhưng một số từ thông dụng đọc /e/ hoặc /eɪ/. Hãy học theo từng nhóm âm.", outcomes: [
    { id: "i-long", ipa: "/iː/", label: "Âm /iː/ dài", hint: "clean · meat" },
    { id: "e", ipa: "/e/", label: "Âm /e/ ngắn", hint: "bread · head" },
    { id: "ei", ipa: "/eɪ/", label: "Âm /eɪ/", hint: "great · break" }
  ] },
  { id: "oo", grapheme: "oo", title: "Họ âm OO", vietnamese: "Nhìn OO, chọn âm đúng", kind: "tendency", rule: "OO có nhiều cách đọc thường gặp. Những từ đọc /ʌ/ thuộc một nhóm ngoại lệ nhỏ.", outcomes: [
    { id: "u-long", ipa: "/uː/", label: "Âm /uː/ dài", hint: "moon · food" },
    { id: "u-short", ipa: "/ʊ/", label: "Âm /ʊ/ ngắn", hint: "book · good" },
    { id: "uh", ipa: "/ʌ/", label: "Âm /ʌ/", hint: "blood · flood" }
  ] },
  { id: "s-ending", grapheme: "-s / -es", title: "Âm cuối -S và -ES", vietnamese: "Âm cuối phụ thuộc âm trước đó", kind: "rule", rule: "Với đuôi từ thông thường, âm cuối của từ gốc quyết định đuôi -s/-es được đọc /s/, /z/ hay /ɪz/.", outcomes: [
    { id: "s", ipa: "/s/", label: "Âm /s/ vô thanh", hint: "cats · books" },
    { id: "z", ipa: "/z/", label: "Âm /z/ hữu thanh", hint: "dogs · plays" },
    { id: "iz", ipa: "/ɪz/", label: "Thêm một âm tiết", hint: "buses · watches" }
  ] },
  { id: "ed-ending", grapheme: "-ed", title: "Âm cuối -ED", vietnamese: "Dựa vào âm cuối của động từ gốc", kind: "rule", rule: "Đuôi -ed thông thường đọc /t/ sau âm vô thanh, /d/ sau âm hữu thanh, và /ɪd/ sau /t/ hoặc /d/.", outcomes: [
    { id: "t", ipa: "/t/", label: "Âm /t/ vô thanh", hint: "walked · missed" },
    { id: "d", ipa: "/d/", label: "Âm /d/ hữu thanh", hint: "played · cleaned" },
    { id: "id", ipa: "/ɪd/", label: "Thêm một âm tiết", hint: "wanted · needed" }
  ] },
  { id: "i", grapheme: "i", title: "I ngắn hay I dài?", vietnamese: "I ngắn và I dài", kind: "tendency", rule: "Chữ e câm ở cuối thường làm i chuyển thành /aɪ/. Hãy kiểm tra từng từ, đừng áp dụng máy móc.", outcomes: [
    { id: "i-short", ipa: "/ɪ/", label: "Âm /ɪ/ ngắn", hint: "sit · pin" },
    { id: "ai", ipa: "/aɪ/", label: "Âm /aɪ/", hint: "time · fine" }
  ] },
  { id: "th", grapheme: "th", title: "Hai cách đọc TH", vietnamese: "TH không phải lúc nào cũng giống nhau", kind: "tendency", rule: "TH có thể đọc /θ/ vô thanh hoặc /ð/ hữu thanh. Nhiều từ chức năng thông dụng đọc /ð/.", outcomes: [
    { id: "theta", ipa: "/θ/", label: "Âm /θ/ vô thanh", hint: "think · bath" },
    { id: "eth", ipa: "/ð/", label: "Âm /ð/ hữu thanh", hint: "this · mother" }
  ] },
  { id: "ow", grapheme: "ow", title: "Hai cách đọc OW", vietnamese: "OW có hai họ âm thường gặp", kind: "tendency", rule: "Theo giọng Anh Anh được chọn, OW có thể đọc /aʊ/ như now hoặc /əʊ/ như snow.", outcomes: [
    { id: "au", ipa: "/aʊ/", label: "Âm /aʊ/", hint: "now · town" },
    { id: "ou", ipa: "/əʊ/", label: "Âm /əʊ/", hint: "low · snow" }
  ] },
  { id: "c", grapheme: "c", title: "C cứng và C mềm", vietnamese: "C đọc /k/ hoặc /s/", kind: "tendency", rule: "C thường đọc /s/ trước e, i hoặc y, và /k/ ở các vị trí khác. Vẫn có ngoại lệ; hãy học với những từ đã kiểm chứng.", outcomes: [
    { id: "k", ipa: "/k/", label: "C đọc /k/", hint: "cat · cup" },
    { id: "soft-s", ipa: "/s/", label: "C đọc /s/", hint: "city · face" }
  ] },
  { id: "g", grapheme: "g", title: "G cứng và G mềm", vietnamese: "G đọc /ɡ/ hoặc /dʒ/", kind: "tendency", rule: "G thường đọc /dʒ/ trước e, i hoặc y, nhưng một số từ thông dụng như gifted vẫn đọc /ɡ/. Đây không phải quy tắc tuyệt đối.", outcomes: [
    { id: "hard", ipa: "/ɡ/", label: "G đọc /ɡ/", hint: "green · gifted" },
    { id: "soft", ipa: "/dʒ/", label: "G đọc /dʒ/", hint: "giant · gym" }
  ] },
  { id: "ch", grapheme: "ch", title: "Ba cách đọc CH", vietnamese: "CH có ba nhóm âm thường gặp", kind: "tendency", rule: "CH thường đọc /tʃ/ như chat; ở một số từ, CH đọc /k/ như chemical hoặc /ʃ/ như brochure. Đây là các xu hướng chính tả, không phải quy tắc tuyệt đối.", outcomes: [
    { id: "tch", ipa: "/tʃ/", label: "Âm /tʃ/", hint: "chat · beach" },
    { id: "k", ipa: "/k/", label: "Âm /k/", hint: "chemical · technology" },
    { id: "sh", ipa: "/ʃ/", label: "Âm /ʃ/", hint: "brochure · parachute" }
  ] },
  { id: "ou", grapheme: "ou", title: "Họ âm OU", vietnamese: "OU có nhiều cách đọc; học theo nhóm từ", kind: "lexical", rule: "Ở những từ thông dụng này, OU có thể đọc /aʊ/, /uː/ hoặc /ʌ/. Hãy học theo nhóm từ; chỉ nhìn chữ viết chưa thể xác định âm.", outcomes: [
    { id: "au", ipa: "/aʊ/", label: "Âm /aʊ/", hint: "found · proud" },
    { id: "u-long", ipa: "/uː/", label: "Âm /uː/ dài", hint: "soup · youth" },
    { id: "uh", ipa: "/ʌ/", label: "Âm /ʌ/", hint: "country · touch" }
  ] }
];

// Each entry is word|whole-word British IPA. The target is found explicitly from
// the family grapheme; suffixes are anchored to the end of the word.
const inventory: Record<string, Record<string, string[]>> = {
  ea: {
    "i-long": ["clean|kliːn", "meat|miːt", "please|pliːz", "sea|siː", "tea|tiː", "speak|spiːk", "dream|driːm", "reach|riːtʃ", "teach|tiːtʃ"],
    e: ["bread|bred", "head|hed", "dead|ded", "ready|ˈredi", "weather|ˈweðə", "heavy|ˈhevi", "instead|ɪnˈsted", "health|helθ"],
    ei: ["great|ɡreɪt", "break|breɪk", "steak|steɪk"]
  },
  oo: {
    "u-long": ["moon|muːn", "food|fuːd", "school|skuːl", "spoon|spuːn", "boot|buːt", "cool|kuːl", "pool|puːl", "soon|suːn"],
    "u-short": ["book|bʊk", "look|lʊk", "cook|kʊk", "good|ɡʊd", "wood|wʊd", "foot|fʊt", "took|tʊk", "hook|hʊk"],
    uh: ["blood|blʌd", "flood|flʌd"]
  },
  "s-ending": {
    s: ["cats|kæts", "books|bʊks", "stops|stɒps", "walks|wɔːks", "laughs|lɑːfs", "cooks|kʊks", "weeks|wiːks", "looks|lʊks"],
    z: ["dogs|dɒɡz", "plays|pleɪz", "rooms|ruːmz", "pens|penz", "calls|kɔːlz", "days|deɪz", "reads|riːdz", "chairs|tʃeəz"],
    iz: ["buses|ˈbʌsɪz", "watches|ˈwɒtʃɪz", "dishes|ˈdɪʃɪz", "boxes|ˈbɒksɪz", "classes|ˈklɑːsɪz", "roses|ˈrəʊzɪz", "matches|ˈmætʃɪz", "pages|ˈpeɪdʒɪz"]
  },
  "ed-ending": {
    t: ["walked|wɔːkt", "washed|wɒʃt", "liked|laɪkt", "missed|mɪst", "laughed|lɑːft", "stopped|stɒpt", "watched|wɒtʃt", "helped|helpt"],
    d: ["played|pleɪd", "cleaned|kliːnd", "opened|ˈəʊpənd", "called|kɔːld", "lived|lɪvd", "stayed|steɪd", "rained|reɪnd", "moved|muːvd"],
    id: ["wanted|ˈwɒntɪd", "needed|ˈniːdɪd", "started|ˈstɑːtɪd", "decided|dɪˈsaɪdɪd", "invited|ɪnˈvaɪtɪd", "ended|ˈendɪd", "waited|ˈweɪtɪd", "added|ˈædɪd"]
  },
  i: {
    "i-short": ["sit|sɪt", "hit|hɪt", "bit|bɪt", "fit|fɪt", "lip|lɪp", "pin|pɪn", "fin|fɪn", "lid|lɪd"],
    ai: ["time|taɪm", "fine|faɪn", "line|laɪn", "nine|naɪn", "mine|maɪn", "side|saɪd", "ride|raɪd", "kite|kaɪt"]
  },
  th: {
    theta: ["think|θɪŋk", "thin|θɪn", "thank|θæŋk", "three|θriː", "bath|bɑːθ", "math|mæθ", "teeth|tiːθ", "both|bəʊθ"],
    eth: ["this|ðɪs", "that|ðæt", "these|ðiːz", "those|ðəʊz", "mother|ˈmʌðə", "father|ˈfɑːðə", "brother|ˈbrʌðə", "weather|ˈweðə"]
  },
  ow: {
    au: ["cow|kaʊ", "now|naʊ", "how|haʊ", "town|taʊn", "brown|braʊn", "down|daʊn", "flower|flaʊə", "shower|ʃaʊə"],
    ou: ["low|ləʊ", "grow|ɡrəʊ", "show|ʃəʊ", "snow|snəʊ", "slow|sləʊ", "window|ˈwɪndəʊ", "yellow|ˈjeləʊ", "tomorrow|təˈmɒrəʊ"]
  },
  c: {
    k: ["cat|kæt", "cup|kʌp", "class|klɑːs", "cold|kəʊld", "coat|kəʊt", "cake|keɪk", "corn|kɔːn", "camera|ˈkæmrə"],
    "soft-s": ["city|ˈsɪti", "cinema|ˈsɪnəmə", "cent|sent", "face|feɪs", "ice|aɪs", "nice|naɪs", "rice|raɪs", "pencil|ˈpensəl"]
  }
};

function targetSpan(familyId: string, word: string): [number, number] {
  if (familyId === "s-ending") {
    const length = word.endsWith("es") ? 2 : 1;
    return [word.length - length, word.length];
  }
  if (familyId === "ed-ending") return [word.length - 2, word.length];
  const at = word.indexOf(familyId);
  if (at < 0) throw new Error(`Missing ${familyId} in ${word}`);
  return [at, at + familyId.length];
}

const pilotOccurrences: WordOccurrence[] = Object.entries(inventory).flatMap(([familyId, groups]) =>
  Object.entries(groups).flatMap(([outcomeId, entries]) => entries.map((entry) => {
    const [word, ipa] = entry.split("|");
    const [start, end] = targetSpan(familyId, word);
    return { id: `${familyId}:${word}`, familyId, word, ipa: `/${ipa}/`, outcomeId, start, end, accent: "en-GB" as const, status: "approved" as const };
  }))
);

export const occurrences: WordOccurrence[] = [
  ...pilotOccurrences,
  ...[...endingBatch.entries, ...expansionBatch.entries, ...gBatch.entries, ...endingBatchFour.entries, ...chBatch.entries, ...ouBatch.entries, ...endingBatchSeven.entries, ...endingBatchEight.entries, ...consonantBatchNine.entries].map(({ sourceGrades: _grades, ...item }) => ({
    ...item,
    accent: "en-GB" as const,
    status: "approved" as const
  }))
];

export function familyById(id: string): Family {
  const family = families.find((candidate) => candidate.id === id);
  if (!family) throw new Error(`Unknown family: ${id}`);
  return family;
}

export function wordsFor(familyId: string): WordOccurrence[] {
  return occurrences.filter((item) => item.familyId === familyId && item.status === "approved");
}

/** Pick a published, approved teaching example from the outcome's displayed hints. */
export function exampleForOutcome(familyId: string, outcomeId: string): WordOccurrence {
  const outcome = familyById(familyId).outcomes.find((item) => item.id === outcomeId);
  if (!outcome) throw new Error(`Unknown outcome: ${familyId}:${outcomeId}`);
  const examples = outcome.hint.split(" · ");
  const example = examples.map((word) => wordsFor(familyId).find((item) => item.word === word && item.outcomeId === outcomeId)).find(Boolean);
  if (!example) throw new Error(`No approved audio example: ${familyId}:${outcomeId}`);
  return example;
}
