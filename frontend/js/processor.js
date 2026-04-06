import { parseCommand } from "./commands.js";

const FALLBACK_TEXT =
  "Nao encontrei essa informacao, mas posso aprender se quiser me ensinar.";

function resolveApiBaseUrl() {
  const metaTag = document.querySelector('meta[name="api-base-url"]');
  const raw = metaTag?.getAttribute("content") || "";
  const clean = String(raw).trim();

  if (!clean) return "";
  return clean.replace(/\/+$/, "");
}

const API_BASE_URL = resolveApiBaseUrl();

function buildApiUrl(path) {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

async function apiGet(url) {
  const response = await fetch(buildApiUrl(url));
  if (!response.ok) throw new Error("Falha na requisicao");
  return response.json();
}

async function apiPost(url, payload) {
  const response = await fetch(buildApiUrl(url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error("Falha na requisicao");
  return response.json();
}

export async function processUserText(text) {
  const clean = String(text || "").trim();
  if (!clean) {
    return { reply: "Envie uma pergunta para eu te ajudar.", source: "sistema" };
  }

  const command = parseCommand(clean);

  if (command?.type === "show_memories") {
    const data = await apiGet("/api/memory/list");
    const memories = data.memories || [];

    if (!memories.length) {
      return { reply: "Ainda nao ha memorias salvas.", source: "comando" };
    }

    const top = memories
      .slice(0, 8)
      .map((item, index) => `${index + 1}. ${item.question}`)
      .join("\n");

    return { reply: `Memorias salvas:\n${top}`, source: "comando" };
  }

  if (command?.type === "teach_help") {
    return {
      reply:
        "Para ensinar, use: ensinar: sua pergunta | sua resposta",
      source: "comando"
    };
  }

  if (command?.type === "open_memory") {
    const query = command.query || clean;
    const exact = await apiPost("/api/memory/exact", { text: query });

    if (exact.memory) {
      return { reply: exact.memory.answer, source: "memoria_exata" };
    }

    return {
      reply: "Nao encontrei essa memoria especifica.",
      source: "comando"
    };
  }

  if (command?.type === "teach_direct") {
    if (!command.question || !command.answer) {
      return {
        reply: "Formato invalido. Use: ensinar: pergunta | resposta",
        source: "comando"
      };
    }

    await apiPost("/api/memory/teach", {
      question: command.question,
      answer: command.answer
    });

    return {
      reply: "Aprendi com sucesso e guardei na memoria.",
      source: "aprendizado"
    };
  }

  const exact = await apiPost("/api/memory/exact", { text: clean });
  if (exact.memory?.answer) {
    return { reply: exact.memory.answer, source: "memoria_exata" };
  }

  const similar = await apiPost("/api/memory/similar", { text: clean });
  if (similar.memory?.answer) {
    return {
      reply: similar.memory.answer,
      source: `similaridade (${similar.memory.score ?? "aprox"})`
    };
  }

  const wiki = await apiGet(`/api/search/wiki?q=${encodeURIComponent(clean)}`);
  if (wiki.result?.summary) {
    return {
      reply: wiki.result.summary,
      source: "wikipedia"
    };
  }

  const ai = await apiPost("/api/ai/answer", { text: clean });
  if (ai.result?.answer) {
    return { reply: ai.result.answer, source: "ia_gratuita" };
  }

  return { reply: FALLBACK_TEXT, source: "fallback" };
}
