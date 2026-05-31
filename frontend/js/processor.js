import { parseCommand } from "./commands.js";

const FALLBACK_TEXT =
  "Nao encontrei isso na memoria nem na Wikipedia agora. Se quiser, posso aprender com: ensinar: pergunta | resposta";

const WAKE_WORDS = ["axel", "alexa", "pessoa"];

function resolveApiBaseUrl() {
  // Se estiver rodando localmente (localhost), usa caminhos relativos ao próprio servidor local
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return "";
  }
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
    .replace(/[?!.,;:]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function stripWakeWord(text) {
  const raw = String(text || "").trim();
  if (!raw) return { text: "", usedWakeWord: false };
  const pattern = new RegExp(`^\\s*(${WAKE_WORDS.join("|")})\\s*[,;:!.-]*\\s*`, "i");
  const match = raw.match(pattern);
  if (!match) return { text: raw, usedWakeWord: false };
  const cleaned = raw.replace(pattern, "").trim();
  return { text: cleaned, usedWakeWord: true, wakeWordOnly: !cleaned };
}

function getCannedReply(text) {
  const normalized = normalizeForMatch(text);
  if (!normalized) return null;

  const greetings = ["oi", "ola", "hey", "e ai", "eae", "boas", "bom dia", "boa tarde", "boa noite"];
  if (greetings.includes(normalized)) {
    return { reply: "Olá! Como vai? Sou o Axel. Como posso te ajudar hoje?", source: "resposta_pronta" };
  }
  if (normalized.includes("quem e voce") || normalized.includes("se apresenta") || normalized.includes("teu nome") || normalized.includes("seu nome")) {
    return { reply: "Eu sou o Axel, seu assistente inteligente. Estou aqui para responder suas dúvidas e buscar informações para você.", source: "resposta_pronta" };
  }
  if (normalized.includes("o que voce faz") || normalized.includes("o que podes fazer") || normalized.includes("o que pode fazer")) {
    return {
      reply: "Eu posso:\n\n- **Responder perguntas** e buscar informações\n- **Ler notícias** em tempo real\n- **Tocar música** Lo-Fi para te acompanhar\n- **Enviar e-mails** pelo painel de e-mail\n- **Gerir o teu calendário** com eventos e compromissos\n- **Memorizar** e aprender com o comando `ensinar: pergunta | resposta`",
      source: "resposta_pronta"
    };
  }
  return null;
}

function extractSearchTopic(text) {
  return normalizeForMatch(text)
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
    .replace(/\bsobre\b/g, "")
    .replace(/\s+/g, " ")
    .trim() || String(text || "").trim();
}

export async function apiGet(url) {
  const response = await fetch(buildApiUrl(url));
  if (!response.ok) throw new Error("Falha na requisicao");
  return response.json();
}

export async function apiPost(url, payload) {
  const response = await fetch(buildApiUrl(url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Falha na requisicao");
  return response.json();
}

export async function apiDelete(url) {
  const response = await fetch(buildApiUrl(url), { method: "DELETE" });
  if (!response.ok) throw new Error("Falha na requisicao");
  return response.json();
}

export async function processUserText(text, history = []) {
  const raw = String(text || "").trim();
  if (!raw) {
    return { reply: "Envie uma pergunta para eu te ajudar.", source: "sistema" };
  }

  const wake = stripWakeWord(raw);
  if (wake.wakeWordOnly) {
    return { reply: "Estou ouvindo. Pode falar!", source: "ativacao" };
  }

  const clean = wake.text || raw;

  const canned = getCannedReply(clean);
  if (canned) return canned;

  const command = parseCommand(clean);

  // --- Memória ---
  if (command?.type === "show_memories" || command?.type === "manage_memory") {
    return { reply: "Abrindo o gerenciador de memória...", source: "comando", action: "open_memory" };
  }
  if (command?.type === "teach_help") {
    return { reply: "Para ensinar, use: ensinar: sua pergunta | sua resposta", source: "comando" };
  }
  if (command?.type === "get_time") {
    const now = new Date();
    const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return { reply: `Agora são exatamente **${timeStr}**.`, source: "sistema" };
  }
  if (command?.type === "daily_advice") {
    const today = new Date().toLocaleDateString("pt-BR");
    const advicePrompt = `Hoje é dia ${today}. Escreva um conselho curto, impactante e inspirador para um jovem. O tema deve ser sobre a vida, motivação ou fé/Deus. Seja direto e encorajador. Max 3 frases.`;
    try {
      const ai = await apiPost("/api/ai/answer", { text: advicePrompt, history });
      if (ai.ok && ai.result?.answer) {
        return { reply: `Conselho de hoje (${today}):\n\n${ai.result.answer}`, source: "Conselho Axel" };
      }
    } catch (e) {
      return { reply: "O melhor conselho que posso te dar agora é: acredite em si mesmo e comece o dia com gratidão!", source: "fallback" };
    }
  }
  if (command?.type === "set_timer") {
    return {
      reply: `Tudo bem, temporizador de **${command.value} ${command.unit === "minutes" ? "minuto(s)" : "segundo(s)"}** iniciado agora!`,
      source: "temporizador",
      action: "start_timer",
      timerParams: { value: command.value, unit: command.unit }
    };
  }
  if (command?.type === "open_memory") {
    const query = command.query || clean;
    const exact = await apiPost("/api/memory/exact", { text: query });
    if (exact.memory) return { reply: exact.memory.answer, source: "memoria_exata" };
    return { reply: "Nao encontrei essa memoria especifica.", source: "comando" };
  }
  if (command?.type === "teach_direct") {
    if (!command.question || !command.answer) {
      return { reply: "Formato invalido. Use: ensinar: pergunta | resposta", source: "comando" };
    }
    await apiPost("/api/memory/teach", { question: command.question, answer: command.answer });
    return { reply: "Aprendi com sucesso e guardei na memoria.", source: "aprendizado" };
  }

  // --- NOTÍCIAS ---
  if (command?.type === "read_news") {
    return { reply: "A procurar as notícias mais recentes do Brasil...", source: "sistema", action: "fetch_news" };
  }

  // --- LOCALIZAÇÃO ---
  if (command?.type === "open_location") {
    return { reply: "A abrir o seu **Mapa de Localização** em tempo real... 📍", source: "sistema", action: "open_location" };
  }

  // --- EMAIL ---
  if (command?.type === "compose_email") {
    return { reply: "A abrir o compositor de e-mail...", source: "sistema", action: "open_email", toHint: command.toHint || "" };
  }

  // --- CALENDÁRIO ---
  if (command?.type === "show_calendar" || command?.type === "show_calendar_create") {
    return { reply: "A abrir o teu **Calendário de Eventos**...", source: "sistema", action: "open_calendar", titleHint: command.title || "" };
  }
  if (command?.type === "create_calendar_event_direct") {
    try {
      // Converter data dd/mm para YYYY-MM-DD
      const today = new Date();
      let dateParts = command.date.replace(/-/g, "/").split("/");
      let isoDate;
      if (dateParts.length === 3) {
        const year = dateParts[2].length === 2 ? `20${dateParts[2]}` : dateParts[2];
        isoDate = `${year}-${String(dateParts[1]).padStart(2, "0")}-${String(dateParts[0]).padStart(2, "0")}`;
      } else {
        isoDate = `${today.getFullYear()}-${String(dateParts[1]).padStart(2, "0")}-${String(dateParts[0]).padStart(2, "0")}`;
      }
      await apiPost("/api/calendar/events", {
        title: command.title,
        date: isoDate,
        time: command.time,
        description: ""
      });
      return {
        reply: `Evento **"${command.title}"** criado para **${command.date}** às **${command.time}**! ✅`,
        source: "calendário",
        action: "calendar_event_created"
      };
    } catch (e) {
      return { reply: "Não consegui criar o evento agora. Tente pelo painel do calendário.", source: "erro" };
    }
  }

  // --- Pipeline normal (memória → IA → Wikipedia) ---
  const exact = await apiPost("/api/memory/exact", { text: clean });
  if (exact.memory?.answer) return { reply: exact.memory.answer, source: "memoria_exata" };

  const similar = await apiPost("/api/memory/similar", { text: clean });
  if (similar.memory?.answer) {
    return { reply: similar.memory.answer, source: `similaridade (${similar.memory.score ?? "aprox"})` };
  }

  try {
    const ai = await apiPost("/api/ai/answer", { text: clean, history });
    if (ai.ok && ai.result?.answer) {
      return { reply: ai.result.answer, source: ai.result.source || "Gemini AI" };
    }
  } catch (e) {
    console.error("[Processor] Erro ao chamar IA do backend:", e.message);
  }

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
        return { reply: wiki.result.summary, source: "wikipedia" };
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
