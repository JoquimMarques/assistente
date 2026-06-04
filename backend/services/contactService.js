import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDbPool } from "../config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fallbackFile = path.join(__dirname, "..", "data", "contacts.json");

// Garantir que a pasta data existe
async function ensureDataDir() {
  const dir = path.dirname(fallbackFile);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {}
}

function normalizeContactName(name = "") {
  return String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

async function writeFallback(contacts) {
  await ensureDataDir();
  await fs.writeFile(fallbackFile, JSON.stringify(contacts, null, 2), "utf8");
}

async function ensureTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      normalized_name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
}

export async function listContacts() {
  const pool = await getDbPool();

  if (pool) {
    try {
      await ensureTable(pool);
      const [rows] = await pool.query(
        "SELECT id, name, phone, created_at AS createdAt FROM contacts ORDER BY name ASC LIMIT 500"
      );
      return rows;
    } catch (err) {
      console.error("[contactService] Erro ao listar contactos no MySQL, usando fallback:", err.message);
    }
  }

  const contacts = await readFallback();
  return contacts.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createContact({ name, phone }) {
  const cleanName = String(name || "").trim();
  const cleanPhone = String(phone || "").trim();

  if (!cleanName || !cleanPhone) {
    throw new Error("Nome e telefone são campos obrigatórios.");
  }

  const normalized = normalizeContactName(cleanName);
  const pool = await getDbPool();

  if (pool) {
    try {
      await ensureTable(pool);
      // Opcional: Atualizar se o nome normalizado já existir ou apenas inserir
      const [result] = await pool.query(
        "INSERT INTO contacts (name, phone, normalized_name) VALUES (?, ?, ?)",
        [cleanName, cleanPhone, normalized]
      );
      return {
        id: result.insertId,
        name: cleanName,
        phone: cleanPhone
      };
    } catch (err) {
      console.error("[contactService] Erro ao criar contacto no MySQL, usando fallback:", err.message);
    }
  }

  const contacts = await readFallback();
  // Se já existir contacto com o mesmo nome normalizado, atualizar
  const existingIdx = contacts.findIndex(c => normalizeContactName(c.name) === normalized);
  const item = {
    id: existingIdx >= 0 ? contacts[existingIdx].id : (contacts.length ? Math.max(...contacts.map(c => Number(c.id || 0))) + 1 : 1),
    name: cleanName,
    phone: cleanPhone,
    normalized_name: normalized,
    createdAt: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    contacts[existingIdx] = item;
  } else {
    contacts.push(item);
  }

  await writeFallback(contacts);
  return item;
}

export async function findContactByName(name) {
  const normalizedSearch = normalizeContactName(name);
  if (!normalizedSearch) return null;

  const pool = await getDbPool();

  if (pool) {
    try {
      await ensureTable(pool);
      const [rows] = await pool.query(
        "SELECT id, name, phone FROM contacts WHERE normalized_name = ? LIMIT 1",
        [normalizedSearch]
      );
      if (rows[0]) return rows[0];

      // Pesquisa parcial simples por LIKE se não encontrar exato
      const [partialRows] = await pool.query(
        "SELECT id, name, phone FROM contacts WHERE normalized_name LIKE ? LIMIT 1",
        [`%${normalizedSearch}%`]
      );
      return partialRows[0] || null;
    } catch (err) {
      console.error("[contactService] Erro ao pesquisar contacto no MySQL, usando fallback:", err.message);
    }
  }

  const contacts = await readFallback();
  const exact = contacts.find(c => normalizeContactName(c.name) === normalizedSearch);
  if (exact) return exact;

  // Busca parcial no fallback
  return contacts.find(c => normalizeContactName(c.name).includes(normalizedSearch)) || null;
}
