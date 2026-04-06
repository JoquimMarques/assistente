export async function searchWikipedia(query) {
  const clean = String(query || "").trim();
  if (!clean) return null;

  const url = `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(clean)}`;

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
