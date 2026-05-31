function pickPortugueseVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  if (!voices.length) return null;

  const exact = voices.find((voice) => voice.lang?.toLowerCase() === "pt-br");
  if (exact) return exact;

  const pt = voices.find((voice) => String(voice.lang || "").toLowerCase().startsWith("pt"));
  return pt || null;
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

  window.speechSynthesis.cancel();
  window.speechSynthesis.resume();
  onStart?.();

  let index = 0;
  const speakNext = () => {
    if (activeSpeechToken !== speechToken) return;

    if (index >= chunks.length) return;

    const utterance = new SpeechSynthesisUtterance(chunks[index]);
    utterance.lang = voice?.lang || "pt-BR";
    utterance.rate = 1;
    utterance.pitch = 1;
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => {
      if (activeSpeechToken !== speechToken) return;
      index += 1;
      if (index >= chunks.length) {
        onEnd?.();
        return;
      }
      speakNext();
    };

    utterance.onerror = () => {
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
