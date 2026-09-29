# CareFur Public Client Website

Editable React/Vite source project for the **CareFur pet owner/client website**.

## Included in this version

- enhanced public landing page design
- 15-room showcase with room pricing
- room selection + reservation estimate calculator
- embedded Google Maps location section
- Gmail-required review submission
- floating inquiries chat with:
  - common questions
  - option 6 = connect to staff
  - no Google sign-in required
  - email-based realtime inquiry thread
- `/staff-inquiries` page for admin/staff replies

---

## 1. Install

```powershell
npm install
```

Copy the environment file:

```powershell
copy .env.local.example .env.local
```

Add your real **Supabase URL** and **anon/public key** to `.env.local`.

---

## 2. REQUIRED SQL

If you already ran the older public-site SQL, now run:

- `PATCH_PUBLIC_SITE_V3.sql`

This patch adds/fixes:

- email-based public inquiry chat RPCs
- Gmail review submission RPC
- reservation request RPC
- room pricing / estimated total fields
- improved `public_room_availability(date)` output

If you have **not** run the public-site SQL yet, run your base SQL first, then run `PATCH_PUBLIC_SITE_V3.sql` after it.

---

## 3. Run locally

```powershell
npm run dev
```

---

## 4. Build

```powershell
npm run build
```

---

## Staff inquiry inbox

Open:

`/staff-inquiries`

Only accounts with `public.users.role = 'staff'` or `public.users.role = 'admin'` can reply.

---

## Notes

- payment is **in-store only**
- public reviews require a **Gmail address**
- public inquiries now use **name + email**, not Google login
- the public room section shows **15 featured rooms** and uses Supabase room availability data when available
