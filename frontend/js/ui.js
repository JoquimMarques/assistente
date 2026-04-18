export function addMessage(role, text, meta = "") {
  const chat = document.querySelector("#chat");
  if (!chat) return;

  const item = document.createElement("article");
  item.className = `message ${role}`;

  const textNode = document.createElement("div");
  textNode.className = "message-content";
  
  // Renderiza Markdown e sanitiza o HTML
  const rawHtml = marked.parse(text);
  const cleanHtml = DOMPurify.sanitize(rawHtml);
  textNode.innerHTML = cleanHtml;
  
  item.appendChild(textNode);

  if (meta && !["usuario", "sistema", "resposta_pronta", "ativacao", "diagnostico"].includes(meta)) {
    const metaNode = document.createElement("span");
    metaNode.className = "source-tag";
    metaNode.textContent = `Fonte: ${meta}`;
    item.appendChild(metaNode);
  }

  chat.appendChild(item);
  chat.scrollTop = chat.scrollHeight;
}

export function setStatus(text) {
  const status = document.querySelector("#status-text");
  if (!status) return;
  status.textContent = text;
}

export function addDebugLog(type, detail) {
  const log = document.querySelector("#debug-log");
  if (!log) return;

  const item = document.createElement("div");
  item.className = "debug-entry";

  const time = new Date().toLocaleTimeString("pt-PT", {
    hour12: false
  });

  item.textContent = `[${time}] ${type}: ${detail}`;
  log.prepend(item);

  const children = Array.from(log.children);
  if (children.length > 80) {
    children.slice(80).forEach((node) => node.remove());
  }
}

export function clearDebugLog() {
  const log = document.querySelector("#debug-log");
  if (!log) return;
  log.innerHTML = "";
}
