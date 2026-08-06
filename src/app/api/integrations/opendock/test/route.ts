import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { testOpendock } from "@/lib/opendock";

// POST — log in to Opendock and fetch once, so the admin can verify the
// credentials + base URL + warehouse ID before turning the integration on.
export async function POST() {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const result = await testOpendock();
    return NextResponse.json({
      ok: true,
      message: `Connected — found ${result.appointments} appointment(s).`,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message || "Connection failed" },
      { status: 400 }
    );
  }
}
