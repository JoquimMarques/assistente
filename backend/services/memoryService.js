import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDbPool } from "../config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fallbackFile = path.join(__dirname, "..", "data", "memory.json");

function normalizeText(text = "") {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitKeywords(text = "") {
  return normalizeText(text)
    .split(" ")
    .filter((token) => token.length > 2);
}

async function readFallback() {
  try {
    const raw = await fs.readFile(fallbackFile, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeFallback(memories) {
  await fs.writeFile(fallbackFile, JSON.stringify(memories, null, 2), "utf8");
}

function scoreSimilarity(a, b) {
  const setA = new Set(splitKeywords(a));
  const setB = new Set(splitKeywords(b));

  if (!setA.size || !setB.size) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }

  const union = setA.size + setB.size - intersection;
  return union ? intersection / union : 0;
}

async function ensureTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS memories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      normalized_question TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
}

export async function listMemories() {
  const pool = await getDbPool();

  if (pool) {
    await ensureTable(pool);
    const [rows] = await pool.query(
      "SELECT id, question, answer, created_at AS createdAt FROM memories ORDER BY id DESC LIMIT 200"
    );
    return rows;
  }

  return readFallback();
}

export async function teachMemory(question, answer) {
  const cleanQuestion = String(question || "").trim();
  const cleanAnswer = String(answer || "").trim();

  if (!cleanQuestion || !cleanAnswer) {
    throw new Error("Pergunta e resposta sao obrigatorias.");
  }

  const normalized = normalizeText(cleanQuestion);
  const pool = await getDbPool();

  if (pool) {
    await ensureTable(pool);
    const [result] = await pool.query(
      "INSERT INTO memories (question, answer, normalized_question) VALUES (?, ?, ?)",
      [cleanQuestion, cleanAnswer, normalized]
    );

    return {
      id: result.insertId,
      question: cleanQuestion,
      answer: cleanAnswer
    };
  }

  const memories = await readFallback();
  const item = {
    id: memories.length ? Number(memories[0].id || 0) + 1 : 1,
    question: cleanQuestion,
    answer: cleanAnswer,
    normalized_question: normalized,
    createdAt: new Date().toISOString()
  };

  memories.unshift(item);
  await writeFallback(memories);
  return item;
}

export async function findExactMemory(text) {
  const normalizedInput = normalizeText(text);
  if (!normalizedInput) return null;

  const pool = await getDbPool();

  if (pool) {
    await ensureTable(pool);
    const [rows] = await pool.query(
      "SELECT id, question, answer FROM memories WHERE normalized_question = ? LIMIT 1",
      [normalizedInput]
    );

    return rows[0] || null;
  }

  const memories = await readFallback();
  return (
    memories.find((item) => normalizeText(item.question) === normalizedInput) ||
    null
  );
}

export async function findSimilarMemory(text, threshold = 0.30) {
  const normalizedInput = normalizeText(text);
  if (!normalizedInput) return null;

  const pool = await getDbPool();
  let memories = [];

  if (pool) {
    await ensureTable(pool);
    const [rows] = await pool.query(
      "SELECT id, question, answer FROM memories ORDER BY id DESC LIMIT 500"
    );
    memories = rows;
  } else {
    memories = await readFallback();
  }

  let best = null;
  let bestScore = 0;

  for (const item of memories) {
    const score = scoreSimilarity(normalizedInput, item.question);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }

  if (!best || bestScore < threshold) {
    return null;
  }

  return { ...best, score: Number(bestScore.toFixed(3)) };
}

export { normalizeText };
