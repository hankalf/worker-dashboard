"use client";

import { useRef, useState } from "react";

// A position title in the file that doesn't match any existing position.
type NeedsPosition = {
  input: string;
  rows: number[];
  suggestions: { id: string; title: string }[];
};

const inputClass =
  "rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-white";

// Read a spreadsheet as base64 so it can ride in the same JSON body as CSV.
const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",").pop() ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

// Reusable "Import" box: uploads a .csv or .xlsx to `endpoint` (which returns
// { created, updated?, errors }) and calls onDone to refresh the list.
//
// The employee endpoint can also answer with `needsPositions` — titles it
// refuses to guess at. Nothing is imported in that case; we ask which position
// was meant and re-post the same file with the answers.
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
  const [needs, setNeeds] = useState<NeedsPosition[] | null>(null);
  // The chosen position id per unmatched title ("" = import with no position).
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [allPositions, setAllPositions] = useState<{ id: string; title: string }[]>([]);
  // The parsed file, held so the confirmation step can re-post it unchanged.
  const payload = useRef<{ csv?: string; xlsx?: string } | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  const send = async (
    body: { csv?: string; xlsx?: string },
    positionMap?: Record<string, string>
  ) => {
    setImporting(true);
    setError(null);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(positionMap ? { ...body, positionMap } : body),
    });
    const data = await res.json().catch(() => ({}));
    setImporting(false);

    if (!res.ok) {
      setError(data.error ?? "Import failed");
      return;
    }

    // Unmatched positions: import nothing yet, ask, then come back here.
    if (data.needsPositions?.length) {
      setNeeds(data.needsPositions);
      setAllPositions(data.positions ?? []);
      setChoices(
        Object.fromEntries(
          (data.needsPositions as NeedsPosition[]).map((n) => [
            n.input,
            n.suggestions[0]?.id ?? "",
          ])
        )
      );
      setResult(null);
      return;
    }

    setNeeds(null);
    payload.current = null;
    const parts = [
      `Added ${data.created ?? 0}${
        data.updated != null ? `, updated ${data.updated}` : ""
      }.`,
    ];
    if (data.datesReformatted)
      parts.push(`Reformatted ${data.datesReformatted} date(s) to match.`);
    if (data.errors?.length) {
      parts.push(`Skipped ${data.errors.length}: ${data.errors.join(" · ")}`);
    }
    setResult(parts.join(" "));
    onDone();
  };

  const handle = async (file: File) => {
    setResult(null);
    setNeeds(null);
    const isExcel = /\.xls[xm]?$/i.test(file.name);
    const body = isExcel
      ? { xlsx: await toBase64(file) }
      : { csv: await file.text() };
    payload.current = body;
    await send(body);
  };

  return (
    <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="mb-1 text-sm font-medium text-white">Import from CSV or Excel</h3>
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
        accept=".csv,text/csv,.xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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

      {needs && (
        <div className="mt-3 rounded-md border border-amber-700/60 bg-amber-950/30 p-3">
          <p className="text-sm font-medium text-amber-200">
            {needs.length === 1
              ? "One position in this file doesn't exist yet."
              : `${needs.length} positions in this file don't exist yet.`}
          </p>
          <p className="mt-1 text-xs text-amber-300/80">
            Nothing has been imported. Positions are never created from a file —
            a typo would add a column to the board permanently. Pick what each
            one should be, then import.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {needs.map((n) => (
              <li key={n.input} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-white">{n.input}</span>
                <span className="text-xs text-zinc-500">
                  row{n.rows.length === 1 ? "" : "s"} {n.rows.slice(0, 5).join(", ")}
                  {n.rows.length > 5 ? `, +${n.rows.length - 5} more` : ""}
                </span>
                <span className="text-zinc-500">→</span>
                <select
                  value={choices[n.input] ?? ""}
                  onChange={(e) =>
                    setChoices((c) => ({ ...c, [n.input]: e.target.value }))
                  }
                  className={inputClass}
                >
                  <option value="">Import with no position</option>
                  {n.suggestions.length > 0 && (
                    <optgroup label="Did you mean">
                      {n.suggestions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="All positions">
                    {allPositions
                      .filter((p) => !n.suggestions.some((s) => s.id === p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              disabled={importing}
              onClick={() => payload.current && send(payload.current, choices)}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              Import with these positions
            </button>
            <button
              type="button"
              onClick={() => {
                setNeeds(null);
                payload.current = null;
              }}
              className="text-sm text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && <p className="mt-2 text-sm text-green-400">{result}</p>}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
