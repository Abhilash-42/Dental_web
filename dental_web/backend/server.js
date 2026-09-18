// Dr. Chandu's Dental Hospital — backend API
//
// Public endpoints:
//   GET    /
//   GET    /api/doctors
//   GET    /api/services
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
//   OPEN_TIME       optional, default 10:00
//   CLOSE_TIME      optional, default 19:30

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

// ==================================================
// DATABASE
// ==================================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDb() {
  // Create table if it doesn't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      service TEXT NOT NULL,
      doctor TEXT,
      appt_date DATE NOT NULL,
      appt_time TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Add doctor column to an existing appointments table.
  // This is important if your PostgreSQL table was created
  // before the doctor feature was added.
  await pool.query(`
    ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS doctor TEXT;
  `);
}

// ==================================================
// GEMINI
// ==================================================

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

if (!process.env.GEMINI_API_KEY) {
  console.warn(
    "WARNING: GEMINI_API_KEY is not configured."
  );
}

// ==================================================
// GENERAL HELPERS
// ==================================================

function normalizeText(text) {
  return String(text || "")
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
  if (!isValidTimeFormat(time)) {
    return null;
  }

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

// Hospital appointment hours
const OPEN_TIME = process.env.OPEN_TIME || "10:00";
const CLOSE_TIME = process.env.CLOSE_TIME || "19:30";

// ==================================================
// DOCTORS
// ==================================================

// TEMPORARY DEMO PROFILES
// Replace these with real hospital doctor details
// before using them publicly.
const DOCTORS = [
  {
    id: "dr-chandu-reddy",
    name: "Dr. Chandu Reddy",
    specialization: "Chief Dental Surgeon",
    experience: "10+ Years Experience",
    qualification: "BDS",
    focus: "General Dentistry & Oral Care",
    image:
      "https://placehold.co/600x600/f5f1e8/0f3028?text=Dr.+Chandu+Reddy",
    demo: true,
  },

  {
    id: "dr-priya-sharma",
    name: "Dr. Priya Sharma",
    specialization: "Orthodontist",
    experience: "8+ Years Experience",
    qualification: "BDS, MDS Orthodontics",
    focus: "Braces & Clear Aligners",
    image:
      "https://placehold.co/600x600/f5f1e8/0f3028?text=Dr.+Priya+Sharma",
    demo: true,
  },

  {
    id: "dr-arjun-mehta",
    name: "Dr. Arjun Mehta",
    specialization: "Endodontist",
    experience: "9+ Years Experience",
    qualification: "BDS, MDS Endodontics",
    focus: "Root Canal Treatment",
    image:
      "https://placehold.co/600x600/f5f1e8/0f3028?text=Dr.+Arjun+Mehta",
    demo: true,
  },

  {
    id: "dr-sneha-iyer",
    name: "Dr. Sneha Iyer",
    specialization: "Periodontist",
    experience: "7+ Years Experience",
    qualification: "BDS, MDS Periodontics",
    focus: "Gum Care & Dental Implants",
    image:
      "https://placehold.co/600x600/f5f1e8/0f3028?text=Dr.+Sneha+Iyer",
    demo: true,
  },
];

// ==================================================
// ADMIN AUTH
// ==================================================

function requireAdmin(req, res, next) {
  const key = req.header("x-admin-key");

  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({
      error: "unauthorized",
    });
  }

  next();
}

// ==================================================
// HEALTH CHECK
// ==================================================

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "Dr. Chandu's Dental Hospital API",
    message: "Backend is running",
  });
});

// ==================================================
// PUBLIC CATALOG
// ==================================================

app.get("/api/doctors", (_req, res) => {
  res.json({
    doctors: DOCTORS,
  });
});

app.get("/api/services", (_req, res) => {
  res.json({
    services: [
      "Check-ups",
      "Teeth Cleaning",
      "Fillings & Sealants",
      "Emergency Care",
      "Paediatrics",
      "Teeth Whitening",
      "Veneers & Crowns",
      "Bonding",
      "Teeth Reshaping",
      "Laser Dentistry",
      "Dental Implants",
      "Root Canals",
      "Extractions",
      "Oral Surgery",
      "Dentures & Bridges",
      "Mouth Guards",
      "X-ray",
    ],
  });
});

// ==================================================
// APPOINTMENTS
// ==================================================

app.post("/api/appointments", async (req, res) => {
  const {
    name,
    phone,
    email,
    service,
    doctor,
    date,
    time,
    notes,
  } = req.body || {};

  // ------------------------------------------------
  // Required fields
  // ------------------------------------------------

  if (
    !name ||
    !phone ||
    !service ||
    !date ||
    !time
  ) {
    return res.status(400).json({
      error:
        "Name, phone, service, date and time are required.",
    });
  }

  // ------------------------------------------------
  // Phone validation
  // ------------------------------------------------

  const cleanPhone = String(phone).replace(/\D/g, "");

  if (!/^\d{10}$/.test(cleanPhone)) {
    return res.status(400).json({
      error:
        "Please provide a valid 10-digit phone number.",
    });
  }

  // ------------------------------------------------
  // Date validation
  // ------------------------------------------------

  const today = getTodayIndia();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      error: "Invalid appointment date.",
    });
  }

  if (date < today) {
    return res.status(400).json({
      error:
        "Past dates cannot be booked. Please select today or a future date.",
    });
  }

  // ------------------------------------------------
  // Time validation
  // ------------------------------------------------

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

  // ------------------------------------------------
  // Prevent booking a time that already passed today
  // ------------------------------------------------

  if (date === today) {
    const now = new Date();

    const indiaTime = new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }
    ).format(now);

    const currentMinutes =
      timeToMinutes(indiaTime);

    if (
      currentMinutes !== null &&
      requestedMinutes <= currentMinutes
    ) {
      return res.status(400).json({
        error:
          "That time has already passed. Please choose a later time.",
      });
    }
  }

  // ------------------------------------------------
  // Save appointment
  // ------------------------------------------------

  try {
    const result = await pool.query(
      `
      INSERT INTO appointments
        (
          name,
          phone,
          email,
          service,
          doctor,
          appt_date,
          appt_time,
          notes
        )
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, status
      `,
      [
        String(name).trim(),
        cleanPhone,
        email
          ? String(email).trim()
          : null,
        String(service).trim(),
        doctor
          ? String(doctor).trim()
          : null,
        date,
        time,
        notes
          ? String(notes).trim()
          : null,
      ]
    );

    res.status(201).json(
      result.rows[0]
    );
  } catch (err) {
    console.error(
      "Appointment creation error:",
      err
    );

    res.status(500).json({
      error: "Could not save appointment.",
    });
  }
});

// ==================================================
// CHECK APPOINTMENT STATUS
// ==================================================

app.get(
  "/api/appointments/status",
  async (req, res) => {
    const phone = String(
      req.query.phone || ""
    ).replace(/\D/g, "");

    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({
        error:
          "Please provide a valid 10-digit phone number.",
      });
    }

    try {
      const result = await pool.query(
        `
        SELECT
          service,
          doctor,
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
      console.error(
        "Status lookup error:",
        err
      );

      res.status(500).json({
        error:
          "Could not check appointment status.",
      });
    }
  }
);

// ==================================================
// ADMIN — LIST APPOINTMENTS
// ==================================================

app.get(
  "/api/appointments",
  requireAdmin,
  async (_req, res) => {
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
      console.error(
        "Admin appointment lookup error:",
        err
      );

      res.status(500).json({
        error:
          "Could not load appointments.",
      });
    }
  }
);

// ==================================================
// ADMIN — UPDATE STATUS
// ==================================================

app.patch(
  "/api/appointments/:id",
  requireAdmin,
  async (req, res) => {
    const { status } = req.body || {};

    const allowedStatuses = [
      "pending",
      "confirmed",
      "declined",
      "completed",
    ];

    if (
      !allowedStatuses.includes(status)
    ) {
      return res.status(400).json({
        error:
          "Invalid appointment status.",
      });
    }

    try {
      await pool.query(
        `
        UPDATE appointments
        SET status = $1
        WHERE id = $2
        `,
        [
          status,
          req.params.id,
        ]
      );

      res.json({
        ok: true,
      });
    } catch (err) {
      console.error(
        "Appointment status update error:",
        err
      );

      res.status(500).json({
        error:
          "Could not update appointment.",
      });
    }
  }
);

// ==================================================
// CHATBOT KNOWLEDGE BASE
// ==================================================

const KB = [

  // ------------------------------------------------
  // HOSPITAL INFORMATION
  // ------------------------------------------------

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
      "opening hours",
    ],

    text:
      "Dr. Chandu's Multi-speciality Dental Hospital is on the 1st floor, V complex, near Sri Chaitanya School, Sunkara Palem, Andhra Pradesh 533464. The hospital is open daily from 10:00 AM to 7:30 PM. Phone: 090522 09930.",
  },

  // ------------------------------------------------
  // DOCTORS
  // ------------------------------------------------

  {
    id: "doctors",

    keywords: [
      "doctor",
      "doctors",
      "dentist",
      "specialist",
      "specialists",
      "chandu",
      "priya",
      "arjun",
      "sneha",
      "orthodontist",
      "endodontist",
      "periodontist",
    ],

    aliases: [
      "our doctors",
      "meet the doctors",
      "dental specialists",
      "specialist doctors",
      "who are the doctors",
      "doctor list",
      "available doctors",
      "which doctor",
      "doctor names",
      "about the doctors",
    ],

    text:
      "The website currently uses temporary demo doctor profiles for development: Dr. Chandu Reddy — Chief Dental Surgeon, General Dentistry & Oral Care; Dr. Priya Sharma — Orthodontist, Braces & Clear Aligners; Dr. Arjun Mehta — Endodontist, Root Canal Treatment; Dr. Sneha Iyer — Periodontist, Gum Care & Dental Implants. These profiles are placeholders and must be replaced or verified by the hospital before public use.",
  },

  // ------------------------------------------------
  // CHECKUPS
  // ------------------------------------------------

  {
    id: "faq-checkups",

    keywords: [
      "check up",
      "checkups",
      "check-up",
      "check-ups",
      "examination",
      "exam",
      "consultation",
      "consult",
    ],

    aliases: [
      "dental checkup",
      "dental check-up",
      "routine checkup",
      "routine dental checkup",
      "teeth examination",
      "oral examination",
      "general dental checkup",
    ],

    text:
      "Dental check-ups are used for routine examination of your teeth and gums and for identifying dental concerns early. The dentist can recommend any further treatment after an examination.",
  },

  // ------------------------------------------------
  // CLEANING
  // ------------------------------------------------

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

  // ------------------------------------------------
  // FILLINGS & SEALANTS
  // ------------------------------------------------

  {
    id: "faq-fillings-sealants",

    keywords: [
      "filling",
      "fillings",
      "sealant",
      "sealants",
      "cavity",
      "cavities",
      "decay",
      "tooth decay",
    ],

    aliases: [
      "dental filling",
      "tooth filling",
      "teeth filling",
      "fillings and sealants",
      "fillings & sealants",
      "cavity filling",
      "cavity treatment",
      "tooth cavity",
      "dental sealants",
      "sealant treatment",
    ],

    text:
      "Fillings are used to repair teeth affected by cavities or decay. Dental sealants can help protect the chewing surfaces of teeth from cavities. The exact treatment and cost depend on the tooth and the extent of the decay. Please contact the hospital at 090522 09930 for an examination and current treatment details.",
  },

  // ------------------------------------------------
  // EMERGENCY
  // ------------------------------------------------

  {
    id: "faq-emergency",

    keywords: [
      "emergency",
      "pain",
      "urgent",
      "broken tooth",
      "swelling",
      "fever",
      "trauma",
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
      "The hospital handles emergency care for severe pain, broken teeth or trauma. Call 090522 09930 and the team will fit you in the same day where possible. The hospital is open from 10:00 AM to 7:30 PM daily.",
  },

  // ------------------------------------------------
  // PAEDIATRICS
  // ------------------------------------------------

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

  // ------------------------------------------------
  // WHITENING
  // ------------------------------------------------

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

  // ------------------------------------------------
  // VENEERS & CROWNS
  // ------------------------------------------------

  {
    id: "faq-veneers-crowns",

    keywords: [
      "veneer",
      "veneers",
      "crown",
      "crowns",
      "cap",
      "caps",
    ],

    aliases: [
      "veneers and crowns",
      "veneers & crowns",
      "dental veneer",
      "dental veneers",
      "dental crown",
      "tooth crown",
      "dental caps",
    ],

    text:
      "Veneers and crowns are restorative and cosmetic dental options. The suitable option depends on the condition and appearance of the tooth, so an examination is needed before treatment is recommended. Please call 090522 09930 for current treatment details and pricing.",
  },

  // ------------------------------------------------
  // BONDING
  // ------------------------------------------------

  {
    id: "faq-bonding",

    keywords: [
      "bonding",
      "composite bonding",
      "tooth bonding",
    ],

    aliases: [
      "dental bonding",
      "cosmetic bonding",
      "tooth coloured bonding",
    ],

    text:
      "Dental bonding uses tooth-coloured material to improve the shape or appearance of a tooth or repair minor defects. The dentist can confirm whether bonding is suitable after examining the tooth.",
  },

  // ------------------------------------------------
  // TEETH RESHAPING
  // ------------------------------------------------

  {
    id: "faq-reshaping",

    keywords: [
      "reshaping",
      "reshape",
      "contouring",
      "recontouring",
    ],

    aliases: [
      "teeth reshaping",
      "tooth reshaping",
      "dental contouring",
      "enamel reshaping",
    ],

    text:
      "Teeth reshaping or contouring can make small changes to the shape of a tooth. The dentist should examine the tooth first to determine whether the procedure is appropriate.",
  },

  // ------------------------------------------------
  // LASER DENTISTRY
  // ------------------------------------------------

  {
    id: "faq-laser",

    keywords: [
      "laser",
      "laser dentistry",
    ],

    aliases: [
      "laser dental treatment",
      "laser treatment",
      "dental laser",
    ],

    text:
      "Laser dentistry uses dental laser technology for selected procedures. The exact use depends on the patient's dental condition and the treatment recommended by the dentist.",
  },

  // ------------------------------------------------
  // IMPLANTS
  // ------------------------------------------------

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

  // ------------------------------------------------
  // ROOT CANAL
  // ------------------------------------------------

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

  // ------------------------------------------------
  // EXTRACTIONS
  // ------------------------------------------------

  {
    id: "faq-extractions",

    keywords: [
      "extraction",
      "extractions",
      "tooth removed",
      "tooth removal",
      "wisdom tooth",
      "wisdom teeth",
    ],

    aliases: [
      "tooth extraction",
      "teeth extraction",
      "remove tooth",
      "tooth removal treatment",
      "wisdom tooth removal",
    ],

    text:
      "Tooth extraction is used when a tooth needs to be removed. The dentist will examine the tooth and explain the treatment, expected recovery and aftercare. For current pricing or an appointment, call 090522 09930.",
  },

  // ------------------------------------------------
  // ORAL SURGERY
  // ------------------------------------------------

  {
    id: "faq-oral-surgery",

    keywords: [
      "oral surgery",
      "surgery",
      "surgical",
      "jaw surgery",
    ],

    aliases: [
      "dental surgery",
      "oral surgical treatment",
      "mouth surgery",
    ],

    text:
      "Oral surgery covers selected surgical procedures involving the mouth and related structures. The exact procedure depends on the patient's condition and requires a dental examination and treatment plan.",
  },

  // ------------------------------------------------
  // DENTURES & BRIDGES
  // ------------------------------------------------

  {
    id: "faq-dentures-bridges",

    keywords: [
      "denture",
      "dentures",
      "bridge",
      "bridges",
      "missing teeth",
    ],

    aliases: [
      "dentures and bridges",
      "dentures & bridges",
      "dental bridge",
      "tooth bridge",
      "false teeth",
      "replace missing teeth",
    ],

    text:
      "Dentures and dental bridges can be used to replace missing teeth. The appropriate option depends on the number and condition of the missing teeth and the surrounding oral structures.",
  },

  // ------------------------------------------------
  // MOUTH GUARDS
  // ------------------------------------------------

  {
    id: "faq-mouth-guards",

    keywords: [
      "mouth guard",
      "mouth guards",
      "mouthguard",
      "mouthguards",
      "night guard",
      "sports guard",
    ],

    aliases: [
      "dental mouth guard",
      "teeth grinding guard",
      "night mouth guard",
      "sports mouth guard",
    ],

    text:
      "Mouth guards can help protect teeth during sports or, when prescribed, help manage tooth grinding. A dentist can recommend the appropriate type after an examination.",
  },

  // ------------------------------------------------
  // X-RAY
  // ------------------------------------------------

  {
    id: "faq-xray",

    keywords: [
      "x ray",
      "x-ray",
      "xray",
      "radiograph",
      "dental x ray",
    ],

    aliases: [
      "dental x-ray",
      "dental x ray",
      "tooth xray",
      "teeth x ray",
      "x-ray scan",
    ],

    text:
      "Dental X-rays can help the dentist assess teeth and structures that may not be visible during a routine examination. The dentist will recommend an X-ray when it is clinically needed.",
  },

  // ------------------------------------------------
  // BRACES
  // ------------------------------------------------

  {
    id: "faq-braces",

    keywords: [
      "braces",
      "align",
      "aligner",
      "aligners",
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
      "clear aligners",
      "braces and aligners",
    ],

    text:
      "Braces start around ₹25,000 for metal and ₹45,000+ for ceramic/clear aligners, over 12–24 months.",
  },

  // ------------------------------------------------
  // EXTRACTION AFTERCARE
  // ------------------------------------------------

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

  // ------------------------------------------------
  // TOOTHACHE
  // ------------------------------------------------

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

// ==================================================
// IMPROVED RETRIEVAL
// ==================================================

function retrieve(query, topK = 3) {
  const q = normalizeText(query);

  const qWords = new Set(
    q
      .split(" ")
      .filter(
        (word) => word.length >= 3
      )
  );

  const scored = KB.map((chunk) => {
    let score = 0;

    // ------------------------------------------------
    // Exact keyword matching
    // ------------------------------------------------

    for (const keyword of chunk.keywords) {
      const normalizedKeyword =
        normalizeText(keyword);

      if (
        q.includes(normalizedKeyword)
      ) {
        score += normalizedKeyword.includes(" ")
          ? 5
          : 2;
      }

      // Singular/plural-friendly matching
      const words =
        normalizedKeyword.split(" ");

      if (
        words.length === 1 &&
        qWords.has(
          words[0].replace(/s$/, "")
        )
      ) {
        score += 1;
      }
    }

    // ------------------------------------------------
    // Alias matching
    // ------------------------------------------------

    for (
      const alias of chunk.aliases || []
    ) {
      const normalizedAlias =
        normalizeText(alias);

      if (
        q.includes(normalizedAlias)
      ) {
        score += 7;
      }
    }

    // ------------------------------------------------
    // Word overlap
    // ------------------------------------------------

    const textWords =
      normalizeText(chunk.text)
        .split(" ")
        .filter(
          (word) => word.length >= 4
        );

    const uniqueTextWords =
      new Set(textWords);

    for (const word of qWords) {
      if (
        uniqueTextWords.has(word)
      ) {
        score += 0.5;
      }
    }

    return {
      chunk,
      score,
    };
  });

  scored.sort(
    (a, b) => b.score - a.score
  );

  return scored
    .filter(
      (item) => item.score >= 1.5
    )
    .slice(0, topK)
    .map(
      (item) => item.chunk
    );
}

// ==================================================
// GEMINI ANSWER
// ==================================================

async function askGemini(
  userQuery,
  contextChunks
) {
  const context =
    contextChunks
      .map(
        (chunk) =>
          `- ${chunk.text}`
      )
      .join("\n");

  const prompt = `
You are Dr. Chandu AI, the virtual assistant for
Dr. Chandu's Multi-speciality Dental Hospital.

Answer the user's question briefly, naturally and warmly.

IMPORTANT RULES:

1. Use ONLY the hospital information supplied in the context.

2. Do NOT invent prices, services, timings, doctors,
   treatments, guarantees, availability, or medical instructions.

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
    const response =
      await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
      });

    const text =
      response.text?.trim();

    return (
      text ||
      "I don't have that information right now. Please call 090522 09930 and our team can help."
    );
  } catch (err) {

    // Detailed error logging for Render
    console.error(
      "========== GEMINI ERROR =========="
    );

    console.error(
      "Name:",
      err?.name
    );

    console.error(
      "Message:",
      err?.message
    );

    console.error(
      "Status:",
      err?.status
    );

    console.error(
      "Code:",
      err?.code
    );

    console.error(
      "Full error:",
      err
    );

    console.error(
      "==================================="
    );

    // Never expose internal API errors
    // to website visitors.
    return (
      "I'm having trouble answering right now. Please call 090522 09930 and our team can help."
    );
  }
}

// ==================================================
// INTENT DETECTION
// ==================================================

function detectIntent(query) {
  const q =
    normalizeText(query);

  const wantsBooking =
    /\b(book|booking|appointment|schedule|visit)\b/.test(
      q
    );

  const servicePatterns = [

    [
      "Fillings & Sealants",
      [
        "fillings and sealants",
        "fillings sealants",
        "filling",
        "fillings",
        "sealant",
        "sealants",
        "cavity",
      ],
    ],

    [
      "Check-ups",
      [
        "check up",
        "checkup",
        "check-ups",
        "checkups",
        "consultation",
      ],
    ],

    [
      "Teeth Cleaning",
      [
        "cleaning",
        "scaling",
        "tartar",
        "plaque",
      ],
    ],

    [
      "Emergency Care",
      [
        "emergency",
        "urgent dental care",
      ],
    ],

    [
      "Paediatrics",
      [
        "paediatric",
        "pediatric",
        "child dentist",
        "children dentist",
      ],
    ],

    [
      "Teeth Whitening",
      [
        "whitening",
        "white teeth",
      ],
    ],

    [
      "Veneers & Crowns",
      [
        "veneer",
        "veneers",
        "crown",
        "crowns",
      ],
    ],

    [
      "Bonding",
      [
        "bonding",
        "composite bonding",
      ],
    ],

    [
      "Teeth Reshaping",
      [
        "reshaping",
        "reshape",
        "contouring",
      ],
    ],

    [
      "Laser Dentistry",
      [
        "laser dentistry",
        "laser dental",
        "laser treatment",
      ],
    ],

    [
      "Dental Implants",
      [
        "implant",
        "implants",
      ],
    ],

    [
      "Root Canals",
      [
        "root canal",
        "rct",
      ],
    ],

    [
      "Extractions",
      [
        "extraction",
        "extractions",
        "tooth removal",
        "wisdom tooth",
      ],
    ],

    [
      "Oral Surgery",
      [
        "oral surgery",
        "dental surgery",
        "mouth surgery",
      ],
    ],

    [
      "Dentures & Bridges",
      [
        "denture",
        "dentures",
        "bridge",
        "bridges",
      ],
    ],

    [
      "Mouth Guards",
      [
        "mouth guard",
        "mouthguard",
        "night guard",
        "sports guard",
      ],
    ],

    [
      "X-ray",
      [
        "x ray",
        "x-ray",
        "xray",
        "radiograph",
      ],
    ],
  ];

  let service = null;

  for (
    const [serviceName, patterns]
    of servicePatterns
  ) {
    if (
      patterns.some(
        (pattern) =>
          q.includes(pattern)
      )
    ) {
      service = serviceName;
      break;
    }
  }

  return {
    wantsBooking,
    service,
  };
}

// ==================================================
// CHATBOT
// ==================================================

app.post(
  "/api/rag-chat",
  async (req, res) => {

    const userQuery =
      String(
        req.body?.query || ""
      ).trim();

    if (!userQuery) {
      return res.status(400).json({
        error: "missing query",
      });
    }

    try {

      // ==============================================
      // APPOINTMENT STATUS
      // ==============================================

      const phoneMatch =
        userQuery.match(
          /\b\d{10}\b/
        );

      const asksStatus =
        /\b(status|confirmed|pending|did (you|i) get|check (my|on) (my )?appointment)\b/i.test(
          userQuery
        );

      if (
        asksStatus ||
        phoneMatch
      ) {

        if (!phoneMatch) {
          return res.json({
            text:
              "Sure. Please send the 10-digit phone number you used when booking, and I'll check your appointment status.",
            action: null,
          });
        }

        const result =
          await pool.query(
            `
            SELECT
              service,
              doctor,
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

        if (
          result.rows.length === 0
        ) {
          return res.json({
            text:
              `I don't see an appointment under ${phoneMatch[0]}. Would you like to book one now?`,
            action: {
              label:
                "Book an appointment now",
              service: null,
            },
          });
        }

        const text =
          result.rows
            .map(
              (row) => {

                const doctorText =
                  row.doctor
                    ? ` with ${row.doctor}`
                    : "";

                return `${row.service}${doctorText} on ${new Date(
                  row.appt_date
                ).toDateString()} at ${
                  row.appt_time
                } is ${
                  row.status
                }.`;
              }
            )
            .join(" ");

        return res.json({
          text,
          action: null,
        });
      }

      // ==============================================
      // KNOWLEDGE RETRIEVAL
      // ==============================================

      const contextChunks =
        retrieve(userQuery);

      const intent =
        detectIntent(userQuery);

      // If there is no relevant hospital
      // information, don't call Gemini.
      if (
        contextChunks.length === 0
      ) {

        return res.json({
          text:
            "I don't have that information right now. Please call 090522 09930 and our team can help.",

          action:
            intent.wantsBooking ||
            intent.service
              ? {
                  label:
                    intent.service
                      ? `Book ${intent.service} now`
                      : "Book an appointment now",

                  service:
                    intent.service,
                }
              : null,
        });
      }

      // ==============================================
      // GEMINI
      // ==============================================

      const text =
        await askGemini(
          userQuery,
          contextChunks
        );

      const action =
        intent.wantsBooking ||
        intent.service
          ? {
              label:
                intent.service
                  ? `Book ${intent.service} now`
                  : "Book an appointment now",

              service:
                intent.service,
            }
          : null;

      res.json({
        text,
        action,
      });

    } catch (err) {

      console.error(
        "Chatbot error:",
        err
      );

      res.status(500).json({
        error:
          "Chatbot service temporarily unavailable.",
      });
    }
  }
);

// ==================================================
// START SERVER
// ==================================================

const PORT =
  process.env.PORT || 3000;

initDb()
  .then(() => {

    app.listen(
      PORT,
      () => {

        console.log(
          `API running on port ${PORT}`
        );

        console.log(
          `Appointment hours: ${OPEN_TIME} - ${CLOSE_TIME}`
        );

        console.log(
          `Doctors loaded: ${DOCTORS.length}`
        );

        console.log(
          `Knowledge base entries: ${KB.length}`
        );
      }
    );

  })
  .catch((err) => {

    console.error(
      "Database initialization failed:",
      err
    );

    process.exit(1);
  });
