import express from "express";
import { answerChat } from "../services/chatbot.service.js";

export const chatbotRouter = express.Router();

chatbotRouter.post("/", async (req, res) => {
  const userQuery = String(req.body?.query || "").trim();
  if (!userQuery) return res.status(400).json({ error: "missing query" });
  try {
    res.json(await answerChat(userQuery));
  } catch (err) {
    console.error("Chatbot error:", err);
    res.status(500).json({ error: "Chatbot service temporarily unavailable." });
  }
});
