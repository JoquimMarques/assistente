export function addMessage(role, text, meta = "") {
  const chat = document.querySelector("#chat");
  if (!chat) return;

  const item = document.createElement("article");
  item.className = `message ${role}`;

  const textNode = document.createElement("div");
  textNode.textContent = text;
  item.appendChild(textNode);

  if (meta) {
    const metaNode = document.createElement("small");
    metaNode.textContent = meta;
    item.appendChild(metaNode);
  }

  chat.appendChild(item);
  chat.scrollTop = chat.scrollHeight;
}

export function setStatus(text) {
  const status = document.querySelector("#status");
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
