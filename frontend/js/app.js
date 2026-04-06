import { createSpeechRecognizer } from "./speech.js";
import { speak } from "./synthesis.js";
import { processUserText } from "./processor.js";
import { addDebugLog, addMessage, clearDebugLog, setStatus } from "./ui.js";

const form = document.querySelector("#chat-form");
const input = document.querySelector("#chat-input");
const voiceButton = document.querySelector("#btn-voice");
const clearDebugButton = document.querySelector("#btn-clear-debug");
const micSelect = document.querySelector("#mic-select");
const refreshMicsButton = document.querySelector("#btn-refresh-mics");
const openChatButton = document.querySelector("#btn-open-chat");
const closeChatButton = document.querySelector("#btn-close-chat");
const openSettingsButton = document.querySelector("#btn-open-settings");
const closeSettingsButton = document.querySelector("#btn-close-settings");
let isListening = false;
let isStarting = false;
let isSpeaking = false;
let lastNoSpeechAt = 0;
let lastMicPeak = 0;
let noSpeechWithSignalCount = 0;
let selectedDeviceId = "default";

function setSpeakingState(speaking) {
  isSpeaking = speaking;
  document.body.classList.toggle("assistant-speaking", speaking);
  if (voiceButton) {
    voiceButton.disabled = speaking;
    voiceButton.setAttribute("aria-disabled", speaking ? "true" : "false");
  }
}

function warmupSpeechSynthesis() {
  if (!("speechSynthesis" in window)) return;

  const loadVoices = () => {
    window.speechSynthesis.getVoices();
  };

  loadVoices();
  window.speechSynthesis.addEventListener("voiceschanged", loadVoices, { once: true });
}

function buildAudioConstraint() {
  if (!selectedDeviceId || selectedDeviceId === "default") {
    return { audio: true };
  }

  return {
    audio: {
      deviceId: { exact: selectedDeviceId }
    }
  };
}

async function getMicrophoneStreamWithFallback() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: true, stream: null, usedFallback: false };
  }

  const attempts = [buildAudioConstraint(), { audio: true }];
  let lastError = null;

  for (let i = 0; i < attempts.length; i += 1) {
    const constraint = attempts[i];
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraint);
      const usedFallback = i > 0;

      if (usedFallback && selectedDeviceId !== "default") {
        selectedDeviceId = "default";
        if (micSelect) micSelect.value = "default";
        addDebugLog("MIC", "Falha no dispositivo selecionado. Fallback para microfone padrao.");
      }

      return { ok: true, stream, usedFallback };
    } catch (error) {
      lastError = error;
    }
  }

  return { ok: false, stream: null, error: lastError, usedFallback: false };
}

function isProbablyVirtualMicrophone(label = "") {
  const lower = label.toLowerCase();
  return (
    lower.includes("steam") ||
    lower.includes("virtual") ||
    lower.includes("stereo mix") ||
    lower.includes("cable output")
  );
}

function pickPreferredMicrophone(devices) {
  if (!devices.length) return null;
  const nonVirtual = devices.find((device) => !isProbablyVirtualMicrophone(device.label));
  return nonVirtual || devices[0];
}

async function loadAudioInputDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const microphones = devices.filter((device) => device.kind === "audioinput");

    if (!micSelect) return;
    micSelect.innerHTML = "";

    if (!microphones.length) {
      const option = document.createElement("option");
      option.value = "default";
      option.textContent = "Nenhum microfone detectado";
      micSelect.appendChild(option);
      selectedDeviceId = "default";
      return;
    }

    for (const mic of microphones) {
      const option = document.createElement("option");
      option.value = mic.deviceId;
      option.textContent = mic.label || "Microfone sem nome";
      micSelect.appendChild(option);
    }

    const current = microphones.find((mic) => mic.deviceId === selectedDeviceId);
    const preferred = pickPreferredMicrophone(microphones);

    if (!current) {
      selectedDeviceId = preferred?.deviceId || microphones[0].deviceId;
    } else if (isProbablyVirtualMicrophone(current.label) && preferred) {
      selectedDeviceId = preferred.deviceId;
    }

    micSelect.value = selectedDeviceId;

    const chosen = microphones.find((item) => item.deviceId === selectedDeviceId);
    if (chosen) {
      addDebugLog("MIC", `Selecionado: ${chosen.label || "Microfone sem nome"}`);
    }
  } catch {
    addDebugLog("ERROR", "Nao consegui listar os microfones do navegador");
  }
}

if (navigator.mediaDevices?.addEventListener) {
  navigator.mediaDevices.addEventListener("devicechange", () => {
    addDebugLog("MIC", "Mudanca de dispositivo detectada. Atualizando lista...");
    loadAudioInputDevices();
  });
}

async function probeMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) return true;

  const result = await getMicrophoneStreamWithFallback();
  if (!result.ok) {
    return false;
  }

  result.stream?.getTracks().forEach((track) => track.stop());
  return true;
}

async function probeMicrophoneSignal() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: true, hasSignal: true, peak: 0, deviceLabel: "desconhecido" };
  }

  let stream;
  let audioContext;

  try {
    const micResult = await getMicrophoneStreamWithFallback();
    if (!micResult.ok || !micResult.stream) {
      return { ok: false, hasSignal: false, peak: 0, deviceLabel: "indisponivel" };
    }

    stream = micResult.stream;
    const track = stream.getAudioTracks()[0];
    const deviceLabel = track?.label || "microfone sem nome";

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);

    const data = new Uint8Array(analyser.fftSize);
    let peak = 0;

    const startedAt = Date.now();
    while (Date.now() - startedAt < 1100) {
      analyser.getByteTimeDomainData(data);

      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const centered = (data[i] - 128) / 128;
        sum += centered * centered;
      }

      const rms = Math.sqrt(sum / data.length);
      if (rms > peak) peak = rms;

      await new Promise((resolve) => setTimeout(resolve, 60));
    }

    const hasSignal = peak > 0.015;
    return { ok: true, hasSignal, peak, deviceLabel };
  } catch {
    return { ok: false, hasSignal: false, peak: 0, deviceLabel: "indisponivel" };
  } finally {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (audioContext) {
      await audioContext.close();
    }
  }
}

async function handleInput(text) {
  const clean = String(text || "").trim();
  if (!clean) return;

  addMessage("user", clean, "usuario");
  setStatus("Pensando...");

  try {
    const result = await processUserText(clean);
    addMessage("assistant", result.reply, result.source || "assistente");

    const speechStarted = speak(result.reply, {
      onStart: () => {
        setSpeakingState(true);
        setStatus("Falando resposta...");
      },
      onEnd: () => {
        setSpeakingState(false);
        setStatus("Pronto para conversar.");
      }
    });

    if (!speechStarted) {
      setSpeakingState(false);
      setStatus("Pronto para conversar.");
    }
  } catch {
    setSpeakingState(false);
    const msg = "Tive um erro ao processar. Tente novamente em instantes.";
    addMessage("assistant", msg, "erro");
    setStatus("Erro temporario no processamento.");
  }
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await handleInput(input?.value || "");
  if (input) input.value = "";
});

micSelect?.addEventListener("change", () => {
  selectedDeviceId = micSelect.value || "default";
  const label = micSelect.options[micSelect.selectedIndex]?.textContent || "Microfone";
  addDebugLog("MIC", `Troca manual para: ${label}`);
  setStatus(`Microfone selecionado: ${label}`);
});

refreshMicsButton?.addEventListener("click", async () => {
  addDebugLog("ACTION", "Atualizando lista de microfones");
  await loadAudioInputDevices();
});

openChatButton?.addEventListener("click", () => {
  document.body.classList.add("show-chat");
  document.body.classList.remove("show-settings");
});

closeChatButton?.addEventListener("click", () => {
  document.body.classList.remove("show-chat");
});

openSettingsButton?.addEventListener("click", () => {
  document.body.classList.add("show-settings");
  document.body.classList.remove("show-chat");
});

closeSettingsButton?.addEventListener("click", () => {
  document.body.classList.remove("show-settings");
});

const recognizer = createSpeechRecognizer({
  onResult: async (spokenText) => {
    addDebugLog("RESULT", spokenText);
    await handleInput(spokenText);
  },
  onStatusChange: (status) => {
    addDebugLog("STATUS", status);
    setStatus(status);
  },
  onListeningChange: (listening) => {
    isListening = listening;
    voiceButton?.classList.toggle("listening", listening);
    document.body.classList.toggle("assistant-listening", listening);
    addDebugLog("LISTENING", listening ? "inicio" : "fim");
  },
  onNoSpeech: () => {
    const now = Date.now();
    if (now - lastNoSpeechAt < 2500) return;
    lastNoSpeechAt = now;

    if (lastMicPeak > 0.05) {
      noSpeechWithSignalCount += 1;
    } else {
      noSpeechWithSignalCount = 0;
    }

    if (noSpeechWithSignalCount >= 2) {
      addMessage(
        "assistant",
        "Seu microfone tem sinal, mas o motor de reconhecimento do navegador nao está captando fala. No Windows, defina esse microfone como padrao do sistema e padrao de comunicacao, feche e abra o navegador e teste novamente.",
        "diagnostico"
      );
      addDebugLog(
        "HINT",
        "No-speech com pico alto: ajustar microfone padrao no Windows e reiniciar navegador"
      );
      return;
    }

    addMessage(
      "assistant",
      "Nao captei sua fala. Clique no microfone e fale logo apos o sinal de escuta.",
      "diagnostico"
    );
    addDebugLog("NO-SPEECH", "Sem texto reconhecido no ciclo atual");
  },
  onDiagnostic: (message) => {
    addDebugLog("VOICE", message);
    setStatus(message);
  }
});

clearDebugButton?.addEventListener("click", () => {
  clearDebugLog();
  addDebugLog("DEBUG", "Log limpo manualmente");
});

voiceButton?.addEventListener("click", async () => {
  if (!recognizer) {
    addDebugLog("ERROR", "SpeechRecognition nao suportado");
    setStatus("Reconhecimento de voz indisponivel neste navegador.");
    return;
  }

  if (isStarting) {
    addDebugLog("ACTION", "Ignorando clique: reconhecimento ainda iniciando");
    return;
  }

  if (isSpeaking) {
    addDebugLog("ACTION", "Aguarde a resposta terminar para iniciar nova escuta");
    setStatus("Aguarde eu terminar de falar para ouvir de novo.");
    return;
  }

  if (isListening) {
    addDebugLog("ACTION", "Parando escuta manualmente");
    recognizer.stop();
    return;
  }

  isStarting = true;

  addDebugLog("ACTION", "Iniciando verificacao de microfone");
  const micOk = await probeMicrophone();
  if (!micOk) {
    addMessage(
      "assistant",
      "Nao consegui acessar o microfone agora. Verifique permissao do navegador e se outro app nao esta bloqueando o dispositivo.",
      "diagnostico"
    );
    addDebugLog("ERROR", "Falha ao acessar microfone via getUserMedia");
    setStatus("Permita o microfone para este site e tente novamente.");
    isStarting = false;
    return;
  }

  await loadAudioInputDevices();

  const signal = await probeMicrophoneSignal();
  if (!signal.ok) {
    addDebugLog("WARN", "Falha ao medir sinal do microfone. Tentando escuta mesmo assim.");
    lastMicPeak = 0;
  } else {
    addDebugLog(
      "MIC",
      `Dispositivo: ${signal.deviceLabel} | Pico: ${signal.peak.toFixed(4)}`
    );
    lastMicPeak = signal.peak;
  }

  if (signal.ok && !signal.hasSignal) {
    addMessage(
      "assistant",
      "Sinal baixo detectado agora, mas vou tentar ouvir mesmo assim. Fale perto do microfone logo apos ativar.",
      "diagnostico"
    );
    setStatus("Sinal de microfone baixo. Tentando reconhecimento...");
  }

  try {
    addDebugLog("ACTION", "Iniciando reconhecimento de voz");
    recognizer.start();
    setTimeout(() => {
      isStarting = false;
    }, 400);
  } catch {
    addDebugLog("ERROR", "start() falhou");
    setStatus("Nao foi possivel iniciar o microfone agora. Tente novamente.");
    isStarting = false;
  }
});

addDebugLog("DEBUG", "Painel de debug iniciado");
warmupSpeechSynthesis();

await loadAudioInputDevices();

addMessage(
  "assistant",
  "Ola. Pergunte algo ou diga: mostrar memorias, ensinar algo, abrir memoria.",
  "sistema"
);
