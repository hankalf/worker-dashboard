"use client";

import { useRef, useState } from "react";

// Reusable "Import from CSV" box: uploads a CSV to `endpoint` (which returns
// { created, updated?, errors }) and calls onDone to refresh the list.
export function CsvImport({
  endpoint,
  instructions,
  sampleHref,
  onDone,
}: {
  endpoint: string;
  instructions: React.ReactNode;
  sampleHref?: string;
  onDone: () => void;
}) {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  const handle = async (file: File) => {
    setImporting(true);
    setResult(null);
    setError(null);
    const csv = await file.text();
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    const body = await res.json().catch(() => ({}));
    setImporting(false);
    if (!res.ok) {
      setError(body.error ?? "Import failed");
      return;
    }
    const parts = [
      `Added ${body.created ?? 0}${
        body.updated != null ? `, updated ${body.updated}` : ""
      }.`,
    ];
    if (body.errors?.length) {
      parts.push(`Skipped ${body.errors.length}: ${body.errors.join(" · ")}`);
    }
    setResult(parts.join(" "));
    onDone();
  };

  return (
    <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="mb-1 text-sm font-medium text-white">Import from CSV</h3>
      <p className="mb-3 text-sm text-zinc-400">
        {instructions}
        {sampleHref && (
          <>
            {" "}
            <a
              href={sampleHref}
              download
              className="text-blue-400 underline hover:text-blue-300"
            >
              Download the sample CSV
            </a>
          </>
        )}
      </p>
      <input
        ref={ref}
        type="file"
        accept=".csv,text/csv"
        disabled={importing}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handle(file);
            e.target.value = "";
          }
        }}
        className="text-sm text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-blue-500"
      />
      {importing && <p className="mt-2 text-sm text-zinc-400">Importing...</p>}
      {result && <p className="mt-2 text-sm text-green-400">{result}</p>}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
