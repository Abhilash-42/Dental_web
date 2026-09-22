# Dr. Chandu Dental Hospital — Phase 4 Backend

Modular Express/PostgreSQL backend for the dental booking platform.

## Structure

```text
backend/
├── server.js
├── package.json
└── src/
    ├── app.js
    ├── config/
    ├── db/
    ├── data/
    ├── middleware/
    ├── routes/
    ├── services/
    └── utils/
```

## Render

Root Directory: `backend` (if `backend` is the repository subdirectory)

Build Command:

```bash
npm install
```

Start Command:

```bash
npm start
```

## Environment variables

Required:

```text
DATABASE_URL
GROQ_API_KEY
RESEND_API_KEY
ADMIN_NOTIFICATION_EMAIL
EMAIL_FROM
ALLOWED_ORIGIN
ADMIN_USERNAME
ADMIN_PASSWORD
ADMIN_TOKEN_SECRET
```

Legacy `ADMIN_KEY` may remain during migration because it is accepted as a fallback for `ADMIN_TOKEN_SECRET`.

Optional:

```text
OPEN_TIME=10:00
CLOSE_TIME=19:30
BUSINESS_NAME
BUSINESS_TYPE
BUSINESS_PHONE
BUSINESS_EMAIL
BUSINESS_ADDRESS
BUSINESS_TAGLINE
BUSINESS_TIMEZONE
PORT
```

## API routes

### Public

- `GET /`
- `GET /api/business`
- `GET /api/doctors`
- `GET /api/services`
- `GET /api/availability?doctor=...&date=...`
- `POST /api/appointments`
- `GET /api/appointments/status?phone=...`
- `POST /api/rag-chat`

### Admin authentication

- `POST /api/admin/login`
- `GET /api/admin/me`
- `POST /api/admin/logout`

### Protected admin appointment management

- `GET /api/appointments`
- `PATCH /api/appointments/:id`

Protected endpoints require:

```text
Authorization: Bearer <admin-token>
```

## Important routing note

Routers are mounted in `src/app.js`, so route files use paths relative to their mount point. For example:

```js
app.use("/api/appointments", appointmentsRouter);
```

and the appointment router uses `/`, `/status`, and `/:id`. This prevents accidental `/api/appointments/api/appointments` URLs.

## Rescheduling update

Admin rescheduling now supports changing the assigned doctor, selecting a new date/time, and recording a required reschedule reason. Reschedule history is stored in `appointment_reschedules`, while the latest reason/time is stored on `appointments`.
