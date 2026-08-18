'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Result = {
  ok: boolean;
  imported?: number;
  skipped?: number;
  totalRows?: number;
  error?: string;
};

export default function ImportForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    setBusy(true);
    setResult(null);

    try {
      const res = await fetch('/api/admin/import', { method: 'POST', body: data });
      setResult(await res.json());
      form.reset();
      router.refresh();
    } catch {
      setResult({ ok: false, error: 'Upload failed. Try a smaller export.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="file" name="file" accept=".csv,text/csv" required />
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Importing…' : 'Import CSV'}
      </button>

      {result && (
        <p className={`note${result.ok ? '' : ' bad'}`}>
          {result.ok ? (
            <>
              Imported <strong>{result.imported}</strong> order lines from {result.totalRows} rows
              {result.skipped ? ` (${result.skipped} skipped — no email, no line item, or refunded)` : ''}
              .
            </>
          ) : (
            result.error
          )}
        </p>
      )}
    </form>
  );
}
