import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { DailyFlashcard } from "@/lib/flashcards/types";
import { fetchWordFromWiktapi } from "@/lib/flashcards/wiktapi";
import { pickRandomWords } from "@/lib/flashcards/word-bank";

type ReplacePayload = {
  words?: DailyFlashcard[];
  index?: number;
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

  const body = (await request.json()) as ReplacePayload;
  const day = toDayUtc();

  const todaySession = await prisma.dailySession.findUnique({
    where: { userId_date: { userId, date: day } },
    select: { completedAt: true, wordsPayload: true },
  });

  if (todaySession?.completedAt) {
    return Response.json({ error: "Session already completed." }, { status: 409 });
  }

  const sessionWords = Array.isArray(todaySession?.wordsPayload)
    ? (todaySession.wordsPayload as unknown as DailyFlashcard[])
    : [];

  const words = (body.words && body.words.length > 0 ? body.words : sessionWords).slice(0, 10);

  if (words.length === 0) {
    return Response.json({ error: "No active flashcards found." }, { status: 400 });
  }

  const requestedIndex = Number.isInteger(body.index) ? Number(body.index) : 0;
  const safeIndex = Math.min(Math.max(requestedIndex, 0), words.length - 1);

  const existingWords = await prisma.word.findMany({
    where: { userId },
    select: { word: true },
  });

  const exclude = new Set(existingWords.map((item) => item.word.toLowerCase()));
  for (const item of words) {
    exclude.add(item.word.toLowerCase());
  }

  const oldWord = words[safeIndex]?.word?.toLowerCase();
  if (oldWord) {
    exclude.delete(oldWord);
  }

  let replacement: DailyFlashcard | null = null;
  const candidates = pickRandomWords(40, exclude);

  for (const candidate of candidates) {
    const card = await fetchWordFromWiktapi(candidate);
    if (!card?.word) continue;

    const normalized = card.word.trim().toLowerCase();
    if (!exclude.has(normalized)) {
      replacement = {
        word: card.word,
        article: card.article || "—",
        meaning: card.meaning,
        pos: card.pos,
        exampleSentences: card.exampleSentences,
        tags: card.tags ?? [],
        plural: card.plural ?? "",
      };
      break;
    }
  }

  if (!replacement) {
    return Response.json(
      { error: "Could not find a replacement word from the word list." },
      { status: 503 }
    );
  }

  const updatedWords = [...words];
  updatedWords[safeIndex] = replacement;

  await prisma.dailySession.upsert({
    where: { userId_date: { userId, date: day } },
    create: {
      userId,
      date: day,
      generatedCount: updatedWords.length,
      wordsPayload: updatedWords,
      completedCount: 0,
      completedAt: null,
    },
    update: {
      wordsPayload: updatedWords,
    },
  });

  return Response.json({ words: updatedWords }, { status: 200 });
}
