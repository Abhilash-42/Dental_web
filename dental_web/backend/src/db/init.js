import { pool } from "./pool.js";

export async function initDb() {
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

  await pool.query(`
    ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS doctor TEXT;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS unique_active_doctor_slot
    ON appointments (doctor, appt_date, appt_time)
    WHERE status IN ('pending', 'confirmed')
      AND doctor IS NOT NULL;
  `);
}
