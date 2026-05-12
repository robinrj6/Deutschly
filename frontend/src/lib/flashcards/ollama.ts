const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "mistral-nemo:12b";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 4000);

type OllamaGenerateResponse = {
  response?: string;
};

export type GeneratedWord = {
  word: string;
  meaning: string;
  article?: string;
  examples: string[];
  pos?: string; // Part of speech: noun, verb, adjective, adverb, etc.
};

function extractLines(text: string) {
  return text
    .split("\n")
    .map((line) => line.replace(/^[-\d.)\s]+/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 2);
}

export async function generateExamplesWithOllama(word: string, meaning: string) {
  const prompt = [
    "Generate 2 short B1-level German example sentences for a flashcard.",
    `Word: ${word}`,
    `Meaning: ${meaning || "N/A"}`,
    "Rules:",
    "- Return plain text only",
    "- One sentence per line",
    "- No numbering, no explanations",
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) return [];

    const payload = (await response.json()) as OllamaGenerateResponse;
    if (!payload.response) return [];

    return extractLines(payload.response);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
