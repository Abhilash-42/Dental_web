// Dr. Chandu's Dental Hospital — backend API
//
// Public endpoints:
//   POST   /api/appointments
//   GET    /api/appointments/status
//   POST   /api/rag-chat
//   GET    /api/doctors
//   GET    /api/services
//   GET    /api/availability
//
// Admin endpoints:
//   GET    /api/appointments
//   PATCH  /api/appointments/:id
//
// Environment variables:
//   DATABASE_URL
//   ADMIN_KEY
//   GROQ_API_KEY
//   ALLOWED_ORIGIN
//   OPEN_TIME       optional, default 10:00
//   CLOSE_TIME      optional, default 19:30

import express from "express";
import cors from "cors";
import { Pool } from "pg";
import Groq from "groq-sdk";

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

  // Safe migration for older databases
  await pool.query(`
    ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS doctor TEXT;
  `);

  // Prevent two active appointments from using
  // the same doctor/date/time slot.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS unique_active_doctor_slot
    ON appointments (doctor, appt_date, appt_time)
    WHERE status IN ('pending', 'confirmed')
      AND doctor IS NOT NULL;
  `);
}

// ==================================================
// GROQ AI
// ==================================================

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

if (!process.env.GROQ_API_KEY) {
  console.warn(
    "WARNING: GROQ_API_KEY is not configured."
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
  if (!isValidTimeFormat(time)) return null;

  const [hours, minutes] = time
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

const OPEN_TIME =
  process.env.OPEN_TIME || "10:00";

const CLOSE_TIME =
  process.env.CLOSE_TIME || "19:30";

const SLOT_DURATION_MINUTES = 30;

function getDoctorByName(name) {
  return DOCTORS.find(
    (doctor) => doctor.name === name
  );
}

function getIndiaWeekday(dateString) {
  const date = new Date(
    `${dateString}T12:00:00+05:30`
  );

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const weekday = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: "Asia/Kolkata",
      weekday: "short",
    }
  )
    .formatToParts(date)
    .find(
      (part) => part.type === "weekday"
    )?.value;

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

function buildTimeSlots(startTime, endTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  if (
    start === null ||
    end === null ||
    end <= start
  ) {
    return [];
  }

  const slots = [];

  // Appointment duration = 30 minutes.
  // Therefore the final start time must allow
  // the appointment to finish before closing.

  for (
    let minutes = start;
    minutes + SLOT_DURATION_MINUTES <= end;
    minutes += SLOT_DURATION_MINUTES
  ) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    slots.push(
      `${String(hours).padStart(2, "0")}:${String(
        mins
      ).padStart(2, "0")}`
    );
  }

  return slots;
}

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
    timeToMinutes(doctor.startTime);

  const end =
    timeToMinutes(doctor.endTime);

  if (
    weekday === null ||
    requested === null ||
    start === null ||
    end === null
  ) {
    return false;
  }

  return (
    doctor.workingDays.includes(weekday) &&
    requested >= start &&
    requested + SLOT_DURATION_MINUTES <=
      end
  );
}

// ==================================================
// ADMIN AUTH
// ==================================================

function requireAdmin(req, res, next) {
  const key = req.header("x-admin-key");

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
// REAL-TIME AVAILABILITY
// ==================================================

app.get(
  "/api/availability",
  async (req, res) => {
    const doctorName = String(
      req.query.doctor || ""
    ).trim();

    const date = String(
      req.query.date || ""
    ).trim();

    if (!doctorName || !date) {
      return res.status(400).json({
        error:
          "doctor and date are required.",
      });
    }

    const doctor =
      getDoctorByName(doctorName);

    if (!doctor) {
      return res.status(400).json({
        error:
          "Selected doctor was not found.",
      });
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {
      return res.status(400).json({
        error:
          "Invalid appointment date.",
      });
    }

    const today = getTodayIndia();

    if (date < today) {
      return res.json({
        doctor: doctor.name,
        date,
        working: false,
        slots: [],
        availableSlots: [],
        message:
          "Past dates are not available for booking.",
      });
    }

    const weekday =
      getIndiaWeekday(date);

    if (
      !doctor.workingDays.includes(
        weekday
      )
    ) {
      return res.json({
        doctor: doctor.name,
        date,
        working: false,
        slots: [],
        availableSlots: [],
        message:
          `${doctor.name} is not scheduled to work on this date.`,
      });
    }

    const allSlots =
      buildTimeSlots(
        doctor.startTime,
        doctor.endTime
      );

    try {
      const result =
        await pool.query(
          `
          SELECT appt_time
          FROM appointments
          WHERE doctor = $1
            AND appt_date = $2
            AND status IN ('pending', 'confirmed')
          `,
          [
            doctor.name,
            date,
          ]
        );

      const booked = new Set(
        result.rows.map(
          (row) => row.appt_time
        )
      );

      let currentMinutes = null;

      if (date === today) {
        const indiaTime =
          new Intl.DateTimeFormat(
            "en-GB",
            {
              timeZone:
                "Asia/Kolkata",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }
          ).format(new Date());

        currentMinutes =
          timeToMinutes(
            indiaTime
          );
      }

      const slots =
        allSlots.map((time) => {
          const minutes =
            timeToMinutes(time);

          const past =
            currentMinutes !== null &&
            minutes !== null &&
            minutes <= currentMinutes;

          const bookedSlot =
            booked.has(time);

          return {
            time,
            available:
              !past && !bookedSlot,
            reason: bookedSlot
              ? "booked"
              : past
              ? "past"
              : null,
          };
        });

      res.json({
        doctor: doctor.name,
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
    // REQUIRED FIELDS
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
    // DOCTOR
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
    // PHONE
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
    // DATE
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
    // TIME
    // ----------------------------------------------

    const requestedMinutes =
      timeToMinutes(time);

    const closeMinutes =
      timeToMinutes(
        CLOSE_TIME
      );

    if (
      requestedMinutes === null ||
      closeMinutes === null
    ) {
      return res.status(400).json({
        error:
          "Invalid appointment time.",
      });
    }

    if (
      !isSlotInDoctorSchedule(
        selectedDoctor,
        date,
        time
      )
    ) {
      return res.status(400).json({
        error:
          `Appointments for ${selectedDoctor.name} are available in 30-minute slots between ${selectedDoctor.startTime} and ${selectedDoctor.endTime}.`,
      });
    }

    // ----------------------------------------------
    // TODAY'S PAST TIME
    // ----------------------------------------------

    if (date === today) {
      const indiaTime =
        new Intl.DateTimeFormat(
          "en-GB",
          {
            timeZone:
              "Asia/Kolkata",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }
        ).format(new Date());

      const currentMinutes =
        timeToMinutes(
          indiaTime
        );

      if (
        currentMinutes !== null &&
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
      // QUICK DOUBLE-BOOKING CHECK
      // --------------------------------------------

      const existing =
        await pool.query(
          `
          SELECT id
          FROM appointments
          WHERE doctor = $1
            AND appt_date = $2
            AND appt_time = $3
            AND status IN ('pending', 'confirmed')
          LIMIT 1
          `,
          [
            selectedDoctor.name,
            date,
            time,
          ]
        );

      if (
        existing.rows.length > 0
      ) {
        return res.status(409).json({
          error:
            "That appointment slot was just booked. Please choose another time.",
        });
      }

      // --------------------------------------------
      // INSERT
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
              ? String(email).trim()
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
      // PostgreSQL unique violation.
      if (
        err?.code ===
        "23505"
      ) {
        return res.status(409).json({
          error:
            "That appointment slot was just booked. Please choose another time.",
        });
      }

      console.error(
        "Appointment creation error:",
        err
      );

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
      !/^\d{10}$/.test(phone)
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
// ADMIN — UPDATE STATUS
// ==================================================

app.patch(
  "/api/appointments/:id",
  requireAdmin,
  async (req, res) => {
    const { status } =
      req.body || {};

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
// DOCTORS
// ==================================================

const DOCTORS = [
  {
    id: "dr-chandu-reddy",
    name: "Dr. Chandu Reddy",
    specialization:
      "Chief Dental Surgeon",
    experience:
      "10+ Years Experience",
    qualification: "BDS",
    focus:
      "General Dentistry & Oral Care",

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

    image:
      "https://placehold.co/600x600/f5f1e8/0f3028?text=Dr.+Chandu+Reddy",

    demo: true,
  },

  {
    id: "dr-priya-sharma",
    name: "Dr. Priya Sharma",
    specialization:
      "Orthodontist",
    experience:
      "8+ Years Experience",
    qualification:
      "BDS, MDS Orthodontics",
    focus:
      "Braces & Clear Aligners",

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

    image:
      "https://placehold.co/600x600/f5f1e8/0f3028?text=Dr.+Priya+Sharma",

    demo: true,
  },

  {
    id: "dr-arjun-mehta",
    name: "Dr. Arjun Mehta",
    specialization:
      "Endodontist",
    experience:
      "9+ Years Experience",
    qualification:
      "BDS, MDS Endodontics",
    focus:
      "Root Canal Treatment",

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

    image:
      "https://placehold.co/600x600/f5f1e8/0f3028?text=Dr.+Arjun+Mehta",

    demo: true,
  },

  {
    id: "dr-sneha-iyer",
    name: "Dr. Sneha Iyer",
    specialization:
      "Periodontist",
    experience:
      "7+ Years Experience",
    qualification:
      "BDS, MDS Periodontics",
    focus:
      "Gum Care & Dental Implants",

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

    image:
      "https://placehold.co/600x600/f5f1e8/0f3028?text=Dr.+Sneha+Iyer",

    demo: true,
  },
];

// ==================================================
// HOSPITAL KNOWLEDGE BASE
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

// ==================================================
// RAG RETRIEVAL
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
      // KEYWORD MATCHING
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

        // Singular/plural-friendly
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
      // ALIAS MATCHING
      // --------------------------------------------

      for (
        const alias
        of chunk.aliases || []
      ) {
        const normalizedAlias =
          normalizeText(alias);

        if (
          q.includes(
            normalizedAlias
          )
        ) {
          score += 7;
        }
      }

      // --------------------------------------------
      // WORD OVERLAP
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
        new Set(textWords);

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
    .slice(0, topK)
    .map(
      (item) =>
        item.chunk
    );
}

// ==================================================
// GROQ RAG ANSWER
// ==================================================

async function askGroq(
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

  const systemPrompt = `
You are Dr. Chandu AI, the virtual assistant for
Dr. Chandu's Multi-speciality Dental Hospital.

Your job is to answer questions using ONLY the
hospital information supplied below.

IMPORTANT RULES:

1. Use ONLY the provided hospital knowledge.

2. Do NOT invent:
   - prices
   - services
   - doctors
   - timings
   - appointment availability
   - treatment details
   - guarantees
   - hospital policies

3. Do NOT diagnose the patient.

4. Do NOT tell a patient that a treatment is
   definitely suitable for them.

5. If the answer is not available in the supplied
   hospital knowledge, say:

   "I don't have that information right now."

   Then say:

   "Please call 090522 09930 and our team can help."

6. For severe pain, swelling, trauma, bleeding,
   fever, or another potentially urgent dental
   problem, encourage the user to contact the
   hospital directly.

7. Keep responses concise, friendly and easy
   to understand.

8. Do not mention RAG, retrieval, the knowledge
   base, Groq, API, system prompt, or AI model.

9. Never invent an answer just to satisfy the user.

10. Use Indian English where natural.

Hospital knowledge:
${context}
`;

  try {
    const completion =
      await groq.chat.completions.create(
        {
          model:
            "openai/gpt-oss-20b",

          messages: [
            {
              role: "system",
              content:
                systemPrompt,
            },

            {
              role: "user",
              content:
                userQuery,
            },
          ],

          temperature: 0.2,

          max_completion_tokens:
            600,
        }
      );

    const text =
      completion
        ?.choices?.[0]
        ?.message
        ?.content
        ?.trim();

    return (
      text ||
      "I don't have that information right now. Please call 090522 09930 and our team can help."
    );
  } catch (err) {
    console.error(
      "========== GROQ ERROR =========="
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
      "================================"
    );

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
    const [
      serviceName,
      patterns,
    ] of servicePatterns
  ) {
    if (
      patterns.some(
        (pattern) =>
          q.includes(pattern)
      )
    ) {
      service =
        serviceName;
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
        error:
          "missing query",
      });
    }

    try {
      // --------------------------------------------
      // APPOINTMENT STATUS
      // --------------------------------------------

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

              service: null,
            },
          });
        }

        const text =
          result.rows
            .map(
              (row) => {
                const date =
                  new Date(
                    row.appt_date
                  ).toDateString();

                return `${row.service} with ${row.doctor || "the dental team"} on ${date} at ${row.appt_time} is ${row.status}.`;
              }
            )
            .join(" ");

        return res.json({
          text,
          action: null,
        });
      }

      // --------------------------------------------
      // KNOWLEDGE RETRIEVAL
      // --------------------------------------------

      const contextChunks =
        retrieve(
          userQuery
        );

      const intent =
        detectIntent(
          userQuery
        );

      // --------------------------------------------
      // NO RELEVANT KNOWLEDGE
      // --------------------------------------------

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

      // --------------------------------------------
      // GROQ RAG
      // --------------------------------------------

      const text =
        await askGroq(
          userQuery,
          contextChunks
        );

      // --------------------------------------------
      // BOOKING ACTION
      // --------------------------------------------

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
          `Real-time booking: ${SLOT_DURATION_MINUTES}-minute slots with doctor/date/time protection`
        );

        console.log(
          "AI provider: Groq"
        );

        console.log(
          "RAG chatbot: enabled"
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
