-- Supplement tracker schema.
-- Paste this whole file into Supabase -> SQL Editor -> Run.

-- ---------------------------------------------------------------------------
-- profiles: one row per signed-in customer. Holds the timezone we use to
-- decide what "today" means for that person.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  email      text not null,
  timezone   text not null default 'UTC',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- offers: the admin config. Each row says "an order line that looks like THIS
-- unlocks a challenge of N days". Managed at /admin.
-- ---------------------------------------------------------------------------
create table if not exists public.offers (
  id             uuid primary key default gen_random_uuid(),
  label          text not null,
  match_type     text not null check (match_type in ('sku', 'variant_id', 'title_contains')),
  match_value    text not null,
  challenge_days int  not null check (challenge_days between 1 and 400),
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- orders: one row per purchased line item, imported from a Shopify CSV export
-- (and later, from the orders/create webhook). Deliberately dumb storage --
-- offers are matched against these at read time, so editing an offer applies
-- retroactively to everyone who already bought.
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  order_number    text,
  sku             text,
  variant_id      text,
  line_item_title text,
  purchased_at    timestamptz not null default now(),
  source          text not null default 'csv',
  created_at      timestamptz not null default now(),

  -- Re-importing the same CSV must not duplicate rows. A generated column (as
  -- opposed to an expression index) is what lets upserts target this conflict.
  dedupe_key text generated always as (
    lower(email) || '|' || coalesce(order_number, '') || '|' ||
    coalesce(sku, '') || '|' || coalesce(line_item_title, '')
  ) stored
);

create unique index if not exists orders_dedupe on public.orders (dedupe_key);

create index if not exists orders_email_idx on public.orders (lower(email));

-- ---------------------------------------------------------------------------
-- challenges: one active challenge per customer. Created the first time they
-- sign in with a qualifying order. length_days is upgraded (never downgraded)
-- if they later buy a bigger bundle.
-- ---------------------------------------------------------------------------
create table if not exists public.challenges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users on delete cascade,
  length_days int  not null,
  started_on  date not null,
  offer_label text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- check_ins: the whole point. One row per day the customer tapped the button.
-- The unique index is what makes the button idempotent.
-- ---------------------------------------------------------------------------
create table if not exists public.check_ins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  local_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create index if not exists check_ins_user_idx on public.check_ins (user_id, local_date desc);

-- ---------------------------------------------------------------------------
-- Row-level security.
-- Customers can only ever touch their own rows. offers and orders get RLS
-- enabled with no policies at all, which means: nobody can read them with the
-- anon key. Only the server (service role) touches them.
-- ---------------------------------------------------------------------------
alter table public.profiles   enable row level security;
alter table public.challenges enable row level security;
alter table public.check_ins  enable row level security;
alter table public.offers     enable row level security;
alter table public.orders     enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "own challenge" on public.challenges;
create policy "own challenge" on public.challenges
  for select using (auth.uid() = user_id);

drop policy if exists "read own check-ins" on public.check_ins;
create policy "read own check-ins" on public.check_ins
  for select using (auth.uid() = user_id);

drop policy if exists "create own check-ins" on public.check_ins;
create policy "create own check-ins" on public.check_ins
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Starter offer config matching the Summer Blowout bundles.
-- Edit these at /admin -- match_value must equal the SKU on the Shopify
-- variant, or use match_type 'title_contains' to match the line item title.
-- ---------------------------------------------------------------------------
insert into public.offers (label, match_type, match_value, challenge_days, active)
values
  ('Buy 2, Get 1 Free — 90 Day Supply',  'title_contains', '90 Day Supply',  90,  true),
  ('Buy 3, Get 2 Free — 150 Day Supply', 'title_contains', '150 Day Supply', 150, true)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Onboarding (added 2026-08-18).
-- The customer now answers a short wizard on first open instead of just typing
-- an email, so profiles hold who they are and which bundle they say they bought.
--
-- claimed_days is what they picked in onboarding. It is a *claim*, not proof:
-- until REQUIRE_ORDER_MATCH is turned on, it is what sizes their challenge. A
-- real imported order always wins over a claim -- see entitlementFor + access.ts.
--
-- Idempotent: safe to paste into the SQL editor over an existing database.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists full_name     text;
alter table public.profiles add column if not exists age           int check (age is null or age between 13 and 120);
alter table public.profiles add column if not exists gender        text;
alter table public.profiles add column if not exists claimed_days  int check (claimed_days is null or claimed_days between 1 and 400);
alter table public.profiles add column if not exists claimed_label text;
alter table public.profiles add column if not exists order_email   text;
alter table public.profiles add column if not exists onboarded_at  timestamptz;

-- The email they log in with may differ from the one they used at checkout;
-- order_email is the one matched against imported orders.
create index if not exists profiles_order_email_idx on public.profiles (lower(order_email));

-- grantAccess does .eq('email', …).maybeSingle(), which throws if two profiles
-- ever share an address. Make that impossible.
create unique index if not exists profiles_email_uniq on public.profiles (lower(email));

-- ---------------------------------------------------------------------------
-- Make the seed above genuinely idempotent (added 2026-08-18).
--
-- The `on conflict do nothing` on the seed insert could never fire: there was
-- no unique constraint for it to conflict on, so every re-run of this file
-- added another copy of both bundle rules. Deduplicate, then add the index that
-- makes the seed a no-op from now on.
--
-- Keeps the oldest row of each duplicate set, so any rule you edited by hand
-- in /admin survives and only the re-seeded copies go.
-- ---------------------------------------------------------------------------
delete from public.offers a
 using public.offers b
 where a.match_type = b.match_type
   and a.match_value = b.match_value
   and a.challenge_days = b.challenge_days
   and a.created_at > b.created_at;

create unique index if not exists offers_rule_uniq
  on public.offers (match_type, match_value, challenge_days);
