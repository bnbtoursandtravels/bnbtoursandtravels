# B&B Tours and Travel — website

Static site. No build step, no dependencies. Open `index.html` or upload the whole
folder to any host (Netlify, Vercel, cPanel, S3 — anything that serves files).

```
index.html              the whole page
assets/css/style.css    single stylesheet
assets/js/main.js       single script (deferred)
assets/img/             photos, logo, icons
sitemap.xml  robots.txt  site.webmanifest
src-photos/  clean/     original + plate-blurred photos (not needed on the server)
```

---

## 1. What is already set

| Detail | Value |
|---|---|
| Phone / WhatsApp | `+91 98954 51666` (`tel:+919895451666`, `wa.me/919895451666`) |
| Email | `bnbtoursandtravels777@gmail.com` |
| Base city | **Calicut (Kozhikode), Kerala** — all Kerala covered |

## 2. Still to replace before going live

Find and replace across `index.html`, `robots.txt` and `sitemap.xml`:

| Placeholder | Replace with | Notes |
|---|---|---|
| `https://www.example.com` | your live domain | canonical, Open Graph, schema, sitemap, robots |

In `assets/js/main.js`, top of the file:

| Setting | Replace with |
|---|---|
| `googlePlaceId: 'GOOGLE_PLACE_ID'` | see below |
| `googleApiKey: 'GOOGLE_MAPS_API_KEY'` | see below |

---

## 3. All reviews, auto-updating (Business Profile API)

This is the good option: **every** review, refreshed daily, written into
`index.html` as real HTML so search engines can read it.

```
tools/get-refresh-token.mjs        run once, gets you a refresh token
tools/fetch-reviews.mjs            the job — fetches reviews, edits index.html
.github/workflows/update-reviews.yml   runs it daily at 02:00 UTC
```

Reviews land between the `REVIEWS:START` / `REVIEWS:END` markers in
`index.html`. Never edit inside those markers by hand. `main.js` detects the
baked-in reviews and leaves them alone.

### Step 1 — Request API access (the slow bit, start now)

The Business Profile APIs are restricted; Google approves each project by hand.

1. Create a Google Cloud project (or reuse the one from the Places API key)
2. Fill in the **Business Profile APIs access request form** — search
   "Google Business Profile API access request". Use the Google account that
   *owns* the B&B listing.
3. Wait for approval. This can take a few days.
4. Once approved, enable these in **APIs & Services → Library**:
   - My Business Account Management API
   - My Business Business Information API
   - Google My Business API (this one carries the reviews endpoint)

### Step 2 — Create an OAuth client

1. **APIs & Services → OAuth consent screen** → External → fill in the basics →
   add the scope `https://www.googleapis.com/auth/business.manage` → add your
   own Google account as a **test user**
2. **Credentials → Create credentials → OAuth client ID → Web application**
3. Under *Authorised redirect URIs* add exactly:
   `http://127.0.0.1:5273/oauth2callback`
   (`127.0.0.1` rather than `localhost`, and an uncommon port, so a dev server
   listening on `::1` cannot swallow the callback)
4. Copy the **client ID** and **client secret**

### Step 3 — Get a refresh token (once, on your own machine)

Needs Node.js 18 or newer.

```bash
GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node tools/get-refresh-token.mjs
```

A browser opens, you approve, and the terminal prints
`GOOGLE_REFRESH_TOKEN=1//...`. It does not expire unless revoked.

**Keep this secret.** Anyone holding it can manage your Business Profile. Never
commit it, and never put it in `assets/` — it must stay server-side.

### Step 4 — Find your location id

```bash
GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy GOOGLE_REFRESH_TOKEN=zzz \
  node tools/fetch-reviews.mjs --list
```

Prints something like `GBP_LOCATION=accounts/123456/locations/789012`.

### Step 5 — Run it

```bash
GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy GOOGLE_REFRESH_TOKEN=zzz \
GBP_LOCATION=accounts/123456/locations/789012 \
  node tools/fetch-reviews.mjs
```

`index.html` now contains your reviews, and `assets/data/reviews.json` holds the
raw data. Re-running is safe — it replaces the block rather than appending.

Options: `MAX_REVIEWS` (default 12) and `MIN_RATING` (default 4).

### Step 6 — Put it on a schedule

**GitHub Pages / any Git-based host** — the workflow is already written. In your
repo: *Settings → Secrets and variables → Actions*, add `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GBP_LOCATION`. Then run it once
by hand from the Actions tab to confirm.

**cPanel / a normal server** — delete the workflow and add a cron entry instead:

```cron
0 2 * * *  cd /home/you/public_html && \
  GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy \
  GOOGLE_REFRESH_TOKEN=zzz GBP_LOCATION=accounts/…/locations/… \
  /usr/bin/node tools/fetch-reviews.mjs
```

Better: put the variables in a `.env` file outside the web root and source it,
so the secrets are never inside a servable directory.

### A note on schema markup

The baked reviews are visible, indexable text, which helps the page. They are
deliberately **not** marked up with `Review` / `AggregateRating` schema —
Google's structured data guidelines prohibit marking up reviews collected on
another platform as your own, and doing it risks a manual action.

---

## 4. Live Google reviews, the simple way (Places API)

The reviews section pulls from the **Places API (New)** at page load and caches
the result in the visitor's browser for 24 hours. Until both values below are
filled in, the section hides itself automatically — nothing broken shows.

**Get the Place ID**
1. Go to <https://developers.google.com/maps/documentation/places/web-service/place-id>
2. Search for *B&B Tours and Travels*
3. Copy the ID (looks like `ChIJN1t_tDeuEmsRUsoyG83frY4`)

**Get the API key**
1. <https://console.cloud.google.com/> → create or pick a project
2. **APIs & Services → Library** → enable **Places API (New)**
3. **Credentials → Create credentials → API key**
4. Edit the key and lock it down — this key is visible to anyone viewing the page:
   - *Application restrictions* → **HTTP referrers** → add `https://yourdomain.com/*`
     and `https://www.yourdomain.com/*`
   - *API restrictions* → **Restrict key** → select **Places API (New)** only
5. Billing must be enabled on the project. Place Details calls fall under a free
   monthly allowance; with the 24-hour cache this site will sit well inside it.

**Known limits (Google's, not the site's)**
- The API returns a **maximum of 5 reviews**, chosen by Google. There is no way
  to fetch all of them or pick which ones appear.
- Only reviews of 4 stars and above are displayed (`reviewsMinRating` in the config).
- Because the reviews arrive by JavaScript they are **not indexed** as your page
  content, and they carry no `Review` schema markup — Google's structured-data
  guidelines forbid marking up reviews collected on another platform as your own.
  If you want reviews that help SEO, collect testimonials directly and I can add
  them as static content with proper markup.

---

## 5. Number plates

All three photos had their registration plates detected and destroyed
(pixelated, then blurred, then feathered) — originals are in `src-photos/`,
scrubbed versions in `clean/`, web-sized derivatives in `assets/img/`.
Neither folder needs to be uploaded; only `assets/` does.

---

## 6. Fleet photos

The fleet section now runs on the five studio shots you supplied — Etios,
Ertiga, Innova Crysta, Force Traveller and the Volvo coach — as
`assets/img/fleet-<name>-{400,800,1200}.{jpg,webp}`. The drawn Etios SVG that
stood in for the missing photo is gone.

Two things to check:

- **Seat counts for the Traveller and the coach** are standard configurations
  (12–17 and 45), not figures you gave me. Correct them in the `<dl class="spec">`
  of those two cards in `index.html` if your vehicles differ.
- **The Maruti Suzuki Dzire card was removed** — you sent no Dzire photo and it
  is not in the hero line-up either. Its images are still in `assets/img/`
  (`fleet-sedan-dzire-*`) if you want the card back.

---

## 7. Google Map

The map is click-to-load (a button, not an iframe) so it costs nothing until a
visitor asks for it. Point `data-map-src` on `#map-embed` in `index.html` at your
own Google Business Profile embed URL when you have one.
