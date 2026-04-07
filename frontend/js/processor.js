import { parseCommand } from "./commands.js";

const FALLBACK_TEXT =
  "Nao encontrei isso na memoria nem na Wikipedia agora. Se quiser, posso aprender com: ensinar: pergunta | resposta";

const WAKE_WORDS = ["axel", "alexa", "pessoa"];

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

function normalizeForMatch(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]/g, " ") // Remove pontuação para matching limpo
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function stripWakeWord(text) {
  const raw = String(text || "").trim();
  if (!raw) return { text: "", usedWakeWord: false };

  const pattern = new RegExp(`^\\s*(${WAKE_WORDS.join("|")})\\s*[,;:!.-]*\\s*`, "i");
  const match = raw.match(pattern);
  if (!match) {
    return { text: raw, usedWakeWord: false };
  }

  const cleaned = raw.replace(pattern, "").trim();
  return {
    text: cleaned,
    usedWakeWord: true,
    wakeWordOnly: !cleaned
  };
}

function getCannedReply(text) {
  const normalized = normalizeForMatch(text);

  if (!normalized) return null;

  const greetings = ["oi", "ola", "hey", "e ai", "eae", "boas", "bom dia", "boa tarde", "boa noite"];
  if (greetings.includes(normalized)) {
    return {
      reply:
        "Olá, eu sou o Axel, seu assistente virtual. Diga “Axel” seguido da sua pergunta. Caso eu não tenha a resposta, posso pesquisar na Wikipedia para encontrar a melhor informação para você.",
      source: "resposta_pronta"
    };
  }

  if (
    normalized.includes("quem e voce") ||
    normalized.includes("se apresenta") ||
    normalized.includes("teu nome") ||
    normalized.includes("seu nome")
  ) {
    return {
      reply:
        "Eu sou o Axel. Posso conversar com voce, responder perguntas e buscar informacoes na Wikipedia quando nao encontro na memoria.",
      source: "resposta_pronta"
    };
  }

  if (
    normalized.includes("o que voce faz") ||
    normalized.includes("o que podes fazer") ||
    normalized.includes("o que pode fazer")
  ) {
    return {
      reply:
        "Eu posso responder perguntas, ler respostas em voz alta, mostrar memorias salvas e aprender com o comando ensinar: pergunta | resposta.",
      source: "resposta_pronta"
    };
  }

  return null;
}

function extractSearchTopic(text) {
  const normalized = normalizeForMatch(text)
    .replace(/[?!.]/g, " ")
    .replace(/\bo\s+que\s+e\b/g, "")
    .replace(/\bquem\s+e\b/g, "")
    .replace(/\bqual\s+e\b/g, "")
    .replace(/\bquais\s+sao\b/g, "")
    .replace(/\bme\s+da\b/g, "")
    .replace(/\bme\s+diz\b/g, "")
    .replace(/\bme\s+diga\b/g, "")
    .replace(/\bme\s+fala\s+sobre\b/g, "")
    .replace(/\bme\s+fale\s+sobre\b/g, "")
    .replace(/\bespecificacoes\b/g, "")
    .replace(/\bdo\s+computador\b/g, "")
    .replace(/\bdo\s+portatil\b/g, "")
    .replace(/\bdo\s+laptop\b/g, "")
    .replace(/\bsobre\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length >= 2) return normalized;
  return String(text || "").trim();
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
  const raw = String(text || "").trim();
  if (!raw) {
    return { reply: "Envie uma pergunta para eu te ajudar.", source: "sistema" };
  }

  const wake = stripWakeWord(raw);
  if (wake.wakeWordOnly) {
    return {
      reply: "Estou ouvindo. Pode fazer sua pergunta.",
      source: "ativacao"
    };
  }

  const clean = wake.text || raw;

  const canned = getCannedReply(clean);
  if (canned) {
    return canned;
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

  // Gemini AI - Prioridade Inteligente
  try {
    const ai = await apiPost("/api/ai/answer", { text: clean });
    if (ai.ok && ai.result?.answer) {
      return {
        reply: ai.result.answer,
        source: ai.result.source || "Gemini AI"
      };
    }
  } catch (e) {
    console.error("Erro ao chamar IA:", e);
  }

  // Wikipedia - Fallback para fatos enciclopédicos se a IA não responder
  const keyword = extractSearchTopic(clean);
  const wikiQueries = [clean, keyword].filter(Boolean);
  const tried = new Set();

  for (const query of wikiQueries) {
    const normalized = normalizeForMatch(query);
    if (tried.has(normalized)) continue;
    tried.add(normalized);

    try {
      const wiki = await apiGet(`/api/search/wiki?q=${encodeURIComponent(query)}`);
      if (wiki.result?.summary) {
        return {
          reply: wiki.result.summary,
          source: "wikipedia"
        };
      }
    } catch (e) {
      console.error("Erro ao buscar Wiki:", e);
    }
  }

  return { 
    reply: "Não consegui encontrar uma resposta específica, mas você pode me ensinar usando 'ensinar: pergunta | resposta'.", 
    source: "fallback" 
  };
}
