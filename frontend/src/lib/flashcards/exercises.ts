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
  kind: "multiple_choice" | "fill_blank" | "true_false" | "word_scramble";
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
    return `Heute üben wir das Verb ${word.word} in einer kurzen Übung.`;
  }

  if (pos === "adjective") {
    return `Die Aufgabe ist heute wirklich ${word.word}.`;
  }

  if (pos === "adverb") {
    return `Bitte antworte ${word.word} auf die Frage.`;
  }

  return `In dieser Übung passt ${display} gut zum Thema.`;
}

function scrambleText(value: string) {
  const chars = value.split("");
  if (chars.length <= 2) return value;

  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  const scrambled = chars.join("");
  return scrambled.toLowerCase() === value.toLowerCase() ? value.split("").reverse().join("") : scrambled;
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

function fallbackTrueFalse(word: ExerciseSourceWord, pool: ExerciseSourceWord[], index: number): FlashcardExercise {
  const useCorrectMeaning = Math.random() > 0.5 || pool.length < 2;
  const wrongSource = shuffle(pool.filter((item) => item.word !== word.word))[0];
  const shownMeaning = useCorrectMeaning ? word.meaning : (wrongSource?.meaning ?? word.meaning);

  return {
    id: makeId("tf", word.word, index),
    kind: "true_false",
    prompt: "True or false?",
    question: `${articlePrefix(word)} means: ${shownMeaning}`,
    options: ["True", "False"],
    answer: useCorrectMeaning ? "True" : "False",
    targetWord: word.word,
    hint: word.meaning,
  };
}

function fallbackWordScramble(word: ExerciseSourceWord, index: number): FlashcardExercise {
  return {
    id: makeId("scramble", word.word, index),
    kind: "word_scramble",
    prompt: "Unscramble the word.",
    question: scrambleText(word.word),
    options: [],
    answer: word.word,
    targetWord: word.word,
    hint: word.meaning,
  };
}

function normalizeExercise(input: unknown, index: number): FlashcardExercise | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<FlashcardExercise>;
  if (!candidate.targetWord) return null;
  if (!candidate.answer || !candidate.question || !candidate.prompt) return null;

  const kind =
    candidate.kind === "fill_blank" ||
    candidate.kind === "true_false" ||
    candidate.kind === "word_scramble"
      ? candidate.kind
      : "multiple_choice";

  const options = Array.isArray(candidate.options)
    ? candidate.options.filter((item): item is string => typeof item === "string")
    : [];

  const normalizedOptions = kind === "true_false" && options.length === 0
    ? ["True", "False"]
    : options;

  const normalizedAnswer =
    kind === "true_false"
      ? (candidate.answer.toLowerCase() === "true" ? "True" : "False")
      : candidate.answer;

  return {
    id: candidate.id ?? makeId(kind, candidate.targetWord ?? candidate.answer, index),
    kind,
    prompt: candidate.prompt,
    question: candidate.question,
    options: normalizedOptions,
    answer: normalizedAnswer,
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
    const mode = index % 4;
    const exercise =
      mode === 0
        ? fallbackMultipleChoice(word, pool, index)
        : mode === 1
          ? fallbackFillBlank(word, index)
          : mode === 2
            ? fallbackTrueFalse(word, pool, index)
            : fallbackWordScramble(word, index);

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
  const quick = exercises.filter((item) => item.kind === "multiple_choice" || item.kind === "true_false");
  const medium = exercises.filter((item) => item.kind === "word_scramble");
  const reflective = exercises.filter((item) => item.kind === "fill_blank");
  return [...quick, ...medium, ...reflective];
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
