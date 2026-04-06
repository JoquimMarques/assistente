function normalizeQuestionToTopic(query) {
  return String(query || "")
    .toLowerCase()
    .replace(/[?!.]/g, " ")
    .replace(/\bo\s+que\s+[ée]\b/g, "")
    .replace(/\bo\s+que\s+eh\b/g, "")
    .replace(/\bquem\s+[ée]\b/g, "")
    .replace(/\bcomo\s+funciona\b/g, "")
    .replace(/\bexplique\b/g, "")
    .replace(/\bme\s+fala\s+sobre\b/g, "")
    .replace(/\bme\s+fale\s+sobre\b/g, "")
    .replace(/\bsobre\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWikipediaSummaryByTitle(title) {
  if (!title) return null;

  const url = `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "assistente-virtual/1.0"
      }
    });

    if (!response.ok) return null;

    const data = await response.json();

    if (!data.extract) return null;

    return {
      title: data.title,
      summary: data.extract,
      source: data.content_urls?.desktop?.page || null
    };
  } catch {
    return null;
  }
}

async function searchWikipediaTitle(query) {
  const clean = String(query || "").trim();
  if (!clean) return null;

  const url = `https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(clean)}&srlimit=1&format=json`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "assistente-virtual/1.0"
      }
    });

    if (!response.ok) return null;

    const data = await response.json();
    const bestTitle = data?.query?.search?.[0]?.title || null;
    return bestTitle;
  } catch {
    return null;
  }
}

export async function searchWikipedia(query) {
  const clean = String(query || "").trim();
  if (!clean) return null;

  const topic = normalizeQuestionToTopic(clean);
  const candidates = [clean, topic].filter(Boolean);

  for (const candidate of candidates) {
    const summary = await fetchWikipediaSummaryByTitle(candidate);
    if (summary) return summary;
  }

  for (const candidate of candidates) {
    const title = await searchWikipediaTitle(candidate);
    if (!title) continue;
    const summary = await fetchWikipediaSummaryByTitle(title);
    if (summary) return summary;
  }

  return null;
}
