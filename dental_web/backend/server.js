// ==================================================
// DR. CHANDU'S MULTI-SPECIALITY DENTAL HOSPITAL
// BACKEND API
// ==================================================
//
// Public endpoints:
//   GET    /
//   GET    /api/doctors
//   GET    /api/services
//   GET    /api/availability
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
//   OPEN_TIME
//   CLOSE_TIME
//
// Default hospital booking hours:
//   10:00 AM - 7:30 PM
//
// ==================================================

import express from "express";
import cors from "cors";
import { Pool } from "pg";
import { GoogleGenAI } from "@google/genai";

const app = express();

// ==================================================
// MIDDLEWARE
// ==================================================

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
  ssl: {
    rejectUnauthorized: false,
  },
});

// ==================================================
// HOSPITAL CONFIGURATION
// ==================================================

const OPEN_TIME =
  process.env.OPEN_TIME || "10:00";

const CLOSE_TIME =
  process.env.CLOSE_TIME || "19:30";

const SLOT_DURATION_MINUTES = 30;

// ==================================================
// DOCTORS
// ==================================================
//
// These are currently demo doctor profiles.
// Replace names/details/images with actual hospital
// information when available.
//
// workingDays:
//   0 = Sunday
//   1 = Monday
//   2 = Tuesday
//   3 = Wednesday
//   4 = Thursday
//   5 = Friday
//   6 = Saturday
//
// ==================================================

const DOCTORS = [
  {
    name: "Dr. Chandu Reddy",
    role: "Chief Dental Surgeon",
    qualification: "BDS",
    specialization:
      "General Dentistry & Oral Care",
    experience: "10+ Years",
    image:
      "https://placehold.co/600x600?text=Dr.+Chandu",
    demo: true,

    startTime: "10:00",
    endTime: "19:30",

    workingDays: [
      0,
      1,
      2,
      3,
      4,
      5,
      6,
    ],
  },

  {
    name: "Dr. Priya Sharma",
    role: "Orthodontist",
    qualification:
      "BDS, MDS Orthodontics",
    specialization:
      "Braces & Clear Aligners",
    experience: "8+ Years",
    image:
      "https://placehold.co/600x600?text=Dr.+Priya",
    demo: true,

    startTime: "10:00",
    endTime: "19:30",

    workingDays: [
      0,
      1,
      2,
      3,
      4,
      5,
      6,
    ],
  },

  {
    name: "Dr. Arjun Mehta",
    role: "Endodontist",
    qualification:
      "BDS, MDS Endodontics",
    specialization:
      "Root Canal Treatment",
    experience: "9+ Years",
    image:
      "https://placehold.co/600x600?text=Dr.+Arjun",
    demo: true,

    startTime: "10:00",
    endTime: "19:30",

    workingDays: [
      0,
      1,
      2,
      3,
      4,
      5,
      6,
    ],
  },

  {
    name: "Dr. Sneha Iyer",
    role: "Periodontist",
    qualification:
      "BDS, MDS Periodontics",
    specialization:
      "Gum Care & Dental Implants",
    experience: "7+ Years",
    image:
      "https://placehold.co/600x600?text=Dr.+Sneha",
    demo: true,

    startTime: "10:00",
    endTime: "19:30",

    workingDays: [
      0,
      1,
      2,
      3,
      4,
      5,
      6,
    ],
  },
];

// ==================================================
// SERVICES
// ==================================================

const SERVICES = [
  {
    name: "General Dentistry",
    description:
      "Routine dental examinations and general oral care.",
  },

  {
    name: "Teeth Cleaning",
    description:
      "Professional scaling and polishing for plaque and tartar removal.",
  },

  {
    name: "Root Canals",
    description:
      "Root canal treatment for infected or damaged teeth.",
  },

  {
    name: "Dental Implants",
    description:
      "Dental implant solutions for missing teeth.",
  },

  {
    name: "Braces",
    description:
      "Orthodontic treatment including braces and clear aligners.",
  },

  {
    name: "Teeth Whitening",
    description:
      "Professional teeth whitening treatment.",
  },

  {
    name: "Extractions",
    description:
      "Tooth extraction and related dental care.",
  },

  {
    name: "Paediatrics",
    description:
      "Dental care for children.",
  },

  {
    name: "X-ray",
    description:
      "Dental imaging and diagnostic X-rays.",
  },

  {
    name: "Veneers & Crowns",
    description:
      "Restorative and cosmetic dental solutions.",
  },

  {
    name: "Dentures & Bridges",
    description:
      "Tooth replacement using dentures and bridges.",
  },
];

// ==================================================
// DATABASE INITIALIZATION
// ==================================================

async function initDb() {
  // ----------------------------------------------
  // Create appointments table
  // ----------------------------------------------

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

  // ----------------------------------------------
  // Migration for existing databases
  // ----------------------------------------------

  await pool.query(`
    ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS doctor TEXT;
  `);

  // ----------------------------------------------
  // Prevent double booking
  //
  // Only pending and confirmed appointments
  // occupy a slot.
  //
  // declined/completed appointments do not block it.
  // ----------------------------------------------

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS
    unique_active_doctor_slot

    ON appointments (
      doctor,
      appt_date,
      appt_time
    )

    WHERE status IN ('pending', 'confirmed')
      AND doctor IS NOT NULL;
  `);
}

// ==================================================
// GEMINI
// ==================================================

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

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

// --------------------------------------------------
// Get today's date in India
// --------------------------------------------------

function getTodayIndia() {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Asia/Kolkata",
    }
  ).format(new Date());
}

// --------------------------------------------------
// Validate HH:MM
// --------------------------------------------------

function isValidTimeFormat(time) {
  return /^\d{2}:\d{2}$/.test(
    String(time || "")
  );
}

// --------------------------------------------------
// Convert HH:MM to minutes
// --------------------------------------------------

function timeToMinutes(time) {
  if (!isValidTimeFormat(time)) {
    return null;
  }

  const [hours, minutes] = String(time)
    .split(":")
    .map(Number);

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

// --------------------------------------------------
// Get doctor
// --------------------------------------------------

function getDoctorByName(name) {
  return DOCTORS.find(
    (doctor) =>
      doctor.name === String(name || "").trim()
  );
}

// --------------------------------------------------
// Get weekday in India
//
// 0 = Sunday
// 1 = Monday
// ...
// 6 = Saturday
// --------------------------------------------------

function getIndiaWeekday(dateString) {
  const date = new Date(
    `${dateString}T12:00:00+05:30`
  );

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const weekday =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
    }).format(date);

  const map = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return map[weekday] ?? null;
}

// --------------------------------------------------
// Generate 30-minute slots
// --------------------------------------------------

function buildTimeSlots(
  startTime,
  endTime
) {
  const start =
    timeToMinutes(startTime);

  const end =
    timeToMinutes(endTime);

  if (
    start === null ||
    end === null ||
    end <= start
  ) {
    return [];
  }

  const slots = [];

  for (
    let minutes = start;
    minutes + SLOT_DURATION_MINUTES <= end;
    minutes += SLOT_DURATION_MINUTES
  ) {
    const hours =
      Math.floor(minutes / 60);

    const mins =
      minutes % 60;

    slots.push(
      `${String(hours).padStart(2, "0")}:${String(
        mins
      ).padStart(2, "0")}`
    );
  }

  return slots;
}

// --------------------------------------------------
// Check doctor schedule
// --------------------------------------------------

function isSlotInDoctorSchedule(
  doctor,
  date,
  time
) {
  const weekday =
    getIndiaWeekday(date);

  const requested =
    timeToMinutes(time);

  const start =
    timeToMinutes(
      doctor.startTime
    );

  const end =
    timeToMinutes(
      doctor.endTime
    );

  if (
    weekday === null ||
    requested === null ||
    start === null ||
    end === null
  ) {
    return false;
  }

  return (
    doctor.workingDays.includes(
      weekday
    ) &&
    requested >= start &&
    requested + SLOT_DURATION_MINUTES <=
      end
  );
}

// --------------------------------------------------
// Get current India time in minutes
// --------------------------------------------------

function getCurrentIndiaMinutes() {
  const indiaTime =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }
    ).format(new Date());

  return timeToMinutes(
    indiaTime
  );
}

// ==================================================
// ADMIN AUTH
// ==================================================

function requireAdmin(
  req,
  res,
  next
) {
  const key =
    req.header("x-admin-key");

  if (
    !key ||
    key !== process.env.ADMIN_KEY
  ) {
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

    service:
      "Dr. Chandu's Dental Hospital API",

    message:
      "Backend is running",

    bookingHours:
      `${OPEN_TIME} - ${CLOSE_TIME}`,

    slotDuration:
      SLOT_DURATION_MINUTES,

    doctors:
      DOCTORS.length,

    services:
      SERVICES.length,
  });
});

// ==================================================
// DOCTORS API
// ==================================================

app.get(
  "/api/doctors",
  (_req, res) => {
    res.json({
      doctors: DOCTORS,
    });
  }
);

// ==================================================
// SERVICES API
// ==================================================

app.get(
  "/api/services",
  (_req, res) => {
    res.json({
      services: SERVICES,
    });
  }
);

// ==================================================
// REAL-TIME AVAILABILITY
// ==================================================

app.get(
  "/api/availability",
  async (req, res) => {
    const doctorName =
      String(
        req.query.doctor || ""
      ).trim();

    const date =
      String(
        req.query.date || ""
      ).trim();

    // ----------------------------------------------
    // Validate inputs
    // ----------------------------------------------

    if (
      !doctorName ||
      !date
    ) {
      return res.status(400).json({
        error:
          "doctor and date are required.",
      });
    }

    // ----------------------------------------------
    // Validate doctor
    // ----------------------------------------------

    const doctor =
      getDoctorByName(
        doctorName
      );

    if (!doctor) {
      return res.status(400).json({
        error:
          "Selected doctor was not found.",
      });
    }

    // ----------------------------------------------
    // Validate date
    // ----------------------------------------------

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        date
      )
    ) {
      return res.status(400).json({
        error:
          "Invalid appointment date.",
      });
    }

    const today =
      getTodayIndia();

    // ----------------------------------------------
    // Past date
    // ----------------------------------------------

    if (date < today) {
      return res.json({
        doctor:
          doctor.name,

        date,

        working: false,

        slots: [],

        availableSlots: [],

        message:
          "Past dates are not available for booking.",
      });
    }

    // ----------------------------------------------
    // Check doctor working day
    // ----------------------------------------------

    const weekday =
      getIndiaWeekday(date);

    if (
      !doctor.workingDays.includes(
        weekday
      )
    ) {
      return res.json({
        doctor:
          doctor.name,

        date,

        working: false,

        slots: [],

        availableSlots: [],

        message:
          `${doctor.name} is not scheduled to work on this date.`,
      });
    }

    // ----------------------------------------------
    // Generate slots
    // ----------------------------------------------

    const allSlots =
      buildTimeSlots(
        doctor.startTime,
        doctor.endTime
      );

    try {
      // --------------------------------------------
      // Get booked slots
      // --------------------------------------------

      const result =
        await pool.query(
          `
          SELECT appt_time

          FROM appointments

          WHERE doctor = $1

            AND appt_date = $2

            AND status IN (
              'pending',
              'confirmed'
            )
          `,
          [
            doctor.name,
            date,
          ]
        );

      const booked =
        new Set(
          result.rows.map(
            (row) =>
              row.appt_time
          )
        );

      // --------------------------------------------
      // Current time for today
      // --------------------------------------------

      let currentMinutes =
        null;

      if (date === today) {
        currentMinutes =
          getCurrentIndiaMinutes();
      }

      // --------------------------------------------
      // Build availability
      // --------------------------------------------

      const slots =
        allSlots.map(
          (time) => {
            const minutes =
              timeToMinutes(
                time
              );

            const past =
              currentMinutes !==
                null &&
              minutes !== null &&
              minutes <=
                currentMinutes;

            const bookedSlot =
              booked.has(time);

            return {
              time,

              available:
                !past &&
                !bookedSlot,

              reason:
                bookedSlot
                  ? "booked"
                  : past
                  ? "past"
                  : null,
            };
          }
        );

      // --------------------------------------------
      // Response
      // --------------------------------------------

      res.json({
        doctor:
          doctor.name,

        date,

        working: true,

        schedule: {
          startTime:
            doctor.startTime,

          endTime:
            doctor.endTime,

          slotDurationMinutes:
            SLOT_DURATION_MINUTES,
        },

        slots,

        availableSlots:
          slots
            .filter(
              (slot) =>
                slot.available
            )
            .map(
              (slot) =>
                slot.time
            ),
      });
    } catch (err) {
      console.error(
        "Availability lookup error:",
        err
      );

      res.status(500).json({
        error:
          "Could not load appointment availability.",
      });
    }
  }
);

// ==================================================
// CREATE APPOINTMENT
// ==================================================

app.post(
  "/api/appointments",
  async (req, res) => {
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

    // ----------------------------------------------
    // Required fields
    // ----------------------------------------------

    if (
      !name ||
      !phone ||
      !service ||
      !doctor ||
      !date ||
      !time
    ) {
      return res.status(400).json({
        error:
          "Name, phone, service, doctor, date and time are required.",
      });
    }

    // ----------------------------------------------
    // Doctor validation
    // ----------------------------------------------

    const selectedDoctor =
      getDoctorByName(
        String(doctor).trim()
      );

    if (!selectedDoctor) {
      return res.status(400).json({
        error:
          "Please select a valid doctor.",
      });
    }

    // ----------------------------------------------
    // Phone validation
    // ----------------------------------------------

    const cleanPhone =
      String(phone).replace(
        /\D/g,
        ""
      );

    if (
      !/^\d{10}$/.test(
        cleanPhone
      )
    ) {
      return res.status(400).json({
        error:
          "Please provide a valid 10-digit phone number.",
      });
    }

    // ----------------------------------------------
    // Date validation
    // ----------------------------------------------

    const today =
      getTodayIndia();

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        date
      )
    ) {
      return res.status(400).json({
        error:
          "Invalid appointment date.",
      });
    }

    if (date < today) {
      return res.status(400).json({
        error:
          "Past dates cannot be booked. Please select today or a future date.",
      });
    }

    // ----------------------------------------------
    // Time validation
    // ----------------------------------------------

    const requestedMinutes =
      timeToMinutes(time);

    const openMinutes =
      timeToMinutes(
        OPEN_TIME
      );

    const closeMinutes =
      timeToMinutes(
        CLOSE_TIME
      );

    if (
      requestedMinutes ===
        null ||
      openMinutes === null ||
      closeMinutes === null
    ) {
      return res.status(400).json({
        error:
          "Invalid appointment time.",
      });
    }

    // ----------------------------------------------
    // Hospital hours
    // ----------------------------------------------

    if (
      requestedMinutes <
        openMinutes ||
      requestedMinutes +
          SLOT_DURATION_MINUTES >
        closeMinutes
    ) {
      return res.status(400).json({
        error:
          `Appointments are available between ${OPEN_TIME} and ${CLOSE_TIME}, with 30-minute slots.`,
      });
    }

    // ----------------------------------------------
    // 30-minute slot validation
    // ----------------------------------------------

    if (
      requestedMinutes %
        SLOT_DURATION_MINUTES !==
      0
    ) {
      return res.status(400).json({
        error:
          "Please select a valid 30-minute appointment slot.",
      });
    }

    // ----------------------------------------------
    // Doctor schedule validation
    // ----------------------------------------------

    if (
      !isSlotInDoctorSchedule(
        selectedDoctor,
        date,
        time
      )
    ) {
      return res.status(400).json({
        error:
          `${selectedDoctor.name} is not available at that time.`,
      });
    }

    // ----------------------------------------------
    // Same-day past-time validation
    // ----------------------------------------------

    if (date === today) {
      const currentMinutes =
        getCurrentIndiaMinutes();

      if (
        currentMinutes !==
          null &&
        requestedMinutes <=
          currentMinutes
      ) {
        return res.status(400).json({
          error:
            "That time has already passed. Please choose a later time.",
        });
      }
    }

    try {
      // --------------------------------------------
      // Extra availability check
      // --------------------------------------------

      const existing =
        await pool.query(
          `
          SELECT id

          FROM appointments

          WHERE doctor = $1

            AND appt_date = $2

            AND appt_time = $3

            AND status IN (
              'pending',
              'confirmed'
            )

          LIMIT 1
          `,
          [
            selectedDoctor.name,
            date,
            time,
          ]
        );

      if (
        existing.rows.length >
        0
      ) {
        return res.status(409).json({
          error:
            "That appointment slot is already booked. Please select another time.",
        });
      }

      // --------------------------------------------
      // Create appointment
      // --------------------------------------------

      const result =
        await pool.query(
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
          (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8
          )

          RETURNING
            id,
            status,
            doctor,
            appt_date,
            appt_time
          `,
          [
            String(name).trim(),

            cleanPhone,

            email
              ? String(
                  email
                ).trim()
              : null,

            String(
              service
            ).trim(),

            selectedDoctor.name,

            date,

            time,

            notes
              ? String(
                  notes
                ).trim()
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

      // --------------------------------------------
      // PostgreSQL unique violation
      // --------------------------------------------

      if (
        err?.code ===
        "23505"
      ) {
        return res.status(409).json({
          error:
            "Sorry, that appointment slot was just booked by someone else. Please select another time.",
        });
      }

      res.status(500).json({
        error:
          "Could not save appointment.",
      });
    }
  }
);

// ==================================================
// CHECK APPOINTMENT STATUS
// ==================================================

app.get(
  "/api/appointments/status",
  async (req, res) => {
    const phone =
      String(
        req.query.phone || ""
      ).replace(
        /\D/g,
        ""
      );

    if (
      !/^\d{10}$/.test(
        phone
      )
    ) {
      return res.status(400).json({
        error:
          "Please provide a valid 10-digit phone number.",
      });
    }

    try {
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
          [phone]
        );

      res.json({
        appointments:
          result.rows,
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
      const result =
        await pool.query(`
          SELECT *

          FROM appointments

          ORDER BY created_at DESC

          LIMIT 200
        `);

      res.json({
        appointments:
          result.rows,
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
// ADMIN — UPDATE APPOINTMENT STATUS
// ==================================================

app.patch(
  "/api/appointments/:id",
  requireAdmin,
  async (req, res) => {
    const {
      status,
    } = req.body || {};

    const allowedStatuses = [
      "pending",
      "confirmed",
      "declined",
      "completed",
    ];

    if (
      !allowedStatuses.includes(
        status
      )
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
      "Dr. Chandu's Multi-speciality Dental Hospital is on the 1st floor, V complex, near Sri Chaitanya School, Sunkara Palem, Andhra Pradesh 533464. The hospital's booking hours are 10:00 AM to 7:30 PM daily. Phone: 090522 09930.",
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
      "chandu",
      "orthodontist",
      "endodontist",
      "periodontist",
      "braces doctor",
      "implant doctor",
    ],

    aliases: [
      "who are the doctors",
      "which doctors are available",
      "tell me about doctors",
      "dental specialists",
      "your doctors",
    ],

    text:
      "The website currently contains four demo doctor profiles: Dr. Chandu Reddy, Chief Dental Surgeon specializing in General Dentistry & Oral Care; Dr. Priya Sharma, Orthodontist specializing in Braces & Clear Aligners; Dr. Arjun Mehta, Endodontist specializing in Root Canal Treatment; and Dr. Sneha Iyer, Periodontist specializing in Gum Care & Dental Implants. These are demo profiles and should be replaced with verified hospital doctor information before presenting them as actual staff.",
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
  // BRACES
  // ------------------------------------------------

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
      "The hospital handles emergency care for severe pain, broken teeth or trauma. Call 090522 09930 and the team can advise you about same-day care where possible. The hospital's booking hours are 10:00 AM to 7:30 PM daily.",
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
      "For toothache: rinse with warm salt water, take an OTC pain reliever if appropriate for you, avoid very hot or cold foods, and avoid chewing on that side. Severe pain with swelling or fever requires prompt dental attention — call 090522 09930.",
  },

  // ------------------------------------------------
  // GENERAL CHECKUPS
  // ------------------------------------------------

  {
    id: "faq-checkups",

    keywords: [
      "checkup",
      "check-up",
      "check up",
      "examination",
      "exam",
      "routine",
    ],

    aliases: [
      "dental checkup",
      "dental check-up",
      "routine checkup",
      "routine dental examination",
      "teeth checkup",
    ],

    text:
      "Regular dental check-ups help identify dental problems early. You can book a dental appointment through the website.",
  },

  // ------------------------------------------------
  // FILLINGS
  // ------------------------------------------------

  {
    id: "faq-fillings",

    keywords: [
      "filling",
      "fillings",
      "cavity",
      "cavities",
      "decay",
      "tooth decay",
    ],

    aliases: [
      "dental filling",
      "tooth filling",
      "cavity filling",
      "fill cavity",
      "cavity treatment",
    ],

    text:
      "Dental fillings are used to restore teeth affected by cavities or decay. The exact treatment and cost depend on the tooth and the extent of the decay.",
  },

  // ------------------------------------------------
  // SEALANTS
  // ------------------------------------------------

  {
    id: "faq-sealants",

    keywords: [
      "sealant",
      "sealants",
      "dental sealant",
    ],

    aliases: [
      "tooth sealant",
      "dental sealants",
      "sealant treatment",
    ],

    text:
      "Dental sealants are protective coatings that can help protect the grooves of teeth from decay, particularly in children.",
  },

  // ------------------------------------------------
  // VENEERS
  // ------------------------------------------------

  {
    id: "faq-veneers",

    keywords: [
      "veneer",
      "veneers",
    ],

    aliases: [
      "dental veneer",
      "dental veneers",
      "teeth veneers",
    ],

    text:
      "Veneers are thin restorations used for cosmetic improvement of the appearance of teeth. Treatment suitability should be assessed by a dentist.",
  },

  // ------------------------------------------------
  // CROWNS
  // ------------------------------------------------

  {
    id: "faq-crowns",

    keywords: [
      "crown",
      "crowns",
      "dental crown",
    ],

    aliases: [
      "tooth crown",
      "dental crowns",
      "crown treatment",
    ],

    text:
      "Dental crowns are restorations used to protect or restore damaged teeth. The appropriate type depends on the individual tooth and clinical assessment.",
  },

  // ------------------------------------------------
  // DENTURES
  // ------------------------------------------------

  {
    id: "faq-dentures",

    keywords: [
      "denture",
      "dentures",
      "false teeth",
    ],

    aliases: [
      "dental dentures",
      "false teeth",
      "tooth replacement dentures",
    ],

    text:
      "Dentures are removable dental appliances used to replace missing teeth. The suitable option depends on the patient's dental condition.",
  },

  // ------------------------------------------------
  // BRIDGES
  // ------------------------------------------------

  {
    id: "faq-bridges",

    keywords: [
      "bridge",
      "bridges",
      "dental bridge",
    ],

    aliases: [
      "dental bridges",
      "tooth bridge",
      "replace missing teeth",
    ],

    text:
      "Dental bridges can be used to replace one or more missing teeth by connecting a replacement tooth to supporting teeth or structures.",
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
    ],

    aliases: [
      "dental x ray",
      "dental x-ray",
      "tooth xray",
      "teeth x ray",
    ],

    text:
      "Dental X-rays can help dentists examine structures that may not be visible during a regular oral examination.",
  },
];

// ==================================================
// RETRIEVAL
// ==================================================

function retrieve(
  query,
  topK = 3
) {
  const q =
    normalizeText(query);

  const qWords =
    new Set(
      q
        .split(" ")
        .filter(
          (word) =>
            word.length >= 3
        )
    );

  const scored =
    KB.map((chunk) => {
      let score = 0;

      // --------------------------------------------
      // Keyword matching
      // --------------------------------------------

      for (
        const keyword
        of chunk.keywords
      ) {
        const normalizedKeyword =
          normalizeText(
            keyword
          );

        if (
          q.includes(
            normalizedKeyword
          )
        ) {
          score +=
            normalizedKeyword.includes(
              " "
            )
              ? 5
              : 2;
        }

        const words =
          normalizedKeyword.split(
            " "
          );

        if (
          words.length === 1 &&
          qWords.has(
            words[0].replace(
              /s$/,
              ""
            )
          )
        ) {
          score += 1;
        }
      }

      // --------------------------------------------
      // Alias matching
      // --------------------------------------------

      for (
        const alias
        of chunk.aliases || []
      ) {
        const normalizedAlias =
          normalizeText(
            alias
          );

        if (
          q.includes(
            normalizedAlias
          )
        ) {
          score += 7;
        }
      }

      // --------------------------------------------
      // Text overlap
      // --------------------------------------------

      const textWords =
        normalizeText(
          chunk.text
        )
          .split(" ")
          .filter(
            (word) =>
              word.length >= 4
          );

      const uniqueTextWords =
        new Set(
          textWords
        );

      for (
        const word
        of qWords
      ) {
        if (
          uniqueTextWords.has(
            word
          )
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
    (a, b) =>
      b.score - a.score
  );

  return scored
    .filter(
      (item) =>
        item.score >= 1.5
    )
    .slice(
      0,
      topK
    )
    .map(
      (item) =>
        item.chunk
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

8. If doctor information is requested, remember that the doctor
   profiles in the supplied knowledge base are demo profiles.
   Do not present demo doctors as verified real hospital staff.

Hospital knowledge:

${context}

User question:

${userQuery}
`;

  try {
    const response =
      await ai.models.generateContent(
        {
          model:
            "gemini-3.6-flash",

          contents:
            prompt,
        }
      );

    const text =
      response.text?.trim();

    return (
      text ||
      "I don't have that information right now. Please call 090522 09930 and our team can help."
    );
  } catch (err) {
    console.error(
      "Gemini error:",
      err
    );

    return (
      "I'm having trouble answering right now. Please call 090522 09930 and our team can help."
    );
  }
}

// ==================================================
// INTENT DETECTION
// ==================================================

function detectIntent(
  query
) {
  const q =
    normalizeText(query);

  // ----------------------------------------------
  // Booking intent
  // ----------------------------------------------

  const wantsBooking =
    /\b(book|booking|appointment|schedule|visit)\b/.test(
      q
    );

  // ----------------------------------------------
  // Services
  // ----------------------------------------------

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
      "bridge",
      "filling",
      "sealant",
      "checkup",
      "check-up",
    ].find(
      (service) =>
        q.includes(service)
    );

  const map = {
    "root canal":
      "Root Canals",

    implant:
      "Dental Implants",

    braces:
      "Braces",

    whitening:
      "Teeth Whitening",

    cleaning:
      "Teeth Cleaning",

    extraction:
      "Extractions",

    paediatric:
      "Paediatrics",

    pediatric:
      "Paediatrics",

    "x ray":
      "X-ray",

    "x-ray":
      "X-ray",

    veneer:
      "Veneers & Crowns",

    crown:
      "Veneers & Crowns",

    denture:
      "Dentures & Bridges",

    bridge:
      "Dentures & Bridges",

    filling:
      "Fillings",

    sealant:
      "Fillings & Sealants",

    checkup:
      "General Dentistry",

    "check-up":
      "General Dentistry",
  };

  return {
    wantsBooking,

    service:
      directService
        ? map[directService]
        : null,
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
        error:
          "missing query",
      });
    }

    try {
      // ============================================
      // APPOINTMENT STATUS
      // ============================================

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
            [
              phoneMatch[0],
            ]
          );

        if (
          result.rows.length ===
          0
        ) {
          return res.json({
            text:
              `I don't see an appointment under ${phoneMatch[0]}. Would you like to book one now?`,

            action: {
              label:
                "Book an appointment now",

              service:
                null,
            },
          });
        }

        const text =
          result.rows
            .map(
              (row) =>
                `${row.service} with ${row.doctor || "the hospital"} on ${new Date(
                  row.appt_date
                ).toDateString()} at ${row.appt_time} is ${row.status}.`
            )
            .join(" ");

        return res.json({
          text,

          action: null,
        });
      }

      // ============================================
      // RETRIEVAL
      // ============================================

      const contextChunks =
        retrieve(
          userQuery
        );

      const intent =
        detectIntent(
          userQuery
        );

      // ============================================
      // NO CONTEXT
      // ============================================

      if (
        contextChunks.length ===
        0
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

      // ============================================
      // GEMINI
      // ============================================

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
// 404 HANDLER
// ==================================================

app.use(
  (req, res) => {
    res.status(404).json({
      error:
        "Endpoint not found.",
    });
  }
);

// ==================================================
// GLOBAL ERROR HANDLER
// ==================================================

app.use(
  (
    err,
    _req,
    res,
    _next
  ) => {
    console.error(
      "Unhandled server error:",
      err
    );

    res.status(500).json({
      error:
        "Internal server error.",
    });
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
          `Appointment slot duration: ${SLOT_DURATION_MINUTES} minutes`
        );

        console.log(
          `Doctors configured: ${DOCTORS.length}`
        );

        console.log(
          `Services configured: ${SERVICES.length}`
        );

        console.log(
          `Knowledge base entries: ${KB.length}`
        );
      }
    );
  })
  .catch(
    (err) => {
      console.error(
        "Database initialization failed:",
        err
      );

      process.exit(1);
    }
  );
