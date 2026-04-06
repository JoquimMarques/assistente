export function speak(text) {
  const clean = String(text || "").trim();
  if (!clean || !("speechSynthesis" in window)) return;

  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = "pt-BR";
  utterance.rate = 1;
  utterance.pitch = 1;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
