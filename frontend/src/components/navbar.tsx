"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";

export default function Navbar() {
	const { data: session, status } = useSession();
	const [menuOpen, setMenuOpen] = useState(false);

	const isLoggedIn = status === "authenticated";

	return (
		<header className="sticky top-0 z-50 border-b border-black/10 bg-white/90 backdrop-blur dark:border-white/10 dark:bg-zinc-950/90">
			<div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
				<Link href="/home" className="text-lg font-semibold tracking-tight">
					Deutschly
				</Link>

				<button
					type="button"
					className="inline-flex items-center rounded-md border border-black/10 px-3 py-2 text-sm md:hidden dark:border-white/10"
					aria-label="Toggle menu"
					aria-expanded={menuOpen}
					onClick={() => setMenuOpen((open) => !open)}
				>
					Menu
				</button>

				<nav className="hidden items-center gap-3 md:flex">
					<Link href="/home" className="rounded-md px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10">
						Home
					</Link>

					{isLoggedIn ? (
						<>
							<div className="hidden max-w-[220px] truncate text-sm text-zinc-600 md:block dark:text-zinc-300">
								{session?.user?.email ?? session?.user?.name}
							</div>
							<button
								type="button"
								onClick={() => signOut({ callbackUrl: "/login" })}
								className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 dark:bg-white dark:text-black"
							>
								Logout
							</button>
						</>
					) : (
						<>
							<Link
								href="/login"
								className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 dark:bg-white dark:text-black"
							>
								Login
							</Link>
							<Link
								href="/signup"
								className="rounded-md px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
							>
								Sign up
							</Link>
						</>
					)}
				</nav>
			</div>

			{menuOpen ? (
				<nav className="border-t border-black/10 px-4 py-3 md:hidden dark:border-white/10">
					<div className="flex flex-col gap-2">
						<Link
							href="/home"
							className="rounded-md px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
							onClick={() => setMenuOpen(false)}
						>
							Home
						</Link>

						{isLoggedIn ? (
							<>
								<div className="px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300">
									{session?.user?.email ?? session?.user?.name}
								</div>
								<button
									type="button"
									onClick={() => signOut({ callbackUrl: "/login" })}
									className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 dark:bg-white dark:text-black"
								>
									Logout
								</button>
							</>
						) : (
							<>
								<Link
									href="/login"
									className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 dark:bg-white dark:text-black"
									onClick={() => setMenuOpen(false)}
								>
									Login
								</Link>
								<Link
									href="/signup"
									className="rounded-md px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
									onClick={() => setMenuOpen(false)}
								>
									Sign up
								</Link>
							</>
						)}
					</div>
				</nav>
			) : null}
		</header>
	);
}

