# Dr. Chandu's Dental Hospital — deployment guide

Two pieces:
- `index.html` — the whole website (frontend), including the booking form,
  admin panel, and chat widget.
- `backend/` — a small Express API that stores appointments in Postgres and
  answers the chatbot using a real Claude API call.

## 1. Database

Create a free Postgres instance on any of these (pick one):
- https://neon.tech
- https://supabase.com
- https://railway.app

Copy the connection string it gives you (`postgres://user:pass@host/db`).
The backend creates its own `appointments` table automatically on first run
— no manual SQL needed.

## 2. Backend

```
cd backend
npm install
cp .env.example .env   # fill in the real values
npm start               # test locally on http://localhost:3000
```

Deploy it:
1. Push this `backend/` folder to a GitHub repo.
2. On https://render.com (or https://railway.app), create a new **Web Service**
   from that repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add environment variables in the dashboard: `DATABASE_URL`, `ADMIN_KEY`
   (make up a long random string — this is your staff password for the admin
   panel), `ANTHROPIC_API_KEY` (from https://console.anthropic.com),
   `ALLOWED_ORIGIN` (your frontend's URL, once you know it — you can update
   this after step 3).
5. Deploy. You'll get a URL like `https://drchandu-api.onrender.com`.

## 3. Frontend

1. Open `index.html` and change this line near the top of the `<script>`:
   ```js
   const API_BASE = "https://your-backend-domain.com";
   ```
   to your real backend URL from step 2.
2. Push `index.html` to a GitHub repo (can be the same repo, different
   folder, or a separate one).
3. Deploy it on https://netlify.com or https://vercel.com — both support
   dragging a single HTML file into their dashboard, or connecting the repo.
4. You'll get a URL like `https://drchandu.netlify.app`. Go back to the
   backend's `ALLOWED_ORIGIN` env var and set it to this URL, then redeploy
   the backend so CORS allows requests from it.

## 4. Custom domain

In the Netlify/Vercel dashboard: Domain settings → Add a domain you own.
They'll give you DNS records to add at your registrar (GoDaddy, Namecheap,
etc). HTTPS certificates are issued automatically once DNS points at them.

## 5. Using the site

- Patients book at `/#booking` — this hits `POST /api/appointments` and
  saves a `pending` row.
- Staff open the site, click **"Staff: manage appointments"** in the
  footer, and enter the `ADMIN_KEY` you set in step 2. That key is then
  remembered for the browser session and used to accept/decline/complete
  requests.
- The chat widget calls `POST /api/rag-chat`, which either answers from the
  knowledge base (via a real Claude call) or looks up appointment status
  directly in Postgres when asked.

## Before real patients rely on this

- Replace the single shared `ADMIN_KEY` with real staff accounts (email +
  password, hashed, with sessions) — a shared key is fine for launch, not
  for ongoing use by multiple staff.
- Add SMS or email notifications (e.g. Twilio, SendGrid) so patients and
  staff don't have to keep the page open to know about status changes.
- Review India's data protection rules (DPDP Act) for handling patient
  contact and health information, and add a privacy policy page.
- Add basic rate limiting to `/api/appointments` and `/api/rag-chat` to
  prevent spam/abuse from the public internet.
