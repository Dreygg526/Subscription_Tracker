// Pure logic: no database, no React. Everything here is a function of its
// inputs so it stays easy to reason about (and easy to test).

export type MatchType = 'sku' | 'variant_id' | 'title_contains';

export type Offer = {
  id: string;
  label: string;
  match_type: MatchType;
  match_value: string;
  challenge_days: number;
  active: boolean;
};

export type OrderLine = {
  sku: string | null;
  variant_id: string | null;
  line_item_title: string | null;
  purchased_at: string;
};

// --- dates -----------------------------------------------------------------
// Everything is an ISO "YYYY-MM-DD" string in the *customer's* timezone.
// Arithmetic goes through UTC midnight so daylight saving can never shift a day.

/** Today's date as the customer sees it, e.g. "2026-08-17". */
export function localDate(timezone: string, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  } catch {
    // Unknown timezone string -- fall back to UTC rather than throwing.
    return at.toISOString().slice(0, 10);
  }
}

function toUtcMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  return new Date(toUtcMs(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / 86_400_000);
}

// --- offer matching --------------------------------------------------------

function matches(line: OrderLine, offer: Offer): boolean {
  const needle = offer.match_value.trim().toLowerCase();
  if (!needle) return false;

  switch (offer.match_type) {
    case 'sku':
      return (line.sku ?? '').trim().toLowerCase() === needle;
    case 'variant_id':
      return (line.variant_id ?? '').trim() === offer.match_value.trim();
    case 'title_contains':
      return (line.line_item_title ?? '').toLowerCase().includes(needle);
  }
}

export type Entitlement = {
  days: number;
  offerLabel: string;
  /** Purchase date of the earliest qualifying order. */
  since: string;
};

/**
 * The best challenge this customer's orders unlock. A customer who bought the
 * 90-day bundle and later the 150-day bundle gets 150.
 */
export function entitlementFor(orders: OrderLine[], offers: Offer[]): Entitlement | null {
  const active = offers.filter((o) => o.active);
  let best: Entitlement | null = null;

  for (const order of orders) {
    for (const offer of active) {
      if (!matches(order, offer)) continue;

      const since = order.purchased_at.slice(0, 10);
      if (!best || offer.challenge_days > best.days) {
        best = { days: offer.challenge_days, offerLabel: offer.label, since };
      } else if (offer.challenge_days === best.days && since < best.since) {
        best.since = since;
      }
    }
  }

  return best;
}

// --- streaks ---------------------------------------------------------------

export type Streak = {
  /** Days in a row up to today. */
  current: number;
  /** Best run ever. */
  longest: number;
  /** Total days checked in. */
  total: number;
  checkedInToday: boolean;
};

export function computeStreak(checkInDates: string[], today: string): Streak {
  const done = new Set(checkInDates);
  const checkedInToday = done.has(today);

  // If they haven't checked in yet today the streak isn't broken -- it's just
  // pending. Count back from yesterday so the number doesn't scare them at 8am.
  let cursor = checkedInToday ? today : addDays(today, -1);
  let current = 0;
  while (done.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of [...done].sort()) {
    run = prev !== null && daysBetween(prev, day) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = day;
  }

  return { current, longest, total: done.size, checkedInToday };
}

// --- progress --------------------------------------------------------------

export type Progress = {
  /** Days actually taken. */
  completed: number;
  lengthDays: number;
  /** 0-1, by days taken. */
  fraction: number;
  /** Which calendar day of the challenge today is, 1-based. */
  dayNumber: number;
  daysRemaining: number;
  finished: boolean;
};

export function computeProgress(
  checkInDates: string[],
  startedOn: string,
  lengthDays: number,
  today: string
): Progress {
  const completed = checkInDates.filter((d) => d >= startedOn).length;
  const dayNumber = Math.max(1, daysBetween(startedOn, today) + 1);

  return {
    completed,
    lengthDays,
    fraction: Math.min(1, completed / lengthDays),
    dayNumber,
    daysRemaining: Math.max(0, lengthDays - completed),
    finished: completed >= lengthDays,
  };
}

// --- what actually sizes the challenge -------------------------------------

export type Claim = { days: number | null; label: string | null };
export type Resolved = { days: number | null; offerLabel: string | null; verified: boolean };

/**
 * Decides how long a customer's challenge is, from what they told us during
 * sign-up and what their imported orders prove.
 *
 * `requireOrderMatch` off (today): the bundle they PICKED wins. Someone who
 * picks 30 days gets 30, even if an old order for that address says 90 -- the
 * opposite used to be true and it silently overrode people's choice.
 *
 * `requireOrderMatch` on: only an imported order counts, and a claim on its own
 * unlocks nothing.
 *
 * `verified` is independent of both: it says whether a real order backs this
 * person, which is what the admin console reports.
 */
export function resolveChallenge(
  claim: Claim,
  entitlement: Entitlement | null,
  requireOrderMatch: boolean
): Resolved {
  const verified = Boolean(entitlement);

  if (requireOrderMatch) {
    return {
      days: entitlement?.days ?? null,
      offerLabel: entitlement?.offerLabel ?? null,
      verified,
    };
  }

  return {
    days: claim.days ?? entitlement?.days ?? null,
    offerLabel: claim.label ?? entitlement?.offerLabel ?? null,
    verified,
  };
}
