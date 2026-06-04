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

  // --- CONTACTOS E WHATSAPP ---
  if (command?.type === "add_contact") {
    try {
      const res = await apiPost("/api/contacts", { name: command.name, phone: command.phone });
      if (res.ok) {
        return {
          reply: `Contacto **"${command.name}"** adicionado com o número **${command.phone}** com sucesso! ✅`,
          source: "contactos"
        };
      }
    } catch (e) {
      return { reply: "Não consegui guardar o contacto agora. Verifique a ligação ao servidor.", source: "erro" };
    }
  }

  if (command?.type === "send_whatsapp") {
    try {
      let targetName = command.name;
      let targetMessage = command.message;

      if (command.rawText) {
        // Buscar todos os contactos do servidor para comparar com o rawText falado/escrito
        let contacts = [];
        try {
          const contactsRes = await apiGet("/api/contacts");
          contacts = contactsRes.contacts || [];
        } catch (err) {
          console.error("[processor] Falha ao obter contactos para correspondência:", err);
        }

        // Ordenar os contactos pelo comprimento do nome decrescente (ex: "Nelson Marques" antes de "Nelson")
        const sortedContacts = [...contacts].sort((a, b) => (b.name || "").length - (a.name || "").length);
        const normalizedRawText = normalizeForMatch(command.rawText);
        let foundContact = null;

        for (const contact of sortedContacts) {
          const normContactName = normalizeForMatch(contact.name);
          if (normContactName && (normalizedRawText + " ").startsWith(normContactName + " ")) {
            foundContact = contact;
            
            // Separar o nome da mensagem. Como usamos NFD e removemos acentos na normalização,
            // podemos estimar pelo número de palavras.
            const rawWords = command.rawText.split(/\s+/);
            const nameWordsCount = contact.name.split(/\s+/).length;
            
            targetName = contact.name;
            targetMessage = rawWords.slice(nameWordsCount).join(" ").trim();
            break;
          }
        }

        if (!foundContact) {
          // Se não bater com nenhum contacto da lista, usamos o comportamento de fallback
          // assume que a primeira palavra é o nome do contacto, e o resto é a mensagem
          const spaceIdx = command.rawText.indexOf(" ");
          if (spaceIdx > 0) {
            targetName = command.rawText.substring(0, spaceIdx).trim();
            targetMessage = command.rawText.substring(spaceIdx + 1).trim();
          } else {
            targetName = command.rawText;
            targetMessage = "";
          }
        }
      }

      if (!targetMessage) {
        return {
          reply: `Encontrei o contacto **"${targetName}"**. Qual é a mensagem que queres enviar?`,
          source: "whatsapp"
        };
      }

      const res = await apiGet(`/api/contacts/search?name=${encodeURIComponent(targetName)}`);
      if (res.ok && res.contact) {
        // Usar o número exatamente como foi guardado (sem adicionar prefixo automático)
        const cleanPhone = res.contact.phone.replace(/[^\d]/g, "");
        const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(targetMessage)}`;
        return {
          reply: `A abrir o WhatsApp para enviar mensagem a **${res.contact.name}**... 💬\n\nCaso a janela não abra automaticamente devido ao bloqueador do navegador, clique abaixo:\n👉 **[Enviar mensagem via WhatsApp](${waUrl})**`,
          source: "whatsapp",
          action: "send_whatsapp",
          whatsappParams: {
            phone: res.contact.phone,
            text: targetMessage
          }
        };
      } else {
        return {
          reply: `Não encontrei nenhum contacto com o nome **"${targetName}"**. Podes adicioná-lo primeiro com o comando: *adicionar contacto [número] com nome [nome]*.`,
          source: "whatsapp"
        };
      }
    } catch (e) {
      console.error("[processor] erro no whatsapp:", e);
      return { reply: "Ocorreu um erro ao processar o contacto. Tente novamente.", source: "erro" };
    }
  }

  // --- CONSULTA EXPRESSA DA WIKIPEDIA ---
  const isExplicitWiki = 
    clean.startsWith("wikipedia:") || 
    clean.startsWith("wiki:") || 
    clean.includes("pesquise na wikipedia") || 
    clean.includes("buscar na wikipedia") || 
    clean.includes("procure na wikipedia") ||
    clean.includes("pesquisa na wikipedia") ||
    clean.includes("busca na wikipedia");

  if (isExplicitWiki) {
    const keyword = extractSearchTopic(clean);
    try {
      const wiki = await apiGet(`/api/search/wiki?q=${encodeURIComponent(keyword)}`);
      if (wiki.result?.summary) {
        let reply = `Aqui está o que encontrei na Wikipedia sobre **${wiki.result.title}**:\n\n${wiki.result.summary}`;
        if (wiki.result.source) {
          reply += `\n\n🔗 *Gostaria de saber mais? Acesse o artigo completo na [Wikipedia](${wiki.result.source}).*`;
        }
        return { reply, source: "Wikipedia" };
      } else {
        return { reply: `Procurei por **"${keyword}"** na Wikipedia, mas não encontrei nenhum artigo relevante. Quer tentar outro termo?`, source: "Wikipedia" };
      }
    } catch (e) {
      console.error("Erro ao buscar Wiki expressa:", e);
      return { reply: "Tentei acessar a Wikipedia para você, mas ocorreu uma falha de conexão. Tente novamente mais tarde.", source: "Wikipedia (Erro)" };
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
        let reply = `Encontrei isto na Wikipedia sobre **${wiki.result.title}**:\n\n${wiki.result.summary}`;
        if (wiki.result.source) {
          reply += `\n\n🔗 *Fonte: [Wikipedia](${wiki.result.source}).*`;
        }
        return { reply, source: "Wikipedia" };
      }
    } catch (e) {
      console.error("Erro ao buscar Wiki:", e);
    }
  }

  // --- RESPOSTAS DE RESERVA INTELIGENTES (FALLBACK LOCAL) ---
  const normalizedClean = normalizeForMatch(clean);
  if (normalizedClean.includes("ajuda") || normalizedClean.includes("socorro") || normalizedClean.includes("suporte") || normalizedClean.includes("comandos")) {
    return {
      reply: "Precisa de ajuda? No momento, minha conexão com a IA principal está instável, mas você pode usar meus comandos locais:\n\n- Diga **'tocar musica'** para ouvir Lo-Fi\n- Diga **'noticias'** para ver as novidades do dia\n- Diga **'calendario'** para abrir seu painel de compromissos\n- Diga **'ensinar: pergunta | resposta'** para gravar uma resposta direta na minha memória.",
      source: "fallback_ajuda"
    };
  }

  if (normalizedClean.includes("quem e") || normalizedClean.includes("o que e") || normalizedClean.includes("significado") || normalizedClean.includes("como funciona")) {
    return {
      reply: "Peço desculpas! Não consegui pesquisar essa informação agora porque meus serviços de busca (IA e Wikipedia) estão offline. Deseja tentar ensinar-me a resposta com `ensinar: pergunta | resposta`?",
      source: "fallback_busca"
    };
  }

  const randomFallbacks = [
    "Minha conexão de IA e serviços de busca falharam agora. Tem algo que eu possa fazer localmente (tocar música, abrir calendário, notícias)?",
    "Estou com instabilidade na conexão para processar sua pergunta. Se quiser, você pode me ensinar o que responder usando: `ensinar: sua pergunta | sua resposta`!",
    "Ops! Parece que o servidor de inteligência não pôde responder a tempo. Quer tentar refazer a pergunta de outra forma?",
    "Meus servidores estão temporariamente ocupados ou sem comunicação. Estou por aqui operando em modo de segurança. Como posso ajudar com funções locais?",
    "Hum, não consegui obter resposta da IA e nem na Wikipedia. Se for algo importante, você pode me ensinar essa resposta diretamente no comando `ensinar:`."
  ];

  const randomReply = randomFallbacks[Math.floor(Math.random() * randomFallbacks.length)];
  return {
    reply: randomReply,
    source: "fallback_sistema"
  };
}
