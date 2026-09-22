import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
export const EMAIL_FROM = process.env.EMAIL_FROM || "Dr. Chandu's Dental Hospital <onboarding@resend.dev>";
export const ADMIN_NOTIFICATION_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || "";

if (!process.env.RESEND_API_KEY) console.warn("WARNING: RESEND_API_KEY is not configured. Email notifications are disabled.");
if (!ADMIN_NOTIFICATION_EMAIL) console.warn("WARNING: ADMIN_NOTIFICATION_EMAIL is not configured. Admin booking emails are disabled.");

export async function sendEmail({ to, subject, html }) {
  if (!resend) { console.warn("Email skipped: RESEND_API_KEY is not configured."); return null; }
  if (!to) { console.warn("Email skipped: recipient email is missing."); return null; }
  try {
    const { data, error } = await resend.emails.send({ from: EMAIL_FROM, to: [to], subject, html });
    if (error) { console.error("Resend email error:", error); return null; }
    console.log("Email sent successfully:", data?.id);
    return data;
  } catch (err) {
    console.error("Email sending failed:", err);
    return null;
  }
}

export function emailEnabled() { return Boolean(resend); }
