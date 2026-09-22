import express from "express";
import cors from "cors";
import { ALLOWED_ORIGIN, PORT, OPEN_TIME, CLOSE_TIME, SLOT_DURATION_MINUTES, validateProductionConfig } from "./config/env.js";
import { BUSINESS } from "./config/business.js";
import { initDb } from "./db/init.js";
import { pool } from "./db/pool.js";
import { emailEnabled } from "./services/email.service.js";
import { adminAuthRouter } from "./routes/adminAuth.routes.js";
import { publicRouter, healthPayload } from "./routes/public.routes.js";
import { availabilityRouter } from "./routes/availability.routes.js";
import { appointmentsRouter } from "./routes/appointments.routes.js";
import { chatbotRouter } from "./routes/chatbot.routes.js";
import { securityHeaders, noStore, requestId, adminApiRateLimit } from "./middleware/security.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(requestId);
  app.use(securityHeaders);
  app.use(noStore);
  app.use(express.json({ limit: "256kb" }));
  app.use(cors({ origin: ALLOWED_ORIGIN }));

  app.get("/", (_req, res) => res.json(healthPayload()));
  app.use("/api/admin", adminAuthRouter);
  app.use("/api/admin", adminApiRateLimit);
  app.use("/api", publicRouter);
  app.use("/api/availability", availabilityRouter);
  app.use("/api/appointments", appointmentsRouter);
  app.use("/api/rag-chat", chatbotRouter);

  app.use((err, _req, res, _next) => {
    console.error("Unhandled API error:", err);
    res.status(500).json({ error: "Internal server error." });
  });
  return app;
}

export async function startServer() {
  try {
    validateProductionConfig();
    await initDb();
    const app = createApp();
    app.listen(PORT, () => {
      console.log(`API running on port ${PORT}`);
      console.log(`Business: ${BUSINESS.name}`);
      console.log(`Appointment hours: ${OPEN_TIME} - ${CLOSE_TIME}`);
      console.log(`Real-time booking: ${SLOT_DURATION_MINUTES}-minute slots with doctor/date/time protection`);
      console.log(`Email notifications: ${emailEnabled() ? "enabled" : "disabled"}`);
    });
  } catch (err) {
    console.error("Database initialization failed:", err);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}
