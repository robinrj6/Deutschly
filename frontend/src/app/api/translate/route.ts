const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "mistral-nemo:12b";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 12000);

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
          options: {
            temperature: 0.3,
            top_p: 0.9,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        console.error(`Ollama returned ${response.status}`);
        return Response.json(
          { error: "Translation service unavailable" },
          { status: 503 }
        );
      }

      const payload = (await response.json()) as OllamaGenerateResponse;
      const translation = payload.response?.trim() || "";

      if (!translation) {
        return Response.json(
          { error: "Translation service returned empty response" },
          { status: 500 }
        );
      }

      return Response.json({ translation }, { status: 200 });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error("Translation request timed out after", OLLAMA_TIMEOUT_MS, "ms");
        return Response.json(
          { error: "Translation request timed out. Is Ollama running?" },
          { status: 504 }
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    console.error("Translation error:", error);
    return Response.json(
      { error: "Translation service error" },
      { status: 500 }
    );
  }
}
