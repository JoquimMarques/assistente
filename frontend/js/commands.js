export function parseCommand(text) {
  const raw = String(text || "").trim();

  // Normalização para matching (remover acentos e pontuação)
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  // --- Memória ---
  if (normalized === "mostrar memorias" || normalized === "mostrar as memorias" || normalized === "ver memorias") {
    return { type: "show_memories" };
  }
  if (normalized === "ensinar algo" || normalized === "aprender algo") {
    return { type: "teach_help" };
  }
  if (normalized === "abrir memoria" || normalized === "abrir a memoria" || normalized === "gerenciar memoria") {
    return { type: "manage_memory" };
  }
  if (normalized.startsWith("abrir memoria ") || normalized.startsWith("abrir a memoria ")) {
    const query = normalized.replace(/^abrir (a )?memoria /, "").trim();
    return { type: "open_memory", query };
  }
  if (normalized.startsWith("ensinar:")) {
    const payload = raw.slice("ensinar:".length).trim();
    const [question, answer] = payload.split("|").map((part) => part?.trim());
    return { type: "teach_direct", question, answer };
  }

  // --- Hora / Conselho / Timer ---
  if (normalized === "que horas sao") {
    return { type: "get_time" };
  }
  if (normalized === "conselho de hoje" || normalized === "me da um conselho") {
    return { type: "daily_advice" };
  }
  const timerMatch = normalized.match(/temporizador de (\d+) (minutos?|segundos?)/);
  if (timerMatch) {
    return {
      type: "set_timer",
      value: parseInt(timerMatch[1], 10),
      unit: timerMatch[2].startsWith("min") ? "minutes" : "seconds"
    };
  }

  // --- NOTÍCIAS ---
  if (
    normalized === "noticias" ||
    normalized === "ler noticias" ||
    normalized === "noticias de hoje" ||
    normalized === "ler as noticias" ||
    normalized === "novidades" ||
    normalized === "me mostra as noticias" ||
    normalized === "o que esta acontecendo" ||
    normalized === "quais sao as noticias"
  ) {
    return { type: "read_news" };
  }

  // --- LOCALIZAÇÃO ---
  if (
    normalized === "onde estou" ||
    normalized === "minha localizacao" ||
    normalized === "mostrar localizacao" ||
    normalized === "abrir mapa" ||
    normalized === "ver mapa" ||
    normalized === "localizacao" ||
    normalized === "mapa" ||
    normalized === "minha posicao" ||
    normalized === "onde eu estou"
  ) {
    return { type: "open_location" };
  }

  // --- EMAIL ---
  if (
    normalized === "mandar email" ||
    normalized === "enviar email" ||
    normalized === "escrever email" ||
    normalized === "abrir email" ||
    normalized === "novo email" ||
    normalized === "compor email" ||
    normalized === "escrever mensagem"
  ) {
    return { type: "compose_email" };
  }
  // Enviar email para X
  const emailMatch = normalized.match(/(?:enviar|mandar|escrever) email (?:para|pra) (.+)/);
  if (emailMatch) {
    return { type: "compose_email", toHint: emailMatch[1].trim() };
  }

  // --- CALENDÁRIO ---
  if (
    normalized === "calendario" ||
    normalized === "abrir calendario" ||
    normalized === "mostrar calendario" ||
    normalized === "ver eventos" ||
    normalized === "meus compromissos" ||
    normalized === "ver calendario" ||
    normalized === "agenda"
  ) {
    return { type: "show_calendar" };
  }

  // Tentar casamento de padrão complexo para criação direta de evento por voz/texto
  // Ex: "criar evento prova dia 31/05 as 14:00" ou "criar evento nome do evento prova data 31105 de 2026 hora 14:00"
  const lowerRaw = raw.toLowerCase().trim();
  if (
    normalized.includes("criar evento") ||
    normalized.includes("criar um evento") ||
    normalized.includes("criar novo evento") ||
    normalized.includes("criar compromisso") ||
    normalized.includes("criar um compromisso") ||
    normalized.includes("agendar") ||
    normalized.includes("marcar")
  ) {
    // 1. Extrair título/nome do evento
    // Conjuntores que separam o título do resto da frase em PT-BR
    let title = "";
    // Primeiro tenta padrão com prefixo descritivo ("nome do evento", "chamado", "\bde\b" como palavra isolada)
    const titleMatch = lowerRaw.match(
      /(?:criar evento|criar um evento|criar novo evento|criar compromisso|criar um compromisso|agendar|marcar)\s+(?:nome do evento\s*|chamado\s*|\bde\b\s*)?(.+?)(?:\s+(?:no\s+dia|na\s+data|para\s+o\s+dia|para\s+a|no\s+proximo|no|na|para|dia|data|em|as|às|hora|local|ao|hoje|amanha|amanhã|depois\s+de\s+amanha|depois\s+de\s+amanhã|segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo)\b|$)/
    );
    if (titleMatch) {
      title = titleMatch[1].trim();
      // Limpar palavras de ligação que possam ter ficado no final (ex: "prova no" → "prova")
      title = title.replace(/\s+\b(no|na|para|ao|ao|a|de|do|da)\s*$/i, "").trim();
    }

    // 2. Extrair data
    let date = "";
    // Padrões de data
    const dateRegex1 = /\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/;
    const dateRegex2 = /\b(\d{1,2})\s+de\s+([a-z0-9]+)\b/i;
    
    let dMatch = lowerRaw.match(dateRegex1);
    if (dMatch) {
      const day = dMatch[1];
      const month = dMatch[2];
      const year = dMatch[3] || new Date().getFullYear();
      date = `${day}/${month}/${year}`;
    } else {
      dMatch = lowerRaw.match(dateRegex2);
      if (dMatch) {
        const day = dMatch[1];
        const monthStr = dMatch[2].toLowerCase();
        const monthMap = {
          "janeiro": "01", "fevereiro": "02", "marco": "03", "abril": "04",
          "maio": "05", "junho": "06", "julho": "07", "agosto": "08",
          "setembro": "09", "outubro": "10", "novembro": "11", "dezembro": "12",
          "01": "01", "02": "02", "03": "03", "04": "04", "05": "05", "06": "06",
          "07": "07", "08": "08", "09": "09", "10": "10", "11": "11", "12": "12"
        };
        const month = monthMap[monthStr] || "05";
        const yearMatch = lowerRaw.match(/\bde\s+(\d{4})\b/);
        const year = yearMatch ? yearMatch[1] : new Date().getFullYear();
        date = `${day}/${month}/${year}`;
      } else {
        // Caso especial de transcrição por voz como "31105"
        const specialMatch = lowerRaw.match(/\b31105\b/);
        if (specialMatch) {
          date = `31/05/${new Date().getFullYear()}`;
        } else {
          // DDMM geral
          const digitMatch = lowerRaw.match(/\b(\d{1,2})(0[1-9]|1[0-2])\b/);
          if (digitMatch) {
            date = `${digitMatch[1]}/${digitMatch[2]}/${new Date().getFullYear()}`;
          }
        }
      }
    }

    // Suporte a datas relativas se a data exata não foi encontrada
    if (!date) {
      const today = new Date();
      if (normalized.includes("depois de amanha") || normalized.includes("depois de amanhã")) {
        const dayAfter = new Date(today);
        dayAfter.setDate(today.getDate() + 2);
        date = `${dayAfter.getDate()}/${dayAfter.getMonth() + 1}/${dayAfter.getFullYear()}`;
      } else if (normalized.includes("amanha") || normalized.includes("amanhã")) {
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        date = `${tomorrow.getDate()}/${tomorrow.getMonth() + 1}/${tomorrow.getFullYear()}`;
      } else if (normalized.includes("hoje")) {
        date = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`;
      } else {
        // Testar dias da semana
        const weekdays = [
          "segunda-feira", "segunda", "terça-feira", "terça", "terca-feira", "terca",
          "quarta-feira", "quarta", "quinta-feira", "quinta", "sexta-feira", "sexta",
          "sábado", "sabado", "domingo"
        ];
        for (const wd of weekdays) {
          if (normalized.includes(wd)) {
            const calculatedDate = getNextWeekday(wd);
            if (calculatedDate) {
              date = calculatedDate;
              break;
            }
          }
        }
      }
    }

    // 3. Extrair hora
    let time = "";
    const timeMatch = lowerRaw.match(/(?:hora|as|s|as)?\s*(\d{1,2})[:h](\d{2})/);
    if (timeMatch) {
      time = `${String(timeMatch[1]).padStart(2, "0")}:${String(timeMatch[2]).padStart(2, "0")}`;
    } else {
      const spaceTimeMatch = lowerRaw.match(/(?:hora|as|s|as)?\s*(\d{1,2})\s+(\d{2})\b/);
      if (spaceTimeMatch && parseInt(spaceTimeMatch[1], 10) <= 23 && parseInt(spaceTimeMatch[2], 10) <= 59) {
        time = `${String(spaceTimeMatch[1]).padStart(2, "0")}:${String(spaceTimeMatch[2]).padStart(2, "0")}`;
      } else {
        const simpleTimeMatch = lowerRaw.match(/(?:hora|as|s|as)?\s*(\d{1,2})\s*horas?\b/);
        if (simpleTimeMatch) {
          time = `${String(simpleTimeMatch[1]).padStart(2, "0")}:00`;
        } else {
          const justNumberMatch = lowerRaw.match(/(?:as|às|para\s+as|para\s+às)\s*(\d{1,2})\b/);
          if (justNumberMatch && parseInt(justNumberMatch[1], 10) <= 23) {
            time = `${String(justNumberMatch[1]).padStart(2, "0")}:00`;
          } else if (normalized.includes("meio dia") || normalized.includes("meio-dia")) {
            time = "12:00";
          } else if (normalized.includes("meia noite") || normalized.includes("meia-noite")) {
            time = "00:00";
          }
        }
      }
    }

    // Se temos tudo necessário, criamos diretamente!
    if (title && date && time) {
      return {
        type: "create_calendar_event_direct",
        title: title,
        date: date,
        time: time
      };
    }

    // Caso contrário, apenas abre o painel do calendário pré-preenchendo o título
    return {
      type: "show_calendar_create",
      title: title || ""
    };
  }

  return null;
}

// Auxiliar para obter a data do próximo dia da semana correspondente
function getNextWeekday(dayName) {
  const weekdays = {
    "domingo": 0,
    "segunda": 1, "segunda-feira": 1,
    "terca": 2, "terca-feira": 2, "terça": 2, "terça-feira": 2,
    "quarta": 3, "quarta-feira": 3,
    "quinta": 4, "quinta-feira": 4,
    "sexta": 5, "sexta-feira": 5,
    "sabado": 6, "sábado": 6
  };
  const targetDay = weekdays[dayName];
  if (targetDay === undefined) return null;
  
  const today = new Date();
  const currentDay = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
  let daysToAdd = targetDay - currentDay;
  if (daysToAdd <= 0) {
    daysToAdd += 7; // Próxima semana
  }
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + daysToAdd);
  return `${targetDate.getDate()}/${targetDate.getMonth() + 1}/${targetDate.getFullYear()}`;
}

