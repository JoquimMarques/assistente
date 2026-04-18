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

  if (normalized === "que horas sao") {
    return { type: "get_time" };
  }

  if (normalized === "conselho de hoje" || normalized === "me da um conselho") {
    return { type: "daily_advice" };
  }

  // Regex para temporizador (ex: temporizador de 5 minutos, temporizador de 10 segundos)
  const timerMatch = normalized.match(/temporizador de (\d+) (minutos?|segundos?)/);
  if (timerMatch) {
    return { 
      type: "set_timer", 
      value: parseInt(timerMatch[1], 10), 
      unit: timerMatch[2].startsWith("min") ? "minutes" : "seconds" 
    };
  }

  if (normalized.startsWith("ensinar:")) {
    const payload = raw.slice("ensinar:".length).trim();
    const [question, answer] = payload.split("|").map((part) => part?.trim());
    return { type: "teach_direct", question, answer };
  }

  return null;
}
