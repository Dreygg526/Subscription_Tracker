// Pure logic: the offer ladder the customer picks from during onboarding.
//
// These mirror the live bundle picker on the product page. The labels match the
// `offers` rows seeded in supabase/schema.sql on purpose, so a claim made in
// onboarding and an order matched from a Shopify CSV describe the same thing.
//
// This is NOT a replacement for offer rules. Which orders unlock the tracker is
// still config at /admin (see CLAUDE.md). This list is only what the wizard
// shows, and what a claim is worth until a real order backs it up.

export type Bundle = {
  id: string;
  /** Matches the seeded offer label, e.g. "Buy 2, Get 1 Free — 90 Day Supply". */
  label: string;
  /** What the customer sees as the headline. */
  name: string;
  supply: string;
  days: number;
  note: string | null;
};

export const BUNDLES: Bundle[] = [
  {
    id: 'supply-30',
    label: 'Buy 1 — 30 Day Supply',
    name: 'Buy 1',
    supply: '30 Day Supply',
    days: 30,
    note: null,
  },
  {
    id: 'supply-90',
    label: 'Buy 2, Get 1 Free — 90 Day Supply',
    name: 'Buy 2, Get 1 Free',
    supply: '90 Day Supply',
    days: 90,
    note: 'Most popular',
  },
  {
    id: 'supply-150',
    label: 'Buy 3, Get 2 Free — 150 Day Supply',
    name: 'Buy 3, Get 2 Free',
    supply: '150 Day Supply',
    days: 150,
    note: 'Longest challenge',
  },
];

export function bundleById(id: string | null | undefined): Bundle | null {
  if (!id) return null;
  return BUNDLES.find((b) => b.id === id) ?? null;
}

/** Challenge length for a bundle id, or null if it isn't one we offer. */
export function daysForBundle(id: string | null | undefined): number | null {
  return bundleById(id)?.days ?? null;
}
