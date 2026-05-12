import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { DailyFlashcard } from "@/lib/flashcards/types";
import { fetchWordFromWiktapi } from "@/lib/flashcards/wiktapi";
import { pickRandomWords, randomCount } from "@/lib/flashcards/word-bank";

const MIN_DAILY_COUNT = 10;
const MAX_DAILY_COUNT = 15;
const MAX_ATTEMPTS = 60;

function toDayUtc(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toFlashcard(candidate: {
  word: string;
  meaning: string;
  article?: string;
  examples: string[];
  pos?: string;
}): DailyFlashcard {
  const pos = candidate.pos?.toLowerCase();
  const word = pos === "noun"
    ? candidate.word.trim().charAt(0).toUpperCase() + candidate.word.trim().slice(1).toLowerCase()
    : candidate.word.trim().toLowerCase();

  return {
    word,
    article: candidate.article || "—",
    meaning: candidate.meaning,
    pos,
    exampleSentences: candidate.examples,
    tags: [],
    plural: "",
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user && (session.user as { id?: string }).id);

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const day = toDayUtc();

  const targetCount = randomCount(MIN_DAILY_COUNT, MAX_DAILY_COUNT);

  // Check for existing unfinished session
  const existingSession = await prisma.dailySession.findUnique({
    where: { userId_date: { userId, date: day } },
    select: {
      completedAt: true,
      wordsPayload: true,
    },
  });

  if (
    existingSession &&
    !existingSession.completedAt &&
    Array.isArray(existingSession.wordsPayload) &&
    existingSession.wordsPayload.length >= MIN_DAILY_COUNT &&
    existingSession.wordsPayload.length <= MAX_DAILY_COUNT
  ) {
    return Response.json({ words: existingSession.wordsPayload, day, resumed: true }, { status: 200 });
  }

  // Fetch user's existing words to avoid duplicates
  const existingWords = await prisma.word.findMany({
    where: { userId },
    select: { word: true },
  });

  const blocked = new Set(existingWords.map((item) => item.word.toLowerCase()));

  const existingPayload = Array.isArray(existingSession?.wordsPayload)
    ? (existingSession.wordsPayload as DailyFlashcard[])
    : [];

  const selected: DailyFlashcard[] = [...existingPayload].slice(0, targetCount);
  for (const item of selected) {
    blocked.add(item.word.toLowerCase());
  }

  const candidateWords = pickRandomWords(targetCount * 6, blocked);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const write = (data: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(data)}\n`));
      };

      try {
        // Send any already-generated cards immediately.
        for (const card of selected) {
          write({ type: "word", word: card, count: selected.length });
        }

        let attempts = 0;
        let candidateIndex = 0;

        while (selected.length < targetCount && attempts < MAX_ATTEMPTS) {
          attempts += 1;

          const candidate = candidateWords[candidateIndex] ?? pickRandomWords(1, blocked)[0];
          candidateIndex += 1;

          if (!candidate) {
            continue;
          }

          const card = await fetchWordFromWiktapi(candidate);
          if (!card?.word || !card.meaning || !Array.isArray(card.exampleSentences)) {
            continue;
          }

          const normalized = card.word.trim().toLowerCase();
          if (blocked.has(normalized)) {
            continue;
          }

          const flashcard = toFlashcard({
            word: card.word,
            article: card.article,
            meaning: card.meaning,
            examples: card.exampleSentences,
            pos: card.pos,
          });

          selected.push(flashcard);
          blocked.add(normalized);

          await prisma.dailySession.upsert({
            where: { userId_date: { userId, date: day } },
            create: {
              userId,
              date: day,
              generatedCount: selected.length,
              completedCount: 0,
              completedAt: null,
              wordsPayload: selected,
            },
            update: {
              generatedCount: selected.length,
              completedCount: 0,
              completedAt: null,
              wordsPayload: selected,
            },
          });

          write({ type: "word", word: flashcard, count: selected.length });
        }

        if (selected.length === 0) {
          write({ type: "error", error: "Unable to load words from the list or dictionary API." });
          controller.close();
          return;
        }

        if (selected.length < targetCount) {
          write({
            type: "error",
            error: `Only generated ${selected.length}/${targetCount} valid new words. Try again later.`,
          });
          controller.close();
          return;
        }

        await prisma.dailySession.upsert({
          where: { userId_date: { userId, date: day } },
          create: {
            userId,
            date: day,
            generatedCount: targetCount,
            completedCount: 0,
            completedAt: null,
            wordsPayload: selected,
          },
          update: {
            generatedCount: targetCount,
            completedCount: 0,
            completedAt: null,
            wordsPayload: selected,
          },
        });

        write({ type: "done", words: selected, day });
      } catch (error) {
        write({
          type: "error",
          error: error instanceof Error ? error.message : "Failed to generate flashcards.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
