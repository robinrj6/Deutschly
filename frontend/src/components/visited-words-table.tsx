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

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const ALL_TYPES = "all";

export default function VisitedWordsTable({ initialWords }: Props) {
  const [words, setWords] = useState<VisitedWord[]>(initialWords);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState(ALL_TYPES);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Unique POS types from data
  const posTypes = useMemo(() => {
    const types = new Set(words.map((w) => w.partOfSpeech?.toLowerCase()).filter(Boolean));
    return Array.from(types).sort();
  }, [words]);

  // Filtered + searched words
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return words.filter((w) => {
      const matchesType = filterType === ALL_TYPES || (w.partOfSpeech?.toLowerCase() ?? "") === filterType;
      const matchesSearch =
        !q ||
        w.word.toLowerCase().includes(q) ||
        w.meaning.toLowerCase().includes(q);
      return matchesType && matchesSearch;
    });
  }, [words, search, filterType]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const allPageSelected =
    paginated.length > 0 && paginated.every((w) => selectedIds.includes(w.id));
  const selectedCount = selectedIds.length;

  function toggleWord(id: number) {
    setSelectedIds((cur) =>
      cur.includes(id) ? cur.filter((i) => i !== id) : [...cur, id],
    );
  }

  function togglePageSelect() {
    if (allPageSelected) {
      setSelectedIds((cur) => cur.filter((id) => !paginated.some((w) => w.id === id)));
    } else {
      const toAdd = paginated.map((w) => w.id).filter((id) => !selectedIds.includes(id));
      setSelectedIds((cur) => [...cur, ...toAdd]);
    }
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
      if (!response.ok) throw new Error(payload.error ?? "Failed to delete words.");
      setWords((cur) => cur.filter((w) => !ids.includes(w.id)));
      setSelectedIds((cur) => cur.filter((id) => !ids.includes(id)));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to delete words.");
    } finally {
      setDeleting(false);
    }
  }

  function handleFilterChange(type: string) {
    setFilterType(type);
    setPage(1);
  }

  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {/* Search + Type filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search word or meaning…"
          className="min-w-[180px] flex-1 rounded-md border border-black/15 bg-white px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-black/40 dark:border-white/20 dark:bg-zinc-900 dark:focus:border-white/40"
        />

        {/* Type filter dropdown */}
        <select
          value={filterType}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:bg-zinc-900 dark:focus:border-white/40"
        >
          <option value={ALL_TYPES}>All types</option>
          {posTypes.map((type) => (
            <option key={type} value={type} className="capitalize">
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Bulk actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={togglePageSelect}
          className="rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          {allPageSelected ? "Deselect page" : "Select page"}
        </button>
        <button
          type="button"
          disabled={deleting || selectedCount === 0}
          onClick={() => deleteWords(selectedIds)}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {deleting ? "Deleting…" : `Delete selected (${selectedCount})`}
        </button>
        <span className="ml-auto text-xs text-zinc-500">
          {filtered.length} word{filtered.length !== 1 ? "s" : ""} found
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/20">
        <table className="min-w-full divide-y divide-black/10 text-sm dark:divide-white/10">
          <thead className="bg-zinc-50 dark:bg-zinc-900/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={togglePageSelect}
                  aria-label="Select all on page"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium">Word</th>
              <th className="px-4 py-3 text-left font-medium">Meaning</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/10">
            {paginated.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-zinc-500" colSpan={4}>
                  {words.length === 0 ? "No visited words yet." : "No words match your filters."}
                </td>
              </tr>
            ) : (
              paginated.map((item) => (
                <tr key={item.id} className={selectedIds.includes(item.id) ? "bg-zinc-50 dark:bg-zinc-900/40" : ""}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleWord(item.id)}
                      aria-label={`Select ${item.word}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {item.partOfSpeech?.toLowerCase() === "noun" && item.article && item.article !== "—"
                      ? `${item.article} ${item.word}`
                      : item.word}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-200">{item.meaning}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-black/10 px-2 py-0.5 text-xs capitalize dark:border-white/15">
                      {item.partOfSpeech || "unknown"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 text-zinc-500">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="rounded-md border border-black/15 bg-white px-2 py-1 text-sm dark:border-white/20 dark:bg-zinc-900"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={safePage === 1}
            onClick={() => setPage(1)}
            className="rounded-md border border-black/15 px-2 py-1 disabled:opacity-40 dark:border-white/20"
            aria-label="First page"
          >
            «
          </button>
          <button
            type="button"
            disabled={safePage === 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border border-black/15 px-2 py-1 disabled:opacity-40 dark:border-white/20"
            aria-label="Previous page"
          >
            ‹
          </button>

          {/* Page number pills */}
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((n) => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
            .reduce<(number | "…")[]>((acc, n, i, arr) => {
              if (i > 0 && (n as number) - (arr[i - 1] as number) > 1) acc.push("…");
              acc.push(n);
              return acc;
            }, [])
            .map((item, i) =>
              item === "…" ? (
                <span key={`ellipsis-${i}`} className="px-1 text-zinc-400">…</span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPage(item as number)}
                  className={`min-w-[2rem] rounded-md border px-2 py-1 ${
                    safePage === item
                      ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                      : "border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                  }`}
                >
                  {item}
                </button>
              )
            )}

          <button
            type="button"
            disabled={safePage === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-black/15 px-2 py-1 disabled:opacity-40 dark:border-white/20"
            aria-label="Next page"
          >
            ›
          </button>
          <button
            type="button"
            disabled={safePage === totalPages}
            onClick={() => setPage(totalPages)}
            className="rounded-md border border-black/15 px-2 py-1 disabled:opacity-40 dark:border-white/20"
            aria-label="Last page"
          >
            »
          </button>
        </div>

        <span className="text-zinc-500">
          Page {safePage} of {totalPages}
        </span>
      </div>
    </div>
  );
}
