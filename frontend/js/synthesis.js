function pickPortugueseVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  if (!voices.length) return null;

  // Filtrar apenas vozes em português
  const ptVoices = voices.filter((voice) =>
    String(voice.lang || "").toLowerCase().startsWith("pt")
  );

  if (!ptVoices.length) return null;

  // Preferência para vozes femininas na ordem de melhor qualidade (mais natural)
  const preferredKeywords = [
    "francisca",       // Edge Natural (excelente)
    "google portugues", // Chrome (muito boa)
    "heloisa",         // Microsoft (boa)
    "raquel",          // macOS
    "luciana",         // macOS
    "joana",           // macOS
    "maria",           // Microsoft (robótica, mas clássica)
    "elsa"             // Microsoft pt-PT
  ];

  for (const keyword of preferredKeywords) {
    const found = ptVoices.find((voice) =>
      voice.name.toLowerCase().includes(keyword)
    );
    if (found) return found;
  }

  // Fallback: tentar pegar qualquer voz pt-BR que não pareça masculina
  const ptBr = ptVoices.filter((voice) => voice.lang?.toLowerCase() === "pt-br");
  const fallbackList = ptBr.length ? ptBr : ptVoices;

  const maleKeywords = ["daniel", "antonio", "duarte", "helio", "masculino"];
  const femaleFallback = fallbackList.find((voice) =>
    !maleKeywords.some(male => voice.name.toLowerCase().includes(male))
  );

  return femaleFallback || fallbackList[0];
}

function stripMarkdown(text) {
  return String(text || "")
    .replace(/\*\*/g, "")     // Remove negrito
    .replace(/\*/g, "")      // Remove itálico
    .replace(/_{1,2}/g, "")   // Remove underscores
    .replace(/[`#]/g, "")     // Remove crases e hashtags
    .replace(/\[(.*?)\]\(.*?\)/g, "$1") // Remove links, mantém o texto
    .trim();
}

let activeSpeechToken = 0;
let activeUtterances = []; // Mantém referências ativas para evitar Garbage Collection que para a fala do nada

function splitIntoSpeechChunks(text, maxLength = 260) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const sentences = clean.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    if (sentence.length <= maxLength) {
      current = sentence;
      continue;
    }

    let start = 0;
    while (start < sentence.length) {
      chunks.push(sentence.slice(start, start + maxLength));
      start += maxLength;
    }
    current = "";
  }

  if (current) chunks.push(current);
  return chunks;
}

export function speak(text, callbacks = {}) {
  const raw = String(text || "").trim();
  if (!raw || !("speechSynthesis" in window)) return false;

  const clean = stripMarkdown(raw);

  const chunks = splitIntoSpeechChunks(clean);
  if (!chunks.length) return false;

  const voice = pickPortugueseVoice();
  const onStart = callbacks?.onStart;
  const onEnd = callbacks?.onEnd;
  const speechToken = activeSpeechToken + 1;
  activeSpeechToken = speechToken;

  // Cancelar falas anteriores e limpar a lista de referências ativas
  window.speechSynthesis.cancel();
  activeUtterances = [];
  window.speechSynthesis.resume();
  onStart?.();

  let index = 0;
  const speakNext = () => {
    if (activeSpeechToken !== speechToken) return;

    if (index >= chunks.length) return;

    const utterance = new SpeechSynthesisUtterance(chunks[index]);

    // Guardar a referência no array global para evitar Garbage Collection no meio da fala
    activeUtterances.push(utterance);

    utterance.lang = voice?.lang || "pt-BR";
    utterance.rate = 1;
    utterance.pitch = 1;
    if (voice) {
      utterance.voice = voice;
    }

    const cleanUpUtterance = () => {
      activeUtterances = activeUtterances.filter((u) => u !== utterance);
    };

    utterance.onend = () => {
      cleanUpUtterance();
      if (activeSpeechToken !== speechToken) return;
      index += 1;
      if (index >= chunks.length) {
        onEnd?.();
        return;
      }
      speakNext();
    };

    utterance.onerror = () => {
      cleanUpUtterance();
      if (activeSpeechToken !== speechToken) return;
      index += 1;
      if (index >= chunks.length) {
        onEnd?.();
        return;
      }
      speakNext();
    };

    window.speechSynthesis.speak(utterance);
  };

  speakNext();
  return true;
}
