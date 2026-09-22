import express from "express";
import { pool } from "../db/pool.js";
import { getDoctorByName } from "../data/doctors.js";
import { getTodayIndia, getIndiaWeekday, buildTimeSlots, timeToMinutes } from "../utils/time.js";
import { SLOT_DURATION_MINUTES } from "../config/env.js";

export const availabilityRouter = express.Router();

availabilityRouter.get(
  "/",
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

    if (
      !doctor.workingDays.includes(
        getIndiaWeekday(date)
      )
    ) {
      return res.json({
        doctor: doctor.name,
        date,
        working: false,
        slots: [],
        availableSlots: [],
        message: `${doctor.name} is not scheduled to work on this date.`,
      });
    }

    const allSlots = buildTimeSlots(
      doctor.startTime,
      doctor.endTime
    );

    try {
      const result = await pool.query(
        `
        SELECT appt_time
        FROM appointments
        WHERE doctor = $1
          AND appt_date = $2
          AND status IN ('pending', 'confirmed')
        `,
        [doctor.name, date]
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
              timeZone: "Asia/Kolkata",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }
          ).format(new Date());

        currentMinutes =
          timeToMinutes(indiaTime);
      }

      const slots = allSlots.map(
        (time) => {
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
        }
      );

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

        availableSlots: slots
          .filter(
            (slot) => slot.available
          )
          .map(
            (slot) => slot.time
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

