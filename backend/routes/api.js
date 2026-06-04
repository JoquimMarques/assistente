import { Router } from "express";
import {
  findExactMemory,
  findSimilarMemory,
  listMemories,
  teachMemory
} from "../services/memoryService.js";
import { searchWikipedia } from "../services/searchService.js";
import { askFreeAI } from "../services/aiService.js";
import { fetchTopNews } from "../services/newsService.js";
import { sendEmail } from "../services/emailService.js";
import { listEvents, createEvent, deleteEvent } from "../services/calendarService.js";
import { listContacts, createContact, findContactByName } from "../services/contactService.js";

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
    const { text, history } = req.body || {};
    const result = await askFreeAI(text, history);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// --- Novas Rotas (Notícias, E-mail e Calendário) ---

router.get("/news", async (req, res) => {
  try {
    const news = await fetchTopNews();
    res.json({ ok: true, news });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/email/send", async (req, res) => {
  try {
    const { to, subject, body } = req.body || {};
    const result = await sendEmail({ to, subject, body });
    res.json({ ok: true, result });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.get("/calendar/events", async (req, res) => {
  try {
    const events = await listEvents();
    res.json({ ok: true, events });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/calendar/events", async (req, res) => {
  try {
    const { title, date, time, description } = req.body || {};
    const event = await createEvent({ title, date, time, description });
    res.status(201).json({ ok: true, event });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.delete("/calendar/events/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await deleteEvent(id);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/contacts", async (req, res) => {
  try {
    const contacts = await listContacts();
    res.json({ ok: true, contacts });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/contacts", async (req, res) => {
  try {
    const { name, phone } = req.body || {};
    const contact = await createContact({ name, phone });
    res.status(201).json({ ok: true, contact });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.get("/contacts/search", async (req, res) => {
  try {
    const { name } = req.query;
    const contact = await findContactByName(name);
    res.json({ ok: true, contact });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
