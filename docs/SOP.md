# Worker Dashboard — Standard Operating Procedure

How to run the warehouse board day to day: who signs in, what each tab does, how
the wall displays are managed, and how the Opendock dock schedule works.

Written for supervisors, leads and admins. No engineering knowledge assumed.

> **Other formats.** This document is also in this folder as
> `Worker-Dashboard-SOP.pdf` and `Worker-Dashboard-SOP.docx`. There is also a
> recorded walkthrough of about eleven minutes — it is kept outside the repo
> because of its size; see [SOP-video-script.md](./SOP-video-script.md) for the
> chapter list and where to find it.

---

## Contents

1. [What this system is](#1-what-this-system-is)
2. [Accounts and access levels](#2-accounts-and-access-levels)
3. [Signing in and picking a location](#3-signing-in-and-picking-a-location)
4. [Daily routine — the short version](#4-daily-routine--the-short-version)
5. [Admin Dashboard](#5-admin-dashboard)
6. [Notices](#6-notices)
7. [Assign](#7-assign)
8. [Lunches](#8-lunches)
9. [Side Tasks](#9-side-tasks)
10. [Attendance](#10-attendance)
11. [Setup → General](#11-setup--general)
12. [Setup → Employees](#12-setup--employees)
13. [Setup → Positions](#13-setup--positions)
14. [Setup → Roles](#14-setup--roles)
15. [Setup → Equipment](#15-setup--equipment)
16. [Setup → Integrations (Opendock)](#16-setup--integrations-opendock)
17. [Setup → Activity](#17-setup--activity)
18. [Locations (super-admin)](#18-locations-super-admin)
19. [Screen Fleet (super-admin)](#19-screen-fleet-super-admin)
20. [The wall board](#20-the-wall-board)
21. [The Opendock dock schedule screen](#21-the-opendock-dock-schedule-screen)
22. [Troubleshooting](#22-troubleshooting)

---

## 1. What this system is

A live wall display for the warehouse floor plus an admin panel that drives it.

- **The board** (`/`) is what the TVs show: who is working, in what position, on
  what shift, who is at lunch, open side tasks, notices, and — when Opendock is
  connected — today's dock schedule. It refreshes itself; nobody has to touch it.
- **The admin panel** (`/admin`) is where supervisors post notices, mark
  attendance, move people between positions, stagger lunches and manage setup.

One deployment can run **several warehouses**. Each warehouse is a *location*
with its own employees, positions, notices, attendance and display settings.
Nothing crosses between locations — a handoff note posted at Main Warehouse
never appears on the Production Warehouse board.

---

## 2. Accounts and access levels

Every login is an employee record with a username and password. Access is set
per employee on **Setup → Employees**.

| Level | Can see |
|---|---|
| **None** | No panel login at all. Most of the floor. |
| **Lead** | Admin Dashboard, Notices, Assign, Lunches, Side Tasks |
| **Supervisor** | The above **+ Attendance** |
| **Admin** | Everything, including the whole **Setup** group |

Two accounts are special:

- **`admin`** — the bootstrap account created on first deploy. Password comes
  from `SEED_ADMIN_PASSWORD`. **Change it after the first sign-in.**
- **`superadmin`** — a permanent super-user that cannot be deleted or demoted,
  so a deployment can never lock itself out. Password comes from
  `SUPERADMIN_PASSWORD`.

**Super-admin** is a separate flag on top of Admin. A regular Admin manages
their own location only. A super-admin can switch between locations, create and
rename locations, and manage the screen fleet — they see two extra tabs,
**Locations** and **Screen Fleet**.

> **Rule of thumb:** give leads *Lead*, give shift supervisors *Supervisor*,
> give the warehouse manager and IT *Admin*. Keep super-admin to one or two
> people.

---

## 3. Signing in and picking a location

1. Go to the board URL and add `/admin`, or click **Admin login** in the top
   right of the board.
2. Sign in with your username and password.

**If you only have one location**, you land straight in and every tab is
available.

**If you have access to more than one location** (super-admins), you land on the
**Master Dashboard**. This is the location chooser. Until you pick a location,
*only* the Admin Dashboard tab is shown — there is nothing else to edit yet,
because the system does not know which warehouse you mean.

- Click a location card to select it.
- The rest of the tabs (Notices, Assign, Lunches, …) appear immediately.
- A **Master Dashboard** bar at the top of the Admin Dashboard tab names the
  location you are editing. **← Switch dashboard** on that bar takes you back to
  the picker.
- The **Location** dropdown in the header switches warehouse from any tab.

Your selection sticks for the session, so you are not re-picking on every page.

> **Always check the location shown in the header before you post a notice or
> reset assignments.** Everything you do applies to that location.

---

## 4. Daily routine — the short version

**Start of shift (supervisor / lead)**

1. **Assign → Mark all Present**, then click through anyone who called out, is
   on PTO, or is coming in late.
2. **Assign** — drag anyone who has moved into their position for the day, or
   press **Fill open positions** to have the system propose assignments for the
   gaps.
3. **Assign → Stagger lunches** to lay out lunch times across the shift.
4. **Notices** — post anything the floor needs to know, and write the handoff
   note for your shift (it is shown to the shift that follows you).
5. **Side Tasks** — add the day's extra jobs and assign owners.

**During the shift**

- Update attendance as people leave or arrive.
- Mark side tasks in progress / done.
- Glance at the board's dock panel if you run Opendock — late trucks show
  yellow, rejected loads show red.

**End of shift**

- Update the handoff note for the incoming shift.
- Clear or extend notices that are no longer relevant.

---

## 5. Admin Dashboard

The landing tab. Two jobs:

- **Multi-location users** — the Master Dashboard location list (see §3).
- **Once a location is selected** — a live mirror of what the wall board is
  currently showing for that location, plus headcount counts per position and
  the current notices, with an **Edit plan** and **Manage notices** shortcut.

The admin copy of the board shows each person's **roles** under their name. The
wall board deliberately does not — the floor sees names and status only, so the
cards stay readable from a distance.

If a registered wall screen has stopped checking in, a **warning banner** appears
here naming the screen. A screen is flagged after roughly an hour of silence.
See §19.

---

## 6. Notices

Two things live here.

### Notices

Short messages that scroll on the board.

- **Post** — type the message and save. It goes live immediately unless you give
  it a start time.
- **Start / expiry** — optional. A notice with a future start stays hidden until
  then (up to 48 hours ahead); a notice with an expiry disappears on its own.
- **Upcoming events** — preplanned notices weeks or months out. Each appears on
  the board on its start date and clears at its end.
- **Notice history** — everything that has been posted, for reference.
- **Pinned** — a pinned notice always shows and never queues out.
- The board shows up to **three** active notices at a time, oldest first. Extra
  notices queue and rotate in as older ones expire.

Keep them short. They are read from across the warehouse.

### Shift handoff notes

One note per shift (1st, 2nd, 3rd). Each shift's note is shown to the **next**
shift: 3rd's note shows while 1st works, 1st's while 2nd works, 2nd's while 3rd
works — with the author's name. You can also edit them on the Assign tab, where
the shift currently being shown is marked **ACTIVE**.

Handoff notes are **per location**. A note written at Main Warehouse shows on
Main Warehouse screens only.

---

## 7. Assign

The daily plan. Positions across the top, people in cards you can drag.

**Attendance** — click a person's card to set **Present**, **Absent**,
**Called out** or **PTO**. Two extra states:

- **Coming in** — set an arrival time; the board shows an "In at …" badge.
- **Stay over / cover** — keep someone on the board past their own shift end
  when they are helping the next shift.

**Buttons**

| Button | What it does |
|---|---|
| **Mark all Present** | Sets everyone on the shift to Present. Start here, then mark exceptions. |
| **Fill open positions** | Looks at every position under its target headcount and proposes who to move, based on their roles and equipment. It fills the hardest-to-staff position first and uses the least flexible qualified person, so specialists are not wasted on general work. Review the proposal before applying. If nothing is short it says so. |
| **Stagger lunches** | Spreads lunches across the shift, sending **one person from each position at a time** so no position empties out. See §8. |
| **Reset all to Unassigned** | Clears the day's assignments. |

**Position targets** — each position has a minimum headcount per shift (set on
Setup → Positions). Positions under target are flagged so you can see the gap at
a glance.

**Equipment / role warnings** — if a position requires a piece of equipment or a
role and you assign someone who does not hold it, you get a warning. It is a
warning, not a block; you can still make the assignment.

**Scheduling ahead** — the date strip under the buttons lets you build a plan for
a future day. It is applied automatically on that date, once, when the board
first loads. **Clear this day** wipes a future plan you no longer want.

**Labor share** — borrowed workers for a single shift: a name, the shift, a
position and in/out times. They show on the board for that shift and remove
themselves when it ends. They are *not* added to the Employees list, so a
one-day loan from another department does not clutter the roster.

---

## 8. Lunches

Shows every lunch window for the shift and lets you edit them by hand.

**Stagger lunches** (on the Assign tab) does this automatically:

- Lunch is 30 minutes.
- Slots are laid out **within the shift's own hours**, not at fixed clock times,
  with a margin at each end so nobody goes to lunch in the first or last stretch
  of their shift.
- People are sent **one per position at a time** — Receiving sends one, Put-away
  sends one, Picking sends one, then the next round starts.
- The system aims for a 30-minute gap between rounds and compresses toward a
  5-minute minimum only if the shift is too short to fit everyone comfortably.

Shift hours come from **Setup → General → Shift times**, so if your shifts are
not the default 6/2/10, set them there first or the stagger will land in the
wrong window.

Hand-edit anything the automatic layout got wrong — manual edits are not
overwritten unless you run the stagger again.

Today's lunches update live. Past days are logged and kept for **two weeks**,
recorded while the Lunches or Admin Dashboard tab is open.

---

## 9. Side Tasks

Extra work that is not a position: sweep an aisle, rewrap a skid, charge the
pallet jacks.

- Add a task, give it a **priority**, optionally assign it to a person.
- Status moves **Unassigned → Assigned → In Progress → Done**.
- Filter the list by **All / Open / Overdue / Done**.
- Open tasks show on the board so the floor can pick them up.
- Completed tasks are logged, so you can see what actually got done.

---

## 10. Attendance

Supervisor and above.

- **Today** — set and review attendance for the current day.
- **Present by day** — present / on-shift headcount, recorded per shift **while
  the Admin Dashboard tab is open**. A shift with no admin viewing leaves no
  record, so if you want a complete history, leave the panel up on a back-office
  machine.
- **Coverage by weekday** — the share of the on-shift roster that showed up,
  averaged across every recorded week. This is where a chronic Monday or Friday
  gap becomes obvious.
- **Days out per person** — absent, called out or PTO counts per employee over
  the window, so you can spot a pattern before it becomes a problem.

History builds from the day the feature went live and is kept for **120 days**.
Panels that do not have enough data yet say so rather than showing a misleading
chart.

---

## 11. Setup → General

Admin only. Everything here applies to **the location currently selected**.

- **Dashboard name** — shown on the board header, the browser tab and the login
  page. Give each warehouse its own name so a screen is identifiable at a glance.
- **Branding / appearance** — logo and colours for this location's board.
- **Auto-scroll speed** (1–10) — how fast the board's overflowing sections
  (positions, lunches, side tasks, and the dock schedule) scroll. Saves
  automatically a moment after you release the slider.
- **Shift times** — when each shift starts. Each shift ends when the next begins.
  These drive the "current shift" logic, the handoff note shown, and the lunch
  stagger.
- **Tab names** — rename any admin tab and give it a hover description, so the
  panel matches your site's vocabulary. Clear the name to go back to the default.
- **Rotating dashboard** — alternate the board between the normal roster view and
  an external page (a KPI dashboard, a safety video page, whatever URL you give
  it). Set **seconds between rotations**. There is a live preview.
- **Descriptions** — the position blurbs shown on the board.
- **Backup** — **Download full backup (.xlsx)**: one Excel workbook with a sheet
  per table. Take one before any big change.
- **Danger zone — clear data** — wipes operational data for this location. There
  is no undo. Use the backup first.

> The Opendock dock-schedule rotation setting is **not** here — it lives with the
> rest of the Opendock config on **Integrations** (§16).

---

## 12. Setup → Employees

The roster. Add, edit and terminate people; set their position, shift, roles,
equipment, lunch window, hire and birth dates, and panel access.

- Clicking **Edit** on a card brings the edit form into view rather than leaving
  you scrolled halfway down a long roster.
- **History** on a card shows that person's recorded work and lunch history.
- **Hire date** and **birth date** drive the work-anniversary and birthday badges
  on the board. Both are date-only (`YYYY-MM-DD`), so they never drift a day.
- **Terminating** someone keeps their history but takes them off the board.

### CSV import

**Import from CSV** with these columns:

```
name, position, equipment, roles, admin, username, password, shift, hire_date, birth_date
```

- `equipment` — physical equipment / certifications (forklift, reach truck).
- `roles` — job functions the person can perform (Receive, Ship, Pick, DAX).
- Separate multiple values with **semicolons**: `Forklift;Scanner`
- `admin` is `yes`/`no`; `username` and `password` are required for admins.
- `shift` is `1`, `2` or `3`. Dates are `YYYY-MM-DD`.
- Positions, equipment and roles that do not exist yet are **created
  automatically**.
- **Download the sample CSV** from the same panel to get the header right.

### CSV export

**Export all employees** writes the same columns, minus `password` (only ever
stored hashed), plus `terminated_at`. It covers **current and terminated**
employees — active first — so it doubles as a roster snapshot for HR.

---

## 13. Setup → Positions

The columns on the board.

- **Title** and **description** (the description shows on the board).
- **Sort order** — the left-to-right order on the board.
- **Minimum headcount per shift** — the target used for the understaffed flags
  and for **Fill open positions**. `0` means no target.
- **Required equipment** and **required role** — optional. Assigning someone
  without them raises a warning on the Assign tab.

---

## 14. Setup → Roles

Job functions a person can perform: Receive, Ship, Pick, Put-away, Cycle Count,
DAX. An employee can hold several. They show as small tags on the employee card
in the admin panel.

Roles are used by **Fill open positions** to work out who can cover what.

> Naming note: in the database this table is `Capability`. The UI calls it
> **Roles** everywhere, and so does the CSV column `roles`.

---

## 15. Setup → Equipment

Physical equipment and certifications: sit-down forklift, reach truck, order
picker, electric pallet jack, clamp truck.

Used for the required-equipment warning on positions and by **Fill open
positions**.

> Naming note: in the database this table is `Role`. The UI calls it
> **Equipment**, and so does the CSV column `equipment`. This inversion matters
> only if you are reading raw exports.

---

## 16. Setup → Integrations (Opendock)

Pulls today's dock appointments from Opendock and puts them in two places:

1. a **status pill** on the employee card of whoever is tagged on the
   appointment, and
2. a full **dock schedule screen** that rotates onto the board.

Connection settings apply to **the location selected in the header**, so each
warehouse points at its own Opendock warehouse.

### Connection settings

| Field | What to put in it |
|---|---|
| **Enabled** | Master on/off for this location. |
| **API base URL** | Your Opendock (Neutron) API endpoint. |
| **Login email** / **Password** | A dedicated Opendock service account — not a personal login. |
| **Warehouse ID** | The Opendock warehouse this location maps to. Appointments are scoped through the docks that belong to it. |
| **Time window (hours either side of now)** | Only appointments starting inside this window feed the badges. Default 24. Raise it if crews tag loads well ahead of the shift. |
| **Refresh interval (seconds)** | How often the board actually calls Opendock. Default 120; the field is bounded to 30–900 so a typo can't hammer the API. |
| **Person tag roles** | Which tag prefixes name a person. Default `receiver, loader`. |
| **Name overrides** | Manual `tag value = employee name` fixes for nicknames the matcher cannot resolve. |
| **Dock schedule text size** | Scales the dock schedule table like browser zoom, so it reflows instead of clipping. |
| **Rotate through today's Opendock schedule** | Adds the dock screen to the board's rotation. |
| **Hide these statuses** | Which statuses the dock screen hides. Default hides **Cancelled / NoShow** and **Requested**. |

> **Leave the refresh interval at 60 seconds or more.** Every call that
> has to re-authenticate counts against Opendock's failed-login tracking; hammering
> it is what produces *"Couldn't reach Opendock: Opendock login failed."* The
> system caches its login token and backs off for five minutes after a failure,
> but a very short interval defeats that.

### How tags work

Opendock appointments carry free-text tags. The system reads them as
`ROLE: VALUE`:

| Tag | Effect |
|---|---|
| `RECEIVER: DENNIS R.` | Matches employee Dennis Reyes; puts a dock pill on his card. |
| `LOADER: GLORIA P.` | Same, for the loader role. |
| `DOOR: 23` | Fills the **Door** column on the dock screen. |
| `REJECTED` | Highlights the whole appointment **red**. |

**Name matching**, in order — the first rule that gives exactly one answer wins:

1. a **Name override** you configured
2. exact full-name match
3. **first name + last initial** (`DENNIS R.` → Dennis Reyes)
4. first name + last name
5. a unique first name
6. a unique last name

If two people would match, the system **refuses** rather than guess — the tag
shows as unmatched. Fix it with a Name override, or make the tag more specific.

Tag matching is case-insensitive and tolerates the trailing period.

**Door pills** drop off an employee's card **15 minutes after** the appointment
is marked completed, so the card does not keep showing a door that is already
cleared.

### Test connection

The **Test connection** button runs a full diagnostic and reports:

- whether login succeeded and what role the account has
- how many docks are in the warehouse, and how many appointments came back
- **Matched** tags (tag → employee) and **Unmatched** tags, with "did you mean"
  suggestions
- how many appointments fell **outside the time window**
- **Available fields** from one real appointment — the raw field inventory, so
  you can see exactly what Opendock is sending before deciding what to map

Run this after any Opendock change, and any time a pill stops appearing.

---

## 17. Setup → Activity

An audit log: who changed what and when — attendance edits, notices posted,
assignments applied, settings changed. Scoped to the current location.

Use it when "who cleared the board?" comes up.

- **Export to Excel** — the visible log as a spreadsheet.
- **Download all logs** — the full history.
- **Export all & clear DB** — downloads everything, then empties the log. Use it
  to keep the log from growing without bound; the download is your only copy.

---

## 18. Locations (super-admin)

Create, rename and delete warehouses.

- **Name** — what people call it. Renaming is safe at any time.
- **Slug** — a short URL-safe identifier (`/default`, `/production`), derived
  from the name and unique across the whole deployment. It is shown under each
  location so you can tell two similarly-named sites apart.

Wall displays are **not** addressed by slug — each screen gets its own token
from Screen Fleet (§19).

Deleting a location deletes **everything in it** — employees, history, notices,
screens. Take a backup first (§11).

---

## 19. Screen Fleet (super-admin)

Registers the physical displays.

**Adding a screen**

1. Pick the location, give the screen a name that identifies where it hangs —
   *Receiving Office TV*, *Dock 12 Wall*.
2. The system generates a unique display URL: `/screen/<token>`.
3. **Copy URL** and open it on that TV or media box, full screen.

That screen now renders **its location's** board, read-only, no login. The
browser tab is titled with the location's dashboard name, so you can tell
screens apart from the tab bar alone.

**Live control** — for each screen you can send:

| Command | Effect |
|---|---|
| **Refresh** | Reloads the screen. Use after a settings change that has not appeared. |
| **Identify** | Flashes a marker on that screen so you can tell which physical TV it is. |
| **Message** | Puts a short message on that one screen. |

Commands are picked up on the screen's next check-in, so allow a few seconds.

**Status** — each screen shows **online now** or when it was last seen, or
*never opened* if the URL has not been loaded yet. If a screen goes quiet for
about an hour, a warning banner appears on the Admin Dashboard naming it. That
usually means the TV is off, the browser crashed, or the box lost network.

Treat the display URL as a secret — anyone with it can see that board.

---

## 20. The wall board

What the floor sees. It needs no interaction.

- **Header** — the location's dashboard name and logo.
- **Positions** — one column per position, employee cards inside, understaffed
  positions flagged.
- **Employee cards** — name, lead marker, lunch window, "In at …" for late
  arrivals, birthday and anniversary badges, and the Opendock dock pill when
  the person is tagged on a live appointment. **Roles are not shown here** — only
  in the admin panel — to keep the cards legible from a distance.
- **Notices** — up to three, oldest first, pinned ones always.
- **Handoff note** — the previous shift's note, with the author.
- **Side tasks** — open work anyone can pick up.
- **Footer** — "Updated hh:mm:ss" in the centre and the build version on the
  right.
- **Auto-scroll** — any section taller than the screen scrolls at the speed set
  in Setup → General.
- **Rotation** — the board cycles between the roster, the Opendock dock schedule
  (if enabled), and the external rotating URL (if enabled), at the interval you
  set. With none of the extras enabled it simply stays on the roster.
- **Light and dark mode** — both are supported and cards carry a distinct border
  in light mode so they stay readable under warehouse lighting.

### If the connection drops

A flashing red **NO INTERNET** bar appears across the top of the board, with the
time of the last good update.

The board underneath keeps running on the last data it received — the clock
still ticks, panels still rotate, sections still scroll — so the floor still has
something to read while the network is being fixed. Nothing is lost and nobody
needs to touch the screen: when the connection comes back the bar disappears and
the board pulls fresh data straight away.

The bar means the screen cannot reach the dashboard server. That can be the
site's internet, the local network, or the server itself — it is not a fault in
the display. If the bar is up on **every** screen, look at the network or the
server; if it is up on **one**, look at that TV's connection.

---

## 21. The Opendock dock schedule screen

Today's appointments, rotating in with the roster. Available on the main board
for the location.

**Columns**

| Column | Meaning |
|---|---|
| **Time** | The booked appointment time. |
| **Arrived** | When the truck actually checked in. Blank until it arrives. |
| **Status** | Scheduled / Requested / Arrived / In progress / Completed / Cancelled. |
| **Door** | From the `DOOR:` tag. Blank if the appointment is not tagged — it is deliberately not guessed from the dock name. |
| **Load type** | The Opendock load type. |
| **Dir** | Inbound / outbound. |
| **PO / Ref #** | The reference number. |
| **Tags** | The appointment's person tags (`RECEIVER: …`, `LOADER: …`). |
| **On time** | How far off the booked time the arrival was. |
| **Dwell** | How long the truck has been on site. Keeps counting while it is open. |
| **Processing** | From arrival to in-progress. |

**Sort order** — by scheduled time, with **completed** appointments moved to the
bottom, followed by **cancelled**. Live work always sits at the top.

**Colours** (there is a legend at the top of the screen, next to the counts)

| Colour | Meaning |
|---|---|
| 🔴 **Red** | The appointment carries a `REJECTED` tag. |
| 🟡 **Yellow** | Late — past its appointment time, or arrived after it. |
| 🟢 **Green** | Completed. |

**Reading the screen**

- The header row stays frozen while the table auto-scrolls, so you always know
  what column you are looking at.
- Auto-scroll uses the same speed slider as the rest of the board.
- Text size is set by the **Dock schedule text size** slider on Integrations.
- A **freshness indicator** shows when the data last synced. If it is more than
  about ten minutes stale it says so — that is your signal the Opendock
  connection needs attention, rather than a genuinely quiet dock.

---

## 22. Troubleshooting

**A screen shows a flashing NO INTERNET bar**
It cannot reach the server. The board keeps showing its last update, so there is
no rush at the screen itself — check the site's network or the server. It clears
itself when the connection returns.

**A screen is blank or stuck**
Check Screen Fleet — is it *online now*? Send **Refresh**. If it still shows
*last seen* an hour ago, the TV or its box is the problem, not the dashboard.

**A screen shows the wrong warehouse**
It is registered to the wrong location. Delete the screen and re-register it
under the right one; the URL changes.

**"Couldn't reach Opendock: Opendock login failed"**
Almost always credentials or call frequency.
1. Run **Test connection** on Integrations.
2. If login fails, re-enter the password — Opendock locks accounts after
   repeated failures, so a stale password compounds.
3. Check the **Refresh interval** is not set very low (keep it ≥ 60s).
4. After a failure the system backs off for five minutes before retrying, so
   give it that long after a fix before deciding it did not work.

**A dock pill is missing from someone's card**
Run **Test connection** and look at **Unmatched** tags.
- Tag spelled differently → add a **Name override**.
- Tag ambiguous (two Dennises) → make the tag more specific, or add an override.
- Appointment outside the window → raise **Time window (hours)**.

**The Door column is empty**
The appointment has no `DOOR:` tag. The column is tag-only by design — it will
not guess from the dock name, because those names are not door numbers.

**Notices are not showing**
More than three active notices queue. Check start and expiry times, and check you
posted to the right location.

**A handoff note appears on the wrong board**
Check the location bar at the top of the panel before posting. Notes are stored
against the location that was selected at the time.

**Someone lost panel access**
Setup → Employees → their card → access level. If nobody can get in, sign in as
`superadmin`; that account cannot be locked out.

**Something got wiped**
Setup → General → **Download full backup (.xlsx)** is the recovery path — which
only helps if a backup was taken. Take one before any bulk change.

---

## Quick reference

| I want to… | Go to |
|---|---|
| Mark who is here today | Assign → Mark all Present, then exceptions |
| Fill a short position | Assign → Fill open positions |
| Lay out lunches | Assign → Stagger lunches |
| Tell the floor something | Notices |
| Leave a note for the next shift | Notices → shift handoff |
| Add an extra job | Side Tasks |
| See who keeps missing Mondays | Attendance → Coverage by weekday |
| Add a new hire | Setup → Employees |
| Bulk-load the roster | Setup → Employees → Import from CSV |
| Give HR a roster | Setup → Employees → Export all employees |
| Rename the board | Setup → General → Dashboard name |
| Change how fast the board scrolls | Setup → General → Auto-scroll speed |
| Connect Opendock | Setup → Integrations |
| Diagnose Opendock | Setup → Integrations → Test connection |
| Add a TV | Screen Fleet |
| Find out who changed something | Setup → Activity |
| Add a warehouse | Locations |
