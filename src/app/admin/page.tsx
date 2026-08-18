import { redirect } from 'next/navigation';

import { getAdminSession, requireOrderMatch } from '@/lib/access';
import { entitlementFor, type Offer, type OrderLine } from '@/lib/challenge';
import { signOut } from '@/app/actions';
import { createOffer, deleteOffer, grantAccess, toggleOffer } from './actions';
import ImportForm from './ImportForm';

export const dynamic = 'force-dynamic';

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  claimed_days: number | null;
  claimed_label: string | null;
  order_email: string | null;
  onboarded_at: string | null;
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tone?: string; msg?: string }>;
}) {
  const { tone, msg } = await searchParams;

  // Admins are not customers: this deliberately does NOT call getAccess(), so an
  // admin without a qualifying order is never routed into the onboarding wizard.
  const session = await getAdminSession();
  if (!session) redirect('/admin/login');

  const admin = session.admin;

  const [
    { data: offers },
    { data: profiles },
    { data: orders },
    { data: challenges },
    { data: checkIns },
    orderCount,
  ] = await Promise.all([
    admin.from('offers').select('*').order('challenge_days', { ascending: true }),
    admin
      .from('profiles')
      .select('id, email, full_name, claimed_days, claimed_label, order_email, onboarded_at')
      .order('created_at', { ascending: false })
      .limit(200),
    admin.from('orders').select('email, sku, variant_id, line_item_title, purchased_at'),
    admin.from('challenges').select('user_id, length_days, started_on'),
    admin.from('check_ins').select('user_id, local_date'),
    admin.from('orders').select('*', { count: 'exact', head: true }),
  ]);

  const activeOffers = ((offers ?? []) as Offer[]).filter((o) => o.active);

  // Group orders by address once, rather than querying per customer.
  const ordersByEmail = new Map<string, OrderLine[]>();
  for (const row of orders ?? []) {
    const key = String(row.email).toLowerCase();
    const list = ordersByEmail.get(key) ?? [];
    list.push(row as OrderLine);
    ordersByEmail.set(key, list);
  }

  const challengeByUser = new Map((challenges ?? []).map((c) => [c.user_id as string, c]));

  const checkInsByUser = new Map<string, string[]>();
  for (const row of checkIns ?? []) {
    const list = checkInsByUser.get(row.user_id as string) ?? [];
    list.push(row.local_date as string);
    checkInsByUser.set(row.user_id as string, list);
  }

  const customers = ((profiles ?? []) as ProfileRow[]).map((p) => {
    const emails = [p.email?.toLowerCase(), p.order_email?.toLowerCase()].filter(Boolean);
    const lines = emails.flatMap((e) => ordersByEmail.get(e!) ?? []);
    const entitlement = entitlementFor(lines, activeOffers);
    const dates = (checkInsByUser.get(p.id) ?? []).sort();

    return {
      ...p,
      verified: Boolean(entitlement),
      verifiedDays: entitlement?.days ?? null,
      challenge: challengeByUser.get(p.id) ?? null,
      checkIns: dates.length,
      lastCheckIn: dates[dates.length - 1] ?? null,
    };
  });

  const unverified = customers.filter((c) => c.onboarded_at && !c.verified).length;

  return (
    <main className="shell admin">
      <header className="top">
        <div>
          <div className="eyebrow">Admin</div>
          <h1>Tracker config</h1>
        </div>
        {/* Which admin is signed in, and a way out. There is more than one
            admin account now, so "who am I?" and "let me switch" both matter.
            signOut redirects to "/", which on this host lands on /admin/login. */}
        <div className="whoami">
          <span className="eyebrow">{session.user.email}</span>
          <form action={signOut}>
            <button className="linkish" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      {msg ? (
        <p
          className={tone === 'ok' ? 'note' : tone === 'warn' ? 'note warn' : 'note bad'}
          role="status"
        >
          {msg}
        </p>
      ) : null}

      <div className="stats">
        <div className="stat">
          <div className="stat-value">{orderCount.count ?? 0}</div>
          <div className="stat-label">Order lines</div>
        </div>
        <div className="stat">
          <div className="stat-value">{customers.length}</div>
          <div className="stat-label">Customers</div>
        </div>
        <div className="stat">
          <div className="stat-value">{unverified}</div>
          <div className="stat-label">Unverified</div>
        </div>
      </div>

      {!requireOrderMatch() && (
        <p className="note warn">
          <strong>Order matching is off.</strong> Whatever bundle a customer picks during
          onboarding sizes their challenge, whether or not an order backs it. Set{' '}
          <code>REQUIRE_ORDER_MATCH=true</code> to make an imported order mandatory.
        </p>
      )}

      <hr className="sep" />

      <h2 className="section">Customers</h2>
      <p className="section-intro">
        &ldquo;Claimed&rdquo; is what they picked during onboarding. &ldquo;Verified&rdquo; means an
        imported order actually backs it.
      </p>

      <div className="scroll-x">
        <table className="tablish">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Claimed</th>
              <th>Order</th>
              <th>Streak</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.full_name ?? '—'}</strong>
                  <br />
                  <code>{c.email}</code>
                  {c.order_email && c.order_email !== c.email && (
                    <>
                      <br />
                      <code>bought as {c.order_email}</code>
                    </>
                  )}
                </td>
                <td>
                  {c.onboarded_at ? c.claimed_label ?? `${c.claimed_days ?? '—'} days` : 'Not set up yet'}
                </td>
                <td>
                  {c.verified ? (
                    <span className="badge ok">{c.verifiedDays}d verified</span>
                  ) : (
                    <span className="badge unverified">No order</span>
                  )}
                </td>
                <td>
                  {c.checkIns} check-ins
                  <br />
                  <code>{c.lastCheckIn ?? 'never'}</code>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={4}>Nobody has signed up yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <hr className="sep" />

      <h2 className="section">Which offers unlock the tracker</h2>
      <p className="section-intro">
        Every order line is checked against these rules. If more than one matches, the customer gets
        the longest challenge. Editing a rule applies to everyone who already bought.
      </p>

      <div className="rowlist">
        {(offers ?? []).map((offer: Offer) => (
          <div key={offer.id} className={`rowitem${offer.active ? '' : ' off'}`}>
            <div style={{ minWidth: 0 }}>
              <h3>{offer.label}</h3>
              <code>
                {offer.match_type} = {offer.match_value}
              </code>
            </div>
            <div className="actions">
              <span className="pill">{offer.challenge_days}d</span>
              <form action={toggleOffer}>
                <input type="hidden" name="id" value={offer.id} />
                <input type="hidden" name="active" value={String(offer.active)} />
                <button className="btn small ghost" type="submit">
                  {offer.active ? 'Disable' : 'Enable'}
                </button>
              </form>
              <form action={deleteOffer}>
                <input type="hidden" name="id" value={offer.id} />
                <button className="btn small danger" type="submit">
                  Delete
                </button>
              </form>
            </div>
          </div>
        ))}
        {(offers ?? []).length === 0 && (
          <p className="note">No rules yet — nothing can be verified. Add one below.</p>
        )}
      </div>

      <hr className="sep" />

      <h2 className="section">Add a rule</h2>
      <form action={createOffer} className="formgrid">
        <div className="wide">
          <label htmlFor="label">What customers see</label>
          <input id="label" name="label" required placeholder="Buy 2, Get 1 Free — 90 Day Supply" />
        </div>
        <div>
          <label htmlFor="match_type">Match on</label>
          <select id="match_type" name="match_type" defaultValue="title_contains">
            <option value="title_contains">Line item title contains</option>
            <option value="sku">SKU is exactly</option>
            <option value="variant_id">Variant ID is exactly</option>
          </select>
        </div>
        <div>
          <label htmlFor="match_value">Value</label>
          <input id="match_value" name="match_value" required placeholder="90 Day Supply" />
        </div>
        <div>
          <label htmlFor="challenge_days">Challenge length (days)</label>
          <input
            id="challenge_days"
            name="challenge_days"
            type="number"
            min={1}
            max={400}
            defaultValue={90}
            required
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="btn" type="submit">
            Add rule
          </button>
        </div>
      </form>

      <hr className="sep" />

      <h2 className="section">Import Shopify orders</h2>
      <p className="section-intro">
        In Shopify: <strong>Orders → Export → CSV for Excel</strong>. Upload it here. Re-uploading
        the same file is safe — existing rows are skipped, not duplicated.
      </p>
      <ImportForm />

      <hr className="sep" />

      <h2 className="section">Grant access manually</h2>
      <form action={grantAccess} className="formgrid">
        <div>
          <label htmlFor="grant-email">Customer email</label>
          <input id="grant-email" name="email" type="email" required placeholder="them@example.com" />
        </div>
        <div>
          <label htmlFor="grant-days">Challenge length</label>
          <input id="grant-days" name="days" type="number" min={1} max={400} defaultValue={90} required />
        </div>
        <div className="wide">
          <button className="btn ghost" type="submit">
            Grant access
          </button>
        </div>
      </form>
    </main>
  );
}
