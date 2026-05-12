import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user && (session.user as { id?: string }).id);

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const words = await prisma.word.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      word: true,
      article: true,
      meaning: true,
      partOfSpeech: true,
    },
  });

  return Response.json({ words }, { status: 200 });
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user && (session.user as { id?: string }).id);

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { ids?: number[]; id?: number };
  const ids = (Array.isArray(body.ids) ? body.ids : Number.isInteger(body.id) ? [body.id] : [])
    .filter((value): value is number => Number.isInteger(value));

  if (ids.length === 0) {
    return Response.json({ error: "No word ids provided." }, { status: 400 });
  }

  const result = await prisma.word.deleteMany({
    where: {
      userId,
      id: { in: ids },
    },
  });

  return Response.json({ ok: true, deleted: result.count }, { status: 200 });
}
