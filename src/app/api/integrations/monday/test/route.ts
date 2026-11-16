import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { diagnoseMonday } from "@/lib/monday";

// POST — read the board once and report exactly what came back: the board
// name, its columns (so the mappings can be filled in from real column IDs), a
// few sample rows, how those rows map to people, and a dry run of what a sync
// would change. Writes nothing.
export async function POST() {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const diagnostic = await diagnoseMonday();
    const ok =
      diagnostic.errors.length === 0 &&
      typeof diagnostic.status === "number" &&
      diagnostic.status < 400 &&
      !!diagnostic.boardName;
    const message = ok
      ? `Connected to "${diagnostic.boardName}" — ${diagnostic.rowCount} row(s) read, ${diagnostic.mappedPreview.length} mapped to people.`
      : diagnostic.errors.length
        ? diagnostic.errors.join("; ")
        : "Could not read the board — see the details below.";
    return NextResponse.json({ ok, message, diagnostic });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message || "Connection failed" },
      { status: 400 }
    );
  }
}
