"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DailyFlashcard } from "@/lib/flashcards/types";

type FlashcardExercise = {
    id: string;
    kind: "multiple_choice" | "fill_blank" | "true_false" | "word_scramble";
    prompt: string;
    question: string;
    options: string[];
    answer: string;
    targetWord: string;
    hint?: string;
    exampleSentence?: string;
};

type ExerciseResult = {
    targetWord: string;
    correct: boolean;
};

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
    const [exercises, setExercises] = useState<FlashcardExercise[]>([]);
    const [exerciseIndex, setExerciseIndex] = useState(0);
    const [exerciseResults, setExerciseResults] = useState<Record<string, boolean>>({});
    const [exerciseInput, setExerciseInput] = useState("");
    const [exerciseDone, setExerciseDone] = useState(false);

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

    const currentExercise = exercises[exerciseIndex] ?? null;
    const exerciseCompletedCount = Object.keys(exerciseResults).length;
    const exerciseCorrectCount = Object.values(exerciseResults).filter(Boolean).length;
    const exerciseProgressPct = exercises.length > 0 ? Math.round((exerciseCompletedCount / exercises.length) * 100) : 0;

    function markExerciseResult(targetWord: string, correct: boolean) {
        setExerciseResults((current) => ({ ...current, [targetWord]: correct }));
    }

    function answerMultipleChoice(answer: string) {
        if (!currentExercise) return;
        if (exerciseResults[currentExercise.targetWord] !== undefined) return;

        const correct = answer === currentExercise.answer;
        markExerciseResult(currentExercise.targetWord, correct);
    }

    function checkFillBlank() {
        if (!currentExercise) return;
        if (exerciseResults[currentExercise.targetWord] !== undefined) return;

        const correct = exerciseInput.trim().toLowerCase() === currentExercise.answer.trim().toLowerCase();
        markExerciseResult(currentExercise.targetWord, correct);
    }

    function goToNextExercise() {
        setExerciseInput("");
        setExerciseIndex((current) => Math.min(current + 1, Math.max(exercises.length - 1, 0)));
    }

    async function finishExercises() {
        if (exerciseDone || exercises.length === 0) return;

        setSaving(true);
        try {
            const results: ExerciseResult[] = exercises.map((exercise) => ({
                targetWord: exercise.targetWord,
                correct: Boolean(exerciseResults[exercise.targetWord]),
            }));

            await fetch("/api/flashcards/exercises/complete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ results }),
            });

            setExerciseDone(true);
        } catch (error) {
            setError(error instanceof Error ? error.message : "Failed to save exercises.");
        } finally {
            setSaving(false);
        }
    }

    async function parseJsonResponse<T>(response: Response): Promise<T | null> {
        const text = await response.text();

        if (!text.trim()) {
            return null;
        }

        try {
            return JSON.parse(text) as T;
        } catch {
            return null;
        }
    }

    useEffect(() => {
        let cancelled = false;

        async function loadDailyCards() {
            setLoading(true);
            setError(null);
            setCards([]);
            setActiveIndex(0);
            setIsFlipped(false);
            setCompleted(false);
            setExercises([]);
            setExerciseIndex(0);
            setExerciseResults({});
            setExerciseInput("");
            setExerciseDone(false);

            try {
                const response = await fetch("/api/flashcards/daily", { method: "GET" });

                if (!response.ok) {
                    const payload = (await response.json()) as { error?: string };
                    throw new Error(payload.error ?? "Failed to load daily flashcards.");
                }

                const contentType = response.headers.get("content-type") ?? "";

                if (!response.body || !contentType.includes("application/x-ndjson")) {
                    const payload = (await response.json()) as {
                        words?: DailyFlashcard[];
                        exercises?: FlashcardExercise[];
                        completed?: boolean;
                        error?: string;
                    };
                    if (!response.ok) {
                        throw new Error(payload.error ?? "Failed to load daily flashcards.");
                    }

                    if (!cancelled) {
                        const words = payload.words ?? [];
                        setCompleted(Boolean(payload.completed));
                        setExercises(payload.exercises ?? []);
                        setExerciseIndex(0);
                        setExerciseResults({});
                        setExerciseInput("");
                        setExerciseDone(Boolean(payload.completed));
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

            const payload = (await parseJsonResponse<{
                error?: string;
                exercises?: FlashcardExercise[];
            }>(response)) ?? {};

            if (!response.ok) {
                throw new Error(payload.error ?? "Failed to complete session.");
            }

            setCompleted(true);
            setExercises(payload.exercises ?? []);
            setExerciseIndex(0);
            setExerciseResults({});
            setExerciseInput("");
            setExerciseDone(false);
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
            const payload = (await parseJsonResponse<{ translation?: string; error?: string }>(response)) ?? {};
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
        if (!window.confirm("Reset today's flashcards? Your saved word list will be kept.")) {
            return;
        }

        setSaving(true);
        setError(null);

        try {
            const response = await fetch("/api/flashcards/reset", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });

            const payload = (await parseJsonResponse<{ error?: string }>(response)) ?? {};

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
                                    {activeCard?.meanings && activeCard.meanings.length > 1 ? (
                                      <ol className="mt-2 space-y-1 text-left list-decimal list-inside">
                                        {activeCard.meanings.map((m, i) => (
                                          <li key={i} className="text-base font-medium leading-snug">{m}</li>
                                        ))}
                                      </ol>
                                    ) : (
                                      <p className="mt-2 text-2xl font-semibold">{activeCard?.meaning || "No meaning"}</p>
                                    )}
                                    
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
                                {activeCard?.meanings && activeCard.meanings.length > 1 ? (
                                  <ol className="mt-2 space-y-1 text-left list-decimal list-inside">
                                    {activeCard.meanings.map((m, i) => (
                                      <li key={i} className="text-base font-medium leading-snug">{m}</li>
                                    ))}
                                  </ol>
                                ) : (
                                  <p className="mt-2 text-2xl font-semibold">{activeCard?.meaning || "No meaning"}</p>
                                )}

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

            {completed && exercises.length > 0 && currentExercise && (
                <section className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/20 dark:bg-zinc-900">
                    <div className="mb-3 flex items-center justify-between text-xs text-zinc-500">
                        <span>Quick exercise</span>
                        <span>{exerciseCompletedCount}/{exercises.length}</span>
                    </div>

                    <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                        <div className="h-full rounded-full bg-black transition-all dark:bg-white" style={{ width: `${exerciseProgressPct}%` }} />
                    </div>

                    <p className="text-sm uppercase tracking-wide text-zinc-500">{currentExercise.prompt}</p>
                    <p className="mt-2 text-lg font-semibold">{currentExercise.question}</p>

                    {currentExercise.hint && (
                        <p className="mt-2 text-sm text-zinc-500">Hint: {currentExercise.hint}</p>
                    )}

                    {currentExercise.kind === "multiple_choice" || currentExercise.kind === "true_false" ? (
                        <div className="mt-4 grid gap-2">
                            {(currentExercise.options.length > 0 ? currentExercise.options : ["True", "False"]).map((option) => {
                                const answered = exerciseResults[currentExercise.targetWord] !== undefined;
                                const isCorrect = option === currentExercise.answer;
                                const wasChosenCorrect = answered && exerciseResults[currentExercise.targetWord] && isCorrect;
                                const wasChosenWrong = answered && !exerciseResults[currentExercise.targetWord] && option !== currentExercise.answer;

                                return (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => answerMultipleChoice(option)}
                                        disabled={answered}
                                        className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                                            wasChosenCorrect
                                                ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300"
                                                : wasChosenWrong
                                                    ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
                                                    : "border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                                        }`}
                                    >
                                        {option}
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="mt-4 flex gap-2">
                            <input
                                type="text"
                                value={exerciseInput}
                                onChange={(e) => setExerciseInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        checkFillBlank();
                                    }
                                }}
                                placeholder={currentExercise.kind === "word_scramble" ? "Type the unscrambled word" : "Type the missing word"}
                                className="flex-1 rounded-xl border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/40"
                                disabled={exerciseResults[currentExercise.targetWord] !== undefined}
                            />
                            <button
                                type="button"
                                onClick={checkFillBlank}
                                disabled={exerciseResults[currentExercise.targetWord] !== undefined}
                                className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
                            >
                                Check
                            </button>
                        </div>
                    )}

                    {exerciseResults[currentExercise.targetWord] !== undefined && (
                        <div className="mt-3 rounded-xl border border-black/10 bg-zinc-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5">
                            {exerciseResults[currentExercise.targetWord] ? "Correct ✓" : `Not quite — answer: ${currentExercise.answer}`}
                        </div>
                    )}

                    <div className="mt-4 flex items-center justify-between gap-2">
                        <p className="text-xs text-zinc-500">
                            Score: {exerciseCorrectCount}/{exerciseCompletedCount}
                        </p>
                        <button
                            type="button"
                            onClick={exerciseIndex >= exercises.length - 1 ? finishExercises : goToNextExercise}
                            disabled={exerciseResults[currentExercise.targetWord] === undefined}
                            className="rounded-xl border border-black/15 px-4 py-2 text-sm disabled:opacity-50 dark:border-white/20"
                        >
                            {exerciseIndex >= exercises.length - 1 ? (exerciseDone ? "Exercises saved" : "Finish exercises") : "Next"}
                        </button>
                    </div>
                </section>
            )}

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
                    {saving ? "Resetting…" : "Reset today"}
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