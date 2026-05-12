import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import VisitedWordsTable from "../../components/visited-words-table";

export default async function VisitedWordsPage() {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user && (session.user as { id?: string }).id);

  if (!userId) redirect("/login");

  const words = await prisma.word.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      word: true,
      article: true,
      meaning: true,
      tags: true,
      partOfSpeech: true,
    },
  });

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Visited words</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
        Words already saved in your database with meaning and type.
      </p>
      <VisitedWordsTable
        initialWords={words.map((item) => ({
          id: item.id,
          word: item.word,
          article: item.article,
          meaning: item.meaning,
          partOfSpeech: item.partOfSpeech,
        }))}
      />
    </main>
  );
}
