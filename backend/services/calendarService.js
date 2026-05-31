import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDbPool } from "../config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fallbackFile = path.join(__dirname, "..", "data", "calendar.json");

// Garantir que a pasta data existe
async function ensureDataDir() {
  const dir = path.dirname(fallbackFile);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {}
}

async function readFallback() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(fallbackFile, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeFallback(events) {
  await ensureDataDir();
  await fs.writeFile(fallbackFile, JSON.stringify(events, null, 2), "utf8");
}

async function ensureTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      event_date VARCHAR(10) NOT NULL,
      event_time VARCHAR(5) NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
}

export async function listEvents() {
  const pool = await getDbPool();

  if (pool) {
    try {
      await ensureTable(pool);
      const [rows] = await pool.query(
        "SELECT id, title, event_date AS eventDate, event_time AS eventTime, description, created_at AS createdAt FROM calendar_events ORDER BY event_date ASC, event_time ASC LIMIT 300"
      );
      return rows;
    } catch (err) {
      console.error("[calendarService] Erro ao listar eventos no MySQL, tentando fallback:", err.message);
    }
  }

  // Fallback local JSON
  const events = await readFallback();
  // Ordenar por data e depois por hora
  return events.sort((a, b) => {
    const dateComp = String(a.eventDate).localeCompare(String(b.eventDate));
    if (dateComp !== 0) return dateComp;
    return String(a.eventTime).localeCompare(String(b.eventTime));
  });
}

export async function createEvent({ title, date, time, description = "" }) {
  const cleanTitle = String(title || "").trim();
  const cleanDate = String(date || "").trim(); // YYYY-MM-DD
  const cleanTime = String(time || "").trim(); // HH:MM
  const cleanDesc = String(description || "").trim();

  if (!cleanTitle || !cleanDate || !cleanTime) {
    throw new Error("Título, Data e Hora são obrigatórios.");
  }

  const pool = await getDbPool();

  if (pool) {
    try {
      await ensureTable(pool);
      const [result] = await pool.query(
        "INSERT INTO calendar_events (title, event_date, event_time, description) VALUES (?, ?, ?, ?)",
        [cleanTitle, cleanDate, cleanTime, cleanDesc]
      );
      return {
        id: result.insertId,
        title: cleanTitle,
        eventDate: cleanDate,
        eventTime: cleanTime,
        description: cleanDesc
      };
    } catch (err) {
      console.error("[calendarService] Erro ao criar evento no MySQL, tentando fallback:", err.message);
    }
  }

  // Fallback JSON
  const events = await readFallback();
  const item = {
    id: events.length ? Math.max(...events.map(e => Number(e.id || 0))) + 1 : 1,
    title: cleanTitle,
    eventDate: cleanDate,
    eventTime: cleanTime,
    description: cleanDesc,
    createdAt: new Date().toISOString()
  };

  events.push(item);
  await writeFallback(events);
  return item;
}

export async function deleteEvent(id) {
  const numId = Number(id);
  if (isNaN(numId)) {
    throw new Error("ID de evento inválido.");
  }

  const pool = await getDbPool();

  if (pool) {
    try {
      await ensureTable(pool);
      await pool.query("DELETE FROM calendar_events WHERE id = ?", [numId]);
      return { ok: true };
    } catch (err) {
      console.error("[calendarService] Erro ao deletar evento no MySQL, tentando fallback:", err.message);
    }
  }

  // Fallback JSON
  const events = await readFallback();
  const filtered = events.filter((e) => Number(e.id) !== numId);
  await writeFallback(filtered);
  return { ok: true };
}
