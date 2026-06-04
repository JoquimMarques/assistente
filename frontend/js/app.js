import { createSpeechRecognizer } from "./speech.js";
import { speak } from "./synthesis.js";
import { processUserText, apiGet, apiPost, apiDelete } from "./processor.js";
import { addDebugLog, addMessage, clearDebugLog, setStatus, renderMemoryList } from "./ui.js";
import { initCanvas } from "./canvas.js";

initCanvas();

// ── DOM references ─────────────────────────────────────────────────────────────
const form                = document.querySelector("#chat-form");
const input               = document.querySelector("#chat-input");
const voiceButton         = document.querySelector("#btn-voice");
const clearDebugButton    = document.querySelector("#btn-clear-debug");
const micSelect           = document.querySelector("#mic-select");
const refreshMicsButton   = document.querySelector("#btn-refresh-mics");
const openChatButton      = document.querySelector("#btn-open-chat");
const closeChatButton     = document.querySelector("#btn-close-chat");
const openSettingsButton  = document.querySelector("#btn-open-settings");
const closeSettingsButton = document.querySelector("#btn-close-settings");
const closeMemoryButton   = document.querySelector("#btn-close-memory");
const memoryForm          = document.querySelector("#memory-form");
const refreshMemoryButton = document.querySelector("#btn-refresh-memory");
const timerWidget         = document.querySelector("#timer-widget");
const timerDisplay        = document.querySelector("#timer-display");
const cancelTimerButton   = document.querySelector("#btn-cancel-timer");

// New panels
const openEmailButton     = document.querySelector("#btn-open-email");   // optional floating btn
const closeEmailButton    = document.querySelector("#btn-close-email");
const emailForm           = document.querySelector("#email-form");
const openLocationButton  = document.querySelector("#btn-open-location");
const closeLocationButton = document.querySelector("#btn-close-location");
const openCalendarButton  = document.querySelector("#btn-open-calendar");
const closeCalendarButton = document.querySelector("#btn-close-calendar");
const calEventForm        = document.querySelector("#calendar-event-form");

// ── State ───────────────────────────────────────────────────────────────────────
let isListening       = false;
let isStarting        = false;
let isSpeaking        = false;
let lastNoSpeechAt    = 0;
let lastMicPeak       = 0;
let noSpeechWithSignalCount = 0;
let selectedDeviceId  = "default";
let chatContext       = [];
const MAX_CONTEXT     = 10;
let timerInterval     = null;

// ── LOCATION STATE ───────────────────────────────────────────────────────────────
let locationWatchId = null;

// ── CALENDAR STATE ───────────────────────────────────────────────────────────────
let calendarEvents    = [];
let calViewYear       = new Date().getFullYear();
let calViewMonth      = new Date().getMonth(); // 0-indexed
let calSelectedDate   = null;

// ══════════════════════════════════════════════════════════════════════════════
// PANEL HELPERS
// ══════════════════════════════════════════════════════════════════════════════

const ALL_PANELS = ["show-chat", "show-settings", "show-memory", "show-email", "show-location", "show-calendar"];

function closeAllPanels() {
  ALL_PANELS.forEach(cls => document.body.classList.remove(cls));
}

function openPanel(panelClass) {
  closeAllPanels();
  document.body.classList.add(panelClass);
}

// ══════════════════════════════════════════════════════════════════════════════
// SPEAKING STATE
// ══════════════════════════════════════════════════════════════════════════════

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
  const loadVoices = () => window.speechSynthesis.getVoices();
  loadVoices();
  window.speechSynthesis.addEventListener("voiceschanged", loadVoices, { once: true });
}

// ══════════════════════════════════════════════════════════════════════════════
// MICROPHONE HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function buildAudioConstraint() {
  if (!selectedDeviceId || selectedDeviceId === "default") return { audio: true };
  return { audio: { deviceId: { exact: selectedDeviceId } } };
}

async function getMicrophoneStreamWithFallback() {
  if (!navigator.mediaDevices?.getUserMedia) return { ok: true, stream: null, usedFallback: false };
  const attempts = [buildAudioConstraint(), { audio: true }];
  let lastError = null;
  for (let i = 0; i < attempts.length; i++) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(attempts[i]);
      const usedFallback = i > 0;
      if (usedFallback && selectedDeviceId !== "default") {
        selectedDeviceId = "default";
        if (micSelect) micSelect.value = "default";
        addDebugLog("MIC", "Falha no dispositivo selecionado. Fallback para microfone padrao.");
      }
      return { ok: true, stream, usedFallback };
    } catch (error) { lastError = error; }
  }
  return { ok: false, stream: null, error: lastError, usedFallback: false };
}

function isProbablyVirtualMicrophone(label = "") {
  const lower = label.toLowerCase();
  return lower.includes("steam") || lower.includes("virtual") || lower.includes("stereo mix") || lower.includes("cable output");
}

function pickPreferredMicrophone(devices) {
  if (!devices.length) return null;
  return devices.find(d => !isProbablyVirtualMicrophone(d.label)) || devices[0];
}

async function loadAudioInputDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const microphones = devices.filter(d => d.kind === "audioinput");
    if (!micSelect) return;
    micSelect.innerHTML = "";
    if (!microphones.length) {
      const opt = document.createElement("option");
      opt.value = "default"; opt.textContent = "Nenhum microfone detectado";
      micSelect.appendChild(opt); selectedDeviceId = "default"; return;
    }
    for (const mic of microphones) {
      const opt = document.createElement("option");
      opt.value = mic.deviceId; opt.textContent = mic.label || "Microfone sem nome";
      micSelect.appendChild(opt);
    }
    const current   = microphones.find(m => m.deviceId === selectedDeviceId);
    const preferred = pickPreferredMicrophone(microphones);
    if (!current) {
      selectedDeviceId = preferred?.deviceId || microphones[0].deviceId;
    } else if (isProbablyVirtualMicrophone(current.label) && preferred) {
      selectedDeviceId = preferred.deviceId;
    }
    micSelect.value = selectedDeviceId;
    const chosen = microphones.find(m => m.deviceId === selectedDeviceId);
    if (chosen) addDebugLog("MIC", `Selecionado: ${chosen.label || "Microfone sem nome"}`);
  } catch { addDebugLog("ERROR", "Nao consegui listar os microfones do navegador"); }
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
  if (!result.ok) return false;
  result.stream?.getTracks().forEach(t => t.stop());
  return true;
}

async function probeMicrophoneSignal() {
  if (!navigator.mediaDevices?.getUserMedia) return { ok: true, hasSignal: true, peak: 0, deviceLabel: "desconhecido" };
  let stream, audioContext;
  try {
    const micResult = await getMicrophoneStreamWithFallback();
    if (!micResult.ok || !micResult.stream) return { ok: false, hasSignal: false, peak: 0, deviceLabel: "indisponivel" };
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
      for (let i = 0; i < data.length; i++) { const c = (data[i] - 128) / 128; sum += c * c; }
      const rms = Math.sqrt(sum / data.length);
      if (rms > peak) peak = rms;
      await new Promise(r => setTimeout(r, 60));
    }
    return { ok: true, hasSignal: peak > 0.015, peak, deviceLabel };
  } catch { return { ok: false, hasSignal: false, peak: 0, deviceLabel: "indisponivel" }; }
  finally {
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (audioContext) await audioContext.close();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN INPUT HANDLER
// ══════════════════════════════════════════════════════════════════════════════

async function handleInput(text) {
  const clean = String(text || "").trim();
  if (!clean) return;

  addMessage("user", clean, "usuario");
  document.body.classList.remove("show-settings");
  setStatus("Pensando...");

  try {
    const result = await processUserText(clean, chatContext);

    // --- Actions ---
    if (result.action === "open_memory") {
      addMessage("assistant", result.reply, result.source);
      await loadAndShowMemories();
      speak(result.reply, {
        onStart: () => { setSpeakingState(true); setStatus("Falando..."); },
        onEnd:   () => { setSpeakingState(false); setStatus("Pronto para conversar."); }
      });
      return;
    }
    if (result.action === "start_timer" && result.timerParams) {
      const { value, unit } = result.timerParams;
      startTimer(unit === "minutes" ? value * 60 : value);
    }
    if (result.action === "fetch_news") {
      addMessage("assistant", result.reply, result.source);
      await fetchAndRenderNews();
      setStatus("Pronto para conversar.");
      return;
    }
    if (result.action === "open_location") {
      addMessage("assistant", result.reply, result.source);
      await loadAndShowLocation();
      speak(result.reply, {
        onStart: () => { setSpeakingState(true); setStatus("Falando..."); },
        onEnd:   () => { setSpeakingState(false); setStatus("Pronto para conversar."); }
      });
      return;
    }
    if (result.action === "open_email") {
      addMessage("assistant", result.reply, result.source);
      if (result.toHint) {
        const toInput = document.querySelector("#email-to");
        if (toInput) toInput.value = result.toHint;
      }
      openPanel("show-email");
      setStatus("Compositor de e-mail aberto.");
      speak(result.reply, {
        onStart: () => { setSpeakingState(true); setStatus("Falando..."); },
        onEnd:   () => { setSpeakingState(false); setStatus("Pronto para conversar."); }
      });
      return;
    }
    if (result.action === "open_calendar") {
      addMessage("assistant", result.reply, result.source);
      await loadAndShowCalendar();
      if (result.titleHint) {
        const titleInput = document.querySelector("#cal-event-title");
        if (titleInput) titleInput.value = result.titleHint;
      }
      speak(result.reply, {
        onStart: () => { setSpeakingState(true); setStatus("Falando..."); },
        onEnd:   () => { setSpeakingState(false); setStatus("Pronto para conversar."); }
      });
      return;
    }
    if (result.action === "calendar_event_created") {
      addMessage("assistant", result.reply, result.source);
      calendarEvents = []; // force reload
      await loadCalendarEvents();
      renderCalendar();
      setStatus("Pronto para conversar.");
      speak(result.reply, {
        onStart: () => { setSpeakingState(true); setStatus("Falando..."); },
        onEnd:   () => { setSpeakingState(false); setStatus("Pronto para conversar."); }
      });
      return;
    }
    if (result.action === "send_whatsapp" && result.whatsappParams) {
      const { phone, text } = result.whatsappParams;
      // Usar o número exatamente como foi guardado (sem prefixo automático)
      const cleanPhone = phone.replace(/[^\d]/g, "");
      
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const url = isMobile 
        ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`
        : `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`;

      // Mostrar a mensagem do assistente
      addMessage("assistant", result.reply, result.source);

      // Injetar botão WhatsApp clicável diretamente no chat (sem popup blocker)
      const chat = document.querySelector("#chat");
      if (chat) {
        const waBtn = document.createElement("a");
        waBtn.href = url;
        if (!isMobile) {
          waBtn.target = "_blank";
          waBtn.rel = "noopener noreferrer";
        }
        waBtn.style.cssText = `
          display: flex; align-items: center; gap: 10px;
          margin: 6px 0 6px auto; max-width: 280px;
          background: linear-gradient(135deg, #25D366, #128C7E);
          color: #fff; font-weight: 700; font-size: 0.95rem;
          text-decoration: none; padding: 12px 18px;
          border-radius: 16px; box-shadow: 0 4px 20px rgba(37,211,102,0.4);
          transition: opacity 0.2s ease; cursor: pointer;
        `;
        waBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.115.549 4.099 1.51 5.828L0 24l6.335-1.484A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818c-1.939 0-3.742-.527-5.28-1.443l-.379-.225-3.76.881.924-3.653-.247-.393A9.8 9.8 0 012.182 12C2.182 6.579 6.579 2.182 12 2.182S21.818 6.579 21.818 12 17.421 21.818 12 21.818z"/></svg>Abrir WhatsApp → ${cleanPhone}`;
        waBtn.onmouseover = () => waBtn.style.opacity = "0.85";
        waBtn.onmouseout = () => waBtn.style.opacity = "1";
        chat.appendChild(waBtn);
        chat.scrollTop = chat.scrollHeight;

        // Tentar redirecionar automaticamente
        if (isMobile) {
          window.location.href = url;
        } else {
          try {
            window.open(url, "_blank");
          } catch (e) {
            console.warn("Abertura automática bloqueada pelo navegador no desktop:", e);
          }
        }
      }

      speak(result.reply, {
        onStart: () => { setSpeakingState(true); setStatus("A abrir WhatsApp..."); },
        onEnd:   () => { setSpeakingState(false); setStatus("Pronto para conversar."); }
      });
      return;
    }

    addMessage("assistant", result.reply, result.source || "assistente");

    chatContext.push({ role: "user", content: clean });
    chatContext.push({ role: "assistant", content: result.reply });
    if (chatContext.length > MAX_CONTEXT) chatContext = chatContext.slice(-MAX_CONTEXT);

    const speechStarted = speak(result.reply, {
      onStart: () => { setSpeakingState(true); setStatus("Falando resposta..."); },
      onEnd:   () => { setSpeakingState(false); setStatus("Pronto para conversar."); }
    });
    if (!speechStarted) { setSpeakingState(false); setStatus("Pronto para conversar."); }

  } catch (err) {
    setSpeakingState(false);
    console.error("[handleInput] erro:", err);
    addMessage("assistant", "Tive um erro ao processar. Tente novamente em instantes.", "erro");
    setStatus("Erro temporario no processamento.");
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TIMER
// ══════════════════════════════════════════════════════════════════════════════

function startTimer(seconds) {
  if (timerInterval) clearInterval(timerInterval);
  let timeLeft = seconds;
  timerWidget?.classList.remove("hide");
  updateTimerDisplay(timeLeft);
  timerInterval = setInterval(() => {
    timeLeft -= 1;
    updateTimerDisplay(timeLeft);
    if (timeLeft <= 0) {
      clearInterval(timerInterval); timerInterval = null;
      timerWidget?.classList.add("hide");
      const msg = "Temporizador terminado!";
      addMessage("assistant", msg, "sistema");
      speak(msg, { onStart: () => setSpeakingState(true), onEnd: () => setSpeakingState(false) });
    }
  }, 1000);
}

function updateTimerDisplay(totalSeconds) {
  if (!timerDisplay) return;
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  timerDisplay.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

cancelTimerButton?.addEventListener("click", () => {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  timerWidget?.classList.add("hide");
  setStatus("Temporizador cancelado.");
});

// ══════════════════════════════════════════════════════════════════════════════
// MEMORY
// ══════════════════════════════════════════════════════════════════════════════

async function loadAndShowMemories() {
  try {
    setStatus("Carregando memória...");
    const data = await apiGet("/api/memory/list");
    renderMemoryList(data.memories || []);
    openPanel("show-memory");
    setStatus("Pronto para conversar.");
  } catch (error) {
    addDebugLog("ERROR", "Falha ao carregar memórias: " + error.message);
    setStatus("Erro ao carregar lista de memórias.");
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// NEWS
// ══════════════════════════════════════════════════════════════════════════════

async function fetchAndRenderNews() {
  const chat = document.querySelector("#chat");
  if (!chat) return;

  // Loading skeleton
  const loadingEl = document.createElement("article");
  loadingEl.className = "message assistant";
  loadingEl.innerHTML = `<div class="message-content" style="color: var(--text-muted); font-style: italic; font-size: 0.85rem;">⏳ A carregar notícias em tempo real...</div>`;
  chat.appendChild(loadingEl);
  chat.scrollTop = chat.scrollHeight;

  try {
    const data = await apiGet("/api/news");
    loadingEl.remove();

    if (!data.ok || !data.news?.length) {
      addMessage("assistant", "Não consegui obter notícias neste momento. Tente mais tarde.", "notícias");
      return;
    }

    const articles = data.news.slice(0, 5);

    // Header message
    const headerEl = document.createElement("article");
    headerEl.className = "message assistant";
    headerEl.innerHTML = `<div class="message-content"><strong style="color: var(--orange-neon);">📰 Notícias de Hoje</strong></div>`;
    chat.appendChild(headerEl);

    // News cards wrapper
    const wrapper = document.createElement("div");
    wrapper.className = "news-cards-wrapper";
    wrapper.style.cssText = "max-width: 420px; width: 100%; padding: 0 0 10px 0;";

    articles.forEach(art => {
      const card = document.createElement("a");
      card.className = "news-card";
      card.href = art.url || "#";
      card.target = "_blank";
      card.rel = "noopener noreferrer";
      card.innerHTML = `
        <img class="news-card-img" src="${art.urlToImage}" alt="${art.title}" onerror="this.src='https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=600&auto=format&fit=crop'">
        <div class="news-card-body">
          <div class="news-card-source">${art.source} · ${art.publishedAt}</div>
          <h3 class="news-card-title">${art.title}</h3>
          <p class="news-card-desc">${art.description}</p>
        </div>`;
      wrapper.appendChild(card);
    });

    chat.appendChild(wrapper);
    chat.scrollTop = chat.scrollHeight;

    // Voice summary – read first 3 headlines
    const headlines = articles.slice(0, 3).map(a => a.title).join(". ");
    const summary = `Aqui estão as principais notícias de hoje: ${headlines}`;
    speak(summary, {
      onStart: () => { setSpeakingState(true); setStatus("Lendo notícias..."); },
      onEnd:   () => { setSpeakingState(false); setStatus("Pronto para conversar."); }
    });

    // Make sure lucide icons re-render if needed
    if (window.lucide) lucide.createIcons();

  } catch (err) {
    loadingEl.remove();
    addMessage("assistant", "Erro ao carregar notícias. Verifique a ligação à internet.", "erro");
    console.error("[News] erro:", err);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// LOCATION
// ══════════════════════════════════════════════════════════════════════════════

function updateLocationUI(lat, lon, accuracy) {
  const latEl = document.querySelector("#loc-lat");
  const lonEl = document.querySelector("#loc-lon");
  const accEl = document.querySelector("#loc-accuracy");
  const iframeEl = document.querySelector("#loc-map-iframe");

  if (latEl) latEl.textContent = lat.toFixed(6);
  if (lonEl) lonEl.textContent = lon.toFixed(6);
  if (accEl) accEl.textContent = `±${Math.round(accuracy)} metros`;

  if (iframeEl) {
    const zoom = accuracy < 100 ? 16 : accuracy < 1000 ? 14 : 12;
    iframeEl.src = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.01},${lat - 0.01},${lon + 0.01},${lat + 0.01}&layer=mapnik&marker=${lat},${lon}`;
  }

  // Reverse geocode via Nominatim
  fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`)
    .then(r => r.json())
    .then(data => {
      const addr = data.display_name || "";
      const addrEl = document.querySelector("#loc-address");
      const addrContainer = document.querySelector("#loc-address-container");
      if (addrEl && addr) {
        addrEl.textContent = addr.split(",").slice(0, 3).join(", ");
        if (addrContainer) addrContainer.style.display = "";
      }
    })
    .catch(() => {});
}

function fetchLocation() {
  if (!navigator.geolocation) {
    addMessage("assistant", "Geolocalização não é suportada pelo seu navegador.", "sistema");
    return;
  }
  const latEl = document.querySelector("#loc-lat");
  const lonEl = document.querySelector("#loc-lon");
  if (latEl) latEl.textContent = "Obtendo localização...";
  if (lonEl) lonEl.textContent = "...";

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      updateLocationUI(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      setStatus("Localização obtida!");
      setTimeout(() => setStatus("Pronto para conversar."), 2000);
    },
    (err) => {
      const latEl = document.querySelector("#loc-lat");
      if (latEl) latEl.textContent = "Permissão negada ou erro";
      setStatus("Não foi possível obter a localização.");
      console.warn("[Location] erro:", err);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

async function loadAndShowLocation() {
  openPanel("show-location");
  setStatus("Obtendo localização GPS...");
  fetchLocation();
}

// ══════════════════════════════════════════════════════════════════════════════
// EMAIL
// ══════════════════════════════════════════════════════════════════════════════

emailForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const to      = document.querySelector("#email-to")?.value.trim();
  const subject = document.querySelector("#email-subject")?.value.trim();
  const body    = document.querySelector("#email-body")?.value.trim();
  if (!to || !subject || !body) return;

  const submitBtn  = document.querySelector("#btn-email-submit");
  const sendIcon   = document.querySelector("#icon-email-send");
  const sendText   = document.querySelector("#text-email-send");

  // Loading state
  if (submitBtn) submitBtn.classList.add("btn-sending");
  if (sendText)  sendText.textContent = "A enviar...";
  if (sendIcon)  { sendIcon.setAttribute("data-lucide", "loader"); lucide.createIcons(); }

  try {
    const result = await apiPost("/api/email/send", { to, subject, body });

    if (result.ok) {
      // Success state
      if (sendText)  sendText.textContent = "E-mail enviado! ✅";
      if (sendIcon)  { sendIcon.setAttribute("data-lucide", "check-circle"); lucide.createIcons(); }
      if (submitBtn) { submitBtn.style.background = "#22c55e"; submitBtn.classList.remove("btn-sending"); }

      addMessage("assistant", `**E-mail enviado com sucesso** para ${to}!\n\n**Assunto:** ${subject}`, "e-mail");
      speak(`E-mail enviado para ${to} com o assunto ${subject}.`, {
        onStart: () => setSpeakingState(true),
        onEnd:   () => setSpeakingState(false)
      });

      // Reset form after 2s
      setTimeout(() => {
        emailForm.reset();
        if (sendText)  sendText.textContent = "Enviar E-mail";
        if (sendIcon)  { sendIcon.setAttribute("data-lucide", "send"); lucide.createIcons(); }
        if (submitBtn) { submitBtn.style.background = ""; submitBtn.classList.remove("btn-sending"); }
      }, 2500);
    }
  } catch (err) {
    if (submitBtn) { submitBtn.classList.remove("btn-sending"); submitBtn.style.background = ""; }
    if (sendText)  sendText.textContent = "Erro ao enviar";
    if (sendIcon)  { sendIcon.setAttribute("data-lucide", "alert-circle"); lucide.createIcons(); }
    setTimeout(() => {
      if (sendText)  sendText.textContent = "Enviar E-mail";
      if (sendIcon)  { sendIcon.setAttribute("data-lucide", "send"); lucide.createIcons(); }
    }, 2000);
    console.error("[Email] erro:", err);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// CALENDAR
// ══════════════════════════════════════════════════════════════════════════════

const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

async function loadCalendarEvents() {
  try {
    const data = await apiGet("/api/calendar/events");
    calendarEvents = data.events || [];
  } catch (err) {
    console.error("[Calendar] erro ao carregar eventos:", err);
    calendarEvents = [];
  }
}

function getEventsForDate(dateStr) {
  return calendarEvents.filter(ev => ev.eventDate === dateStr);
}

function renderCalendar() {
  const daysEl = document.querySelector("#calendar-days");
  const monthYearEl = document.querySelector("#calendar-month-year");
  if (!daysEl || !monthYearEl) return;

  monthYearEl.textContent = `${MONTH_NAMES[calViewMonth]} ${calViewYear}`;
  daysEl.innerHTML = "";

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  const firstDay = new Date(calViewYear, calViewMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
  const daysInPrev  = new Date(calViewYear, calViewMonth, 0).getDate();

  // Previous month filler
  for (let i = firstDay - 1; i >= 0; i--) {
    const dayEl = document.createElement("div");
    dayEl.className = "cal-day other-month";
    dayEl.textContent = daysInPrev - i;
    daysEl.appendChild(dayEl);
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calViewYear}-${String(calViewMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const dayEl = document.createElement("div");
    dayEl.className = "cal-day";
    if (dateStr === todayStr)     dayEl.classList.add("today");
    if (dateStr === calSelectedDate) dayEl.classList.add("selected");

    const numSpan = document.createElement("span");
    numSpan.textContent = d;
    dayEl.appendChild(numSpan);

    // Event dot
    if (getEventsForDate(dateStr).length > 0) {
      const dot = document.createElement("div");
      dot.className = "event-dot";
      dayEl.appendChild(dot);
    }

    dayEl.addEventListener("click", () => selectCalendarDay(dateStr));
    daysEl.appendChild(dayEl);
  }

  // Next month filler
  const totalCells = firstDay + daysInMonth;
  const remainder = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let n = 1; n <= remainder; n++) {
    const dayEl = document.createElement("div");
    dayEl.className = "cal-day other-month";
    dayEl.textContent = n;
    daysEl.appendChild(dayEl);
  }

  // Update selected day events if any
  if (calSelectedDate) renderDayEvents(calSelectedDate);
}

function selectCalendarDay(dateStr) {
  calSelectedDate = dateStr;
  renderCalendar();
  renderDayEvents(dateStr);

  // Pre-fill the event form date
  const dateInput = document.querySelector("#cal-event-date");
  if (dateInput) dateInput.value = dateStr;
}

function renderDayEvents(dateStr) {
  const listEl = document.querySelector("#calendar-events-list");
  const labelEl = document.querySelector("#selected-day-label");
  if (!listEl) return;

  const [y, m, d] = dateStr.split("-");
  const label = `${d} de ${MONTH_NAMES[parseInt(m,10)-1]} de ${y}`;
  if (labelEl) labelEl.textContent = `Compromissos — ${label}`;

  const events = getEventsForDate(dateStr);
  if (!events.length) {
    listEl.innerHTML = `<p class="cal-empty-msg">Nenhum compromisso para este dia.</p>`;
    return;
  }

  listEl.innerHTML = "";
  events.forEach(ev => {
    const item = document.createElement("div");
    item.className = "cal-event-item";
    item.innerHTML = `
      <span class="cal-event-time">${ev.eventTime}</span>
      <div class="cal-event-info">
        <div class="cal-event-title">${ev.title}</div>
        ${ev.description ? `<div class="cal-event-desc">${ev.description}</div>` : ""}
      </div>
      <button class="btn-delete-event" data-id="${ev.id}" title="Remover evento">
        <i data-lucide="trash-2"></i>
      </button>`;
    listEl.appendChild(item);
  });

  if (window.lucide) lucide.createIcons();

  // Delete event listeners
  listEl.querySelectorAll(".btn-delete-event").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      try {
        await apiDelete(`/api/calendar/events/${id}`);
        calendarEvents = calendarEvents.filter(ev => String(ev.id) !== String(id));
        renderCalendar();
        renderDayEvents(calSelectedDate);
      } catch (err) {
        console.error("[Calendar] erro ao deletar:", err);
      }
    });
  });
}

async function loadAndShowCalendar() {
  setStatus("Carregando calendário...");
  await loadCalendarEvents();
  renderCalendar();
  openPanel("show-calendar");
  setStatus("Pronto para conversar.");
}

calEventForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.querySelector("#cal-event-title")?.value.trim();
  const date  = document.querySelector("#cal-event-date")?.value;
  const time  = document.querySelector("#cal-event-time")?.value;
  const desc  = document.querySelector("#cal-event-desc")?.value.trim();
  if (!title || !date || !time) return;

  const submitBtn = calEventForm.querySelector("button[type='submit']");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = "0.7"; }

  try {
    const result = await apiPost("/api/calendar/events", { title, date, time, description: desc });
    if (result.ok) {
      calendarEvents.push(result.event);
      calSelectedDate = date;
      renderCalendar();
      renderDayEvents(date);
      calEventForm.reset();
      document.querySelector("#cal-event-date").value = date; // keep date
      setStatus("Evento criado!");
      setTimeout(() => setStatus("Pronto para conversar."), 2000);
    }
  } catch (err) {
    console.error("[Calendar] erro ao criar evento:", err);
    setStatus("Erro ao criar evento.");
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = ""; }
  }
});

document.querySelector("#btn-cal-prev")?.addEventListener("click", () => {
  calViewMonth--;
  if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; }
  renderCalendar();
});

document.querySelector("#btn-cal-next")?.addEventListener("click", () => {
  calViewMonth++;
  if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; }
  renderCalendar();
});

// ══════════════════════════════════════════════════════════════════════════════
// PANEL BUTTONS (Dock navigation)
// ══════════════════════════════════════════════════════════════════════════════

openChatButton?.addEventListener("click",     () => openPanel("show-chat"));
closeChatButton?.addEventListener("click",    () => document.body.classList.remove("show-chat"));
openSettingsButton?.addEventListener("click", () => openPanel("show-settings"));
closeSettingsButton?.addEventListener("click",() => document.body.classList.remove("show-settings"));
closeMemoryButton?.addEventListener("click",  () => document.body.classList.remove("show-memory"));

openEmailButton?.addEventListener("click",    () => openPanel("show-email"));
closeEmailButton?.addEventListener("click",   () => document.body.classList.remove("show-email"));

openLocationButton?.addEventListener("click", () => loadAndShowLocation());
closeLocationButton?.addEventListener("click", () => document.body.classList.remove("show-location"));

document.querySelector("#btn-update-location")?.addEventListener("click", () => {
  setStatus("Atualizando localização...");
  fetchLocation();
});

openCalendarButton?.addEventListener("click", () => loadAndShowCalendar());
closeCalendarButton?.addEventListener("click",() => document.body.classList.remove("show-calendar"));

// ── Chat form ──────────────────────────────────────────────────────────────────
form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await handleInput(input?.value || "");
  if (input) input.value = "";
});

// ── Mic select ────────────────────────────────────────────────────────────────
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

refreshMemoryButton?.addEventListener("click", async () => {
  const data = await apiGet("/api/memory/list");
  renderMemoryList(data.memories || []);
});

memoryForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const qInput = document.querySelector("#mem-question");
  const aInput = document.querySelector("#mem-answer");
  const question = qInput.value.trim();
  const answer   = aInput.value.trim();
  if (!question || !answer) return;
  try {
    setStatus("Salvando...");
    await apiPost("/api/memory/teach", { question, answer });
    qInput.value = ""; aInput.value = "";
    const data = await apiGet("/api/memory/list");
    renderMemoryList(data.memories || []);
    setStatus("Memória salva com sucesso!");
    setTimeout(() => setStatus("Pronto para conversar."), 2000);
  } catch (error) {
    addDebugLog("ERROR", "Erro ao salvar memória: " + error.message);
    setStatus("Erro ao salvar conhecimento.");
  }
});

clearDebugButton?.addEventListener("click", () => {
  clearDebugLog();
  addDebugLog("DEBUG", "Log limpo manualmente");
});

// ══════════════════════════════════════════════════════════════════════════════
// VOICE RECOGNITION
// ══════════════════════════════════════════════════════════════════════════════

const recognizer = createSpeechRecognizer({
  onResult: async (spokenText) => {
    const clean = String(spokenText || "").trim();
    addDebugLog("VOICE-RESULT", `Recebido: "${clean}"`);
    await handleInput(clean);
  },
  onStatusChange:   (status)    => { addDebugLog("STATUS", status); setStatus(status); },
  onListeningChange:(listening) => {
    isListening = listening;
    voiceButton?.classList.toggle("listening", listening);
    document.body.classList.toggle("assistant-listening", listening);
    addDebugLog("LISTENING", listening ? "inicio" : "fim");
  },
  onNoSpeech: () => {
    const now = Date.now();
    if (now - lastNoSpeechAt < 2500) return;
    lastNoSpeechAt = now;
    if (lastMicPeak > 0.05) { noSpeechWithSignalCount++; } else { noSpeechWithSignalCount = 0; }
    if (noSpeechWithSignalCount >= 2) {
      addMessage("assistant", "Seu microfone tem sinal, mas o motor de reconhecimento do navegador nao está captando fala. No Windows, defina esse microfone como padrao do sistema e padrao de comunicacao, feche e abra o navegador e teste novamente.", "diagnostico");
      return;
    }
    addMessage("assistant", "Nao captei sua fala. Clique no microfone e fale logo apos o sinal de escuta.", "diagnostico");
    addDebugLog("NO-SPEECH", "Sem texto reconhecido no ciclo atual");
  },
  onDiagnostic: (message) => { addDebugLog("VOICE", message); setStatus(message); }
});

voiceButton?.addEventListener("click", async () => {
  if (!recognizer) { addDebugLog("ERROR", "SpeechRecognition nao suportado"); setStatus("Reconhecimento de voz indisponivel neste navegador."); return; }
  if (isStarting)  { addDebugLog("ACTION", "Ignorando clique: reconhecimento ainda iniciando"); return; }
  if (isSpeaking)  { addDebugLog("ACTION", "Aguarde a resposta terminar para iniciar nova escuta"); setStatus("Aguarde eu terminar de falar para ouvir de novo."); return; }
  if (isListening) { addDebugLog("ACTION", "Parando escuta manualmente"); recognizer.stop(); return; }

  isStarting = true;
  addDebugLog("ACTION", "Iniciando verificacao de microfone");
  const micOk = await probeMicrophone();
  if (!micOk) {
    addMessage("assistant", "Nao consegui acessar o microfone agora. Verifique permissao do navegador e se outro app nao esta bloqueando o dispositivo.", "diagnostico");
    addDebugLog("ERROR", "Falha ao acessar microfone via getUserMedia");
    setStatus("Permita o microfone para este site e tente novamente.");
    isStarting = false; return;
  }

  await loadAudioInputDevices();
  const signal = await probeMicrophoneSignal();
  if (!signal.ok) {
    addDebugLog("WARN", "Falha ao medir sinal do microfone. Tentando escuta mesmo assim.");
    lastMicPeak = 0;
  } else {
    addDebugLog("MIC", `Dispositivo: ${signal.deviceLabel} | Pico: ${signal.peak.toFixed(4)}`);
    lastMicPeak = signal.peak;
  }

  if (signal.ok && !signal.hasSignal) {
    addMessage("assistant", "Sinal baixo detectado agora, mas vou tentar ouvir mesmo assim. Fale perto do microfone logo apos ativar.", "diagnostico");
    setStatus("Sinal de microfone baixo. Tentando reconhecimento...");
  }

  try {
    addDebugLog("ACTION", "Iniciando reconhecimento de voz");
    recognizer.start();
    setTimeout(() => { isStarting = false; }, 400);
  } catch {
    addDebugLog("ERROR", "start() falhou");
    setStatus("Nao foi possivel iniciar o microfone agora. Tente novamente.");
    isStarting = false;
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════════════════

addDebugLog("DEBUG", "Painel de debug iniciado");
warmupSpeechSynthesis();
await loadAudioInputDevices();

// Load first track metadata
loadTrack(currentTrackIndex);

addMessage("assistant", "Olá! Eu sou o Axel. Como posso te ajudar hoje?", "sistema");
