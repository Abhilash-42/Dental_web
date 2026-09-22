import express from "express";
import { pool } from "../db/pool.js";
import { BUSINESS } from "../config/business.js";
import { getDoctorByName } from "../data/doctors.js";
import { getTodayIndia, timeToMinutes, isSlotInDoctorSchedule } from "../utils/time.js";
import { CLOSE_TIME } from "../config/env.js";
import { ADMIN_NOTIFICATION_EMAIL, sendEmail } from "../services/email.service.js";
import { escapeHtml } from "../utils/text.js";
import { requireAdmin } from "../services/adminAuth.service.js";
import { publicBookingRateLimit, publicStatusRateLimit } from "../middleware/security.js";

export const appointmentsRouter = express.Router();

appointmentsRouter.post(
  "/",
  publicBookingRateLimit,
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

    const rawName = String(name).trim();
    const rawService = String(service).trim();
    const rawDoctor = rawDoctor;
    const rawNotes = notes ? String(notes).trim() : "";

    if (rawName.length > 100) {
      return res.status(400).json({ error: "Name must be 100 characters or fewer." });
    }

    if (rawService.length > 150) {
      return res.status(400).json({ error: "Service must be 150 characters or fewer." });
    }

    if (rawDoctor.length > 150) {
      return res.status(400).json({ error: "Doctor must be 150 characters or fewer." });
    }

    if (rawNotes.length > 2000) {
      return res.status(400).json({ error: "Notes must be 2000 characters or fewer." });
    }

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
    // PHONE VALIDATION
    // ----------------------------------------------

    const cleanPhone = String(
      phone
    ).replace(/\D/g, "");

    if (!/^\d{10}$/.test(cleanPhone)) {
      return res.status(400).json({
        error:
          "Please provide a valid 10-digit phone number.",
      });
    }

    // ----------------------------------------------
    // EMAIL VALIDATION
    // ----------------------------------------------

    let cleanEmail = null;

    if (email) {
      cleanEmail = String(email)
        .trim()
        .toLowerCase();

      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          cleanEmail
        )
      ) {
        return res.status(400).json({
          error:
            "Please provide a valid email address.",
        });
      }
    }

    // ----------------------------------------------
    // DATE VALIDATION
    // ----------------------------------------------

    const today = getTodayIndia();

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
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
    // TIME VALIDATION
    // ----------------------------------------------

    const requestedMinutes =
      timeToMinutes(time);

    const closeMinutes =
      timeToMinutes(CLOSE_TIME);

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
        error: `Appointments for ${selectedDoctor.name} are available in 30-minute slots between ${selectedDoctor.startTime} and ${selectedDoctor.endTime}.`,
      });
    }

    // ----------------------------------------------
    // TODAY — PREVENT PAST TIME
    // ----------------------------------------------

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

      const currentMinutes =
        timeToMinutes(indiaTime);

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

    // ----------------------------------------------
    // SAVE APPOINTMENT
    // ----------------------------------------------

    try {
      // Fast user-friendly check before INSERT.
      //
      // The unique database index remains the final
      // protection against race conditions.

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

      // Return the complete appointment because
      // email notifications need patient details.

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
          RETURNING *
          `,
          [
            rawName,
            cleanPhone,
            cleanEmail,
            rawService,
            selectedDoctor.name,
            date,
            time,
            rawNotes || null,
          ]
        );

      const appointment =
        result.rows[0];

      // --------------------------------------------
      // ADMIN EMAIL
      // --------------------------------------------

      if (
        ADMIN_NOTIFICATION_EMAIL
      ) {
        await sendEmail({
          to:
            ADMIN_NOTIFICATION_EMAIL,

          subject:
            `New Appointment — ${appointment.name}`,

          html: `
            <div style="
              font-family:Arial,sans-serif;
              max-width:650px;
              margin:auto;
              padding:24px;
              color:#222;
            ">

              <h2 style="
                margin-bottom:8px;
              ">
                New Appointment Request
              </h2>

              <p>
                A new appointment has been
                booked through the booking platform.
              </p>

              <div style="
                background:#f7f7f7;
                padding:20px;
                border-radius:10px;
                margin:20px 0;
              ">

                <p>
                  <strong>Patient:</strong>
                  ${escapeHtml(
                    appointment.name
                  )}
                </p>

                <p>
                  <strong>Phone:</strong>
                  ${escapeHtml(
                    appointment.phone
                  )}
                </p>

                <p>
                  <strong>Email:</strong>
                  ${escapeHtml(
                    appointment.email ||
                      "Not provided"
                  )}
                </p>

                <p>
                  <strong>Service:</strong>
                  ${escapeHtml(
                    appointment.service
                  )}
                </p>

                <p>
                  <strong>Doctor:</strong>
                  ${escapeHtml(
                    appointment.doctor
                  )}
                </p>

                <p>
                  <strong>Date:</strong>
                  ${escapeHtml(
                    appointment.appt_date
                  )}
                </p>

                <p>
                  <strong>Time:</strong>
                  ${escapeHtml(
                    appointment.appt_time
                  )}
                </p>

                <p>
                  <strong>Notes:</strong>
                  ${escapeHtml(
                    appointment.notes ||
                      "None"
                  )}
                </p>

                <p>
                  <strong>Status:</strong>
                  Pending
                </p>

              </div>

              <p>
                Please open the admin dashboard
                to confirm or decline this appointment.
              </p>

              <p>
                <strong>
                  ${escapeHtml(BUSINESS.name)}
                </strong>
              </p>

            </div>
          `,
        });
      }

      // --------------------------------------------
      // CUSTOMER ACKNOWLEDGEMENT EMAIL
      // --------------------------------------------
      //
      // This email tells the patient that their
      // request was received and is pending confirmation.

      if (appointment.email) {
        await sendEmail({
          to: appointment.email,

          subject:
            `Appointment Request Received — ${BUSINESS.name}`,

          html: `
            <div style="
              font-family:Arial,sans-serif;
              max-width:650px;
              margin:auto;
              padding:24px;
              color:#222;
            ">

              <h2>
                Appointment Request Received
              </h2>

              <p>
                Dear ${escapeHtml(
                  appointment.name
                )},
              </p>

              <p>
                Thank you for requesting an
                appointment with ${escapeHtml(BUSINESS.name)}.
              </p>

              <p>
                Your appointment request has been
                received and is currently
                <strong>pending confirmation</strong>.
              </p>

              <div style="
                background:#f7f7f7;
                padding:20px;
                border-radius:10px;
                margin:20px 0;
              ">

                <p>
                  <strong>Doctor:</strong>
                  ${escapeHtml(
                    appointment.doctor
                  )}
                </p>

                <p>
                  <strong>Service:</strong>
                  ${escapeHtml(
                    appointment.service
                  )}
                </p>

                <p>
                  <strong>Date:</strong>
                  ${escapeHtml(
                    appointment.appt_date
                  )}
                </p>

                <p>
                  <strong>Time:</strong>
                  ${escapeHtml(
                    appointment.appt_time
                  )}
                </p>

                <p>
                  <strong>Status:</strong>
                  Pending
                </p>

              </div>

              <p>
                We will confirm your appointment
                after the hospital team reviews
                the request.
              </p>

              <p>
                For assistance, please call
                <strong>${escapeHtml(BUSINESS.phone || '')}</strong>.
              </p>

              <p>
                Regards,<br>
                <strong>
                  ${escapeHtml(BUSINESS.name)}
                </strong>
              </p>

            </div>
          `,
        });
      }

      // --------------------------------------------
      // RESPONSE
      // --------------------------------------------

      res.status(201).json({
        id: appointment.id,
        status: appointment.status,
        doctor: appointment.doctor,
        appt_date:
          appointment.appt_date,
        appt_time:
          appointment.appt_time,
      });

    } catch (err) {

      // PostgreSQL unique violation means
      // another request won the same slot.

      if (err?.code === "23505") {
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


appointmentsRouter.get(
  "/status",
  publicStatusRateLimit,
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


appointmentsRouter.get(
  "/",
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

// --------------------------------------------------
// ADMIN — UPDATE STATUS
// --------------------------------------------------

appointmentsRouter.patch(
  "/:id",
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

      // --------------------------------------------
      // UPDATE + RETURN COMPLETE APPOINTMENT
      // --------------------------------------------

      const result =
        await pool.query(
          `
          UPDATE appointments
          SET status = $1
          WHERE id = $2
          RETURNING *
          `,
          [
            status,
            req.params.id,
          ]
        );

      const appointment =
        result.rows[0];

      if (!appointment) {
        return res.status(404).json({
          error:
            "Appointment not found.",
        });
      }

      // --------------------------------------------
      // CUSTOMER CONFIRMATION EMAIL
      // --------------------------------------------

      if (
        status === "confirmed" &&
        appointment.email
      ) {

        await sendEmail({
          to: appointment.email,

          subject:
            `Appointment Confirmed — ${BUSINESS.name}`,

          html: `
            <div style="
              font-family:Arial,sans-serif;
              max-width:650px;
              margin:auto;
              padding:24px;
              color:#222;
            ">

              <h2>
                Appointment Confirmed
              </h2>

              <p>
                Dear ${escapeHtml(
                  appointment.name
                )},
              </p>

              <p>
                Your dental appointment has
                been successfully confirmed.
              </p>

              <div style="
                background:#f7f7f7;
                padding:20px;
                border-radius:10px;
                margin:20px 0;
              ">

                <p>
                  <strong>Doctor:</strong>
                  ${escapeHtml(
                    appointment.doctor
                  )}
                </p>

                <p>
                  <strong>Service:</strong>
                  ${escapeHtml(
                    appointment.service
                  )}
                </p>

                <p>
                  <strong>Date:</strong>
                  ${escapeHtml(
                    appointment.appt_date
                  )}
                </p>

                <p>
                  <strong>Time:</strong>
                  ${escapeHtml(
                    appointment.appt_time
                  )}
                </p>

                <p>
                  <strong>Status:</strong>
                  Confirmed
                </p>

              </div>

              <p>
                Please arrive a few minutes
                before your appointment time.
              </p>

              <p>
                If you need any assistance,
                please contact us at
                <strong>${escapeHtml(BUSINESS.phone || '')}</strong>.
              </p>

              <p>
                Regards,<br>
                <strong>
                  ${escapeHtml(BUSINESS.name)}
                </strong>
              </p>

            </div>
          `,
        });
      }

      // --------------------------------------------
      // CUSTOMER DECLINE EMAIL
      // --------------------------------------------

      if (
        status === "declined" &&
        appointment.email
      ) {

        await sendEmail({
          to: appointment.email,

          subject:
            `Appointment Update — ${BUSINESS.name}`,

          html: `
            <div style="
              font-family:Arial,sans-serif;
              max-width:650px;
              margin:auto;
              padding:24px;
              color:#222;
            ">

              <h2>
                Appointment Update
              </h2>

              <p>
                Dear ${escapeHtml(
                  appointment.name
                )},
              </p>

              <p>
                We are sorry to inform you
                that your requested appointment
                could not be confirmed for the
                selected time.
              </p>

              <div style="
                background:#f7f7f7;
                padding:20px;
                border-radius:10px;
                margin:20px 0;
              ">

                <p>
                  <strong>Doctor:</strong>
                  ${escapeHtml(
                    appointment.doctor
                  )}
                </p>

                <p>
                  <strong>Service:</strong>
                  ${escapeHtml(
                    appointment.service
                  )}
                </p>

                <p>
                  <strong>Date:</strong>
                  ${escapeHtml(
                    appointment.appt_date
                  )}
                </p>

                <p>
                  <strong>Time:</strong>
                  ${escapeHtml(
                    appointment.appt_time
                  )}
                </p>

                <p>
                  <strong>Status:</strong>
                  Declined
                </p>

              </div>

              <p>
                Please contact us at
                <strong>${escapeHtml(BUSINESS.phone || '')}</strong>
                to discuss another available
                appointment time.
              </p>

              <p>
                Regards,<br>
                <strong>
                  ${escapeHtml(BUSINESS.name)}
                </strong>
              </p>

            </div>
          `,
        });
      }

      // --------------------------------------------
      // ADMIN RESPONSE
      // --------------------------------------------

      res.json({
        ok: true,
        appointment: {
          id: appointment.id,
          status: appointment.status,
          doctor: appointment.doctor,
          appt_date:
            appointment.appt_date,
          appt_time:
            appointment.appt_time,
        },
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


// --------------------------------------------------
// ADMIN — RESCHEDULE APPOINTMENT
// --------------------------------------------------

appointmentsRouter.post(
  "/:id/reschedule",
  requireAdmin,
  async (req, res) => {
    const { doctor, date, time, reason } = req.body || {};
    const selectedDoctorName = String(doctor || "").trim();
    const rescheduleReason = String(reason || "").trim();

    if (!selectedDoctorName) {
      return res.status(400).json({
        error: "Please select a doctor.",
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
      return res.status(400).json({
        error: "Invalid appointment date.",
      });
    }

    const requestedMinutes = timeToMinutes(String(time || ""));
    if (requestedMinutes === null) {
      return res.status(400).json({
        error: "Invalid appointment time.",
      });
    }

    if (!rescheduleReason) {
      return res.status(400).json({
        error: "Please provide a reason for rescheduling.",
      });
    }

    if (rescheduleReason.length > 500) {
      return res.status(400).json({
        error: "Reschedule reason must be 500 characters or fewer.",
      });
    }

    const selectedDoctor = getDoctorByName(selectedDoctorName);
    if (!selectedDoctor) {
      return res.status(400).json({
        error: "The selected doctor could not be found.",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const existingResult = await client.query(
        `
        SELECT *
        FROM appointments
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
        `,
        [req.params.id]
      );

      const appointment = existingResult.rows[0];

      if (!appointment) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          error: "Appointment not found.",
        });
      }

      if (!["pending", "confirmed"].includes(appointment.status)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "Only pending or confirmed appointments can be rescheduled.",
        });
      }

      const today = getTodayIndia();
      if (String(date) < today) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "Past dates cannot be selected. Please choose today or a future date.",
        });
      }

      if (!isSlotInDoctorSchedule(selectedDoctor, String(date), String(time))) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: `Appointments for ${selectedDoctor.name} are available in 30-minute slots between ${selectedDoctor.startTime} and ${selectedDoctor.endTime}.`,
        });
      }

      if (String(date) === today) {
        const indiaTime = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date());

        const currentMinutes = timeToMinutes(indiaTime);
        if (currentMinutes !== null && requestedMinutes <= currentMinutes) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            error: "That time has already passed. Please choose a later time.",
          });
        }
      }

      const conflict = await client.query(
        `
        SELECT id
        FROM appointments
        WHERE doctor = $1
          AND appt_date = $2
          AND appt_time = $3
          AND status IN ('pending', 'confirmed')
          AND id <> $4
        LIMIT 1
        `,
        [selectedDoctor.name, date, time, req.params.id]
      );

      if (conflict.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: `That slot is already booked with ${selectedDoctor.name}. Please choose another time.`,
        });
      }

      const oldDate = appointment.appt_date;
      const oldTime = appointment.appt_time;
      const oldDoctor = appointment.doctor;

      const updatedResult = await client.query(
        `
        UPDATE appointments
        SET doctor = $1,
            appt_date = $2,
            appt_time = $3,
            reschedule_reason = $4,
            rescheduled_at = now()
        WHERE id = $5
        RETURNING *
        `,
        [selectedDoctor.name, date, time, rescheduleReason, req.params.id]
      );

      const updated = updatedResult.rows[0];

      await client.query(
        `
        INSERT INTO appointment_reschedules (
          appointment_id,
          previous_doctor,
          previous_date,
          previous_time,
          new_doctor,
          new_date,
          new_time,
          reason
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [
          updated.id,
          oldDoctor,
          oldDate,
          oldTime,
          selectedDoctor.name,
          date,
          time,
          rescheduleReason,
        ]
      );

      await client.query("COMMIT");

      if (updated?.email) {
        const doctorChanged = oldDoctor !== selectedDoctor.name;

        await sendEmail({
          to: updated.email,
          subject: `Appointment Rescheduled — ${BUSINESS.name}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:650px;margin:auto;padding:24px;color:#222;">
              <h2>Appointment Rescheduled</h2>
              <p>Dear ${escapeHtml(updated.name)},</p>
              <p>Your appointment has been rescheduled by the front desk.</p>
              <div style="background:#f7f7f7;padding:20px;border-radius:10px;margin:20px 0;">
                <p><strong>Previous doctor:</strong> ${escapeHtml(oldDoctor || 'Not specified')}</p>
                <p><strong>Previous appointment:</strong> ${escapeHtml(String(oldDate))} · ${escapeHtml(String(oldTime))}</p>
                <p><strong>New doctor:</strong> ${escapeHtml(updated.doctor)}</p>
                <p><strong>New appointment:</strong> ${escapeHtml(String(updated.appt_date))} · ${escapeHtml(String(updated.appt_time))}</p>
                <p><strong>Reason:</strong> ${escapeHtml(rescheduleReason)}</p>
                ${doctorChanged ? '<p><strong>Note:</strong> The doctor assigned to your appointment has also been changed.</p>' : ''}
              </div>
              <p>If you need assistance, please contact us at <strong>${escapeHtml(BUSINESS.phone || '')}</strong>.</p>
              <p>Regards,<br><strong>${escapeHtml(BUSINESS.name)}</strong></p>
            </div>
          `,
        });
      }

      res.json({
        ok: true,
        appointment: {
          id: updated.id,
          status: updated.status,
          doctor: updated.doctor,
          appt_date: updated.appt_date,
          appt_time: updated.appt_time,
          reschedule_reason: updated.reschedule_reason,
          rescheduled_at: updated.rescheduled_at,
        },
      });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});

      if (err?.code === "23505") {
        return res.status(409).json({
          error: "That appointment slot is already booked. Please choose another time.",
        });
      }

      console.error("Appointment reschedule error:", err);
      res.status(500).json({
        error: "Could not reschedule appointment.",
      });
    } finally {
      client.release();
    }
  }
);

// ==================================================
