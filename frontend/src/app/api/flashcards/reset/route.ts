import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user && (session.user as { id?: string }).id);

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Delete today's daily session only.
    // Keep the user's cumulative word history intact.
    const today = new Date(Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate()
    ));

    await prisma.dailySession.deleteMany({
      where: {
        userId,
        date: today,
      },
    });

    return Response.json({ success: true, message: "Cleared today's session" }, { status: 200 });
  } catch (error) {
    console.error("Error clearing today's session:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
