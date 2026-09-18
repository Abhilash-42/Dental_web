// Dr. Chandu's Dental Hospital — backend API
// Endpoints:
//   POST   /api/appointments            create a booking request (public)
//   GET    /api/appointments/status      look up bookings by phone (public, used by the chatbot)
//   GET    /api/appointments             list all bookings (admin only)
//   PATCH  /api/appointments/:id         update a booking's status (admin only)
//   POST   /api/rag-chat                chatbot: retrieve + generate an answer (public)
//
// Required environment variables:
//   DATABASE_URL      Postgres connection string
//   ADMIN_KEY         shared secret the admin panel sends to manage bookings
//   GEMINI_API_KEY    Google Gemini API key
//   ALLOWED_ORIGIN    the frontend's URL

import express from "express";
import cors from "cors";
import { Pool } from "pg";

const app = express();

app.use(express.json());

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN || "*",
  })
);

// ---------------- Database ----------------

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      service TEXT NOT NULL,
      appt_date DATE NOT NULL,
      appt_time TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

// ---------------- Admin authentication ----------------

function requireAdmin(req, res, next) {
  const key = req.header("x-admin-key");

  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }

  next();
}

// ---------------- Appointments ----------------

// Create appointment
app.post("/api/appointments", async (req, res) => {
  const { name, phone, email, service, date, time, notes } = req.body || {};

  if (!name || !phone || !service || !date || !time) {
    return res.status(400).json({
      error: "missing required fields",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO appointments
       (name, phone, email, service, appt_date, appt_time, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, status`,
      [
        name,
        phone,
        email || null,
        service,
        date,
        time,
        notes || null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "could not save appointment",
    });
  }
});

// Check appointment status by phone
app.get("/api/appointments/status", async (req, res) => {
  const phone = (req.query.phone || "").toString();

  if (!/^\d{10}$/.test(phone)) {
    return res.status(400).json({
      error: "provide a 10-digit phone number",
    });
  }

  try {
    const result = await pool.query(
      `SELECT service, appt_date, appt_time, status
       FROM appointments
       WHERE phone = $1
       ORDER BY created_at DESC
       LIMIT 3`,
      [phone]
    );

    res.json({
      appointments: result.rows,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "could not check appointment status",
    });
  }
});

// List all appointments - admin only
app.get("/api/appointments", requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM appointments
       ORDER BY created_at DESC
       LIMIT 200`
    );

    res.json({
      appointments: result.rows,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "could not fetch appointments",
    });
  }
});

// Update appointment status - admin only
app.patch("/api/appointments/:id", requireAdmin, async (req, res) => {
  const { status } = req.body || {};

  if (
    !["pending", "confirmed", "declined", "completed"].includes(status)
  ) {
    return res.status(400).json({
      error: "invalid status",
    });
  }

  try {
    await pool.query(
      `UPDATE appointments
       SET status=$1
       WHERE id=$2`,
      [status, req.params.id]
    );

    res.json({
      ok: true,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "could not update appointment",
    });
  }
});

// ---------------- RAG chatbot ----------------

const KB = [
  {
    id: "hospital-info",
    keywords: [
      "address",
      "location",
      "where",
      "hours",
      "open",
      "timing",
      "time",
      "phone",
      "number",
      "contact",
      "call",
      "doctor",
      "chandu",
    ],
    text: "Dr. Chandu's Multi-speciality Dental Hospital is on the 1st floor, V complex, near Sri Chaitanya School, Sunkara Palem, Andhra Pradesh 533464. Open daily until 8:00 PM. Phone: 090522 09930.",
  },

  {
    id: "faq-root-canal",
    keywords: [
      "root canal",
      "rct",
      "pulp",
      "nerve",
      "canal",
    ],
    text: "A root canal typically costs ₹3,500–₹8,000 depending on the tooth, done under local anaesthesia across 1–2 visits.",
  },

  {
    id: "faq-implants",
    keywords: [
      "implant",
      "implants",
      "missing tooth",
    ],
    text: "Dental implants generally cost ₹25,000–₹45,000 per tooth including the crown, with 3–6 months healing before the final crown.",
  },

  {
    id: "faq-braces",
    keywords: [
      "braces",
      "align",
      "crooked",
      "orthodontic",
      "invisalign",
    ],
    text: "Braces start around ₹25,000 for metal and ₹45,000+ for ceramic/clear aligners, over 12–24 months.",
  },

  {
    id: "faq-whitening",
    keywords: [
      "whitening",
      "white teeth",
      "stain",
    ],
    text: "In-clinic whitening starts around ₹4,000–₹6,000 per session, roughly 45 minutes, lasting 6–12 months.",
  },

  {
    id: "faq-cleaning",
    keywords: [
      "cleaning",
      "scaling",
      "plaque",
      "tartar",
    ],
    text: "Scaling and polishing costs around ₹800–₹1,500, about 30 minutes; recommended every 6 months.",
  },

  {
    id: "faq-emergency",
    keywords: [
      "emergency",
      "pain",
      "urgent",
      "broken tooth",
    ],
    text: "We handle emergency care for severe pain, broken teeth or trauma. Call 090522 09930 and we'll fit you in the same day where possible, since we're open until 8 PM daily.",
  },

  {
    id: "faq-paediatrics",
    keywords: [
      "child",
      "kid",
      "children",
      "paediatric",
      "pediatric",
    ],
    text: "Paediatric dentistry covers check-ups, fillings and sealants for children in a calm, kid-friendly setting.",
  },

  {
    id: "care-extraction",
    keywords: [
      "after extraction",
      "post extraction",
      "extraction care",
    ],
    text: "After an extraction: bite the gauze 30–45 minutes, avoid rinsing/spitting hard/smoking/straws for 24 hours, eat soft cool foods, take prescribed painkillers. Call us if bleeding or pain is severe after 24 hours.",
  },

  {
    id: "care-toothache",
    keywords: [
      "toothache",
      "tooth pain",
      "hurts",
    ],
    text: "For toothache: rinse warm salt water, take an OTC pain reliever, avoid hot/cold foods, avoid chewing on that side. Severe pain with swelling or fever is an emergency — call 090522 09930.",
  },
];

function retrieve(query, topK = 2) {
  const q = query.toLowerCase();

  const scored = KB.map((chunk) => {
    let score = 0;

    chunk.keywords.forEach((k) => {
      if (q.includes(k)) {
        score += k.length > 5 ? 2 : 1;
      }
    });

    return {
      chunk,
      score,
    };
  }).filter((s) => s.score > 0);

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK).map((s) => s.chunk);
}

// ---------------- Gemini AI ----------------

async function askGemini(userQuery, contextChunks) {
  const system = `You are the assistant for Dr. Chandu's Multi-speciality Dental Hospital.

Answer briefly and warmly, using ONLY the context below.

If the context doesn't cover the question, say you're not sure and suggest calling 090522 09930.

Do not invent medical information, prices, timings, services, or policies.

Context:
${contextChunks.map((c) => "- " + c.text).join("\n")}`;

  try {
    const { GoogleGenAI } = await import("@google/genai");

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `${system}

User question:
${userQuery}`,
    });

    const text = response.text?.trim();

    return (
      text ||
      "I'm not sure about that one — please call 090522 09930 and our team can help."
    );
  } catch (err) {
    console.error("Gemini API error:", err);

    return "I'm having trouble answering right now. Please call 090522 09930 and our team can help.";
  }
}

// ---------------- Intent detection ----------------

function detectIntent(query) {
  const q = query.toLowerCase();

  const wantsBooking =
    /\b(book|appointment|schedule|visit)\b/.test(q);

  const directService = [
    "root canal",
    "implant",
    "braces",
    "whitening",
    "cleaning",
    "extraction",
    "paediatric",
    "x-ray",
    "veneer",
    "crown",
    "denture",
  ].find((t) => q.includes(t));

  const map = {
    "root canal": "Root Canals",
    implant: "Dental Implants",
    braces: "Braces",
    whitening: "Teeth Whitening",
    cleaning: "Teeth Cleaning",
    extraction: "Extractions",
    paediatric: "Paediatrics",
    "x-ray": "X-ray",
    veneer: "Veneers & Crowns",
    crown: "Veneers & Crowns",
    denture: "Dentures & Bridges",
  };

  return {
    wantsBooking,
    service: directService ? map[directService] : null,
  };
}

// ---------------- Chatbot endpoint ----------------

app.post("/api/rag-chat", async (req, res) => {
  const userQuery = (req.body?.query || "").toString().trim();

  if (!userQuery) {
    return res.status(400).json({
      error: "missing query",
    });
  }

  // Appointment-status lookups go straight to the database, not the LLM.
  const phoneMatch = userQuery.match(/\b\d{10}\b/);

  const asksStatus =
    /\b(status|confirmed|pending|did (you|i) get|check (my|on) (my )?appointment)\b/i.test(
      userQuery
    );

  if (asksStatus || phoneMatch) {
    if (!phoneMatch) {
      return res.json({
        text: "What's the 10-digit phone number you booked with? I'll check its status.",
        action: null,
      });
    }

    try {
      const result = await pool.query(
        `SELECT service, appt_date, appt_time, status
         FROM appointments
         WHERE phone=$1
         ORDER BY created_at DESC
         LIMIT 3`,
        [phoneMatch[0]]
      );

      if (result.rows.length === 0) {
        return res.json({
          text: `I don't see any appointment under ${phoneMatch[0]}. Want to book one now?`,
          action: {
            label: "Book an appointment now",
            service: null,
          },
        });
      }

      const text = result.rows
        .map(
          (r) =>
            `${r.service} on ${new Date(
              r.appt_date
            ).toDateString()} at ${r.appt_time} is ${r.status}.`
        )
        .join(" ");

      return res.json({
        text,
        action: null,
      });
    } catch (err) {
      console.error("Appointment status error:", err);

      return res.status(500).json({
        error: "could not check appointment status",
      });
    }
  }

  const contextChunks = retrieve(userQuery);
  const intent = detectIntent(userQuery);

  const text =
    contextChunks.length > 0
      ? await askGemini(userQuery, contextChunks)
      : "I don't have that detail on hand — call 090522 09930, or I can help you book an appointment so a dentist can answer in person.";

  const action =
    intent.wantsBooking || intent.service
      ? {
          label: intent.service
            ? `Book ${intent.service} now`
            : "Book an appointment now",
          service: intent.service,
        }
      : null;

  res.json({
    text,
    action,
  });
});

// ---------------- Start server ----------------

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    app.listen(PORT, () =>
      console.log(`API running on port ${PORT}`)
    );
  })
  .catch((err) => {
    console.error("Database initialization failed:", err);
    process.exit(1);
  });
