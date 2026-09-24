import crypto from "crypto";

const buckets = new Map();

function clientKey(req, prefix) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = forwarded || req.ip || req.socket?.remoteAddress || "unknown";
  return `${prefix}:${ip}`;
}

function rateLimit({ windowMs, max, prefix, message }) {
  return (req, res, next) => {
    const key = clientKey(req, prefix);
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || now - bucket.startedAt >= windowMs) {
      bucket = { startedAt: now, count: 0 };
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.startedAt + windowMs - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ error: message });
    }

    next();
  };
}

export const adminLoginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  prefix: "admin-login",
  message: "Too many login attempts. Please try again later.",
});

export const publicBookingRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  prefix: "public-booking",
  message: "Too many booking requests. Please wait a few minutes and try again.",
});

export const publicStatusRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  prefix: "public-status",
  message: "Too many status checks. Please wait a few minutes and try again.",
});

export const adminApiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  prefix: "admin-api",
  message: "Too many admin requests. Please slow down and try again.",
});

export function securityHeaders(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  next();
}

export function noStore(req, res, next) {
  if (req.path.startsWith("/api/admin") || req.path.startsWith("/api/appointments")) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
}

export function requestId(req, res, next) {
  const id = crypto.randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-ID", id);
  next();
}
