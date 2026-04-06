import { Router } from "express";
import {
  findExactMemory,
  findSimilarMemory,
  listMemories,
  teachMemory
} from "../services/memoryService.js";
import { searchWikipedia } from "../services/searchService.js";
import { askFreeAI } from "../services/aiService.js";

const router = Router();

router.get("/health", (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

router.get("/memory/list", async (req, res) => {
  try {
    const memories = await listMemories();
    res.json({ ok: true, memories });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/memory/teach", async (req, res) => {
  try {
    const { question, answer } = req.body || {};
    const item = await teachMemory(question, answer);
    res.status(201).json({ ok: true, memory: item });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.post("/memory/exact", async (req, res) => {
  try {
    const { text } = req.body || {};
    const memory = await findExactMemory(text);
    res.json({ ok: true, memory });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/memory/similar", async (req, res) => {
  try {
    const { text } = req.body || {};
    const memory = await findSimilarMemory(text);
    res.json({ ok: true, memory });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/search/wiki", async (req, res) => {
  try {
    const { q } = req.query;
    const result = await searchWikipedia(q);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/ai/answer", async (req, res) => {
  try {
    const { text } = req.body || {};
    const result = await askFreeAI(text);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
