"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/",
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password");
      return;
    }

    window.location.href = result?.url ?? "/";
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6">
      <form
        onSubmit={onSubmit}
        className="w-full rounded-xl border border-black/10 p-6 shadow-sm dark:border-white/20"
      >
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Use your email and password.
        </p>

        <div className="mt-6 space-y-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-black/20 dark:border-white/20"
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-black/20 dark:border-white/20"
          />
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="mt-5 w-full rounded-md bg-black px-4 py-2 text-white disabled:opacity-60 dark:bg-white dark:text-black"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">
          No account yet?{" "}
          <Link href="/signup" className="underline">
            Create one
          </Link>
        </p>
      </form>
    </main>
  );
}
