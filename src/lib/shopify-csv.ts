// Parses a Shopify "Orders" CSV export into order lines we can store.
//
// The important quirk: Shopify only fills Name / Email / Paid at on the FIRST
// row of each order. Every additional line item of that same order has those
// columns blank. So we forward-fill them as we walk the file.

export type ParsedLine = {
  email: string;
  order_number: string | null;
  sku: string | null;
  variant_id: string | null;
  line_item_title: string | null;
  purchased_at: string;
};

export type ParseResult = {
  lines: ParsedLine[];
  totalRows: number;
  skipped: number;
  missingColumns: string[];
};

/** Minimal RFC-4180 CSV reader: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const src = text.replace(/^﻿/, ''); // strip Excel's BOM

  for (let i = 0; i < src.length; i++) {
    const c = src[i];

    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Finds a column index by trying several header spellings. */
function columnIndex(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const i = headers.indexOf(norm(candidate));
    if (i !== -1) return i;
  }
  return -1;
}

const REFUNDED = new Set(['voided', 'refunded']);

export function parseShopifyOrders(text: string): ParseResult {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (rows.length < 2) {
    return { lines: [], totalRows: 0, skipped: 0, missingColumns: ['(file is empty)'] };
  }

  const headers = rows[0].map(norm);
  const col = {
    name: columnIndex(headers, ['Name', 'Order', 'Order Name']),
    email: columnIndex(headers, ['Email', 'Contact Email', 'Customer Email']),
    paidAt: columnIndex(headers, ['Paid at', 'Created at', 'Processed At']),
    status: columnIndex(headers, ['Financial Status']),
    title: columnIndex(headers, ['Lineitem name', 'Line: Name', 'Line Item Name']),
    sku: columnIndex(headers, ['Lineitem sku', 'Line: SKU', 'Line Item SKU']),
    variant: columnIndex(headers, ['Lineitem variant id', 'Line: Variant ID', 'Variant ID']),
  };

  const missingColumns: string[] = [];
  if (col.email === -1) missingColumns.push('Email');
  if (col.title === -1 && col.sku === -1) missingColumns.push('Lineitem name or Lineitem sku');
  if (missingColumns.length > 0) {
    return { lines: [], totalRows: rows.length - 1, skipped: rows.length - 1, missingColumns };
  }

  const lines: ParsedLine[] = [];
  let skipped = 0;

  // Values carried down from the order's first row.
  let email = '';
  let orderNumber = '';
  let paidAt = '';
  let status = '';

  const cell = (row: string[], i: number) => (i === -1 ? '' : (row[i] ?? '').trim());

  for (const row of rows.slice(1)) {
    const rowEmail = cell(row, col.email);
    const rowName = cell(row, col.name);
    const rowPaid = cell(row, col.paidAt);
    const rowStatus = cell(row, col.status);

    // A non-empty order identifier means a NEW order starts here, so the
    // carried-down values must be replaced -- including with blanks. Carrying
    // them across an order boundary would attribute one customer's purchase to
    // the previous customer's email and unlock the app for the wrong person.
    if (rowName && rowName !== orderNumber) {
      orderNumber = rowName;
      email = rowEmail;
      paidAt = rowPaid;
      status = rowStatus;
    } else {
      // Continuation row: Shopify leaves these columns blank, so fill forward.
      if (rowEmail) email = rowEmail;
      if (rowPaid) paidAt = rowPaid;
      if (rowStatus) status = rowStatus;
    }

    const title = cell(row, col.title);
    const sku = cell(row, col.sku);

    if (!email || (!title && !sku) || REFUNDED.has(norm(status))) {
      skipped += 1;
      continue;
    }

    const purchasedAt = new Date(paidAt || Date.now());

    lines.push({
      email: email.toLowerCase(),
      order_number: orderNumber || null,
      sku: sku || null,
      variant_id: cell(row, col.variant) || null,
      line_item_title: title || null,
      purchased_at: (isNaN(purchasedAt.getTime()) ? new Date() : purchasedAt).toISOString(),
    });
  }

  return { lines, totalRows: rows.length - 1, skipped, missingColumns: [] };
}
