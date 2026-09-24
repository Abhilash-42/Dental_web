export const PORT = Number(process.env.PORT || 3000);

export const OPEN_TIME = process.env.OPEN_TIME || "10:00";
export const CLOSE_TIME = process.env.CLOSE_TIME || "19:30";
export const SLOT_DURATION_MINUTES = 30;

export const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

export const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
export const ADMIN_TOKEN_SECRET =
  process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_KEY || "";
export const ADMIN_TOKEN_TTL_SECONDS = 8 * 60 * 60;


export function validateProductionConfig() {
  const missing = [];
  if (!ADMIN_PASSWORD) missing.push("ADMIN_PASSWORD");
  if (!ADMIN_TOKEN_SECRET || ADMIN_TOKEN_SECRET.length < 32) missing.push("ADMIN_TOKEN_SECRET (32+ characters)");
  if (!ALLOWED_ORIGIN || ALLOWED_ORIGIN === "*") {
    console.warn("WARNING: ALLOWED_ORIGIN is set to *; restrict it to the deployed frontend origin for production.");
  }
  if (missing.length) {
    throw new Error(`Missing or weak production configuration: ${missing.join(", ")}`);
  }
}
