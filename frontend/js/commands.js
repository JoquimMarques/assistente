export function parseCommand(text) {
  const raw = String(text || "").trim();
  const lower = raw.toLowerCase();

  if (lower === "mostrar memorias") {
    return { type: "show_memories" };
  }

  if (lower === "ensinar algo") {
    return { type: "teach_help" };
  }

  if (lower === "abrir memoria") {
    return { type: "manage_memory" };
  }

  if (lower.startsWith("abrir memoria ")) {
    const query = raw.slice("abrir memoria".length).trim();
    return { type: "open_memory", query };
  }

  if (lower.startsWith("ensinar:")) {
    const payload = raw.slice("ensinar:".length).trim();
    const [question, answer] = payload.split("|").map((part) => part?.trim());
    return { type: "teach_direct", question, answer };
  }

  return null;
}
