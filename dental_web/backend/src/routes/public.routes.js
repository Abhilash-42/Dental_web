import express from "express";
import { BUSINESS } from "../config/business.js";
import { DOCTORS } from "../data/doctors.js";
import { SERVICES } from "../data/services.js";
import { OPEN_TIME, CLOSE_TIME, SLOT_DURATION_MINUTES } from "../config/env.js";
import { emailEnabled } from "../services/email.service.js";

export const publicRouter = express.Router();

publicRouter.get("/business", (_req, res) => res.json({ business: BUSINESS }));

publicRouter.get("/doctors", (_req, res) => res.json({ doctors: DOCTORS }));
publicRouter.get("/services", (_req, res) => res.json({ services: SERVICES }));

export function healthPayload() {
  return { ok: true, service: `${BUSINESS.name} API`, message: "Backend is running", appointmentHours: `${OPEN_TIME} - ${CLOSE_TIME}`, slotDurationMinutes: SLOT_DURATION_MINUTES, emailNotifications: emailEnabled() ? "enabled" : "disabled" };
}
