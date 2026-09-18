// Dr. Chandu's Dental Hospital — backend API
//
// Public endpoints:
//   POST   /api/appointments
//   GET    /api/appointments/status
//   POST   /api/rag-chat
//
// Admin endpoints:
//   GET    /api/appointments
//   PATCH  /api/appointments/:id
//
// Environment variables:
//   DATABASE_URL
//   ADMIN_KEY
//   GEMINI_API_KEY
//   ALLOWED_ORIGIN
//   OPEN_TIME       optional, default 08:00
//   CLOSE_TIME      optional, default 20:00

import express from "express";
import cors from "cors";
import { Pool } from "pg";
import { GoogleGenAI } from "@google/genai";

const app = express();

app.use(express.json());

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN || "*",
  })
);

// --------------------------------------------------
// DATABASE
// --------------------------------------------------

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

// --------------------------------------------------
// GEMINI
// --------------------------------------------------

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// --------------------------------------------------
// GENERAL HELPERS
// --------------------------------------------------

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s₹-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTodayIndia() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(new Date());
}

function isValidTimeFormat(time) {
  return /^\d{2}:\d{2}$/.test(time);
}

function timeToMinutes(time) {
  if (!isValidTimeFormat(time)) return null;

  const [hours, minutes] = time.split(":").map(Number);

  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

const OPEN_TIME = process.env.OPEN_TIME || "08:00";
const CLOSE_TIME = process.env.CLOSE_TIME || "20:00";

// --------------------------------------------------
// ADMIN AUTH
// --------------------------------------------------

function requireAdmin(req, res, next) {
  const key = req.header("x-admin-key");

  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({
      error: "unauthorized",
    });
  }

  next();
}

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "Dr. Chandu's Dental Hospital API",
    message: "Backend is running",
  });
});

// --------------------------------------------------
// APPOINTMENTS
// --------------------------------------------------

app.post("/api/appointments", async (req, res) => {
  const {
    name,
    phone,
    email,
    service,
    date,
    time,
    notes,
  } = req.body || {};

  // Basic required-field validation
  if (!name || !phone || !service || !date || !time) {
    return res.status(400).json({
      error: "Name, phone, service, date and time are required.",
    });
  }

  // Phone validation
  const cleanPhone = String(phone).replace(/\D/g, "");

  if (!/^\d{10}$/.test(cleanPhone)) {
    return res.status(400).json({
      error: "Please provide a valid 10-digit phone number.",
    });
  }

  // Date validation
  const today = getTodayIndia();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      error: "Invalid appointment date.",
    });
  }

  if (date < today) {
    return res.status(400).json({
      error: "Past dates cannot be booked. Please select today or a future date.",
    });
  }

  // Time validation
  const requestedMinutes = timeToMinutes(time);
  const openMinutes = timeToMinutes(OPEN_TIME);
  const closeMinutes = timeToMinutes(CLOSE_TIME);

  if (
    requestedMinutes === null ||
    openMinutes === null ||
    closeMinutes === null
  ) {
    return res.status(400).json({
      error: "Invalid appointment time.",
    });
  }

  if (
    requestedMinutes < openMinutes ||
    requestedMinutes > closeMinutes
  ) {
    return res.status(400).json({
      error: `Appointments are available between ${OPEN_TIME} and ${CLOSE_TIME}.`,
    });
  }

  // If booking is for today, don't allow a time that has already passed.
  if (date === today) {
    const now = new Date();

    const indiaTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);

    const currentMinutes = timeToMinutes(indiaTime);

    if (
      currentMinutes !== null &&
      requestedMinutes <= currentMinutes
    ) {
      return res.status(400).json({
        error: "That time has already passed. Please choose a later time.",
      });
    }
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO appointments
        (name, phone, email, service, appt_date, appt_time, notes)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, status
      `,
      [
        String(name).trim(),
        cleanPhone,
        email ? String(email).trim() : null,
        String(service).trim(),
        date,
        time,
        notes ? String(notes).trim() : null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Appointment creation error:", err);

    res.status(500).json({
      error: "Could not save appointment.",
    });
  }
});

// --------------------------------------------------
// CHECK APPOINTMENT STATUS
// --------------------------------------------------

app.get("/api/appointments/status", async (req, res) => {
  const phone = String(req.query.phone || "").replace(/\D/g, "");

  if (!/^\d{10}$/.test(phone)) {
    return res.status(400).json({
      error: "Please provide a valid 10-digit phone number.",
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        service,
        appt_date,
        appt_time,
        status
      FROM appointments
      WHERE phone = $1
      ORDER BY created_at DESC
      LIMIT 3
      `,
      [phone]
    );

    res.json({
      appointments: result.rows,
    });
  } catch (err) {
    console.error("Status lookup error:", err);

    res.status(500).json({
      error: "Could not check appointment status.",
    });
  }
});

// --------------------------------------------------
// ADMIN — LIST APPOINTMENTS
// --------------------------------------------------

app.get("/api/appointments", requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM appointments
      ORDER BY created_at DESC
      LIMIT 200
    `);

    res.json({
      appointments: result.rows,
    });
  } catch (err) {
    console.error("Admin appointment lookup error:", err);

    res.status(500).json({
      error: "Could not load appointments.",
    });
  }
});

// --------------------------------------------------
// ADMIN — UPDATE STATUS
// --------------------------------------------------

app.patch("/api/appointments/:id", requireAdmin, async (req, res) => {
  const { status } = req.body || {};

  const allowedStatuses = [
    "pending",
    "confirmed",
    "declined",
    "completed",
  ];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      error: "Invalid appointment status.",
    });
  }

  try {
    await pool.query(
      `
      UPDATE appointments
      SET status = $1
      WHERE id = $2
      `,
      [status, req.params.id]
    );

    res.json({
      ok: true,
    });
  } catch (err) {
    console.error("Appointment status update error:", err);

    res.status(500).json({
      error: "Could not update appointment.",
    });
  }
});

// ==================================================
// CHATBOT KNOWLEDGE BASE
// ==================================================

const KB = [
  {
    id: "hospital-info",

    keywords: [
      "address",
      "location",
      "where",
      "hospital",
      "clinic",
      "hours",
      "hour",
      "open",
      "opening",
      "closing",
      "timing",
      "time",
      "when",
      "phone",
      "number",
      "contact",
      "call",
      "doctor",
      "chandu",
    ],

    aliases: [
      "where are you",
      "where is the hospital",
      "where is the clinic",
      "how can i reach you",
      "what time do you open",
      "what time do you close",
      "when are you open",
      "when does the hospital open",
      "when does the hospital close",
      "clinic timings",
      "hospital timings",
      "contact number",
      "phone number",
    ],

    text:
      "Dr. Chandu's Multi-speciality Dental Hospital is on the 1st floor, V complex, near Sri Chaitanya School, Sunkara Palem, Andhra Pradesh 533464. The hospital is open daily until 8:00 PM. Phone: 090522 09930.",
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

    aliases: [
      "root canal treatment",
      "root canal cost",
      "root canal price",
      "how much root canal",
      "rct cost",
      "rct price",
    ],

    text:
      "A root canal typically costs ₹3,500–₹8,000 depending on the tooth. It is done under local anaesthesia across 1–2 visits.",
  },

  {
    id: "faq-implants",

    keywords: [
      "implant",
      "implants",
      "missing tooth",
      "missing teeth",
    ],

    aliases: [
      "dental implant",
      "dental implants",
      "implant cost",
      "implant price",
      "replace missing tooth",
      "tooth replacement",
    ],

    text:
      "Dental implants generally cost ₹25,000–₹45,000 per tooth including the crown, with 3–6 months healing before the final crown.",
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

    aliases: [
      "dental braces",
      "teeth braces",
      "crooked teeth",
      "straighten teeth",
      "braces cost",
      "braces price",
    ],

    text:
      "Braces start around ₹25,000 for metal and ₹45,000+ for ceramic/clear aligners, over 12–24 months.",
  },

  {
    id: "faq-whitening",

    keywords: [
      "whitening",
      "white teeth",
      "stain",
      "stains",
    ],

    aliases: [
      "teeth whitening",
      "make teeth white",
      "whitening cost",
      "whitening price",
      "remove teeth stains",
    ],

    text:
      "In-clinic whitening starts around ₹4,000–₹6,000 per session, takes roughly 45 minutes, and can last 6–12 months.",
  },

  {
    id: "faq-cleaning",

    keywords: [
      "cleaning",
      "scaling",
      "plaque",
      "tartar",
    ],

    aliases: [
      "teeth cleaning",
      "dental cleaning",
      "teeth scaling",
      "remove tartar",
      "clean my teeth",
      "cleaning cost",
      "cleaning price",
    ],

    text:
      "Scaling and polishing costs around ₹800–₹1,500, takes about 30 minutes, and is recommended every 6 months.",
  },

  {
    id: "faq-emergency",

    keywords: [
      "emergency",
      "pain",
      "urgent",
      "broken tooth",
      "swelling",
      "fever",
    ],

    aliases: [
      "dental emergency",
      "tooth emergency",
      "severe tooth pain",
      "broken teeth",
      "urgent dental care",
      "tooth swelling",
    ],

    text:
      "The hospital handles emergency care for severe pain, broken teeth or trauma. Call 090522 09930 and the team will fit you in the same day where possible. The hospital is open until 8 PM daily.",
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

    aliases: [
      "kids dentist",
      "dentist for child",
      "dentist for children",
      "child dental care",
      "children dental care",
    ],

    text:
      "Paediatric dentistry covers check-ups, fillings and sealants for children in a calm, kid-friendly setting.",
  },

  {
    id: "care-extraction",

    keywords: [
      "extraction",
      "extracted",
      "tooth removed",
      "tooth removal",
      "removed tooth",
      "post extraction",
    ],

    aliases: [
      "after extraction",
      "after an extraction",
      "after tooth extraction",
      "after tooth removal",
      "care after extraction",
      "extraction aftercare",
      "post extraction care",
      "what to do after extraction",
      "mouth after extraction",
      "care for my mouth",
      "tooth was removed",
    ],

    text:
      "After an extraction: bite the gauze for 30–45 minutes, avoid rinsing, hard spitting, smoking and straws for 24 hours, eat soft cool foods, and take prescribed painkillers. Call the hospital if bleeding or pain is severe after 24 hours.",
  },

  {
    id: "care-toothache",

    keywords: [
      "toothache",
      "tooth pain",
      "hurts",
      "painful tooth",
    ],

    aliases: [
      "my tooth hurts",
      "my teeth hurt",
      "tooth is hurting",
      "what should i do for tooth pain",
      "how to reduce tooth pain",
      "tooth pain relief",
    ],

    text:
      "For toothache: rinse with warm salt water, take an OTC pain reliever, avoid very hot or cold foods, and avoid chewing on that side. Severe pain with swelling or fever is an emergency — call 090522 09930.",
  },
];

// --------------------------------------------------
// IMPROVED RETRIEVAL
// --------------------------------------------------

function retrieve(query, topK = 3) {
  const q = normalizeText(query);

  const qWords = new Set(
    q.split(" ").filter((word) => word.length >= 3)
  );

  const scored = KB.map((chunk) => {
    let score = 0;

    // Exact keyword matching
    for (const keyword of chunk.keywords) {
      const normalizedKeyword = normalizeText(keyword);

      if (q.includes(normalizedKeyword)) {
        score += normalizedKeyword.includes(" ")
          ? 5
          : 2;
      }

      // Singular/plural-friendly matching
      const words = normalizedKeyword.split(" ");

      if (
        words.length === 1 &&
        qWords.has(words[0].replace(/s$/, ""))
      ) {
        score += 1;
      }
    }

    // Alias matching
    for (const alias of chunk.aliases || []) {
      const normalizedAlias = normalizeText(alias);

      if (q.includes(normalizedAlias)) {
        score += 7;
      }
    }

    // Word overlap with KB text
    const textWords = normalizeText(chunk.text)
      .split(" ")
      .filter((word) => word.length >= 4);

    const uniqueTextWords = new Set(textWords);

    for (const word of qWords) {
      if (uniqueTextWords.has(word)) {
        score += 0.5;
      }
    }

    return {
      chunk,
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored
    .filter((item) => item.score >= 1.5)
    .slice(0, topK)
    .map((item) => item.chunk);
}

// --------------------------------------------------
// GEMINI ANSWER
// --------------------------------------------------

async function askGemini(userQuery, contextChunks) {
  const context = contextChunks
    .map((chunk) => `- ${chunk.text}`)
    .join("\n");

  const prompt = `
You are Dr. Chandu AI, the virtual assistant for
Dr. Chandu's Multi-speciality Dental Hospital.

Answer the user's question briefly, naturally and warmly.

IMPORTANT RULES:

1. Use ONLY the hospital information supplied in the context.
2. Do NOT invent prices, services, timings, doctors, treatments,
   guarantees, availability, or medical instructions.
3. If the context does not contain the answer, clearly say:
   "I don't have that information right now."
   Then provide the hospital phone number 090522 09930.
4. Do not pretend to diagnose the patient.
5. For urgent or severe dental symptoms, encourage contacting
   the hospital directly.
6. Keep the answer concise and easy to understand.
7. If the user asks a general question that is not about the
   hospital's documented information, say that you don't have
   that information rather than guessing.

Hospital knowledge:
${context}

User question:
${userQuery}
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const text = response.text?.trim();

    return (
      text ||
      "I don't have that information right now. Please call 090522 09930 and our team can help."
    );
  } catch (err) {
    console.error("Gemini error:", err);

    return (
      "I'm having trouble answering right now. Please call 090522 09930 and our team can help."
    );
  }
}

// --------------------------------------------------
// INTENT DETECTION
// --------------------------------------------------

function detectIntent(query) {
  const q = normalizeText(query);

  const wantsBooking =
    /\b(book|booking|appointment|schedule|visit)\b/.test(q);

  const directService =
    [
      "root canal",
      "implant",
      "braces",
      "whitening",
      "cleaning",
      "extraction",
      "paediatric",
      "pediatric",
      "x ray",
      "x-ray",
      "veneer",
      "crown",
      "denture",
    ].find((service) => q.includes(service));

  const map = {
    "root canal": "Root Canals",
    implant: "Dental Implants",
    braces: "Braces",
    whitening: "Teeth Whitening",
    cleaning: "Teeth Cleaning",
    extraction: "Extractions",
    paediatric: "Paediatrics",
    pediatric: "Paediatrics",
    "x ray": "X-ray",
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

// --------------------------------------------------
// CHATBOT
// --------------------------------------------------

app.post("/api/rag-chat", async (req, res) => {
  const userQuery = String(
    req.body?.query || ""
  ).trim();

  if (!userQuery) {
    return res.status(400).json({
      error: "missing query",
    });
  }

  try {
    // ----------------------------------------------
    // APPOINTMENT STATUS
    // ----------------------------------------------

    const phoneMatch = userQuery.match(/\b\d{10}\b/);

    const asksStatus =
      /\b(status|confirmed|pending|did (you|i) get|check (my|on) (my )?appointment)\b/i.test(
        userQuery
      );

    if (asksStatus || phoneMatch) {
      if (!phoneMatch) {
        return res.json({
          text:
            "Sure. Please send the 10-digit phone number you used when booking, and I'll check your appointment status.",
          action: null,
        });
      }

      const result = await pool.query(
        `
        SELECT
          service,
          appt_date,
          appt_time,
          status
        FROM appointments
        WHERE phone = $1
        ORDER BY created_at DESC
        LIMIT 3
        `,
        [phoneMatch[0]]
      );

      if (result.rows.length === 0) {
        return res.json({
          text:
            `I don't see an appointment under ${phoneMatch[0]}. Would you like to book one now?`,
          action: {
            label: "Book an appointment now",
            service: null,
          },
        });
      }

      const text = result.rows
        .map(
          (row) =>
            `${row.service} on ${new Date(
              row.appt_date
            ).toDateString()} at ${row.appt_time} is ${row.status}.`
        )
        .join(" ");

      return res.json({
        text,
        action: null,
      });
    }

    // ----------------------------------------------
    // KNOWLEDGE RETRIEVAL
    // ----------------------------------------------

    const contextChunks = retrieve(userQuery);

    const intent = detectIntent(userQuery);

    // If there is no relevant hospital information,
    // do not send the question to Gemini.
    if (contextChunks.length === 0) {
      return res.json({
        text:
          "I don't have that information right now. Please call 090522 09930 and our team can help.",
        action:
          intent.wantsBooking || intent.service
            ? {
                label: intent.service
                  ? `Book ${intent.service} now`
                  : "Book an appointment now",
                service: intent.service,
              }
            : null,
      });
    }

    // ----------------------------------------------
    // GEMINI
    // ----------------------------------------------

    const text = await askGemini(
      userQuery,
      contextChunks
    );

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
  } catch (err) {
    console.error("Chatbot error:", err);

    res.status(500).json({
      error: "Chatbot service temporarily unavailable.",
    });
  }
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(
        `API running on port ${PORT}`
      );

      console.log(
        `Appointment hours: ${OPEN_TIME} - ${CLOSE_TIME}`
      );
    });
  })
  .catch((err) => {
    console.error(
      "Database initialization failed:",
      err
    );

    process.exit(1);
  });
