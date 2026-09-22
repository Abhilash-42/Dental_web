import { DOCTORS } from "../data/doctors.js";
import { SLOT_DURATION_MINUTES } from "../config/env.js";

export function getTodayIndia() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(new Date());
}

export function isValidTimeFormat(time) {
  return /^\d{2}:\d{2}$/.test(time);
}

export function timeToMinutes(time) {
  if (!isValidTimeFormat(time)) return null;
  const [hours, minutes] = time.split(":").map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function getIndiaWeekday(dateString) {
  const date = new Date(`${dateString}T12:00:00+05:30`);
  if (Number.isNaN(date.getTime())) return null;
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).formatToParts(date).find((part) => part.type === "weekday")?.value;
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekday] ?? null;
}

export function buildTimeSlots(startTime, endTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null || end <= start) return [];
  const slots = [];
  for (let minutes = start; minutes + SLOT_DURATION_MINUTES <= end; minutes += SLOT_DURATION_MINUTES) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    slots.push(`${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`);
  }
  return slots;
}

export function isSlotInDoctorSchedule(doctor, date, time) {
  const weekday = getIndiaWeekday(date);
  const requested = timeToMinutes(time);
  const start = timeToMinutes(doctor.startTime);
  const end = timeToMinutes(doctor.endTime);
  if (weekday === null || requested === null || start === null || end === null) return false;
  return doctor.workingDays.includes(weekday) && requested >= start && requested + SLOT_DURATION_MINUTES <= end;
}
