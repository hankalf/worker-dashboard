import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { runSync } from "@/lib/monday";

// POST — run the board sync now. Idempotent: running it twice with an
// unchanged board changes nothing the second time.
export async function POST() {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await runSync());
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: (e as Error).message || "Sync failed" },
      { status: 400 }
    );
  }
}
