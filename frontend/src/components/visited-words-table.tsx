"use client";

import { useMemo, useState } from "react";

type VisitedWord = {
  id: number;
  word: string;
  article: string;
  meaning: string;
  partOfSpeech: string;
};

type Props = {
  initialWords: VisitedWord[];
};

export default function VisitedWordsTable({ initialWords }: Props) {
  const [words, setWords] = useState<VisitedWord[]>(initialWords);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [deleting, setDeleting] = useState(false);

  const allSelected = words.length > 0 && selectedIds.length === words.length;

  const selectedCount = useMemo(() => selectedIds.length, [selectedIds]);

  function toggleWord(id: number) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }

    setSelectedIds(words.map((item) => item.id));
  }

  async function deleteWords(ids: number[]) {
    if (ids.length === 0) return;

    setDeleting(true);
    try {
      const response = await fetch("/api/words", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      const payload = (await response.json()) as { deleted?: number; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to delete words.");
      }

      setWords((current) => current.filter((item) => !ids.includes(item.id)));
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to delete words.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={toggleAll}
          className="rounded-md border border-black/15 px-3 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          {allSelected ? "Unselect all" : "Select all"}
        </button>
        <button
          type="button"
          disabled={deleting || selectedCount === 0}
          onClick={() => deleteWords(selectedIds)}
          className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {deleting ? "Deleting…" : `Delete selected (${selectedCount})`}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/20">
        <table className="min-w-full divide-y divide-black/10 text-sm dark:divide-white/10">
          <thead className="bg-zinc-50 dark:bg-zinc-900/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all words" />
              </th>
              <th className="px-4 py-3 text-left font-medium">Word</th>
              <th className="px-4 py-3 text-left font-medium">Meaning</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              {/* <th className="px-4 py-3 text-left font-medium">Action</th> */}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/10">
            {words.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-zinc-500" colSpan={5}>
                  No visited words yet.
                </td>
              </tr>
            ) : (
              words.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleWord(item.id)}
                      aria-label={`Select ${item.word}`}
                    />
                  </td>
                  <td className="px-4 py-3">{item.partOfSpeech?.toLowerCase() === "noun" && item.article && item.article !== "—" ? `${item.article} ${item.word}` : item.word}</td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-200">{item.meaning}</td>
                  <td className="px-4 py-3 capitalize">{item.partOfSpeech || "unknown"}</td>
                  {/* <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() => deleteWords([item.id])}
                      className="rounded-md border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                    >
                      Delete
                    </button>
                  </td> */}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
