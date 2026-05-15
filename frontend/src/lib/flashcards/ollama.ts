const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "mistral-nemo:12b";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 8000);

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
    .map((line) => line.replace(/^[-•*\d.)\s]+/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 2);
}

export async function generateExamplesWithOllama(word: string, meaning: string) {
  const prompt = [
    "Generate exactly 2 short B1-level German example sentences for a flashcard.",
    `Word: ${word}`,
    `Meaning/Definition: ${meaning || "unknown"}`,
    "Output format: one sentence per line, no numbering, no labels, no markdown.",
    "Each sentence should use the word naturally.",
  ].join("\n")  ;

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
        options: {
          temperature: 0.7,
          top_p: 0.9,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) return [];

    const payload = (await response.json()) as OllamaGenerateResponse;
    if (!payload.response) return [];

    let lines = extractLines(payload.response)
      .filter((line) => line.length > 5 && line.length < 220);

    // If model returns a single paragraph, split into sentences.
    if (lines.length < 2) {
      const splitFromParagraph = payload.response
        .split(/(?<=[.!?])\s+/)
        .map((line) => line.replace(/^[-•*\d.)\s]+/, "").trim())
        .filter((line) => line.length > 5 && line.length < 220);

      lines = [...new Set([...lines, ...splitFromParagraph])].slice(0, 2);
    }

    return lines;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
