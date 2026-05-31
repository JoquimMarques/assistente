const STOPWORDS = new Set([
  "o",
  "a",
  "os",
  "as",
  "um",
  "uma",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "que",
  "e",
  "eh",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "por",
  "para",
  "sobre"
]);

function normalizeForCompare(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenizeMeaningful(text) {
  return normalizeForCompare(text)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

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
    .replace(/^\b(o|a|os|as|um|uma)\b\s+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreTitleAgainstTopic(title, topic) {
  const topicTokens = tokenizeMeaningful(topic);
  if (!topicTokens.length) return 0;

  const titleNormalized = normalizeForCompare(title);
  const titleTokens = new Set(tokenizeMeaningful(title));

  let overlap = 0;
  for (const token of topicTokens) {
    if (titleTokens.has(token) || titleNormalized.includes(token)) {
      overlap += 1;
    }
  }

  const overlapScore = overlap / topicTokens.length;
  const phraseBoost = titleNormalized.includes(normalizeForCompare(topic)) ? 0.3 : 0;
  return overlapScore + phraseBoost;
}

function isSummaryRelevant(summary, topic) {
  if (!summary?.summary || !summary?.title) return false;

  const topicTokens = tokenizeMeaningful(topic);
  if (!topicTokens.length) return true;

  const combined = normalizeForCompare(`${summary.title} ${summary.summary}`);
  const hits = topicTokens.filter((token) => combined.includes(token)).length;

  if (topicTokens.length === 1) {
    return hits >= 1;
  }

  return hits / topicTokens.length >= 0.5;
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

async function searchWikipediaTitles(query) {
  const clean = String(query || "").trim();
  if (!clean) return [];

  const url = `https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(clean)}&srlimit=5&format=json`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "assistente-virtual/1.0"
      }
    });

    if (!response.ok) return [];

    const data = await response.json();
    const titles = (data?.query?.search || [])
      .map((item) => item?.title)
      .filter(Boolean);
    return titles;
  } catch {
    return [];
  }
}

export async function searchWikipedia(query) {
  const clean = String(query || "").trim();
  if (!clean) return null;

  const topic = normalizeQuestionToTopic(clean);
  const candidates = [clean, topic].filter(Boolean);
  const relevanceTopic = topic || clean;

  for (const candidate of candidates) {
    const summary = await fetchWikipediaSummaryByTitle(candidate);
    if (summary && isSummaryRelevant(summary, relevanceTopic)) {
      return summary;
    }
  }

  const foundTitles = [];
  for (const candidate of candidates) {
    const titles = await searchWikipediaTitles(candidate);
    foundTitles.push(...titles);
  }

  const uniqueTitles = Array.from(new Set(foundTitles));
  uniqueTitles.sort((a, b) => scoreTitleAgainstTopic(b, relevanceTopic) - scoreTitleAgainstTopic(a, relevanceTopic));

  for (const title of uniqueTitles) {
    const summary = await fetchWikipediaSummaryByTitle(title);
    if (summary && isSummaryRelevant(summary, relevanceTopic)) {
      return summary;
    }
  }

  return null;
}
