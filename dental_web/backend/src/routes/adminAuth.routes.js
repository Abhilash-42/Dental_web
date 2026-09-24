import express from "express";
import { loginAdmin, requireAdmin, adminUserFromRequest } from "../services/adminAuth.service.js";
import { adminLoginRateLimit } from "../middleware/security.js";

export const adminAuthRouter = express.Router();

adminAuthRouter.post("/login", adminLoginRateLimit, (req, res) => {
  try {
    res.json(loginAdmin(req.body?.username, req.body?.password));
  } catch (err) {
    if (err.status === 503) console.error(err.message);
    res.status(err.status || 500).json({ error: err.message || "Admin login failed." });
  }
});

adminAuthRouter.get("/me", requireAdmin, (req, res) => {
  res.json({ authenticated: true, user: adminUserFromRequest(req) });
});

// Bearer tokens are stateless. Sign-out removes the token from the browser;
// this endpoint exists so the frontend can use one consistent logout flow.
adminAuthRouter.post("/logout", requireAdmin, (_req, res) => {
  res.json({ ok: true, message: "Admin session ended on the client." });
});
