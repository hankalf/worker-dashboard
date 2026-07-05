import { NextResponse } from "next/server";

// Lightweight liveness endpoint for the external keep-alive pinger.
// force-dynamic so the request always reaches the running server (a cached/
// static response could be served by the CDN without waking the instance,
// which would defeat the whole point). No DB call — this only needs to keep
// the free-plan web service from idling into sleep.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, time: new Date().toISOString() });
}
