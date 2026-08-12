// Records the Worker Dashboard video SOP: drives a live instance in Chromium
// while an injected overlay adds chapter cards, narration captions and a
// visible cursor. Writes a .webm into ./out/.
//
// Usage: node scripts/sop-video/record-sop.mjs
//   PLAYWRIGHT_PATH  where to import playwright from (default: "playwright")
//   CHROMIUM_PATH    a specific Chromium binary, if the default resolution fails
//
// See docs/SOP-video-script.md for the full setup.
import fs from "node:fs";

// Playwright isn't a project dependency — a global install is fine.
const { chromium } = await import(process.env.PLAYWRIGHT_PATH ?? "playwright");

const BASE = "http://localhost:3210";
const VIDEO_DIR = new URL("./out/", import.meta.url).pathname;
const W = 1440;
const H = 900;

fs.rmSync(VIDEO_DIR, { recursive: true, force: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// The on-screen furniture. Injected into every page load so it survives
// navigation, and rebuilt on demand if React ever replaces the body.
// ---------------------------------------------------------------------------
const OVERLAY = () => {
  const build = () => {
    if (document.getElementById("sop-root")) return;
    const root = document.createElement("div");
    root.id = "sop-root";
    root.innerHTML = `
      <style>
        #sop-root, #sop-root * { box-sizing: border-box; }
        #sop-root { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
        #sop-cap { position: absolute; left: 0; right: 0; bottom: 0; padding: 22px 40px 26px;
          background: linear-gradient(to top, rgba(9,9,11,.97) 55%, rgba(9,9,11,0));
          color: #fafafa; opacity: 0; transition: opacity .35s ease; }
        #sop-cap.on { opacity: 1; }
        #sop-chip { display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: .12em;
          text-transform: uppercase; color: #93c5fd; border: 1px solid rgba(147,197,253,.45);
          border-radius: 999px; padding: 3px 11px; margin-bottom: 10px; }
        #sop-text { font-size: 25px; line-height: 1.38; font-weight: 500; max-width: 1180px;
          text-shadow: 0 2px 10px rgba(0,0,0,.65); }
        #sop-title { position: absolute; inset: 0; background: #09090b; color: #fff;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 16px; opacity: 0; transition: opacity .45s ease; }
        #sop-title.on { opacity: 1; }
        #sop-num { font-size: 15px; font-weight: 700; letter-spacing: .3em; color: #60a5fa; }
        #sop-head { font-size: 58px; font-weight: 700; letter-spacing: -.02em; text-align: center; }
        #sop-sub { font-size: 22px; color: #a1a1aa; text-align: center; max-width: 900px; }
        #sop-ring { position: absolute; border: 3px solid #3b82f6; border-radius: 10px;
          box-shadow: 0 0 0 9999px rgba(9,9,11,.5), 0 0 22px rgba(59,130,246,.85);
          opacity: 0; transition: opacity .3s ease, top .4s ease, left .4s ease,
          width .4s ease, height .4s ease; }
        #sop-ring.on { opacity: 1; }
        #sop-cursor { position: absolute; width: 22px; height: 22px; margin: -11px 0 0 -11px;
          border-radius: 999px; background: rgba(59,130,246,.35); border: 2px solid #60a5fa;
          opacity: 0; transition: opacity .25s ease; }
        #sop-cursor.on { opacity: 1; }
        #sop-cursor.tap { animation: sop-tap .4s ease; }
        @keyframes sop-tap { 0% { transform: scale(1); } 45% { transform: scale(.55); } 100% { transform: scale(1); } }
      </style>
      <div id="sop-ring"></div>
      <div id="sop-cursor"></div>
      <div id="sop-cap"><div id="sop-chip"></div><div id="sop-text"></div></div>
      <div id="sop-title"><div id="sop-num"></div><div id="sop-head"></div><div id="sop-sub"></div></div>
    `;
    document.body.appendChild(root);
  };

  const el = (id) => {
    build();
    return document.getElementById(id);
  };

  window.__sop = {
    caption(text, chip) {
      el("sop-chip").textContent = chip ?? "";
      el("sop-text").textContent = text;
      el("sop-cap").classList.add("on");
    },
    clearCaption() {
      el("sop-cap").classList.remove("on");
    },
    title(num, head, sub) {
      el("sop-num").textContent = num;
      el("sop-head").textContent = head;
      el("sop-sub").textContent = sub ?? "";
      el("sop-title").classList.add("on");
    },
    hideTitle() {
      el("sop-title").classList.remove("on");
    },
    cursor(x, y) {
      const c = el("sop-cursor");
      c.classList.add("on");
      c.style.left = `${x}px`;
      c.style.top = `${y}px`;
    },
    tap() {
      const c = el("sop-cursor");
      c.classList.remove("tap");
      void c.offsetWidth;
      c.classList.add("tap");
    },
    ring(box) {
      const r = el("sop-ring");
      if (!box) {
        r.classList.remove("on");
        return;
      }
      r.style.left = `${box.x - 6}px`;
      r.style.top = `${box.y - 6}px`;
      r.style.width = `${box.width + 12}px`;
      r.style.height = `${box.height + 12}px`;
      r.classList.add("on");
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
};

// ---------------------------------------------------------------------------

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: VIDEO_DIR, size: { width: W, height: H } },
  deviceScaleFactor: 1,
});
await ctx.addInitScript(OVERLAY);
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept().catch(() => {}));

let cursorAt = { x: W / 2, y: H / 2 };

const wait = (ms) => page.waitForTimeout(ms);
const ensure = () => page.evaluate(OVERLAY).catch(() => {});

// Narration: on screen long enough to read at a comfortable pace.
async function say(text, chip, extra = 0) {
  await ensure();
  await page.evaluate(([t, c]) => window.__sop.caption(t, c), [text, chip ?? ""]);
  await wait(Math.max(2900, Math.round(text.length * 52)) + extra);
}

async function chapter(num, head, sub) {
  await ensure();
  await page.evaluate(([n, h, s]) => {
    window.__sop.clearCaption();
    window.__sop.ring(null);
    window.__sop.title(n, h, s);
  }, [num, head, sub ?? ""]);
  await wait(3000);
  await page.evaluate(() => window.__sop.hideTitle());
  await wait(700);
}

async function clearFocus() {
  await page.evaluate(() => {
    window.__sop.ring(null);
  }).catch(() => {});
}

// Glide the marker to an element and outline it.
async function focus(target, { ringIt = true, scroll = true } = {}) {
  const loc = typeof target === "string" ? page.locator(target).first() : target;
  try {
    if (scroll) await loc.scrollIntoViewIfNeeded({ timeout: 4000 });
    await wait(400);
    const box = await loc.boundingBox({ timeout: 4000 });
    if (!box) return null;
    const to = { x: box.x + Math.min(box.width / 2, 220), y: box.y + box.height / 2 };
    const steps = 16;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const x = cursorAt.x + (to.x - cursorAt.x) * ease;
      const y = cursorAt.y + (to.y - cursorAt.y) * ease;
      await page.evaluate(([a, b]) => window.__sop.cursor(a, b), [x, y]);
      await wait(18);
    }
    cursorAt = to;
    if (ringIt) await page.evaluate((b) => window.__sop.ring(b), box);
    return box;
  } catch {
    return null;
  }
}

async function click(target, { settle = 1200 } = {}) {
  const loc = typeof target === "string" ? page.locator(target).first() : target;
  const box = await focus(loc, { ringIt: false });
  if (!box) return false;
  await page.evaluate(() => window.__sop.tap());
  await wait(260);
  try {
    await loc.click({ timeout: 8000 });
  } catch {
    return false;
  }
  await wait(settle);
  return true;
}

async function go(path, { settle = 2200 } = {}) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await wait(settle);
  await ensure();
}

// Slowly scroll the page so long panels are actually seen.
async function pan(toY, ms = 2200) {
  const from = await page.evaluate(() => window.scrollY);
  const steps = Math.max(12, Math.round(ms / 55));
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    await page.evaluate((y) => window.scrollTo(0, y), from + (toY - from) * ease);
    await wait(ms / steps);
  }
  await wait(500);
}

// ===========================================================================
// 1 — Opening
// ===========================================================================
await go("/", { settle: 2600 });
await chapter(
  "WORKER DASHBOARD",
  "How to run the board",
  "A guided walkthrough of the wall display and the admin panel"
);
await say(
  "This is the wall board — what the TVs on the floor show. Nobody has to touch it; it refreshes itself all day.",
  "The board"
);
await focus("text=Warehouse Dashboard");
await say(
  "The header carries this location's dashboard name, today's date and a live clock.",
  "The board"
);
await clearFocus();

await focus("text=/HANDOFF FROM/i").catch(() => {});
await say(
  "The handoff note from the previous shift sits at the top, with the name of whoever wrote it.",
  "The board"
);
await focus("text=/^NOTICE/").catch(() => {});
await say(
  "Notices scroll beside it. The board shows up to three at a time — anything beyond that queues up.",
  "The board"
);
await focus("text=SIDE TASKS");
await say(
  "Side tasks are the extra work of the day: who owns each one and how urgent it is.",
  "The board"
);
await clearFocus();
await pan(340);
await say(
  "Below that, the team by position — one column per position, with the shift's target headcount beside each title.",
  "The board"
);

const pill = page.locator("text=/RECEIVER · Door/i").first();
if (await pill.count()) {
  await focus(pill);
  await say(
    "When Opendock is connected, anyone tagged on a live dock appointment gets a status pill under their name: their role, the door, and where the load is up to.",
    "The board",
    900
  );
  await clearFocus();
}
await say(
  "Employee roles are deliberately not shown out here — the floor reads these cards from a distance, so they stay to names and status.",
  "The board"
);
await page.evaluate(() => window.scrollTo(0, 0));

// ===========================================================================
// 2 — Signing in
// ===========================================================================
await chapter("CHAPTER 1", "Signing in", "And choosing which warehouse you are working on");
await go("/login");
await say("Add slash-admin to the board's address to reach the panel. Everyone signs in with their own account.", "Sign in");
await focus('input[autocomplete="username"]', { ringIt: false });
await page.fill('input[autocomplete="username"]', "superadmin");
await wait(600);
await focus('input[autocomplete="current-password"]', { ringIt: false });
await page.fill('input[autocomplete="current-password"]', "superadmin");
await wait(600);
await say(
  "Access comes in four levels. Lead gets the daily tabs, Supervisor adds Attendance, and Admin unlocks Setup. Super-admin adds Locations and Screen Fleet on top.",
  "Sign in",
  700
);
await click('button[type="submit"]', { settle: 3000 });
await go("/admin", { settle: 2600 });

await say(
  "Because this account can see more than one warehouse, it lands on the Master Dashboard — and until a warehouse is chosen, Admin Dashboard is the only tab.",
  "Master Dashboard",
  900
);
await focus("button:has-text('Main Warehouse')");
await say(
  "That is deliberate. Nothing else can be edited yet, because the system doesn't know which warehouse you mean.",
  "Master Dashboard"
);
await clearFocus();
await click("button:has-text('Main Warehouse')", { settle: 3200 });
await ensure();
await say("Pick one, and the rest of the panel appears.", "Master Dashboard");
await focus("nav");
await say(
  "Notices, Assign, Lunches, Side Tasks, Attendance — and Setup underneath. Everything you now do applies to this warehouse and no other.",
  "Master Dashboard",
  600
);
await clearFocus();
await focus("select");
await say(
  "The location shown up here is your reminder of which board you are editing. Check it before you post anything.",
  "Master Dashboard"
);
await clearFocus();

// ===========================================================================
// 3 — Admin Dashboard
// ===========================================================================
await chapter("CHAPTER 2", "Admin Dashboard", "A live mirror of what the floor is seeing");
await go("/admin");
await say(
  "Once a warehouse is selected, this tab mirrors the wall board — the same roster, the same counts, the same notices.",
  "Admin Dashboard"
);
await pan(320);
await say(
  "One difference: in here each person's roles are listed under their name, so you can see who can cover what while you plan.",
  "Admin Dashboard"
);
await say(
  "If a registered TV stops checking in, a warning appears on this tab naming the screen.",
  "Admin Dashboard"
);
await page.evaluate(() => window.scrollTo(0, 0));

// ===========================================================================
// 4 — Notices
// ===========================================================================
await chapter("CHAPTER 3", "Notices", "Messages for the floor, and the shift handoff");
await go("/admin/notices");
await say("Notices are the short messages that scroll on the board. Type it, post it, and it is live.", "Notices");
const noticeBox = page.locator('input[placeholder*="Notice shown"]').first();
if (await noticeBox.count()) {
  await focus(noticeBox, { ringIt: false });
  await noticeBox.click().catch(() => {});
  await noticeBox.type("Reminder: high-vis vests required past the yellow line.", { delay: 34 });
  await wait(900);
}
await say(
  "You can give a notice a start time so it stays hidden until then, an expiry so it clears itself, or pin it so it always shows.",
  "Notices"
);
await click("button:has-text('Post')", { settle: 2000 });
await say("Posted. It is on the board within seconds.", "Notices");
await say(
  "Keep them short. They are being read from across the warehouse.",
  "Notices"
);

// ===========================================================================
// 5 — Assign
// ===========================================================================
await chapter("CHAPTER 4", "Assign", "The daily plan — attendance, positions and lunches");
await go("/admin/assign", { settle: 2600 });
await say("This is where the shift gets set up. Start at the top row of buttons.", "Assign");
await focus("button:has-text('Mark all Present')");
await say(
  "Mark all Present sets the whole shift to present in one go. Then you click through only the exceptions — called out, PTO, or coming in late.",
  "Assign",
  600
);
await click("button:has-text('Mark all Present')", { settle: 2600 });
await clearFocus();

await focus("text=SHIFT HANDOFF NOTES");
await say(
  "The handoff notes live here too. Each shift's note is shown on the board to the shift that follows it.",
  "Assign"
);
await clearFocus();
await pan(560);
await say(
  "Below, every position with its crew. Drag a card to move someone, or use the dropdown on the card — easier on a phone.",
  "Assign"
);
await say(
  "If a position needs a piece of equipment or a role and you assign someone who doesn't hold it, you get a warning. It won't block you — it just makes sure the choice is deliberate.",
  "Assign",
  600
);
await page.evaluate(() => window.scrollTo(0, 0));
await wait(500);

await focus("button:has-text('Fill open positions')");
await say(
  "Fill open positions looks at every position under its target headcount and proposes who to move, based on roles and equipment.",
  "Assign"
);
await say(
  "It fills the hardest-to-staff position first and picks the least flexible person who qualifies — so a specialist isn't spent on work anyone could do. You confirm before anything changes.",
  "Assign",
  600
);
await click("button:has-text('Fill open positions')", { settle: 3000 });
await clearFocus();

await focus("button:has-text('Stagger lunches')");
await say(
  "Stagger lunches spreads the crew's lunches across their own shift hours — sending one person from each position at a time, so no position ever empties out.",
  "Assign",
  600
);
await click("button:has-text('Stagger lunches')", { settle: 3200 });
await clearFocus();
await say(
  "It aims for thirty minutes between rounds and tightens up only if the shift is too short to fit everyone comfortably. Hand-edit anything it got wrong.",
  "Assign"
);
await focus("button:has-text('Reset all to Unassigned')");
await say(
  "And Reset clears the day's plan, if you want to start over.",
  "Assign"
);
await clearFocus();

// ===========================================================================
// 6 — Lunches / Side tasks / Attendance
// ===========================================================================
await chapter("CHAPTER 5", "Lunches, Side Tasks, Attendance", "The rest of the daily tabs");
await go("/admin/lunches");
await say(
  "The Lunches tab shows every lunch window for the shift — including the ones the stagger just laid out — and lets you edit any of them by hand.",
  "Lunches",
  600
);
await say(
  "Those times come from your shift hours, so if your shifts aren't the standard ones, set them in Setup first.",
  "Lunches"
);

await go("/admin/jobs");
await say(
  "Side Tasks is the extra work that isn't a position — sweep an aisle, rewrap a skid, charge the jacks.",
  "Side Tasks"
);
await focus("button:has-text('Add side task')");
await say(
  "Give each one a priority and an owner. It moves from unassigned, to assigned, to in progress, to done — and the open ones show on the board so the floor can pick them up.",
  "Side Tasks",
  600
);
await clearFocus();

await go("/admin/attendance", { settle: 2600 });
await say(
  "Attendance is Supervisor and above. Today's numbers, and then the history behind them.",
  "Attendance"
);
await pan(300);
await say(
  "Coverage by weekday averages the share of the roster that showed up, week over week. This is where a chronic Monday gap stops being a feeling and becomes a number.",
  "Attendance",
  700
);
await pan(620);
await say(
  "And days out per person — absences, call-outs and PTO — so a pattern is visible before it becomes a problem. History is kept for a hundred and twenty days.",
  "Attendance",
  600
);
await page.evaluate(() => window.scrollTo(0, 0));

// ===========================================================================
// 7 — Setup
// ===========================================================================
await chapter("CHAPTER 6", "Setup", "The configuration behind all of it");
await go("/admin/settings", { settle: 2600 });
await say(
  "Setup is Admin only, and everything in it applies to the warehouse you have selected.",
  "Setup · General"
);
await focus("text=Dashboard name");
await say(
  "The dashboard name shows on the board header, the browser tab and the login page. Give each warehouse its own, so a screen is identifiable at a glance.",
  "Setup · General",
  600
);
await clearFocus();
await focus("text=Auto-scroll speed");
await say(
  "Auto-scroll speed controls how fast the board's long sections move — including the dock schedule. It saves itself a moment after you let go.",
  "Setup · General",
  600
);
await clearFocus();
await pan(420);
await say(
  "Shift times decide which shift is current, which handoff note shows, and where the lunch stagger lands. Set these to your real hours.",
  "Setup · General"
);
await pan(820);
await say(
  "Further down: rename any tab to match your site's vocabulary, rotate the board through an external page, and take a full Excel backup. There is also a clear-data button — take the backup first.",
  "Setup · General",
  900
);
await page.evaluate(() => window.scrollTo(0, 0));

await go("/admin/employees", { settle: 2600 });
await say(
  "Employees is the roster — position, shift, roles, equipment, lunch window, hire and birth dates, and panel access.",
  "Setup · Employees"
);
await focus("text=Import from CSV");
await say(
  "You can bulk-load it from a CSV. Positions, equipment and roles that don't exist yet are created for you, and there is a sample file to copy the header from.",
  "Setup · Employees",
  700
);
await clearFocus();
await focus("a:has-text('Export all employees')");
await say(
  "Export writes the same columns back out, plus the termination date, and covers current and terminated staff — so it doubles as a roster snapshot for HR.",
  "Setup · Employees",
  700
);
await clearFocus();

await go("/admin/positions", { settle: 2200 });
await say(
  "Positions are the columns on the board. Each carries a target headcount per shift — that target is what drives the understaffed flags and the fill suggestions.",
  "Setup · Positions",
  600
);
await say(
  "A position can also require a piece of equipment or a role, which is what produces the warning back on Assign.",
  "Setup · Positions"
);

await go("/admin/roles", { settle: 2000 });
await say(
  "Roles are what a person can do — receive, ship, pick, cycle count. Someone can hold several.",
  "Setup · Roles"
);
await go("/admin/equipment", { settle: 2000 });
await say(
  "Equipment is what they are cleared to operate — forklift, reach truck, order picker. Between them, these two lists are how the system works out who can cover what.",
  "Setup · Equipment",
  600
);

// ===========================================================================
// 8 — Integrations
// ===========================================================================
await chapter("CHAPTER 7", "Opendock", "Where the dock status on the cards comes from");
await go("/admin/integrations", { settle: 2600 });
await say(
  "This is where the dock data on those employee cards comes from. The connection belongs to the selected warehouse, so each site points at its own Opendock warehouse.",
  "Integrations",
  600
);
await focus("text=API base URL");
await say(
  "The API address, a login, and the Opendock warehouse ID. Use a dedicated service account here, not somebody's personal login.",
  "Integrations",
  600
);
await clearFocus();
await focus("text=/Refresh interval/i");
await say(
  "Refresh interval is how often the board actually calls Opendock. Leave it at sixty seconds or more — hammering the API is what produces the login-failed message.",
  "Integrations",
  700
);
await clearFocus();
await focus("text=Person tag roles");
await say(
  "This is the heart of it. Opendock appointments carry free-text tags, and these prefixes are the ones that name a person — receiver and loader by default.",
  "Integrations",
  700
);
await clearFocus();
await say(
  "A tag reading RECEIVER colon DENNIS R. is matched to Dennis Reyes: first name plus last initial. A DOOR tag fills the door column, and a REJECTED tag turns the whole row red.",
  "Integrations",
  900
);
await say(
  "If two people would match the same tag, the system refuses rather than guess — and you fix it with a name override just below.",
  "Integrations",
  600
);
await pan(700);
await focus("button:has-text('Test connection')");
await say(
  "When anything looks wrong, Test connection is the tool. Watch what it reports.",
  "Integrations"
);
await click("button:has-text('Test connection')", { settle: 4500 });
await clearFocus();
await ensure();
await say(
  "It confirms the login, counts the docks and appointments, and then lists every tag it matched — and every tag it couldn't, with a suggestion for what you probably meant.",
  "Integrations",
  900
);
await pan(1200);
await say(
  "It also shows how many appointments fell outside your time window, and the raw fields Opendock is actually sending. Run it after any change here.",
  "Integrations",
  700
);
await pan(1700);
await wait(2500);
await page.evaluate(() => window.scrollTo(0, 0));
await say(
  "There is also an optional full dock schedule screen — today's appointments as a table — that can rotate onto the board. Its text size and which statuses it hides are set on this page too.",
  "Integrations",
  700
);

// ===========================================================================
// 9 — Locations and screens
// ===========================================================================
await chapter("CHAPTER 8", "Locations and screens", "Running more than one warehouse");
await go("/admin/locations", { settle: 2200 });
await say(
  "Super-admins get two more tabs. Locations is where warehouses are created and renamed.",
  "Locations"
);
await say(
  "Deleting one deletes everything inside it — people, history, notices, screens. Take a backup first.",
  "Locations"
);

await go("/admin/fleet", { settle: 2400 });
await say(
  "Screen Fleet registers the physical displays. Name each one for where it actually hangs, and the system gives it its own address.",
  "Screen Fleet",
  600
);
await focus("button:has-text('Copy URL')").catch(() => {});
await say(
  "Open that address on the TV, full screen, and it shows that warehouse's board — read-only, no login. Treat the address as a secret.",
  "Screen Fleet",
  600
);
await clearFocus();
await focus("button:has-text('Identify')").catch(() => {});
await say(
  "From here you can push three things to a screen: refresh it, flash a marker so you can tell which TV it is, or put a message on that one display.",
  "Screen Fleet",
  700
);
await clearFocus();
await say(
  "Each screen reports in, so you can see what is online. Go quiet for about an hour and a warning appears on the Admin Dashboard.",
  "Screen Fleet",
  600
);

await go("/admin/activity", { settle: 2200 });
await say(
  "And Activity is the audit trail — who changed what, and when. That is where 'who cleared the board?' gets answered.",
  "Activity",
  600
);

// ===========================================================================
// 10 — Close
// ===========================================================================
await chapter("CHAPTER 9", "Back to the floor", "What the shift sees now");
await go("/", { settle: 3000 });
await say(
  "Back on the board: the new notice is up, and the lunches the stagger laid out are now on the schedule.",
  "The board",
  600
);
await pan(320);
await say(
  "That is the whole loop. Mark attendance, fill the gaps, stagger the lunches, post what the floor needs to know — and the board does the rest for the next eight hours.",
  "The board",
  900
);
await page.evaluate(() => window.scrollTo(0, 0));
await chapter("", "That's the walkthrough", "The written SOP covers every screen in more detail");
await wait(1200);

await page.evaluate(() => window.__sop.clearCaption());
await wait(800);
await ctx.close();
await browser.close();

const file = fs.readdirSync(VIDEO_DIR).find((f) => f.endsWith(".webm"));
console.log("VIDEO:", file ? `${VIDEO_DIR}/${file}` : "(none produced)");
