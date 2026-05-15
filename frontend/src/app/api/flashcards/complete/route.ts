import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { DailyFlashcard } from "@/lib/flashcards/types";
import { generateExercisesWithOllama } from "@/lib/flashcards/ollama";
import {
  buildFallbackExercises,
  parseExercisePayload,
  sortExercisesForADHD,
  toExerciseSources,
} from "@/lib/flashcards/exercises";

const DAILY_COUNT = 10;
const REVIEW_LIMIT = 5;

type CompletePayload = {
  words?: DailyFlashcard[];
};

function toDayUtc(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user && (session.user as { id?: string }).id);

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as CompletePayload;
  const day = toDayUtc();

  const todaySession = await prisma.dailySession.findUnique({
    where: { userId_date: { userId, date: day } },
    select: { wordsPayload: true, completedAt: true, exercisesPayload: true },
  });

  if (todaySession?.completedAt && Array.isArray(todaySession.exercisesPayload)) {
    return Response.json(
      { ok: true, saved: 0, exercises: todaySession.exercisesPayload },
      { status: 200 },
    );
  }

  const fallbackWords = Array.isArray(todaySession?.wordsPayload)
    ? (todaySession.wordsPayload as unknown as DailyFlashcard[])
    : [];

  const words = (body.words ?? fallbackWords)
    .filter((item) => item.word?.trim().length > 0)
    .slice(0, DAILY_COUNT)
    .map((item) => ({
      ...item,
      word: item.word.trim(),
      article: item.article ?? "",
      plural: item.plural ?? "",
      meaning: item.meaning ?? "",
      pos: item.pos ?? "",
      exampleSentences: item.exampleSentences ?? [],
      tags: item.tags ?? [],
    }));

  if (words.length === 0) {
    return Response.json({ error: "No words provided." }, { status: 400 });
  }

  await prisma.$transaction(
    words.map((item) =>
      prisma.word.upsert({
        where: {
          userId_word: {
            userId,
            word: item.word,
          },
        },
        create: {
          word: item.word,
          article: item.article,
          plural: item.plural,
          meaning: item.meaning,
          partOfSpeech: item.pos ?? "",
          exampleSentences: item.exampleSentences,
          tags: item.tags,
          seenInFlashcard: true,
          repetitionCount: 0,
          intervalDays: 0,
          easeFactor: 2.5,
          nextReviewAt: new Date(),
          lastReviewedAt: new Date(),
          user: {
            connect: { id: userId },
          },
        },
        update: {
          article: item.article,
          plural: item.plural,
          meaning: item.meaning,
          partOfSpeech: item.pos ?? "",
          exampleSentences: item.exampleSentences,
          tags: item.tags,
          seenInFlashcard: true,
          repetitionCount: 0,
          intervalDays: 0,
          easeFactor: 2.5,
          nextReviewAt: new Date(),
          lastReviewedAt: new Date(),
        },
      }),
    ),
  );

  const todaysWords = words.map((item) => item.word.toLowerCase());
  const reviewWords = await prisma.word.findMany({
    where: {
      userId,
      seenInFlashcard: true,
      word: { notIn: todaysWords },
      OR: [
        { nextReviewAt: { lte: new Date() } },
        { repetitionCount: { lt: 3 } },
      ],
    },
    orderBy: [{ nextReviewAt: "asc" }, { updatedAt: "desc" }],
    take: REVIEW_LIMIT,
    select: {
      word: true,
      article: true,
      meaning: true,
      partOfSpeech: true,
      exampleSentences: true,
    },
  });

  const exerciseSources = toExerciseSources(words).concat(
    reviewWords.map((item) => ({
      word: item.word,
      meaning: item.meaning,
      article: item.article,
      pos: item.partOfSpeech,
      exampleSentences: item.exampleSentences,
    })),
  );

  const ollamaExercises = await generateExercisesWithOllama(exerciseSources);
  const exercises = sortExercisesForADHD(
    ollamaExercises.length > 0 ? parseExercisePayload(ollamaExercises) : buildFallbackExercises(exerciseSources),
  );

  await prisma.dailySession.upsert({
    where: { userId_date: { userId, date: day } },
    create: {
      userId,
      date: day,
      generatedCount: words.length,
      completedCount: words.length,
      completedAt: new Date(),
      wordsPayload: words,
      exercisesPayload: exercises,
    },
    update: {
      completedCount: words.length,
      completedAt: new Date(),
      wordsPayload: words,
      exercisesPayload: exercises,
    },
  });

  return Response.json({ ok: true, saved: words.length, exercises }, { status: 200 });
}
