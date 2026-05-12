import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session) redirect("/login");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-16">
      <div>
        <p className="text-sm uppercase tracking-wide text-zinc-500">Home</p>
        <h1 className="mt-2 text-3xl font-semibold">Welcome{session.user?.name ? `, ${session.user.name}` : ""}</h1>
        
        
      </div>
    </main>
  );
}
