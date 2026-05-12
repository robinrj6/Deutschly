import type { DailyFlashcard } from "@/lib/flashcards/types";
import { generateExamplesWithOllama } from "@/lib/flashcards/ollama";

const WIKTAPI_BASE_URL = "https://api.wiktapi.dev/v1/en/word";

const WIKTAPI_TIMEOUT_MS = Number(process.env.WIKTAPI_TIMEOUT_MS ?? 3500);
const ALLOWED_WORD_PATTERN = /^[a-zäöüß][a-zäöüß\- ]*$/i;

const BLOCKED_POS = new Set([
  "name",
  "symbol",
  "letter",
  "initialism",
  "abbreviation",
]);

const BLOCKED_TAGS = new Set([
  "abbreviation",
  "initialism",
  "misspelling",
  "common misspelling",
  "obsolete",
  "archaic",
  "rare",
  "dated",
  "nonstandard",
]);

const BLOCKED_MEANING_SNIPPETS = [
  "alternative spelling",
  "misspelling",
  "obsolete",
  "archaic",
  "initialism",
  "abbreviation",
];

type WiktApiResponse = {
  entries?: Array<{
    lang_code?: string;
    pos?: string;
    senses?: Array<{
      glosses?: string[];
      tags?: string[];
      examples?: Array<{ text?: string }>;
    }>;
  }>;
};

type WiktApiEntry = NonNullable<WiktApiResponse["entries"]>[number];
type WiktApiSense = NonNullable<WiktApiEntry["senses"]>[number];
type WiktApiExample = NonNullable<WiktApiSense["examples"]>[number];

function isUsableCandidate(word: string) {
  const trimmed = word.trim();
  if (!trimmed) return false;
  if (/\d/.test(trimmed)) return false;
  if (trimmed.toUpperCase() === trimmed && trimmed.length > 2) return false;
  if (!/[a-zäöüß]/i.test(trimmed)) return false;
  if (!ALLOWED_WORD_PATTERN.test(trimmed)) return false;
  if (trimmed.length < 3 || trimmed.length > 24) return false;
  return true;
}

function hasBlockedTag(entry?: WiktApiEntry) {
  const tags =
    entry?.senses
      ?.flatMap((sense: WiktApiSense) => sense.tags ?? [])
      .map((tag) => tag.toLowerCase()) ?? [];

  return tags.some((tag) => BLOCKED_TAGS.has(tag));
}

function hasBlockedMeaning(meaning: string) {
  const lower = meaning.toLowerCase();
  return BLOCKED_MEANING_SNIPPETS.some((snippet) => lower.includes(snippet));
}

function splitArticleWord(candidate: string) {
  const normalized = candidate.trim();
  const lower = normalized.toLowerCase();

  if (lower.startsWith("der ") || lower.startsWith("die ") || lower.startsWith("das ")) {
    const [article, ...rest] = normalized.split(" ");
    return {
      article,
      word: rest.join(" ").trim(),
    };
  }

  return {
    article: "",
    word: normalized,
  };
}

function pickMeaning(entry?: WiktApiEntry) {
  const gloss = entry?.senses?.find((sense: WiktApiSense) => (sense.glosses?.length ?? 0) > 0)?.glosses?.[0];
  return gloss?.trim() ?? "";
}

function pickTags(entry?: WiktApiEntry) {
  const tags = entry?.senses?.find((sense: WiktApiSense) => (sense.tags?.length ?? 0) > 0)?.tags ?? [];
  return tags.slice(0, 5);
}

function pickExamples(entry?: WiktApiEntry) {
  const examples = entry?.senses
    ?.flatMap((sense: WiktApiSense) => sense.examples ?? [])
    .map((example: WiktApiExample) => example.text?.trim() ?? "")
    .filter(Boolean);

  return (examples ?? []).slice(0, 2);
}

function fallbackExample(word: string) {
  const lowerWord = word.trim();
  if (/^(der|die|das)\s+/i.test(lowerWord)) {
    return `Ich lerne heute ${lowerWord}.`;
  }

  if (lowerWord.endsWith("en")) {
    return `Ich möchte ${lowerWord} besser verstehen.`;
  }

  return `Das ist ein gutes Beispiel mit ${lowerWord}.`;
}

export async function fetchWordFromWiktapi(candidate: string): Promise<DailyFlashcard | null> {
  const split = splitArticleWord(candidate);
  const queryWord = encodeURIComponent(split.word || candidate);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WIKTAPI_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(`${WIKTAPI_BASE_URL}/${queryWord}?lang=de`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) return null;

  const payload = (await response.json()) as WiktApiResponse;
  const firstEntry = payload.entries?.find((entry) => entry.lang_code === "de") ?? payload.entries?.[0];

  if (!firstEntry) return null;
  if (firstEntry.pos && BLOCKED_POS.has(firstEntry.pos.toLowerCase())) return null;
  if (hasBlockedTag(firstEntry)) return null;

  const meaning = pickMeaning(firstEntry);
  const examples = pickExamples(firstEntry);
  const tags = pickTags(firstEntry);

  if (!split.word) return null;
  if (!isUsableCandidate(split.word)) return null;
  if (!meaning || hasBlockedMeaning(meaning)) return null;

  let exampleSentences = examples;
  if (exampleSentences.length === 0) {
    exampleSentences = await generateExamplesWithOllama(split.word, meaning);
  }

  if (exampleSentences.length === 0) {
    exampleSentences = [fallbackExample(split.word)];
  }

  return {
    word: split.word.toLowerCase(),
    article: split.article.toLowerCase(),
    plural: "",
    meaning,
    exampleSentences: exampleSentences.slice(0, 2),
    tags,
  };
}
