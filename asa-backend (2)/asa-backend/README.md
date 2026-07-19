# ASA Foods Backend

A Node.js/Express backend for the pieces of ASA Foods that a static website genuinely cannot do on its own:

- Shared database (SQLite) for orders and partner banking details — visible from **any admin device**, not just the browser that submitted them
- Real admin login (password hashed + JWT), not the old client-side demo password
- **Email** sending (order/partner notifications, settlement summaries) via SMTP
- **WhatsApp** sending (appointment confirmations, settlement reminders) via Meta's official WhatsApp Cloud API
- Auto-generated **PDF appointment letters** for approved riders, emailed automatically
- **Automatic Friday settlement reminders** — a scheduled job computes what's owed to each restaurant/rider and emails + WhatsApps you every Friday, no manual step needed

This is a *separate project* from the website. The website is static (works on Netlify); this backend needs a host that runs Node.js processes continuously (Netlify does not do this for regular Node servers).

## 1. Install

You need Node.js 18+ and internet access (this was written and syntax-checked in a sandboxed environment without internet, so **you must run `npm install` yourself** and test before going live).

```bash
cd asa-backend
npm install
cp .env.example .env
```

## 2. Configure `.env`

Open `.env` and fill in:

| Variable | What it's for | Where to get it |
|---|---|---|
| `JWT_SECRET` | Signs admin login tokens | Run `openssl rand -hex 32` and paste the output |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Your real admin login | Choose your own |
| `SMTP_USER` / `SMTP_PASS` | Sends emails | Gmail: turn on 2FA, then create an **App Password** at myaccount.google.com/apppasswords |
| `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN` | Sends WhatsApp messages | Free at developers.facebook.com — create an app, add the "WhatsApp" product, use the test number to start |
| `ALLOWED_ORIGINS` | Which website domains can call this API | Your live Netlify URL, e.g. `https://asabites70.netlify.app` |

**Admin account setup:** the admin account is created **automatically the first time the server starts**, using `ADMIN_USERNAME` / `ADMIN_PASSWORD` from your environment variables — no Shell/CLI access needed (Render's free tier doesn't include Shell access). If that admin username already exists, startup leaves its password untouched, so redeploys won't reset a password you've since changed.

If you ever do get Shell/CLI access (paid Render plan, or running locally) and want to force-update the password, you can still run:
```bash
npm run seed-admin
```

## 3. Run it

```bash
npm start
```

Visit `http://localhost:4000/api/health` — you should see `{"ok":true,...}`.

## 4. Deploy it somewhere that runs Node.js

Netlify only serves static files — it will **not** keep this server running. Use one of these instead (all have free tiers):

- **Render.com** — easiest: connect your GitHub repo, pick "Web Service", it auto-detects Node
- **Railway.app** — similarly simple, generous free tier
- **Fly.io** — a bit more setup, good if you want more control

Whichever you pick: set all the `.env` values as environment variables in that platform's dashboard (don't upload the `.env` file itself).

## 5. API reference

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | — | Admin login → returns JWT |
| POST | `/api/orders` | — | Create an order |
| GET | `/api/orders?status=placed` | Admin | List orders |
| PATCH | `/api/orders/:code/status` | Admin | Mark picked up / delivered / cancelled |
| POST | `/api/partners/register` | — | Rider/restaurant submits onboarding + bank details |
| GET | `/api/partners?type=rider&reveal=false` | Admin | List partners (bank number masked unless `reveal=true`) |
| POST | `/api/partners/:id/approve` | Admin | Approve partner → emails/WhatsApps appointment letter (riders) or approval notice (restaurants) |
| GET | `/api/settlement/weekly` | Admin | This week's computed settlement (Friday→Friday) |
| POST | `/api/settlement/send-reminder` | Admin | Manually trigger the settlement summary email/WhatsApp |

Admin-only routes need `Authorization: Bearer <token>` from the login response.

## 6. Connecting the existing website to this backend

Your current `index.html` and `admin.html` use browser `localStorage`, which only works on one device. To share data across devices, replace those `localStorage` calls with `fetch()` calls to this API. Two examples to get you started:

**Rider registration** (in `index.html`, inside the `riderForm` submit handler) — replace the `savePartnerBankRecord(...)` call with:
```js
await fetch('https://your-backend-url.onrender.com/api/partners/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'rider', name, phone, city, aadhaar,
    accountHolder: accName, bankName, accountNumber: accNumber, ifsc,
  }),
});
```

**Admin login** (in `admin.html`, replacing the hardcoded demo check):
```js
const res = await fetch('https://your-backend-url.onrender.com/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password }),
});
const { token } = await res.json();
localStorage.setItem('asa_admin_token', token); // used as Bearer token on subsequent admin API calls
```

Fully rewiring every form and every admin panel view to call this API (instead of `localStorage`) is a further round of frontend work — happy to do that next if you want the whole site running on this backend end-to-end.

## 7. Known limitations / what I could not test

- **I could not run `npm install` or start this server myself** — this sandbox has no internet access. Every file was syntax-checked (`node --check`), and the Friday-window date logic was hand-verified for all 7 weekdays, but you should test the full flow (register → approve → email/WhatsApp arrives) yourself before relying on it.
- **WhatsApp Cloud API test numbers** can only message phone numbers you've added as "testers" in the Meta developer dashboard until your app passes Meta's business verification — plan for that step if you want to message any customer's number.
- **Rider distance-based pay** (₹3/km) isn't calculated in the settlement summary yet — only the ₹20/order base pay — because the current `orders` table has no distance field. Add a `distance_km` column and a small formula change in `services/settlement.js` if you want the full base+distance figure automatically.
