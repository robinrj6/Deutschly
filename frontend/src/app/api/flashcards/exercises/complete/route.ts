import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { nextSm2State, type Sm2State } from "@/lib/flashcards/sm2";

type ExerciseResult = {
  targetWord?: string;
  correct?: boolean;
};

type CompleteExercisesPayload = {
  results?: ExerciseResult[];
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

  const body = (await request.json()) as CompleteExercisesPayload;
  const results = (body.results ?? []).filter(
    (item): item is Required<Pick<ExerciseResult, "targetWord" | "correct">> =>
      typeof item.targetWord === "string" && typeof item.correct === "boolean",
  );

  if (results.length === 0) {
    return Response.json({ error: "No exercise results provided." }, { status: 400 });
  }

  const now = new Date();
  const currentWords = await prisma.word.findMany({
    where: {
      userId,
      word: { in: results.map((item) => item.targetWord) },
    },
    select: {
      word: true,
      repetitionCount: true,
      intervalDays: true,
      easeFactor: true,
      nextReviewAt: true,
    } as any,
  }) as unknown as Array<{
    word: string;
    repetitionCount: number;
    intervalDays: number;
    easeFactor: number;
    nextReviewAt: Date | null;
  }>;

  const stateByWord = new Map(
    currentWords.map((item) => [
      item.word,
      {
        repetitionCount: item.repetitionCount,
        intervalDays: item.intervalDays,
        easeFactor: item.easeFactor,
        nextReviewAt: item.nextReviewAt,
      },
    ]),
  );

  const updates = results.map((result) => {
    const current: Sm2State = stateByWord.get(result.targetWord) ?? {
      repetitionCount: 0,
      intervalDays: 0,
      easeFactor: 2.5,
      nextReviewAt: null,
    };

    const next = nextSm2State(current, result.correct ? 5 : 2, now);

    return prisma.word.updateMany({
      where: {
        userId,
        word: result.targetWord,
      },
      data: {
        seenInFlashcard: true,
        repetitionCount: next.repetitionCount,
        intervalDays: next.intervalDays,
        easeFactor: next.easeFactor,
        nextReviewAt: next.nextReviewAt,
        lastReviewedAt: now,
      } as any,
    });
  });

  await prisma.$transaction(updates);

  const day = toDayUtc();
  await prisma.dailySession.updateMany({
    where: { userId, date: day },
    data: { completedCount: results.length },
  });

  return Response.json({ ok: true, updated: results.length }, { status: 200 });
}
