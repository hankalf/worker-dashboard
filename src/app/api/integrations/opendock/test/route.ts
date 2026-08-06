import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { diagnoseOpendock } from "@/lib/opendock";

// POST — log in to Opendock and fetch once, capturing the raw HTTP status and
// response body at each step. This lets the admin verify credentials + base URL
// + warehouse ID AND gives us the real appointment JSON shape so the endpoint /
// field mappings can be finalized against a live sample.
export async function POST() {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const diagnostic = await diagnoseOpendock();
    const ok =
      diagnostic.tokenFound &&
      diagnostic.apptStatus !== null &&
      Number(diagnostic.apptStatus) >= 200 &&
      Number(diagnostic.apptStatus) < 300;
    const message = ok
      ? `Connected — found ${diagnostic.count ?? 0} appointment(s).`
      : !diagnostic.tokenFound
        ? "Login did not return a token — see details below."
        : "Fetched, but the appointments call needs a look — see details below.";
    return NextResponse.json({ ok, message, diagnostic });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message || "Connection failed" },
      { status: 400 }
    );
  }
}
