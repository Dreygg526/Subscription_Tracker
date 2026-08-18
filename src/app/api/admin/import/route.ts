import { NextResponse, type NextRequest } from 'next/server';

import { getAdminSession } from '@/lib/access';
import { createAdminClient } from '@/lib/supabase/server';
import { parseShopifyOrders } from '@/lib/shopify-csv';

const MAX_BYTES = 15 * 1024 * 1024;
const CHUNK = 500;

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ ok: false, error: 'Not authorised' }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'No file received.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: 'That file is over 15MB. Export a narrower date range.' },
      { status: 413 }
    );
  }

  const parsed = parseShopifyOrders(await file.text());

  if (parsed.missingColumns.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `That doesn't look like a Shopify orders export — missing column(s): ${parsed.missingColumns.join(
          ', '
        )}.`,
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  let imported = 0;

  for (let i = 0; i < parsed.lines.length; i += CHUNK) {
    const batch = parsed.lines.slice(i, i + CHUNK).map((line) => ({ ...line, source: 'csv' }));

    const { error, count } = await admin
      .from('orders')
      .upsert(batch, { onConflict: 'dedupe_key', ignoreDuplicates: true, count: 'exact' });

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Database rejected the import: ${error.message}` },
        { status: 500 }
      );
    }

    imported += count ?? 0;
  }

  return NextResponse.json({
    ok: true,
    imported,
    skipped: parsed.skipped,
    totalRows: parsed.totalRows,
  });
}
