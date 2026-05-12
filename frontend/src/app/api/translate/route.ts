const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "mistral-nemo:12b";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 4000);

type OllamaGenerateResponse = {
  response?: string;
};

export async function POST(req: Request) {
  try {
    const body = await req.json() as { sentence?: string };
    const sentence = body.sentence?.trim();

    if (!sentence) {
      return Response.json({ error: "Sentence required" }, { status: 400 });
    }

    const prompt = `Translate this German sentence to English. Provide ONLY the English translation, nothing else.

German: ${sentence}

English:`;

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

      if (!response.ok) {
        return Response.json(
          { error: "Failed to translate sentence" },
          { status: 503 }
        );
      }

      const payload = (await response.json()) as OllamaGenerateResponse;
      const translation = payload.response?.trim() || "";

      return Response.json({ translation }, { status: 200 });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    console.error("Translation error:", error);
    return Response.json(
      { error: "Translation failed" },
      { status: 500 }
    );
  }
}
