import type { DailyFlashcard } from "@/lib/flashcards/types";

export type ExerciseSourceWord = {
  word: string;
  meaning: string;
  article?: string;
  pos?: string;
  exampleSentences?: string[];
};

export type FlashcardExercise = {
  id: string;
  kind: "multiple_choice" | "fill_blank";
  prompt: string;
  question: string;
  options: string[];
  answer: string;
  targetWord: string;
  hint?: string;
  exampleSentence?: string;
};

export type ExerciseAnswer = {
  targetWord: string;
  correct: boolean;
};

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

function makeId(prefix: string, word: string, index: number) {
  return `${prefix}-${word.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, "-")}-${index}`;
}

function articlePrefix(word: ExerciseSourceWord) {
  if (word.pos?.toLowerCase() === "noun" && word.article && word.article !== "—") {
    return `${word.article} ${word.word}`;
  }
  return word.word;
}

function syntheticPracticeSentence(word: ExerciseSourceWord) {
  const display = articlePrefix(word);
  const pos = word.pos?.toLowerCase() ?? "";

  if (pos === "verb") {
    return `Wir wollen ${word.word} heute in einer kurzen Übung.`;
  }

  if (pos === "adjective") {
    return `Die Aufgabe ist heute wirklich ${word.word}.`;
  }

  if (pos === "adverb") {
    return `Bitte antworte ${word.word} auf die Frage.`;
  }

  return `In dieser Übung passt ${display} gut zum Thema.`;
}

function fallbackFillBlank(word: ExerciseSourceWord, index: number): FlashcardExercise {
  const sentence = syntheticPracticeSentence(word);

  const blankSentence = sentence.replace(new RegExp(`\\b${word.word}\\b`, "i"), "_____" );

  return {
    id: makeId("fill", word.word, index),
    kind: "fill_blank",
    prompt: "Fill the missing word.",
    question: blankSentence,
    options: [],
    answer: word.word,
    targetWord: word.word,
    hint: word.meaning,
    exampleSentence: sentence,
  };
}

function fallbackMultipleChoice(word: ExerciseSourceWord, pool: ExerciseSourceWord[], index: number): FlashcardExercise {
  const distractors = shuffle(pool.filter((item) => item.word !== word.word)).slice(0, 3).map((item) => item.word);
  const options = shuffle([word.word, ...distractors]);

  return {
    id: makeId("mc", word.word, index),
    kind: "multiple_choice",
    prompt: "Choose the correct German word.",
    question: word.meaning,
    options,
    answer: word.word,
    targetWord: word.word,
    hint: articlePrefix(word),
  };
}

function normalizeExercise(input: unknown, index: number): FlashcardExercise | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<FlashcardExercise>;
  if (!candidate.targetWord) return null;
  if (!candidate.answer || !candidate.question || !candidate.prompt) return null;

  const kind = candidate.kind === "fill_blank" ? "fill_blank" : "multiple_choice";
  return {
    id: candidate.id ?? makeId(kind === "fill_blank" ? "fill" : "mc", candidate.targetWord ?? candidate.answer, index),
    kind,
    prompt: candidate.prompt,
    question: candidate.question,
    options: Array.isArray(candidate.options) ? candidate.options.filter((item): item is string => typeof item === "string") : [],
    answer: candidate.answer,
    targetWord: candidate.targetWord ?? candidate.answer,
    hint: candidate.hint,
    exampleSentence: candidate.exampleSentence,
  };
}

export function buildFallbackExercises(words: ExerciseSourceWord[], desiredCount = 5): FlashcardExercise[] {
  const pool = words.filter((item) => item.word.trim().length > 0 && item.meaning.trim().length > 0);
  if (pool.length === 0) return [];

  const exercises: FlashcardExercise[] = [];
  pool.slice(0, desiredCount).forEach((word, index) => {
    const exercise = index % 2 === 0
      ? fallbackMultipleChoice(word, pool, index)
      : fallbackFillBlank(word, index);

    exercises.push(exercise);
  });

  return exercises.slice(0, desiredCount);
}

export function parseExercisePayload(payload: string): FlashcardExercise[] {
  let parsed: unknown;

  try {
    const jsonMatch = payload.match(/\[[\s\S]*\]/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(payload);
  } catch {
    return [];
  }

  const raw = Array.isArray(parsed) ? parsed : [];
  const unique = raw
    .map((item, index) => normalizeExercise(item, index))
    .filter((item): item is FlashcardExercise => Boolean(item))
    .filter((item, index, arr) => arr.findIndex((other) => other.targetWord === item.targetWord) === index);

  return unique;
}

export function sortExercisesForADHD(exercises: FlashcardExercise[]) {
  const quick = exercises.filter((item) => item.kind === "multiple_choice");
  const reflective = exercises.filter((item) => item.kind === "fill_blank");
  return [...quick, ...reflective];
}

export function toExerciseSources(words: DailyFlashcard[]): ExerciseSourceWord[] {
  return words.map((item) => ({
    word: item.word,
    meaning: item.meaning,
    article: item.article,
    pos: item.pos,
    exampleSentences: item.exampleSentences,
  }));
}
