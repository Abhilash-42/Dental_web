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
