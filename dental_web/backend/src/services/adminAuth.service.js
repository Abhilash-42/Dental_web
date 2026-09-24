import crypto from "crypto";
import { ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_TOKEN_SECRET, ADMIN_TOKEN_TTL_SECONDS } from "../config/env.js";

function base64Url(value) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function createAdminToken(username) {
  const payload = { sub: username, role: "admin", exp: Math.floor(Date.now() / 1000) + ADMIN_TOKEN_TTL_SECONDS };
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", ADMIN_TOKEN_SECRET).update(encodedPayload).digest("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${encodedPayload}.${signature}`;
}

function verifyAdminToken(token) {
  if (!token || !ADMIN_TOKEN_SECRET) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, signature] = parts;
  const expectedSignature = crypto.createHmac("sha256", ADMIN_TOKEN_SECRET).update(encodedPayload).digest("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (payload.role !== "admin" || payload.sub !== ADMIN_USERNAME || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

export function requireAdmin(req, res, next) {
  const authHeader = req.header("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const admin = verifyAdminToken(match?.[1]?.trim());
  if (!admin) return res.status(401).json({ error: "unauthorized", message: "Admin login is required or the session has expired." });
  req.admin = admin;
  next();
}

export function loginAdmin(username, password) {
  if (!ADMIN_PASSWORD || !ADMIN_TOKEN_SECRET) {
    const error = new Error("Admin authentication is not configured on the server.");
    error.status = 503;
    throw error;
  }
  const suppliedUsername = String(username || "").trim();
  const suppliedPassword = String(password || "");
  const usernameBuffer = Buffer.from(suppliedUsername);
  const expectedUsernameBuffer = Buffer.from(ADMIN_USERNAME);
  const usernameOk = usernameBuffer.length === expectedUsernameBuffer.length
    ? crypto.timingSafeEqual(usernameBuffer, expectedUsernameBuffer)
    : false;

  const passwordOk = suppliedPassword.length === ADMIN_PASSWORD.length
    ? crypto.timingSafeEqual(Buffer.from(suppliedPassword), Buffer.from(ADMIN_PASSWORD))
    : false;

  if (!usernameOk || !passwordOk) {
    const error = new Error("Invalid admin username or password.");
    error.status = 401;
    throw error;
  }
  return { authenticated: true, token: createAdminToken(ADMIN_USERNAME), expiresIn: ADMIN_TOKEN_TTL_SECONDS, user: { username: ADMIN_USERNAME, role: "admin" } };
}

export function adminUserFromRequest(req) {
  return req.admin ? { username: req.admin.sub, role: req.admin.role } : null;
}
