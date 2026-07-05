import { NextResponse } from "next/server";
import { runEmailReport } from "@/lib/logReport";
import { emailConfigured } from "@/lib/email";

export const dynamic = "force-dynamic";

// Shared secret in the query (?token=) or an Authorization: Bearer header.
function authorized(req: Request): boolean {
  const secret = process.env.REPORT_TOKEN;
  if (!secret) return false;
  const qToken = new URL(req.url).searchParams.get("token");
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  return qToken === secret || bearer === secret;
}

async function handle(req: Request) {
  if (!process.env.REPORT_TOKEN || !emailConfigured() || !process.env.REPORT_TO) {
    return NextResponse.json(
      {
        error:
          "Report emailing is not configured. Set REPORT_TOKEN, SMTP_USER, SMTP_PASS and REPORT_TO.",
      },
      { status: 503 }
    );
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runEmailReport();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    // Never delete anything if the export/email failed.
    console.error("Log report failed:", e);
    return NextResponse.json(
      { error: (e as Error).message ?? "Report failed" },
      { status: 500 }
    );
  }
}

// Both verbs so any scheduler (cron-job.org, etc.) can trigger it.
export const GET = handle;
export const POST = handle;
