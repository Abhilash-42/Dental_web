import Groq from "groq-sdk";
import { BUSINESS } from "../config/business.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
if (!process.env.GROQ_API_KEY) console.warn("WARNING: GROQ_API_KEY is not configured.");

export async function askGroq(userQuery, contextChunks) {
  const context = contextChunks.map((chunk) => `- ${chunk.text}`).join("\n");
  const systemPrompt = `
You are the virtual assistant for ${BUSINESS.name}.

Answer the user's question briefly, naturally and warmly.

IMPORTANT RULES:
1. Use ONLY the hospital information supplied in the context.
2. Do NOT invent prices, services, timings, doctors, treatments, guarantees, availability, or medical instructions.
3. If the context does not contain the answer, clearly say: "I don't have that information right now." Then provide the hospital phone number ${BUSINESS.phone}.
4. Do not pretend to diagnose the patient.
5. For urgent or severe dental symptoms, encourage contacting the hospital directly.
6. Keep the answer concise and easy to understand.
7. If the user asks a general question that is not about the hospital's documented information, say that you don't have that information rather than guessing.

Hospital knowledge:
${context}
`;
  try {
    const completion = await groq.chat.completions.create({ model: "openai/gpt-oss-20b", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userQuery }], temperature: 0.2, max_completion_tokens: 600 });
    return completion?.choices?.[0]?.message?.content?.trim() || `I don't have that information right now. Please call ${BUSINESS.phone} and our team can help.`;
  } catch (err) {
    console.error("Groq error:", err?.message || err);
    return `I'm having trouble answering right now. Please call ${BUSINESS.phone} and our team can help.`;
  }
}
