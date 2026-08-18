# Tracking Order — daily supplement tracker

A one-tap daily tracker that installs to a customer's phone home screen and only
unlocks for people who bought a qualifying Shopify offer. It is the "Health App
Tracker" free gift promised on the Summer Blowout bundle page.

Read `README.md` for setup, operation, and the schema. This file is the working
context: what we decided, why, and where to pick up.

---

## Stack

Next.js 15 (App Router, TypeScript) · Supabase (Postgres + email/password auth) ·
Vercel. Plain CSS with variables in `src/app/globals.css` — no Tailwind, no
component library, deliberately few dependencies.

Same stack as the Teardown project, so there's only one thing to learn.

## Commands

```bash
npm run dev     # http://localhost:3000
npm test        # pure logic: streaks, offer matching, CSV parsing
npm run build   # must pass before deploying
npm run icons   # regenerate PWA icons (rarely needed)
```

`npm test` is a plain Node script using native TypeScript stripping — no test
framework installed. Add cases to `scripts/test.mjs`.

---

## Decisions made, and why

These were chosen deliberately. Don't reverse them without asking.

**Orders arrive by CSV upload, not a Shopify webhook.** The user picked this to
launch without needing Shopify API credentials. It means unlocks are *not*
instant — someone who buys at 2pm can't get in until the next CSV import. The
webhook is the known next step (see below) and everything is shaped for it.

**Email + password auth.** *This reverses the original "magic-link only, no
passwords" decision (2026-08-18).* Two reasons: a magic link cannot carry a
multi-step onboarding wizard — the customer leaves for their inbox mid-flow and
the answers are gone — and every daily sign-in depended on a rate-limited email
sender that still has no real SMTP behind it.

Email has NOT left the critical path. `resetPasswordForEmail` is the only
recovery route, and it is also how anyone whose account predates passwords sets
one. Custom SMTP is already configured on the Supabase project (Gmail SMTP,
sender `ai_support@thestandardlab.com`), so delivery works — but note Supabase
flags Gmail as a personal rather than transactional sender, and the project has
a 60-second minimum interval per user. A dedicated transactional provider
(Resend/Postmark) is still the right move before real traffic.

Email confirmation works **either way**, because custom SMTP is live:

- **Off** — `signUp` returns a session and the sign-up flow finishes in one
  sitting. Addresses are unverified, so someone could claim an email that isn't
  theirs. Recoverable by deleting the auth user.
- **On** — `signUp` returns no session. The flow still saves every answer, via
  the service-role branch in `src/app/welcome/actions.ts`, then shows a
  "confirm your email" screen. Nobody fills the form in twice. That branch is
  narrow on purpose: the account must exist, be unconfirmed, be under 30
  minutes old, and not already onboarded.

With confirmation on, set **Email Templates → Confirm signup** to
`{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup`, or the
link goes through Supabase's verify endpoint and returns the session in a URL
fragment the server cannot read.

**Admin is a separate host.** The tracker and the console ship from one codebase
but are separate entities: `admin.localhost:3000` in dev, `admin.<domain>` in
production, split by hostname in `src/middleware.ts`. Each host holds its own
Supabase session (cookies carry no `Domain`), so signing into the tracker does
not sign you into admin — that is deliberate, and it means a leaked customer
session cannot reach the console. Do not "fix" it with a shared cookie domain.

**Host routing is not authorisation.** The `Host` header is set by the client.
`requireAdmin()` / `getAdminSession()` in `src/lib/access.ts` is the actual
boundary, and every admin page, action and route still calls it.

**The bundle picked during sign-up is a claim, not proof.** `REQUIRE_ORDER_MATCH`
decides what a claim is worth:

- `false` (today) — **the pick wins.** Someone who picks 30 days gets 30. This
  means anyone who finds the URL can pick 150 days and get in; the admin console
  shows verified vs unverified so that risk stays visible.
- `true` — only an imported order counts, and a claim unlocks nothing.

`verified` is separate from both: it reports whether a real order backs this
person, whatever sized their challenge.

The rule lives in one tested pure function, `resolveChallenge` in
`src/lib/challenge.ts`. It originally let a real order override the pick, which
looked sane and was wrong in practice: a customer picked 30 days, an unrelated
90-day order existed against the email they typed as their checkout address, and
the app silently gave them 90 with no way to correct it. If you change this rule,
change it there and nowhere else.

**Tips are code, not config.** Deliberately not the same call as offer rules
below. Offer rules are commercial settings the business changes during a promo;
tip copy is health-adjacent text the business is liable for, and it should go
through a diff and a test rather than a form field at 11pm. Config is what the
business changes; code is what the business is answerable for.

**No push notifications in v1.** Biggest complexity source, and unreliable on
iOS unless the app is genuinely installed to the home screen. Revisit once
install rates justify it.

**Two layouts, one stylesheet.** Phone-first, with a single `@media
(min-width: 900px)` block that widens `.shell.wide` and splits the tracker into
two columns: ring and button left, tip and calendar right. The calendar is the
reason — at phone width a 150-day grid is unreadable, and a laptop was showing a
460px column in the middle of an empty screen. No separate desktop build, no
device sniffing.

**Missed and upcoming days must not be two greys.** They were four percent apart
and read as one colour. Missed is now warm with an inset edge, so it survives
both dark mode and colour blindness.

**PWA, not an App Store app.** Manifest + service worker + "Add to Home Screen".
Ships updates instantly, no review process.

**The Android APK is a wrapper, not a second app.** `/install` offers a signed
APK (a Trusted Web Activity) on Android and add-to-home-screen on iOS, where
sideloading is impossible. The APK is a build artifact produced once by
PWABuilder/Bubblewrap and hosted — nothing generates it at runtime, and the
download button hides itself while `NEXT_PUBLIC_APK_URL` is empty. Because a TWA
is just a browser pointed at this site, installing changes nothing about check-in
or what admin sees. See README, "The Android app".

**Offer rules are config, not code.** Changing which bundles unlock the tracker,
or how long each challenge runs, is done at `/admin` — never by editing
TypeScript. If a request sounds like "make the 150-day bundle unlock X", the
answer is an offer rule, not a code change.

## How the gate works

1. `offers` rows each say "an order line matching *this* unlocks *N* days".
   Match on `sku`, `variant_id`, or `title_contains`.
2. A customer's `orders` rows are matched against active offers at read time.
   **Longest match wins** — buying both bundles gives 150 days, not 90.
3. Matching live (rather than stamping entitlements at import) means editing an
   offer rule immediately changes what existing customers get.
4. No match → `/locked`, which is written as an upsell for the 30-day buyer.
5. First unlock creates their challenge starting **the day they open the app**,
   not the day they ordered — the bottle has to arrive first.

Currently seeded to match on the titles `90 Day Supply` / `150 Day Supply` from
the bundle picker. **Should move to SKU matching** once variants have SKUs set;
titles get edited during promos, SKUs don't.

## Behaviour worth preserving

- **Timezones.** "Today" is computed in the customer's own timezone, captured
  from their browser and stored on `profiles.timezone`. Never use server-local
  or UTC dates for check-in logic.
- **The streak doesn't break until the day is over.** If they haven't checked in
  yet today, the streak counts back from yesterday, so it doesn't read `0` at
  breakfast.
- **Progress counts doses taken, not days elapsed.** Missing a day doesn't move
  the ring; it also doesn't race ahead without them.
- **Challenge length re-syncs in both directions.** It used to only ever upgrade,
  so a corrected 30-day pick stayed stuck at 90 forever. `started_on` is never
  touched by that re-sync — their day count must not restart.
- **Check-in is idempotent.** A unique index on `(user_id, local_date)` makes
  double-tapping a no-op. A `23505` error from that insert is success.
- **Never cache customer HTML.** The service worker caches build assets and the
  offline page only.
- **Recovery links must survive being opened in a different browser.** The
  callback tries `token_hash` (via `verifyOtp`) *before* the PKCE `code`. PKCE
  needs a `code_verifier` cookie written by the browser that requested the link,
  and on a phone the link is usually tapped inside the mail app's in-app browser,
  which has none. Since a phone is where this app is meant to live, don't reorder
  those two branches. Still load-bearing after the move to passwords: both
  password-reset links and `/dev-login` arrive as `token_hash`.
- **`/auth/callback?next=` only accepts a same-origin path.** A recovery link
  mints a full session, so an open redirect there would hand over an account.
  `safeNext()` rejects anything not starting with a single `/`.
- **Passwords are never trimmed.** Leading and trailing spaces are legal
  characters; stripping them makes a password that worked at signup fail at
  sign-in.
- **Sign-out is `scope: 'local'`.** The supabase-js default is `global`, which
  revokes every refresh token for the user — signing out on a laptop would also
  sign them out of the copy installed on their phone.

## Layout

```
src/lib/challenge.ts     dates, streaks, progress, offer matching  (pure, tested)
src/lib/shopify-csv.ts   Shopify order-export parser               (pure, tested)
src/lib/tips.ts          the daily tip for a given day             (pure, tested)
src/lib/bundles.ts       the 30/90/150 offer ladder                (pure, tested)
src/lib/onboarding.ts    wizard field validation                   (pure, tested)
src/lib/access.ts        session -> onboarding -> entitlement -> challenge
src/lib/supabase/        server (RLS), browser, and service-role clients
src/app/page.tsx         the tracker
src/app/welcome/         the onboarding wizard
src/app/reset-password/  set a password from a recovery link
src/app/admin/           customers, offer rules, CSV import, manual grants
src/middleware.ts        session refresh + the customer/admin host split
src/app/dev-login/       local-only sign-in shortcut (404s in production)
src/components/          Tracker, InstallPrompt, ServiceWorker
supabase/schema.sql      tables, indexes, row-level security
```

Business logic goes in `src/lib/*.ts` as pure functions and gets a test. Pages
and components stay thin.

Inside `src/lib`, modules import each other with a **relative, extension-explicit**
specifier (`./bundles.ts`, not `@/lib/bundles`). `scripts/test.mjs` loads these
files directly with plain Node, which resolves neither tsconfig path aliases nor
extensionless imports. `allowImportingTsExtensions` in `tsconfig.json` is there
for exactly this.

## Security constraints

- `SUPABASE_SERVICE_ROLE_KEY` bypasses all row-level security. Server-only,
  never `NEXT_PUBLIC_`, never imported into a client component.
- Every admin action re-checks the `ADMIN_EMAILS` allowlist server-side. The
  hidden `/admin` link in the UI is not a security boundary.
- RLS is on for all tables. `offers` and `orders` have *no* policies on purpose —
  only the service role reads them.
- `/dev-login` mints a session without the email round-trip. Two locks, both of
  which must hold: it 404s when `NODE_ENV === 'production'`, and the email must
  be on `ADMIN_EMAILS`. It redirects through the real `/auth/callback` rather
  than forging a session, so it can't drift from the production path. If either
  lock is ever loosened, this becomes an open door to any account.

## Admin actions must report their outcome

`grantAccess` used to `return` silently on every rejected input. A grant typed
against a slightly wrong address (`roanuson@` vs `andreiuson@`) looked exactly
like a successful one, and the only symptom was the customer still seeing
`/locked`. It now redirects back to `/admin?tone=…&msg=…` on every path,
including a warning when the granted email has no profile yet — legitimate for
someone who hasn't opened the app, and also precisely what a typo looks like.
Keep that: an admin action that can fail silently will eventually be debugged
from the customer's end, which is the expensive end.

## Known gap that bit us once

Shopify's order export only fills `Name` / `Email` / `Paid at` on the **first
row of each order**; later line items of the same order leave them blank. The
parser forward-fills them — but must reset at each order boundary, or one
customer's order gets attributed to the previous customer's email and unlocks
the app for the wrong person. Fixed, with a regression test. Preserve that
behaviour if `shopify-csv.ts` is ever rewritten.

---

## Where it runs

| | URL |
|---|---|
| **Customer tracker** | https://nac-tracker-wine.vercel.app |
| **Admin console** | https://nac-tracker-admin.vercel.app |
| **Repository** | https://github.com/Dreygg526/Subscription_Tracker (public) |
| Vercel project | `dreygg526s-projects/nac-tracker` |
| Supabase project | ref `pzsxxswyulakkpwtyzai` (NAC / The Standard Lab) |

Both hostnames are aliases of the **same** Vercel project and the same
deployment — the split is done in `src/middleware.ts`, not by two deployments.
That matters when you deploy: `vercel --prod` updates the customer host, and the
admin alias has to be re-pointed at the new deployment afterwards, or admin keeps
serving the previous build:

```bash
npx vercel --prod
npx vercel alias set <new-deployment-url> nac-tracker-admin.vercel.app
```

The tracker is on `nac-tracker-wine` and not `nac-tracker` because Vercel
appends a word when the name is already taken globally — `nac-tracker.vercel.app`
belongs to a stranger's project. Don't test against it by mistake; it serves a
different app entirely, which briefly looked like our routing was broken.

`NEXT_PUBLIC_ADMIN_HOST` is set in **Production only**. Preview deploys get one
hostname, so leaving it unset there makes the middleware fall back to serving
both apps together instead of making admin unreachable.

## State

**Live, deployed, and used end to end on 2026-08-18.** Typecheck clean, 50 tests
pass, production build clean.

Everything in the original brief is built. Verified against the running app, not
mocks:

- **The daily tap is finally proven.** It was this project's longest-standing
  untested path — a client `onClick` that unit tests could never reach. There is
  now a real `check_ins` row from the deployed app.
- sign-up → confirmation email → profile → challenge, on the live database
- the host split in production: `/admin` bounced on the customer host,
  `manifest.webmanifest` and `sw.js` 404 on the admin host, `/dev-login` 404 in
  production
- PWA served over HTTPS: `display: standalone`, 3 icons, service worker 200
- offer rules resolve correctly, and the account with a real order reads as
  verified

**Deliberately not enforced: the purchase gate.** `REQUIRE_ORDER_MATCH=false`,
so the bundle someone picks during sign-up is enough to get in — no purchase
required. That is a chosen trade to launch without waiting on order import, not
a bug, and it is the one line of the original brief not currently satisfied. The
matching code still runs on every load and records who is verified, so flipping
the flag to `true` in Vercel turns it into a real gate with no code change.

**Known untidiness in the live database:** `offers` holds 5 rows where 3 would
do — duplicate 90/150 rules from re-pasting `schema.sql` before it had a unique
index, plus a `Manual grant — 90 Day Supply` rule created by the manual grant
form. Harmless (longest match wins) but confusing in the admin list. The dedupe
block at the bottom of `supabase/schema.sql` fixes it and has not been run.

## Next up

1. **Move off Gmail SMTP to a transactional provider** (Resend/Postmark).
   Custom SMTP is on and working, but Gmail is a personal sender — Supabase warns
   about deliverability, daily send caps apply, and the project enforces a
   60-second minimum interval per user. Password reset is the only
   account-recovery path, so a throttled or spam-filed email is a locked-out
   customer.
2. **Turn on `REQUIRE_ORDER_MATCH`** once CSV import is routine. See above.
3. **Shopify `orders/create` webhook**, to make unlocks instant. A single new
   route at `src/app/api/shopify/webhook/route.ts` that verifies the HMAC
   signature and inserts line items into `orders` with `source: 'webhook'` —
   the same shape `parseShopifyOrders` already produces.
4. **A real domain.** `app.thestandardlab.com` / `admin.thestandardlab.com` in
   Vercel, `NEXT_PUBLIC_ADMIN_HOST` updated, and all four `/auth/callback` URLs
   added to Supabase → Authentication → URL Configuration. **Do this before
   building the Android APK** — a TWA is locked to one domain, so moving after
   the fact breaks the app for everyone who installed it.
5. **Build the APK** (README, "The Android app"). Needs the domain above, and
   the signing key must be backed up — losing it means never being able to
   update installed users.
6. Move offer matching from `title_contains` to `sku` once variants have SKUs.
   Promo titles get edited; SKUs don't.
7. Get one legal read of `src/lib/tips.ts` before launch. Outcome claims in it
   are quoted from the brand's own product page and nothing is invented, but it
   is still health-adjacent copy.

## Local development

- **Sign in with `http://localhost:3000/dev-login`.** Still the fastest way in
  as an admin: it mints a `token_hash` server-side, so it needs no email and no
  password. Don't hand-copy link URLs — they are ~130 characters and a truncated
  one fails with `?error=link`, which looks identical to an expired token. That
  misdiagnosis cost an hour.
- **The admin console is at `http://admin.localhost:3000`.** Chrome, Edge and
  Firefox resolve any `*.localhost` to 127.0.0.1 with no hosts-file edit.
  **Safari does not** — use `admin.lvh.me:3000` there, or add a hosts entry.
  `allowedDevOrigins` in `next.config.mjs` is what stops Next flagging its
  `/_next/*` requests as cross-origin; without it the console loads unstyled,
  which looks exactly like the `.next`-clobbering bug below.
- **Never run `npm run build` while `npm run dev` is running.** They share
  `.next`; the build clobbers the dev server's chunks and the app starts serving
  unstyled HTML with a 404 on `layout.css`. Looks like broken CSS, isn't. Fix is
  to stop dev, delete `.next`, restart. Use `npx tsc --noEmit` to typecheck while
  dev is up.
- **`HTTP 431` on localhost** means accumulated `sb-<ref>-auth-token` cookies from
  more than one Supabase project have exceeded Node's 16KB header limit. Clear
  cookies for localhost — and now for `admin.localhost` too, since each host
  keeps its own jar. Check first that you are not talking to an **orphaned**
  `next dev` still holding port 3000: killing `npm run dev` does not always kill
  its child, and the zombie serves 431s while a new server quietly moves to 3001.
  `Get-NetTCPConnection -LocalPort 3000` names the process. `NODE_OPTIONS=--max-http-header-size=65536` is a
  stopgap, not a fix.
- A sample Shopify export covering the awkward cases (multi-line orders, refunds,
  quoted titles with commas, a blank-email order boundary) lives at
  `~/Downloads/shopify-orders-sample.csv`.

Deliberately not built: push reminders, offline check-in queuing, and undo for a
logged day.
