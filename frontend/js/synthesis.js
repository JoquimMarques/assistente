function pickPortugueseVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  if (!voices.length) return null;

  const exact = voices.find((voice) => voice.lang?.toLowerCase() === "pt-br");
  if (exact) return exact;

  const pt = voices.find((voice) => String(voice.lang || "").toLowerCase().startsWith("pt"));
  return pt || null;
}

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

export function speak(text) {
  const clean = String(text || "").trim();
  if (!clean || !("speechSynthesis" in window)) return false;

  const chunks = splitIntoSpeechChunks(clean);
  if (!chunks.length) return false;

  const voice = pickPortugueseVoice();

  window.speechSynthesis.cancel();
  window.speechSynthesis.resume();

  let index = 0;
  const speakNext = () => {
    if (index >= chunks.length) return;

    const utterance = new SpeechSynthesisUtterance(chunks[index]);
    utterance.lang = voice?.lang || "pt-BR";
    utterance.rate = 1;
    utterance.pitch = 1;
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => {
      index += 1;
      speakNext();
    };

    utterance.onerror = () => {
      index += 1;
      speakNext();
    };

    window.speechSynthesis.speak(utterance);
  };

  speakNext();
  return true;
}
