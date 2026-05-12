import rawWords from "../../../b1_words.json";

const BLOCKED_WORDS = new Set([
  "",
  "und",
  "oder",
  "aber",
  "auch",
  "dass",
  "die",
  "der",
  "das",
  "dann",
  "doch",
  "nur",
  "nicht",
  "ein",
  "eine",
  "einerseits",
]);

function normalizeRawWord(raw: string) {
  let value = raw.trim();

  if (!value) return "";

  value = value.replace(/[\u2010-\u2015]/g, "-");
  value = value.replace(/\s*\([^)]*\)\s*/g, " ");
  value = value.replace(/[)\]\}]+$/g, "");
  value = value.replace(/\s*[;|].*$/g, "");
  value = value.replace(/\s+/g, " ").trim();

  const articleVariant = value.match(/^(der|die|das)\/(der|die|das)\s+(.+)$/i);
  if (articleVariant) {
    return `${articleVariant[1]} ${articleVariant[3].trim()}`.replace(/\s+/g, " ").trim();
  }

  const slashParts = value.split("/").map((part) => part.trim()).filter(Boolean);
  if (slashParts.length > 0) {
    value = slashParts[0];
  }

  value = value.replace(/\s+/g, " ").trim();
  value = value.replace(/[.,:!?]+$/g, "");
  value = value.replace(/\s*\d+$/g, "");

  return value;
}

function isUsableWord(word: string) {
  const normalized = word.trim();
  const lower = normalized.toLowerCase();

  if (!normalized) return false;
  if (normalized.length < 2 || normalized.length > 40) return false;
  if (!/[a-zäöüß]/i.test(normalized)) return false;
  if (BLOCKED_WORDS.has(lower)) return false;

  return true;
}

const WORD_BANK = Array.from(
  new Set(
    (rawWords as string[])
      .map(normalizeRawWord)
      .filter(isUsableWord),
  ),
);

export function getWordBank() {
  return WORD_BANK;
}

export function pickRandomWords(count: number, excludeWords = new Set<string>()) {
  const pool = getWordBank().filter((word) => !excludeWords.has(word.toLowerCase()));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);

  return shuffled.slice(0, count);
}

export function randomCount(min = 10, max = 15) {
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);

  return lower + Math.floor(Math.random() * (upper - lower + 1));
}
