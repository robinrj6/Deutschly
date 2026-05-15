"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DailyFlashcard } from "@/lib/flashcards/types";

export default function Flashcards() {
    const [cards, setCards] = useState<DailyFlashcard[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [replacing, setReplacing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [completed, setCompleted] = useState(false);
    const [translatingIndex, setTranslatingIndex] = useState<number | null>(null);

    const hasCards = cards.length > 0;
    const activeCard = hasCards ? cards[activeIndex] : null;
    const isLastCard = activeIndex === cards.length - 1;
    const cardsLeft = cards.length - (activeIndex + 1);
    const progressPct = cards.length > 0 ? Math.round(((activeIndex + 1) / cards.length) * 100) : 0;

    const frontText = useMemo(() => {
        if (!activeCard) return "";
        if (activeCard.pos?.toLowerCase() === "noun" && activeCard.article) {
            return `${activeCard.article} ${activeCard.word}`;
        }

        return activeCard.word;
    }, [activeCard]);

    const wordTypeLabel = useMemo(() => {
        if (!activeCard?.pos) return "Unknown";
        const lowercased = activeCard.pos.toLowerCase();
        // Capitalize first letter of the POS type
        return lowercased.charAt(0).toUpperCase() + lowercased.slice(1);
    }, [activeCard]);

    useEffect(() => {
        let cancelled = false;

        async function loadDailyCards() {
            setLoading(true);
            setError(null);
            setCards([]);
            setActiveIndex(0);
            setIsFlipped(false);
            setCompleted(false);

            try {
                const response = await fetch("/api/flashcards/daily", { method: "GET" });

                if (!response.ok) {
                    const payload = (await response.json()) as { error?: string };
                    throw new Error(payload.error ?? "Failed to load daily flashcards.");
                }

                const contentType = response.headers.get("content-type") ?? "";

                if (!response.body || !contentType.includes("application/x-ndjson")) {
                    const payload = (await response.json()) as { words?: DailyFlashcard[]; error?: string };
                    if (!response.ok) {
                        throw new Error(payload.error ?? "Failed to load daily flashcards.");
                    }

                    if (!cancelled) {
                        const words = payload.words ?? [];
                        setCards(words);
                        // Restore saved position
                        const saved = sessionStorage.getItem("flashcard-index");
                        if (saved !== null) {
                            const idx = Number(saved);
                            if (idx > 0 && idx < words.length) setActiveIndex(idx);
                        }
                    }
                    return;
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                let receivedAnyWord = false;
                let nextCards: DailyFlashcard[] = [];

                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() ?? "";

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;

                        const event = JSON.parse(trimmed) as {
                            type?: string;
                            word?: DailyFlashcard;
                            words?: DailyFlashcard[];
                            error?: string;
                            resumed?: boolean;
                        };

                        if (event.type === "error") {
                            throw new Error(event.error ?? "Failed to load daily flashcards.");
                        }

                        if (event.type === "word" && event.word) {
                            nextCards = [...nextCards, event.word];
                            receivedAnyWord = true;

                            if (!cancelled) {
                                setCards(nextCards);
                                setCompleted(false);
                                if (nextCards.length === 1) {
                                    setLoading(false);
                                }
                            }
                        }

                        if (event.type === "done") {
                            if (!cancelled) {
                                const finalCards = event.words ?? nextCards;
                                setCards(finalCards);
                                setCompleted(false);
                                // Restore saved position on done
                                const saved = sessionStorage.getItem("flashcard-index");
                                if (saved !== null) {
                                    const idx = Number(saved);
                                    if (idx > 0 && idx < finalCards.length) setActiveIndex(idx);
                                }
                            }
                        }
                    }
                }

                if (!receivedAnyWord) {
                    throw new Error("Failed to load daily flashcards.");
                }

                if (!cancelled) {
                    setCards(nextCards);
                }
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : "Failed to load flashcards.");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        void loadDailyCards();

        return () => {
            cancelled = true;
        };
    }, []);

    const goToPrevious = useCallback(() => {
        if (!hasCards) return;
        setIsFlipped(false);
        setActiveIndex((prev) => (prev - 1 + cards.length) % cards.length);
    }, [hasCards, cards.length]);

    const goToNext = useCallback(() => {
        if (!hasCards) return;
        setIsFlipped(false);
        setActiveIndex((prev) => (prev + 1) % cards.length);
    }, [hasCards, cards.length]);

    // Persist active index so position is restored on revisit
    useEffect(() => {
        if (!loading) sessionStorage.setItem("flashcard-index", String(activeIndex));
    }, [activeIndex, loading]);

    // Keyboard shortcuts
    useEffect(() => {
        function handleKey(e: KeyboardEvent) {
            const tag = (e.target as HTMLElement).tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
            if (e.key === "ArrowRight") { e.preventDefault(); goToNext(); }
            else if (e.key === "ArrowLeft") { e.preventDefault(); goToPrevious(); }
            else if (e.key === " ") { e.preventDefault(); setIsFlipped((f) => !f); }
        }
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [goToNext, goToPrevious]);

    async function completeSession() {
        if (!hasCards || completed) return;

        setSaving(true);
        setError(null);

        try {
            const response = await fetch("/api/flashcards/complete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ words: cards }),
            });

            const payload = (await response.json()) as { error?: string };

            if (!response.ok) {
                throw new Error(payload.error ?? "Failed to complete session.");
            }

            setCompleted(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to complete session.");
        } finally {
            setSaving(false);
        }
    }

    async function replaceCurrentWord() {
        if (!hasCards || replacing || completed) return;

        setReplacing(true);
        setError(null);

        try {
            const response = await fetch("/api/flashcards/replace", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ words: cards, index: activeIndex }),
            });

            const payload = (await response.json()) as {
                error?: string;
                words?: DailyFlashcard[];
                index?: number;
            };

            if (!response.ok) {
                throw new Error(payload.error ?? "Failed to replace current word.");
            }

            if (payload.words && payload.words.length > 0) {
                setCards(payload.words);
                if (typeof payload.index === "number") {
                    setActiveIndex(payload.index);
                }
                setIsFlipped(false);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to replace current word.");
        } finally {
            setReplacing(false);
        }
    }

    async function translateSentence(sentence: string, index: number) {
        if (translatingIndex !== null) return;
        
        setTranslatingIndex(index);
        try {
            const response = await fetch("/api/translate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sentence }),
            });
            const payload = (await response.json()) as { translation?: string; error?: string };
            if (response.ok && payload.translation) {
                alert(`Translation: ${payload.translation}`);
            }
        } catch (e) {
            console.error("Translation failed:", e);
        } finally {
            setTranslatingIndex(null);
        }
    }

    async function resetSession() {
        if (!window.confirm("Clear all words and today's flashcards? This will create a fresh stack.")) {
            return;
        }

        setSaving(true);
        setError(null);

        try {
            const response = await fetch("/api/flashcards/reset", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });

            const payload = (await response.json()) as { error?: string };

            if (!response.ok) {
                throw new Error(payload.error ?? "Failed to reset session.");
            }

            // Reload page to get fresh cards
            window.location.reload();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to reset session.");
            setSaving(false);
        }
    }

    if (loading) {
        if (hasCards) {
            return (
                <section className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 py-8">
                    <div className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-zinc-600 dark:border-white/10 dark:bg-white/10 dark:text-zinc-300">
                        Generating more cards…
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsFlipped((prev) => !prev)}
                        className="h-64 w-full max-w-md rounded-2xl text-left"
                        style={{ perspective: "1200px" }}
                        aria-label="Flip flashcard"
                    >
                        <div
                            className="relative h-full w-full rounded-2xl transition-transform duration-500"
                            style={{
                                transformStyle: "preserve-3d",
                                transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                            }}
                        >
                            <div
                                className="absolute inset-0 flex items-center justify-center rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/20 dark:bg-zinc-900"
                                style={{ backfaceVisibility: "hidden" }}
                            >
                                <div className="text-center">
                                    <p className="text-xs uppercase tracking-wide text-zinc-500">Type: {wordTypeLabel}</p>
                                    <p className="mt-2 text-3xl font-semibold">{frontText}</p>
                                </div>
                            </div>

                            <div
                                className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-black/10 bg-black p-6 text-white shadow-sm dark:border-white/20"
                                style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                            >
                                <div className="w-full text-center">
                                    <p className="text-xs uppercase tracking-wide text-zinc-300">Back</p>
                                    <p className="mt-2 text-2xl font-semibold">{activeCard?.meaning || "No meaning"}</p>
                                    
                                    {(activeCard?.exampleSentences?.length ?? 0) > 0 && (
                                        <div className="mt-4 space-y-2">
                                            <p className="text-xs uppercase tracking-wide text-zinc-400">Examples</p>
                                            {activeCard?.exampleSentences?.map((sentence, idx) => (
                                                <div key={idx} className="flex items-start gap-2">
                                                    <p className="text-sm text-zinc-200 flex-1">{sentence}</p>
                                                    <div
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            void translateSentence(sentence, idx);
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter" || e.key === " ") {
                                                                e.stopPropagation();
                                                                void translateSentence(sentence, idx);
                                                            }
                                                        }}
                                                        className="mt-1 flex-shrink-0 cursor-pointer text-lg hover:opacity-70 disabled:opacity-50 transition-opacity"
                                                        title="Translate sentence"
                                                        aria-label="Translate sentence"
                                                    >
                                                        <img
                                                            src="../translate.svg"
                                                            alt="Translate"
                                                            className={`h-5 w-5 brightness-0 invert ${translatingIndex === idx ? "animate-spin" : ""}`}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </button>
                </section>
            );
        }

        return (
            <div className="flex w-full items-center justify-center py-16">
                <div className="flex flex-col items-center gap-2">
                    <p className="text-sm text-zinc-500">Generating your daily flashcards…</p>
                    <div className="h-1 w-32 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                        <div className="h-full w-1/3 animate-pulse bg-black dark:bg-white" />
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex w-full flex-col items-center justify-center gap-3 py-16">
                <p className="text-sm text-red-600">{error}</p>
                <button
                    type="button"
                    className="rounded-md border border-black/15 px-4 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                    onClick={() => window.location.reload()}
                >
                    Retry
                </button>
            </div>
        );
    }

    if (!hasCards) {
        return (
            <div className="flex w-full items-center justify-center py-16">
                <p className="text-sm text-zinc-500">No flashcards available.</p>
            </div>
        );
    }

    return (
        <section className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 py-8">
            {/* Progress bar */}
            <div className="w-full max-w-md">
                <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                    <span>Card {activeIndex + 1} of {cards.length}</span>
                    <span className="font-medium">
                        {cardsLeft === 0 ? "Last card! 🎉" : `${cardsLeft} card${cardsLeft === 1 ? "" : "s"} left`}
                    </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                        className="h-full rounded-full bg-black transition-all duration-300 dark:bg-white"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>
            </div>

            {/* Card row with side arrows */}
            <div className="flex w-full max-w-xl items-center gap-2">
                <button
                    type="button"
                    onClick={goToPrevious}
                    aria-label="Previous card"
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-black/15 text-xl transition hover:bg-black/5 active:scale-95 dark:border-white/20 dark:hover:bg-white/10"
                >
                    <img src="../chevron-left.svg" alt="Previous" className="h-4 w-4 brightness-0 invert" /> 
                </button>

                <button
                    type="button"
                    onClick={() => setIsFlipped((prev) => !prev)}
                    className="h-64 flex-1 rounded-2xl text-left"
                    style={{ perspective: "1200px" }}
                    aria-label="Flip flashcard"
                >
                    <div
                        className="relative h-full w-full rounded-2xl transition-transform duration-500"
                        style={{
                            transformStyle: "preserve-3d",
                            transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                        }}
                    >
                        <div
                            className="absolute inset-0 flex items-center justify-center rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/20 dark:bg-zinc-900"
                            style={{ backfaceVisibility: "hidden" }}
                        >
                            <div className="text-center">
                                <p className="text-xs uppercase tracking-wide text-zinc-500">Type: {wordTypeLabel}</p>
                                <p className="mt-2 text-3xl font-semibold">{frontText}</p>
                            </div>
                        </div>

                        <div
                            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-black/10 bg-black p-6 text-white shadow-sm dark:border-white/20"
                            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                        >
                            <div className="w-full text-center">
                                <p className="text-xs uppercase tracking-wide text-zinc-300">Meaning</p>
                                <p className="mt-2 text-2xl font-semibold">{activeCard?.meaning || "No meaning"}</p>

                                {(activeCard?.exampleSentences?.length ?? 0) > 0 && (
                                    <div className="mt-4 space-y-2">
                                        <p className="text-xs uppercase tracking-wide text-zinc-400">Examples</p>
                                        {activeCard?.exampleSentences?.map((sentence, idx) => (
                                            <div key={idx} className="flex items-start gap-2">
                                                <p className="text-sm text-zinc-200 flex-1">{sentence}</p>
                                                <div
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        void translateSentence(sentence, idx);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter" || e.key === " ") {
                                                            e.stopPropagation();
                                                            void translateSentence(sentence, idx);
                                                        }
                                                    }}
                                                    className="mt-1 flex-shrink-0 cursor-pointer text-lg hover:opacity-70 transition-opacity"
                                                    title="Translate sentence"
                                                    aria-label="Translate sentence"
                                                >
                                                    <img
                                                        src="../translate.svg"
                                                        alt="Translate"
                                                        className={`h-5 w-5 brightness-0 invert ${translatingIndex === idx ? "animate-spin" : ""}`}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </button>

                <button
                    type="button"
                    onClick={goToNext}
                    aria-label="Next card"
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-black/15 text-xl transition hover:bg-black/5 active:scale-95 dark:border-white/20 dark:hover:bg-white/10"
                >
                    <img src="../chevron-right.svg" alt="Next" className="h-4 w-4 brightness-0 invert" />
                </button>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={replaceCurrentWord}
                    disabled={replacing || completed}
                    className="rounded-md border border-black/15 px-4 py-2 text-sm disabled:opacity-60 dark:border-white/20"
                >
                    {replacing ? "Replacing…" : "New word"}
                </button>

                <button
                    type="button"
                    disabled={saving || completed}
                    onClick={completeSession}
                    className="rounded-md border border-black/15 px-4 py-2 text-sm disabled:opacity-60 dark:border-white/20"
                >
                    {completed ? "Session completed ✓" : saving ? "Saving…" : isLastCard ? "Complete session" : "Complete anyway"}
                </button>

                <button
                    type="button"
                    disabled={saving}
                    onClick={resetSession}
                    className="rounded-md border border-red-200/50 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-800/50 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                    {saving ? "Clearing…" : "Reset"}
                </button>
            </div>

            {/* Keyboard shortcuts footer */}
            <div className="mt-2 flex items-center gap-4 rounded-xl border border-black/8 bg-zinc-50 px-5 py-2.5 text-xs text-zinc-400 dark:border-white/8 dark:bg-zinc-900/60">
                <span><kbd className="rounded bg-black/8 px-1.5 py-0.5 font-mono dark:bg-white/10">←</kbd> Prev</span>
                <span><kbd className="rounded bg-black/8 px-1.5 py-0.5 font-mono dark:bg-white/10">→</kbd> Next</span>
                <span><kbd className="rounded bg-black/8 px-1.5 py-0.5 font-mono dark:bg-white/10">Space</kbd> Flip</span>
            </div>
        </section>
    );
}