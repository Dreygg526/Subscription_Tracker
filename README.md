# Daily Supplement Tracker

A one-tap daily tracker that installs to a customer's home screen and only unlocks
for people who bought a qualifying Shopify offer.

- **One tap a day.** Big button, streak counter, progress ring, day grid.
- **Installable.** PWA — "Add to Home Screen" gives it an icon and a fullscreen
  launch. No App Store, no review, updates ship instantly.
- **Gated.** Access is granted by matching the customer's email against imported
  Shopify orders.
- **Configurable.** Different offers unlock different challenge lengths, edited
  in the admin panel without touching code.

Stack: Next.js 15 (App Router) · Supabase (Postgres + auth) · Vercel.

---

## How access works

1. Customer buys a bundle in Shopify.
2. You export orders to CSV and upload them in the admin console.
3. Customer opens the app and completes a short onboarding: name, age, gender,
   which bundle they bought, the email they used at checkout, and a password.
4. The bundle they picked sizes their challenge — 30, 90 or 150 days.
5. Their order lines are also checked against your **offer rules**. Longest
   match wins, and a real order always beats what they typed.
6. First unlock creates their challenge, starting **the day they open the app**
   (not the day they ordered — the bottle has to arrive first).

`REQUIRE_ORDER_MATCH` decides whether step 5 is required. While it is `false`,
step 4 alone is enough and the tracker is effectively open to anyone with the
URL. Set it to `true` to make an imported order mandatory; customers with no
matching order then land on `/locked`, which doubles as an upsell. The admin
console flags every unverified customer either way.

---

## The Android app

`/install` is the "get the app" page, linked from the tracker. What it offers
depends on the device:

- **Android** — a real signed `.apk` download, plus add-to-home-screen as a
  fallback.
- **iPhone/iPad** — add-to-home-screen only. Apple does not permit sideloading,
  so there is no downloadable installer for iOS and there cannot be one.
- **Desktop** — points them at their phone.

The APK is a **build artifact, not something the site generates**. It is built
once, signed, and hosted. Until `NEXT_PUBLIC_APK_URL` is set, the page quietly
shows the home-screen route instead of a dead link.

### Building it (once, after the site is on HTTPS)

The app is a Trusted Web Activity: a thin Android wrapper that opens this site
full screen, with no browser UI. It is not a separate codebase — ship a change
here and installed users get it immediately, exactly like the PWA.

1. Deploy to Vercel first. A TWA points at a real HTTPS origin; localhost will
   not work.
2. Go to [pwabuilder.com](https://www.pwabuilder.com), enter the customer URL,
   and package for Android. (Or `npx @bubblewrap/cli init --manifest
   https://app.yourbrand.com/manifest.webmanifest` if you'd rather build
   locally — that needs a JDK and the Android SDK.)
3. **Keep the signing key it generates, and back it up.** Lose it and you can
   never ship an update to anyone who installed the app — they have to
   uninstall and reinstall.
4. Copy the key's SHA-256 fingerprint into
   `public/.well-known/assetlinks.json`, replacing the placeholder. This is what
   proves the app owns this domain; get it wrong and the app opens with a
   browser address bar visible.
5. Put the `.apk` somewhere public — `public/app/tracker.apk` in this repo works
   — and set `NEXT_PUBLIC_APK_URL` to its URL.
6. Redeploy. The download button appears by itself.

### What customers see

Android shows a "from an unknown source" warning for any APK not from the Play
Store. The install page explains this, but it does cost some installs. Putting
the app on Google Play removes the warning; it costs $25 once and adds review.

### Tracking still works

A TWA is a browser pointed at this site, so check-ins go to Supabase exactly as
they do in a tab. Installing changes nothing about what admin can see. Check-ins
are online-only by design — offline queuing is deliberately not built (see
CLAUDE.md).

---

## Setup

### 1. Supabase

Create a project at [supabase.com](https://supabase.com), then:

- **SQL Editor** → paste all of `supabase/schema.sql` → Run.
- **Authentication → Providers → Email**: turn *Enable email provider* on, and
  turn **Confirm email off**. Confirmation would interrupt the onboarding wizard
  with a trip to the inbox, and `signUp` would return no session, so the wizard
  could not finish. The cost is that email addresses are unverified.
- **Authentication → URL Configuration**: set *Site URL* to the customer app's
  URL, and add every callback to *Redirect URLs* — one per host, including the
  admin one:
  `http://localhost:3000/auth/callback`,
  `http://admin.localhost:3000/auth/callback`,
  and the two production equivalents.
- **Authentication → Email Templates → Confirm signup**, set the link to:
  `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup`
  The default template sends the customer through Supabase's own verify
  endpoint, which returns the session in a URL fragment the server cannot read.
- **Authentication → Email Templates → Reset Password**, set the link to:
  `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
  The default template sends a PKCE `code`, which only works in the browser that
  requested it — not the in-app browser a phone opens mail in.

> Custom SMTP is configured on this project (Gmail SMTP, sender
> `ai_support@thestandardlab.com`) under **Authentication → Emails**. Password
> reset is the only account-recovery path, so email must keep working.
> Gmail is a personal rather than transactional sender — Supabase warns about
> deliverability, daily caps apply, and there is a 60-second minimum interval
> per user. Move to Resend or Postmark before real traffic.
>
> Note that a reset request for an address with **no account sends no email at
> all**, by design — the app answers identically either way so nobody can
> discover customers by typing addresses. A silent reset usually means the
> account does not exist, not that email is broken.

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in the Supabase URL and keys from **Project Settings → API**, then set
`ADMIN_EMAILS` to whichever addresses should reach the admin console.

Also set the two hosts. The admin console is a separate entity on its own
hostname, served from this same app:

```
NEXT_PUBLIC_APP_HOST=localhost:3000
NEXT_PUBLIC_ADMIN_HOST=admin.localhost:3000
```

Chrome, Edge and Firefox resolve any `*.localhost` to 127.0.0.1 with no
hosts-file edit, so `http://admin.localhost:3000` works as typed. Safari does
not — use `admin.lvh.me:3000` there.

Leaving `NEXT_PUBLIC_ADMIN_HOST` **empty** serves both apps from one host, which
is what a Vercel preview deploy needs (it only gets one hostname).

`SUPABASE_SERVICE_ROLE_KEY` bypasses all row-level security. It is server-only —
never prefix it with `NEXT_PUBLIC_`.

### 3. Run it

```bash
npm install
npm run dev       # http://localhost:3000
npm test          # streak / offer-matching / CSV parsing
npm run icons     # regenerate PWA icons (already committed)
```

### 4. Deploy

Push to GitHub, import into Vercel, paste the same env vars in, and point a
subdomain like `app.yourbrand.com` at it. HTTPS is required for PWA install to
work at all, which Vercel gives you automatically.

---

## Day-to-day operation

### Configuring which offers unlock the tracker

At `/admin`, each rule says "an order line that looks like *this* unlocks *N*
days". Three ways to match:

| Match on | Use when | Example |
| --- | --- | --- |
| `title_contains` | Fastest to set up. Matches the Shopify line item title. | `90 Day Supply` |
| `sku` | Most precise. Exact match on the variant SKU. | `LD-BUNDLE-90` |
| `variant_id` | Exact match on the numeric Shopify variant ID. | `45123456789` |

`title_contains` is seeded for you based on the "90 Day Supply" / "150 Day
Supply" labels on your bundle picker. **Switch to `sku` once you've set SKUs on
your variants** — titles get edited during promos, SKUs don't.

Rules are evaluated live, so changing a rule immediately changes what existing
customers get. Disabling a rule locks out everyone who only qualified through it.

### Importing orders

Shopify admin → **Orders → Export → Current page / date range → CSV for Excel** →
upload the file at `/admin`.

Re-uploading the same file is safe; existing rows are skipped, not duplicated.
Refunded and voided orders are ignored.

### One-off access

The **Grant access manually** form on `/admin` unlocks a specific email for a
specific number of days — for support cases, gifted orders, and your own
testing.

---

## Going live: the manual step to replace

Right now, new customers cannot unlock the tracker until you upload a CSV. That
is the deliberate v1 tradeoff — it needs no Shopify API access at all.

When you want unlocks to be instant, the change is small and confined:

1. Create a Shopify custom app with `read_orders` scope.
2. Subscribe it to the `orders/create` webhook.
3. Add `src/app/api/shopify/webhook/route.ts` that verifies the HMAC signature
   against your webhook secret, then inserts each line item into `orders` with
   `source: 'webhook'` — the same shape `parseShopifyOrders` already produces.

Nothing else moves. The offer rules, entitlement logic, and UI all read from the
`orders` table and don't care how rows got there.

---

## Layout

```
src/
  lib/
    challenge.ts       dates, streaks, progress, offer matching (pure, tested)
    shopify-csv.ts     Shopify order-export parser (pure, tested)
    tips.ts            the daily tip for a given day (pure, tested)
    bundles.ts         the 30/90/150 offer ladder (pure, tested)
    onboarding.ts      wizard field validation (pure, tested)
    access.ts          session -> onboarding -> entitlement -> challenge
    supabase/          server, browser, and service-role clients
  app/
    page.tsx           the tracker
    login/             email + password sign-in
    welcome/           the onboarding wizard
    reset-password/    set a password from a recovery link
    auth/callback/     where recovery links land
    locked/            no qualifying order (and the upsell)
    admin/             customers, offer rules, CSV import, manual grants
    api/admin/import/  CSV upload endpoint
  middleware.ts        session refresh + the customer/admin host split
  components/
    Tracker.tsx        ring, tap button, today's tip, stats, day grid
    PasswordField.tsx  password input with a show/hide toggle
    InstallPrompt.tsx  "add to home screen" nudge
scripts/
  test.mjs             run with `npm test`
  generate-icons.mjs   dependency-free PNG icon generator
supabase/schema.sql    tables, indexes, row-level security
```

## Notes on a few decisions

**Timezones.** "Today" is computed in the customer's own timezone, captured from
their browser on first load and stored on their profile. Someone in Sydney
checking in at 9am doesn't get credited to the previous UTC day.

**The streak doesn't break until the day is over.** If they haven't checked in
yet today, the streak counts back from yesterday — so it doesn't read `0` at
breakfast and demoralise them before they've had a chance.

**Progress counts doses taken, not days elapsed.** Miss a day and the ring
doesn't move; it doesn't punish them by racing ahead either.

**Nothing is cached that identifies a customer.** The service worker caches build
assets and an offline page only — never the HTML of the tracker itself.

## Not built (and why)

- **Push reminders.** The single biggest source of complexity, and unreliable on
  iOS unless the app is genuinely installed to the home screen. Worth adding once
  install rates justify it.
- **Offline check-ins.** Tapping while offline shows an error rather than queuing.
  Rare on a phone, and queuing correctly across a day boundary is fiddly.
- **Undo.** There's no way to un-log a day. Add one if support asks for it.
