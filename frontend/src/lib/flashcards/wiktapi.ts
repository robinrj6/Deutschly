import type { DailyFlashcard } from "@/lib/flashcards/types";
import { generateExamplesWithOllama } from "@/lib/flashcards/ollama";

const WIKTIONARY_API = "https://en.wiktionary.org/w/api.php";
const WIKTAPI_TIMEOUT_MS = Number(process.env.WIKTAPI_TIMEOUT_MS ?? 5000);
const ALLOWED_WORD_PATTERN = /^[a-zäöüß][a-zäöüß\- ]*$/i;

const BLOCKED_POS = new Set([
  "name", "symbol", "letter", "initialism", "abbreviation", "suffix", "prefix", "particle",
]);

const BLOCKED_MEANING_SNIPPETS = [
  "alternative spelling", "misspelling", "obsolete", "archaic", "initialism", "abbreviation",
];

// Maps wikitext section headers to normalised POS names
const POS_SECTION_MAP: Record<string, string> = {
  verb: "verb",
  noun: "noun",
  adjective: "adjective",
  adverb: "adverb",
  pronoun: "pronoun",
  preposition: "preposition",
  conjunction: "conjunction",
  interjection: "interjection",
  article: "article",
  numeral: "numeral",
  participle: "participle",
};

type WikitextPage = {
  revisions?: Array<{ slots: { main: { "*": string } } }>;
};

type MediaWikiResponse = {
  query?: { pages?: Record<string, WikitextPage> };
};

// ── Wikitext parsers ──────────────────────────────────────────────────────────

/**
 * Extract the `==German==` block from a full wikitext string.
 * Stops at the next top-level `==` section so we never bleed into other languages.
 */
function extractGermanSection(wikitext: string): string | null {
  const start = wikitext.indexOf("==German==");
  if (start === -1) return null;

  // Find the next top-level == heading that is NOT ==German==
  const afterStart = wikitext.indexOf("\n", start) + 1;
  const nextLang = wikitext.slice(afterStart).search(/\n==[^=]/);

  return nextLang === -1
    ? wikitext.slice(afterStart)
    : wikitext.slice(afterStart, afterStart + nextLang);
}

/**
 * Extract one `===POS===` sub-section from the German block.
 * Returns `{ pos, body }` for the first recognised POS section.
 */
function extractFirstPosSection(germanSection: string): { pos: string; body: string } | null {
  const headerRe = /\n===([^=\n]+)===/g;
  let match: RegExpExecArray | null;
  let first: { pos: string; start: number } | null = null;

  while ((match = headerRe.exec(germanSection)) !== null) {
    const posName = POS_SECTION_MAP[match[1].trim().toLowerCase()];
    if (posName) {
      first = { pos: posName, start: match.index + match[0].length };
      break;
    }
  }

  if (!first) return null;

  // Body runs until the next === or ==== heading
  const bodyEnd = germanSection.slice(first.start).search(/\n===[^=]|\n====/);
  const body =
    bodyEnd === -1
      ? germanSection.slice(first.start)
      : germanSection.slice(first.start, first.start + bodyEnd);

  return { pos: first.pos, body };
}

/**
 * Strip common wiki markup from a plain-text string.
 * Handles: [[link|display]], [[link]], {{templates}}, '''bold''', ''italic'', <tags>
 */
function stripMarkup(text: string): string {
  // [[link|display]] → display
  text = text.replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1");
  // Remove all remaining templates {{...}}
  // Repeat to handle nested templates
  for (let i = 0; i < 4; i++) {
    text = text.replace(/\{\{[^{}]*\}\}/g, "");
  }
  // Remove '''bold''' and ''italic''
  text = text.replace(/'{2,3}/g, "");
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, "");
  // Collapse whitespace
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Parse top-level `# definition` lines from a POS body.
 * Skips sub-definitions (`## …`) and non-definition lines.
 */
function parseMeanings(body: string): string[] {
  const meanings: string[] = [];
  for (const line of body.split("\n")) {
    if (/^# /.test(line) && !/^## /.test(line)) {
      const clean = stripMarkup(line.replace(/^# /, "").trim());
      if (clean && clean.length > 2) meanings.push(clean);
    }
  }
  return meanings;
}

/**
 * Parse `#: {{ux|de|German sentence|…}}` example lines from a POS body.
 * Falls back to extracting bare italic `''text''` examples.
 */
function parseExamples(body: string): string[] {
  const examples: string[] = [];
  for (const line of body.split("\n")) {
    if (!/^#: /.test(line)) continue;

    // Preferred: {{ux|de|sentence|translation}}
    const uxMatch = line.match(/\{\{ux\|de\|([^|{}]+)/i);
    if (uxMatch) {
      const text = stripMarkup(uxMatch[1]).trim();
      if (text) { examples.push(text); continue; }
    }

    // Fallback: ''italic sentence''
    const italicMatch = line.match(/#:\s*''(.+?)''/);
    if (italicMatch) {
      const text = stripMarkup(italicMatch[1]).trim();
      if (text) examples.push(text);
    }
  }
  return examples;
}

// ── Candidate validators ──────────────────────────────────────────────────────

function isUsableCandidate(word: string): boolean {
  const t = word.trim();
  if (!t) return false;
  if (/\d/.test(t)) return false;
  if (t.toUpperCase() === t && t.length > 2) return false;
  if (!/[a-zäöüß]/i.test(t)) return false;
  if (!ALLOWED_WORD_PATTERN.test(t)) return false;
  if (t.length < 3 || t.length > 24) return false;
  return true;
}

function hasBlockedMeaning(meaning: string): boolean {
  const lower = meaning.toLowerCase();
  return BLOCKED_MEANING_SNIPPETS.some((s) => lower.includes(s));
}

function splitArticleWord(candidate: string) {
  const normalized = candidate.trim();
  const lower = normalized.toLowerCase();
  if (lower.startsWith("der ") || lower.startsWith("die ") || lower.startsWith("das ")) {
    const [article, ...rest] = normalized.split(" ");
    return { article, word: rest.join(" ").trim() };
  }
  return { article: "", word: normalized };
}



// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchWordFromWiktapi(candidate: string): Promise<DailyFlashcard | null> {
  const split = splitArticleWord(candidate);
  const queryWord = split.word || candidate;

  if (!isUsableCandidate(queryWord)) return null;

  const url = new URL(WIKTIONARY_API);
  url.search = new URLSearchParams({
    action: "query",
    prop: "revisions",
    rvprop: "content",
    rvslots: "main",
    format: "json",
    titles: queryWord,
  }).toString();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WIKTAPI_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
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

  const data = (await response.json()) as MediaWikiResponse;
  const pages = data?.query?.pages ?? {};
  const page = Object.values(pages)[0] as WikitextPage | undefined;

  // -1 page id means the title does not exist on Wiktionary
  if (!page || !page.revisions?.length) return null;

  const wikitext = page.revisions[0].slots.main["*"] ?? "";
  const germanSection = extractGermanSection(wikitext);
  if (!germanSection) return null;

  const posSection = extractFirstPosSection(germanSection);
  if (!posSection) return null;

  if (BLOCKED_POS.has(posSection.pos)) return null;

  const allMeanings = parseMeanings(posSection.body).filter((m) => !hasBlockedMeaning(m));
  const meaning = allMeanings[0] ?? "";
  if (!meaning) return null;

  let exampleSentences = parseExamples(posSection.body).slice(0, 2);
  
  // If no examples from Wiktionary, try Ollama to generate them
  if (exampleSentences.length === 0) {
    const ollamaExamples = await generateExamplesWithOllama(queryWord, meaning);
    exampleSentences = ollamaExamples.slice(0, 2);
  }

  return {
    word: queryWord.toLowerCase(),
    article: split.article.toLowerCase(),
    plural: "",
    meaning,
    meanings: allMeanings,
    pos: posSection.pos,
    exampleSentences,
    tags: [],
  };
}
