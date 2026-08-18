import assert from 'node:assert/strict';
import {
  addDays, daysBetween, localDate, entitlementFor, computeStreak, computeProgress,
  resolveChallenge,
} from '../src/lib/challenge.ts';
import { parseShopifyOrders } from '../src/lib/shopify-csv.ts';
import { tipForDay, DISCLAIMER } from '../src/lib/tips.ts';
import { BUNDLES, bundleById, daysForBundle } from '../src/lib/bundles.ts';
import { validateOnboarding, isEmailish, ALL_FIELDS, GENDERS, MIN_PASSWORD } from '../src/lib/onboarding.ts';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ok  ' + name); };

console.log('\n-- dates --');
t('addDays crosses a month boundary', () => {
  assert.equal(addDays('2026-08-31', 1), '2026-09-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});
t('addDays survives a DST transition', () => {
  // US DST ends 2026-11-01. Naive local-time math would produce 2026-11-01 here.
  assert.equal(addDays('2026-11-01', 1), '2026-11-02');
  assert.equal(daysBetween('2026-10-30', '2026-11-05'), 6);
});
t('localDate respects the customer timezone', () => {
  const at = new Date('2026-08-17T02:30:00Z');
  assert.equal(localDate('UTC', at), '2026-08-17');
  assert.equal(localDate('America/Los_Angeles', at), '2026-08-16'); // still yesterday there
  assert.equal(localDate('Australia/Sydney', at), '2026-08-17');
  assert.equal(localDate('Not/AZone', at), '2026-08-17');           // falls back, never throws
});

console.log('\n-- offer matching --');
const offers = [
  { id: '1', label: '90 day', match_type: 'title_contains', match_value: '90 Day Supply', challenge_days: 90, active: true },
  { id: '2', label: '150 day', match_type: 'title_contains', match_value: '150 Day Supply', challenge_days: 150, active: true },
  { id: '3', label: 'sku rule', match_type: 'sku', match_value: 'LD-150', challenge_days: 150, active: true },
  { id: '4', label: 'disabled', match_type: 'title_contains', match_value: '30 Day Supply', challenge_days: 30, active: false },
];
const line = (title, sku, at) => ({ line_item_title: title, sku: sku ?? null, variant_id: null, purchased_at: at ?? '2026-06-01T00:00:00Z' });

t('90-day bundle unlocks 90 days', () => {
  assert.equal(entitlementFor([line('Liver Detox - 90 Day Supply')], offers).days, 90);
});
t('no qualifying order returns null', () => {
  assert.equal(entitlementFor([line('Liver Detox - 30 Day Supply')], offers), null);
});
t('"150 Day Supply" does not also match the "90 Day Supply" rule', () => {
  const e = entitlementFor([line('Liver Detox - 150 Day Supply')], offers);
  assert.equal(e.days, 150);
});
t('buying both bundles gives the longer challenge', () => {
  const e = entitlementFor([line('X - 90 Day Supply'), line('X - 150 Day Supply')], offers);
  assert.equal(e.days, 150);
});
t('matching is case-insensitive', () => {
  assert.equal(entitlementFor([line('liver detox - 90 day supply')], offers).days, 90);
});
t('SKU rules match exactly, not by substring', () => {
  assert.equal(entitlementFor([line('Whatever', 'LD-150')], offers).days, 150);
  assert.equal(entitlementFor([line('Whatever', 'LD-1500')], offers), null);
});
t('inactive offers never unlock', () => {
  assert.equal(entitlementFor([line('X - 30 Day Supply')], offers), null);
});
t('"since" is the earliest qualifying purchase', () => {
  const e = entitlementFor([
    line('X - 90 Day Supply', null, '2026-05-01T00:00:00Z'),
    line('X - 90 Day Supply', null, '2026-03-04T00:00:00Z'),
  ], offers);
  assert.equal(e.since, '2026-03-04');
});

console.log('\n-- streaks --');
t('unbroken run counts', () => {
  const s = computeStreak(['2026-08-15','2026-08-16','2026-08-17'], '2026-08-17');
  assert.deepEqual([s.current, s.longest, s.total, s.checkedInToday], [3, 3, 3, true]);
});
t('streak is not broken before today\'s check-in', () => {
  const s = computeStreak(['2026-08-15','2026-08-16'], '2026-08-17');
  assert.equal(s.current, 2);
  assert.equal(s.checkedInToday, false);
});
t('a missed day resets the current streak', () => {
  const s = computeStreak(['2026-08-10','2026-08-11','2026-08-14'], '2026-08-17');
  assert.equal(s.current, 0);
  assert.equal(s.longest, 2);
});
t('longest streak survives later gaps', () => {
  const s = computeStreak(['2026-08-01','2026-08-02','2026-08-03','2026-08-09','2026-08-17'], '2026-08-17');
  assert.equal(s.longest, 3);
  assert.equal(s.current, 1);
});
t('no check-ins at all', () => {
  const s = computeStreak([], '2026-08-17');
  assert.deepEqual([s.current, s.longest, s.total], [0, 0, 0]);
});

console.log('\n-- progress --');
t('counts days taken, not days elapsed', () => {
  const p = computeProgress(['2026-08-01','2026-08-05','2026-08-17'], '2026-08-01', 90, '2026-08-17');
  assert.equal(p.completed, 3);
  assert.equal(p.dayNumber, 17);
  assert.equal(p.daysRemaining, 87);
  assert.equal(p.finished, false);
});
t('fraction never exceeds 1', () => {
  const dates = Array.from({ length: 95 }, (_, i) => addDays('2026-01-01', i));
  const p = computeProgress(dates, '2026-01-01', 90, '2026-04-10');
  assert.equal(p.fraction, 1);
  assert.equal(p.finished, true);
});

console.log('\n-- shopify csv --');
const csv = [
  'Name,Email,Financial Status,Paid at,Lineitem quantity,Lineitem name,Lineitem sku',
  '#1001,buyer@example.com,paid,2026-08-01 10:00:00 -0400,1,"Liver Detox - 90 Day Supply",LD-90',
  ',,,,1,"Free gift, ebook",GIFT-1',
  '#1002,OTHER@Example.com,paid,2026-08-02 11:00:00 -0400,1,"Liver Detox - 150 Day Supply",LD-150',
  '#1003,refund@example.com,refunded,2026-08-03 11:00:00 -0400,1,"Liver Detox - 90 Day Supply",LD-90',
  '#1004,,paid,2026-08-04 11:00:00 -0400,1,"Liver Detox - 90 Day Supply",LD-90',
].join('\n');

t('parses and forward-fills order columns', () => {
  const r = parseShopifyOrders(csv);
  assert.equal(r.missingColumns.length, 0);
  // Line 2 has no email of its own -- it belongs to order #1001.
  const gift = r.lines.find(l => l.sku === 'GIFT-1');
  assert.equal(gift.email, 'buyer@example.com');
  assert.equal(gift.order_number, '#1001');
});
t('handles quoted fields containing commas', () => {
  const r = parseShopifyOrders(csv);
  assert.equal(r.lines.find(l => l.sku === 'GIFT-1').line_item_title, 'Free gift, ebook');
});
t('lowercases emails so matching is consistent', () => {
  const r = parseShopifyOrders(csv);
  assert.ok(r.lines.some(l => l.email === 'other@example.com'));
});
t('skips refunded orders and rows with no email', () => {
  const r = parseShopifyOrders(csv);
  assert.equal(r.lines.some(l => l.email === 'refund@example.com'), false);
  assert.equal(r.skipped, 2); // the refund row, and #1004 which has no email
});
t('never carries an email across an order boundary', () => {
  // Regression: #1004 has a blank Email column. It must NOT inherit #1003's.
  const r = parseShopifyOrders(csv);
  for (const l of r.lines) assert.notEqual(l.order_number, '#1004');
});
t('rejects a file that is not an orders export', () => {
  const r = parseShopifyOrders('Foo,Bar\n1,2');
  assert.deepEqual(r.missingColumns, ['Email', 'Lineitem name or Lineitem sku']);
});
t('end to end: csv line unlocks the right challenge', () => {
  const r = parseShopifyOrders(csv);
  const mine = r.lines.filter(l => l.email === 'other@example.com');
  assert.equal(entitlementFor(mine, offers).days, 150);
});

console.log('\n-- bundles --');
t('the ladder mirrors the live bundle picker', () => {
  assert.deepEqual(BUNDLES.map(b => b.days), [30, 90, 150]);
  assert.equal(bundleById('supply-90').label, 'Buy 2, Get 1 Free \u2014 90 Day Supply');
});
t('daysForBundle returns null for an unknown id, never a default', () => {
  // A default here would hand a challenge to anyone posting junk.
  assert.equal(daysForBundle('supply-999'), null);
  assert.equal(daysForBundle(''), null);
  assert.equal(daysForBundle(null), null);
  assert.equal(daysForBundle(undefined), null);
});
t('every bundle id maps to its own day count', () => {
  assert.equal(daysForBundle('supply-30'), 30);
  assert.equal(daysForBundle('supply-90'), 90);
  assert.equal(daysForBundle('supply-150'), 150);
});

console.log('\n-- daily tips --');
t('every day of every challenge length returns a usable tip', () => {
  for (const len of [30, 90, 150]) {
    for (let d = 1; d <= len; d++) {
      const tip = tipForDay(d, len);
      assert.ok(tip.title.length > 0, `day ${d} of ${len} has no title`);
      assert.ok(tip.body.length > 0, `day ${d} of ${len} has no body`);
      assert.ok(tip.phase.length > 0, `day ${d} of ${len} has no phase`);
    }
  }
});
t('the same day always returns the same tip', () => {
  // Load-bearing, not just tidy: the tracker renders on the server and hydrates
  // on the client, so a shuffling tip would be a hydration mismatch every load.
  for (let i = 0; i < 20; i++) assert.deepEqual(tipForDay(37, 90), tipForDay(37, 90));
});
t('consecutive days differ', () => {
  for (let d = 2; d < 89; d++) {
    assert.notDeepEqual(tipForDay(d, 90), tipForDay(d + 1, 90), `day ${d} repeats on ${d + 1}`);
  }
});
t('phase boundaries follow the published week 1-2 / 2-4 / 4-6 timeline', () => {
  assert.equal(tipForDay(14, 90).phase, tipForDay(2, 90).phase);
  assert.notEqual(tipForDay(14, 90).phase, tipForDay(15, 90).phase);
  assert.notEqual(tipForDay(28, 90).phase, tipForDay(29, 90).phase);
  assert.notEqual(tipForDay(42, 90).phase, tipForDay(43, 90).phase);
});
t('day one and the final day are their own tips', () => {
  assert.equal(tipForDay(1, 90).phase, 'Day one');
  assert.equal(tipForDay(30, 30).phase, 'Final day');
  // The final day wins over the phase rotation on a short challenge.
  assert.notEqual(tipForDay(30, 30).title, tipForDay(30, 150).title);
});
t('out-of-range day numbers never throw', () => {
  for (const bad of [0, -5, NaN, 1e9]) assert.ok(tipForDay(bad, 90).title.length > 0);
});
t('no tip invents a statistic', () => {
  // Cheapest possible guard against someone pasting marketing numbers in later.
  for (let d = 1; d <= 150; d++) {
    const { title, body } = tipForDay(d, 150);
    assert.equal(/\d\s*%/.test(title + body), false, `day ${d} contains a percentage`);
  }
});
t('the FDA disclaimer is present and verbatim', () => {
  assert.ok(DISCLAIMER.startsWith('These statements have not been evaluated'));
  assert.ok(DISCLAIMER.includes('not intended to diagnose, treat, cure or prevent any disease'));
});

console.log('\n-- onboarding validation --');
const draft = {
  fullName: 'Andrei Uson', age: '34', gender: 'male',
  bundleId: 'supply-90', orderEmail: 'me@example.com',
  email: 'me@example.com', password: 'longenough',
};
t('a complete draft passes every field', () => {
  assert.deepEqual(validateOnboarding(draft, ALL_FIELDS), {});
});
t('name is required and capped at 80 characters', () => {
  assert.ok(validateOnboarding({ ...draft, fullName: '  ' }, ['fullName']).fullName);
  assert.ok(validateOnboarding({ ...draft, fullName: 'x'.repeat(81) }, ['fullName']).fullName);
});
t('age is optional but must be a whole number between 13 and 120', () => {
  assert.deepEqual(validateOnboarding({ ...draft, age: '' }, ['age']), {});
  for (const bad of ['12', '121', '18.5', 'abc']) {
    assert.ok(validateOnboarding({ ...draft, age: bad }, ['age']).age, `${bad} should be rejected`);
  }
});
t('gender must be one of the allowed values, or blank', () => {
  assert.deepEqual(validateOnboarding({ ...draft, gender: '' }, ['gender']), {});
  for (const g of GENDERS) assert.deepEqual(validateOnboarding({ ...draft, gender: g }, ['gender']), {});
  assert.ok(validateOnboarding({ ...draft, gender: 'wizard' }, ['gender']).gender);
});
t('an unknown bundle is rejected rather than defaulted', () => {
  assert.ok(validateOnboarding({ ...draft, bundleId: 'supply-999' }, ['bundleId']).bundleId);
  assert.ok(validateOnboarding({ ...draft, bundleId: '' }, ['bundleId']).bundleId);
});
t('password must be at least 8 characters and is never trimmed', () => {
  assert.ok(validateOnboarding({ ...draft, password: 'short' }, ['password']).password);
  // Spaces are legal password characters. Trimming them here would make a
  // password that worked at signup fail at sign-in.
  const padded = '  ' + 'x'.repeat(MIN_PASSWORD) + '  ';
  assert.deepEqual(validateOnboarding({ ...draft, password: padded }, ['password']), {});
});
t('validateOnboarding only reports the fields it was asked about', () => {
  const errors = validateOnboarding({ ...draft, fullName: '', age: '999' }, ['age']);
  assert.equal(errors.fullName, undefined);
  assert.ok(errors.age);
});
t('isEmailish accepts real addresses and rejects obvious junk', () => {
  for (const good of ['a@b.co', ' me@example.com ']) assert.equal(isEmailish(good), true);
  for (const bad of ['', 'me', 'me@', '@example.com', 'me@example', 'a b@c.co']) {
    assert.equal(isEmailish(bad), false, `${bad} should be rejected`);
  }
});

console.log('\n-- what sizes the challenge --');
const ent90 = { days: 90, offerLabel: 'Buy 2, Get 1 Free', since: '2026-06-01' };
const claim30 = { days: 30, label: 'Buy 1 - 30 Day Supply' };
const noClaim = { days: null, label: null };

t('the picked bundle wins over an old order when matching is off', () => {
  // The bug this fixes: someone picked 30, an unrelated 90-day order existed
  // for their checkout email, and the app silently gave them 90.
  const r = resolveChallenge(claim30, ent90, false);
  assert.equal(r.days, 30);
  assert.equal(r.offerLabel, 'Buy 1 - 30 Day Supply');
});
t('150 behaves the same way as 30', () => {
  const claim150 = { days: 150, label: 'Buy 3, Get 2 Free - 150 Day Supply' };
  assert.equal(resolveChallenge(claim150, ent90, false).days, 150);
  assert.equal(resolveChallenge(claim150, null, false).days, 150);
});
t('an order still sizes the challenge when there is no claim', () => {
  assert.equal(resolveChallenge(noClaim, ent90, false).days, 90);
});
t('verified reports the order, whatever sizes the challenge', () => {
  assert.equal(resolveChallenge(claim30, ent90, false).verified, true);
  assert.equal(resolveChallenge(claim30, null, false).verified, false);
});
t('with matching required, only an order counts', () => {
  assert.equal(resolveChallenge(claim30, ent90, true).days, 90);
  assert.equal(resolveChallenge(claim30, null, true).days, null);
  assert.equal(resolveChallenge(noClaim, null, true).days, null);
});
t('no claim and no order means locked, both ways', () => {
  assert.equal(resolveChallenge(noClaim, null, false).days, null);
  assert.equal(resolveChallenge(noClaim, null, true).days, null);
});

console.log(`\n${pass} tests passed.\n`);
