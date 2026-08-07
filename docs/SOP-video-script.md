# Worker Dashboard — video SOP

A recorded walkthrough of the board and the admin panel, with on-screen chapter
cards, captions and a highlight marker. Roughly twelve minutes.

- **File:** `docs/worker-dashboard-sop.webm` (VP8/WebM, 1440×900, no audio —
  narration is on-screen text)
- **Plays in:** Chrome, Edge, Firefox, VLC. Drag it into a browser tab, or host
  it wherever your team keeps training material.

The video is recorded against a **local demo instance with demo data and a
stand-in Opendock API** — no customer data and no calls to the real Opendock
account.

---

## Chapters

| # | Chapter | Covers |
|---|---|---|
| — | The board | Header, handoff note, notices, side tasks, team by position, dock pills |
| 1 | The dock schedule screen | Rotation, colour legend, sync freshness, door tags, on-time / dwell / processing, frozen header |
| 2 | Signing in | Access levels, Master Dashboard, choosing a warehouse |
| 3 | Admin Dashboard | The live mirror, roles shown here only, screen-offline warning |
| 4 | Notices | Posting, start / expiry / pin, handoff notes |
| 5 | Assign | Mark all Present, handoff notes, Fill open positions, Stagger lunches, Reset |
| 6 | Lunches, Side Tasks, Attendance | Lunch edits, task lifecycle, coverage by weekday, days out per person |
| 7 | Setup | Dashboard name, auto-scroll speed, shift times, backup; Employees + CSV; Positions, Roles, Equipment |
| 8 | Opendock | Connection fields, refresh interval, tag conventions, Test connection |
| 9 | Locations and screens | Creating warehouses, registering TVs, refresh / identify / message, Activity |
| 10 | Back to the floor | The completed daily loop |

Everything shown is written up in more detail in [`SOP.md`](./SOP.md).

---

## Re-recording it

The recording is scripted, so it can be regenerated after UI changes rather than
re-shot by hand. Everything lives in `scripts/sop-video/`.

You need: a local Postgres, a built app, and Playwright with a Chromium build.

```bash
# 1. database
createdb dashboard
export DATABASE_URL="postgresql://postgres@127.0.0.1:5432/dashboard"
export NEXTAUTH_SECRET="any-long-random-string"
npx prisma migrate deploy
npx tsx prisma/seed.ts

# 2. demo roster, positions, notices, side tasks and a registered screen
npx tsx scripts/sop-video/demo-data.ts

# 3. the stand-in Opendock API (keep running)
node scripts/sop-video/mock-opendock.mjs &

# 4. point the demo location at it, and turn on the dock rotation
psql "$DATABASE_URL" -f scripts/sop-video/opendock-demo.sql

# 5. build and serve
npm run build
npx next start -p 3210 &

# 6. record — writes a .webm next to the script
node scripts/sop-video/record-sop.mjs
```

`record-sop.mjs` holds the full narration inline; edit the `say(...)` calls to
change wording, and the `chapter(...)` calls to change the chapter cards. Every
interaction is guarded, so a selector that moves degrades to a skipped step
rather than a failed recording.

### Notes

- Captions are timed from their own length (about 52 ms per character, minimum
  2.9 seconds), so rewriting a line automatically retimes it.
- The video has no audio track. Playwright's bundled ffmpeg only encodes VP8, so
  WebM is the output format; convert with a full ffmpeg build if you need MP4:
  `ffmpeg -i worker-dashboard-sop.webm -c:v libx264 -crf 23 worker-dashboard-sop.mp4`
- The mock Opendock server serves the same endpoints and payload shapes as the
  real Neutron API (`/auth/login`, `/dock`, `/appointment`, `/loadType`,
  `/warehouse`), including the nestjs-crud `s` filter, so the dock schedule in
  the video exercises the real code path.
- The demo appointments are positioned relative to the current hour, so a
  re-recording at any time of day still shows completed, live, late and upcoming
  loads.
