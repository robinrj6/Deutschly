import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export default async function HomeRedirect() {
  const session = await getServerSession(authOptions);

  if (!session) redirect("/login");

  redirect("/home");
}
