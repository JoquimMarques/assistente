export function createSpeechRecognizer({
  onResult,
  onStatusChange,
  onListeningChange,
  onNoSpeech,
  onDiagnostic
}) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    onStatusChange?.("Seu navegador nao suporta reconhecimento de voz.");
    return null;
  }

  const recognizer = new SpeechRecognition();
  const languageFallback = ["pt-PT", "pt-BR"];
  let languageIndex = 0;
  let compatibilityMode = false;

  function applyRecognitionProfile() {
    recognizer.lang = languageFallback[languageIndex];

    if (compatibilityMode) {
      recognizer.continuous = false;
      recognizer.interimResults = false;
      recognizer.maxAlternatives = 1;
      return;
    }

    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.maxAlternatives = 3;
  }

  applyRecognitionProfile();

  let capturedText = false;
  let lastInterimText = "";
  let noSpeechCount = 0;
  let hadNoSpeechError = false;
  let timeoutId = null;
  let isListening = false;

  function clearTimer() {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  }

  recognizer.onstart = () => {
    capturedText = false;
    lastInterimText = "";
    hadNoSpeechError = false;
    isListening = true;
    onListeningChange?.(true);
    onStatusChange?.(`Ouvindo (${recognizer.lang})... fale agora.`);

    timeoutId = setTimeout(() => {
      if (!isListening) return;
      recognizer.stop();
    }, 12000);
  };

  recognizer.onend = () => {
    isListening = false;
    clearTimer();
    onListeningChange?.(false);

    if (!capturedText && lastInterimText) {
      capturedText = true;
      onResult?.(lastInterimText);
      onStatusChange?.("Pronto para conversar.");
      return;
    }

    if (!capturedText) {
      onNoSpeech?.();
      onDiagnostic?.(`Sem transcricao valida em ${recognizer.lang}.`);
      onStatusChange?.("Nao captei sua voz. Tente novamente.");
      return;
    }

    onStatusChange?.("Pronto para conversar.");
  };

  recognizer.onerror = (event) => {
    const error = event?.error || "unknown";
    onDiagnostic?.(`onerror: ${error}`);

    if (error === "not-allowed" || error === "service-not-allowed") {
      onStatusChange?.("Permissao de microfone negada no navegador.");
      return;
    }

    if (error === "audio-capture") {
      onStatusChange?.("Falha temporaria ao acessar o microfone. Tente novamente.");
      return;
    }

    if (error === "no-speech") {
      hadNoSpeechError = true;
      noSpeechCount += 1;

      if (noSpeechCount >= 2) {
        languageIndex = (languageIndex + 1) % languageFallback.length;
        applyRecognitionProfile();
        onDiagnostic?.(`Trocando idioma de reconhecimento para ${recognizer.lang}.`);
      }

      if (noSpeechCount >= 4 && !compatibilityMode) {
        compatibilityMode = true;
        applyRecognitionProfile();
        onDiagnostic?.("Ativando modo de compatibilidade do reconhecimento (single-shot).");
      }

      onStatusChange?.("Nao ouvi fala detectavel. Tente novamente.");
      return;
    }

    onStatusChange?.("Nao consegui entender. Tente novamente.");
  };

  recognizer.onnomatch = () => {
    onDiagnostic?.("onnomatch disparado.");
    onStatusChange?.("Nao reconheci palavras claras. Tente novamente.");
  };

  recognizer.onresult = (event) => {
    let finalText = "";
    let interimText = "";

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = (result?.[0]?.transcript || "").trim();
      if (!text) continue;

      if (result.isFinal) {
        finalText = `${finalText} ${text}`.trim();
      } else {
        interimText = `${interimText} ${text}`.trim();
      }
    }

    if (interimText) {
      lastInterimText = interimText;
    }

    if (!finalText) return;

    capturedText = true;
    noSpeechCount = 0;
    if (compatibilityMode) {
      compatibilityMode = false;
      applyRecognitionProfile();
      onDiagnostic?.("Saindo do modo de compatibilidade: reconhecimento voltou ao normal.");
    }
    onResult?.(finalText);
    recognizer.stop();
  };

  recognizer.onaudiostart = () => {
    onDiagnostic?.("onaudiostart: audio capturado pelo navegador.");
  };

  recognizer.onsoundstart = () => {
    onDiagnostic?.("onsoundstart: som detectado no microfone.");
  };

  recognizer.onspeechstart = () => {
    onDiagnostic?.("onspeechstart: fala detectada.");
  };

  recognizer.onspeechend = () => {
    onDiagnostic?.("onspeechend: fala encerrada.");
  };

  recognizer.onaudioend = () => {
    onDiagnostic?.("onaudioend: captura de audio encerrada.");
  };

  const oldOnEnd = recognizer.onend;
  recognizer.onend = () => {
    oldOnEnd?.();
    if (hadNoSpeechError) {
      onDiagnostic?.("O navegador encerrou por no-speech (sem fala util reconhecida).");
    }
  };

  return recognizer;
}
