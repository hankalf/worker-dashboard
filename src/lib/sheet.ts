import ExcelJS from "exceljs";
import { parseCsv } from "@/lib/csv";

// A parsed spreadsheet: rows of raw cell values. Deliberately `unknown` rather
// than `string` — an .xlsx date cell arrives as a Date or a serial number, and
// flattening it to text first is what loses the information needed to fix
// wrongly-formatted dates.
export type SheetRows = unknown[][];

// Unwrap the shapes exceljs uses for non-plain cells: formulas carry their
// computed value, rich text is a run array, links carry display text.
function cellValue(v: unknown): unknown {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return cellValue(o.result);
    if ("text" in o) return cellValue(o.text);
    if ("richText" in o && Array.isArray(o.richText))
      return (o.richText as { text?: string }[]).map((r) => r.text ?? "").join("");
    if ("hyperlink" in o) return cellValue(o.hyperlink);
    if (v instanceof Date) return v;
  }
  return v;
}

// Read the first worksheet of an .xlsx into rows, dropping fully blank ones.
export async function parseXlsx(buffer: Buffer): Promise<SheetRows> {
  const wb = new ExcelJS.Workbook();
  // exceljs types `load` against a Buffer backed by a plain ArrayBuffer, while
  // Buffer.from gives the wider ArrayBufferLike. Types-only mismatch — the
  // runtime takes any Buffer — so cast rather than copy the bytes.
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const sheet = wb.worksheets[0];
  if (!sheet) return [];

  const rows: SheetRows = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    // getSheetValues/row.values are 1-based with a leading hole; slice it off.
    const raw = Array.isArray(row.values) ? row.values.slice(1) : [];
    const cells = Array.from({ length: sheet.columnCount }, (_, i) =>
      cellValue(raw[i])
    );
    if (cells.some((c) => String(c ?? "").trim() !== "")) rows.push(cells);
  });
  return rows;
}

// Accept either shape the client can send: `csv` text, or `xlsx` as base64.
// Returns null when the body carries neither.
export async function parseUpload(body: {
  csv?: unknown;
  xlsx?: unknown;
}): Promise<SheetRows | null> {
  if (typeof body.xlsx === "string" && body.xlsx.trim()) {
    // Tolerate a data: URL prefix, which is what FileReader.readAsDataURL adds.
    const base64 = body.xlsx.includes(",") ? body.xlsx.split(",").pop()! : body.xlsx;
    return parseXlsx(Buffer.from(base64, "base64"));
  }
  if (typeof body.csv === "string" && body.csv.trim()) return parseCsv(body.csv);
  return null;
}

// Cell → trimmed string, for the columns that really are text.
export const text = (v: unknown): string =>
  v == null ? "" : v instanceof Date ? v.toISOString() : String(v).trim();
