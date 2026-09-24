import { pool } from "../db/pool.js";
import { normalizeText } from "../utils/text.js";
import { askGroq } from "./groq.service.js";
import { KB } from "../data/knowledgeBase.js";

function retrieve(
  query,
  topK = 3
) {
  const q = normalizeText(query);

  const qWords = new Set(
    q
      .split(" ")
      .filter(
        (word) => word.length >= 3
      )
  );

  const scored = KB.map(
    (chunk) => {
      let score = 0;

      // --------------------------------------------
      // EXACT KEYWORD MATCHING
      // --------------------------------------------

      for (const keyword of chunk.keywords) {
        const normalizedKeyword =
          normalizeText(keyword);

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

        // Singular/plural-friendly matching

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
        const alias of
          chunk.aliases || []
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

      for (const word of qWords) {
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
    }
  );

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
      service = serviceName;
      break;
    }
  }

  return {
    wantsBooking,
    service,
  };
}



export async function answerChat(userQuery) {
  const phoneMatch = userQuery.match(/\b\d{10}\b/);
  const asksStatus = /\b(status|confirmed|pending|did (you|i) get|check (my|on) (my )?appointment)\b/i.test(userQuery);

  if (asksStatus || phoneMatch) {
    if (!phoneMatch) return { text: "Sure. Please send the 10-digit phone number you used when booking, and I'll check your appointment status.", action: null };
    const result = await pool.query(`SELECT service, doctor, appt_date, appt_time, status FROM appointments WHERE phone = $1 ORDER BY created_at DESC LIMIT 3`, [phoneMatch[0]]);
    if (result.rows.length === 0) return { text: `I don't see an appointment under ${phoneMatch[0]}. Would you like to book one now?`, action: { label: "Book an appointment now", service: null } };
    const text = result.rows.map((row) => `${row.service} with ${row.doctor} on ${new Date(row.appt_date).toDateString()} at ${row.appt_time} is ${row.status}.`).join(" ");
    return { text, action: null };
  }

  const contextChunks = retrieve(userQuery);
  const intent = detectIntent(userQuery);
  if (contextChunks.length === 0) {
    return { text: "I don't have that information right now. Please call 090522 09930 and our team can help.", action: intent.wantsBooking || intent.service ? { label: intent.service ? `Book ${intent.service} now` : "Book an appointment now", service: intent.service } : null };
  }
  const text = await askGroq(userQuery, contextChunks);
  const action = intent.wantsBooking || intent.service ? { label: intent.service ? `Book ${intent.service} now` : "Book an appointment now", service: intent.service } : null;
  return { text, action };
}
