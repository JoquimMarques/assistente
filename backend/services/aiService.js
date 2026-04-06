export async function askFreeAI(query) {
  const clean = String(query || "").trim();
  if (!clean) return null;

  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(clean)}&format=json&no_html=1&skip_disambig=1`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();

    const answer = data.AbstractText || data.Answer || "";
    if (!answer) return null;

    return {
      answer,
      source: data.AbstractURL || "https://duckduckgo.com"
    };
  } catch {
    return null;
  }
}
