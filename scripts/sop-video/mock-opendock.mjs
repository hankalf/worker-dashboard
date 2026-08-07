// A stand-in Opendock (Neutron) API for the SOP recording. Serves the same
// endpoints and payload shapes the real integration reads, so the dock schedule
// screen renders live data without touching the customer's account.
import http from "node:http";

const PORT = 4310;
const WAREHOUSE = "wh-demo-0001";

const DOCKS = [
  { id: "dk-21", name: "Inbound Raw Material #A", doorNumber: "21", warehouseId: WAREHOUSE },
  { id: "dk-22", name: "Inbound Raw Material #B", doorNumber: "22", warehouseId: WAREHOUSE },
  { id: "dk-23", name: "Inbound Finished #A", doorNumber: "23", warehouseId: WAREHOUSE },
  { id: "dk-09", name: "Outbound #9", doorNumber: "9", warehouseId: WAREHOUSE },
  { id: "dk-12", name: "Outbound #12", doorNumber: "12", warehouseId: WAREHOUSE },
  { id: "dk-99", name: "Other Warehouse Door", doorNumber: "1", warehouseId: "wh-other" },
];

const LOAD_TYPES = [
  { id: "lt-1", name: "Dry Van — Palletized", direction: "inbound" },
  { id: "lt-2", name: "Floor Loaded", direction: "inbound" },
  { id: "lt-3", name: "LTL Pickup", direction: "outbound" },
  { id: "lt-4", name: "Full Truckload", direction: "outbound" },
  { id: "lt-5", name: "Parcel / Small Pack", direction: "outbound" },
];

// Eastern-time helpers: the board buckets appointments by the Eastern calendar
// day, so build the demo day the same way.
function easternParts(d) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return p;
}

// Build an ISO instant for "today, Eastern, at HH:MM".
function easternToday(hh, mm) {
  const p = easternParts(new Date());
  const guess = new Date(`${p.year}-${p.month}-${p.day}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`);
  // Correct for the Eastern offset by measuring it at that instant.
  const q = easternParts(guess);
  const drift = (Number(q.hour) - hh) * 60 + (Number(q.minute) - mm);
  return new Date(guess.getTime() - drift * 60_000).toISOString();
}

const nowH = Number(easternParts(new Date()).hour);

// Appointments across the Eastern day, positioned relative to the current hour
// so the recording always shows finished loads, live loads and upcoming ones.
function appt(o) {
  return {
    id: o.id,
    status: o.status,
    dockId: o.dockId,
    start: easternToday(o.h, o.m ?? 0),
    end: easternToday(o.h + 1, o.m ?? 0),
    refNumber: o.ref,
    loadTypeId: o.lt,
    tags: (o.tags ?? []).map((name) => ({ name })),
    statusTimeline: o.timeline ?? {},
    notes: o.notes ?? null,
    createdAt: easternToday(6, 0),
  };
}

const h = (offset) => Math.min(22, Math.max(1, nowH + offset));

const APPOINTMENTS = [
  // Finished earlier in the day — green, sorted to the bottom.
  appt({
    id: "ap-001", status: "Completed", dockId: "dk-21", h: h(-6), m: 0,
    ref: "PO-448120", lt: "lt-1", tags: ["RECEIVER: DENNIS R.", "DOOR: 21"],
    timeline: {
      Arrived: easternToday(h(-6), 4),
      InProgress: easternToday(h(-6), 19),
      Completed: easternToday(h(-5), 2),
    },
  }),
  appt({
    id: "ap-002", status: "Completed", dockId: "dk-09", h: h(-5), m: 30,
    ref: "SO-771204", lt: "lt-3", tags: ["LOADER: GLORIA P.", "DOOR: 9"],
    timeline: {
      Arrived: easternToday(h(-5), 41),
      InProgress: easternToday(h(-5), 55),
      Completed: easternToday(h(-4), 28),
    },
  }),
  // Rejected load — red.
  appt({
    id: "ap-003", status: "Completed", dockId: "dk-22", h: h(-4), m: 0,
    ref: "PO-448155", lt: "lt-2", tags: ["RECEIVER: DONOVAN L.", "DOOR: 22", "REJECTED"],
    timeline: {
      Arrived: easternToday(h(-4), 12),
      InProgress: easternToday(h(-4), 30),
      Completed: easternToday(h(-4), 51),
    },
  }),
  // On site, being worked right now.
  appt({
    id: "ap-004", status: "In progress", dockId: "dk-23", h: h(-1), m: 30,
    ref: "PO-448171", lt: "lt-1", tags: ["RECEIVER: PERCY A.", "DOOR: 23"],
    timeline: {
      Arrived: easternToday(h(-1), 34),
      InProgress: easternToday(h(-1), 52),
    },
  }),
  appt({
    id: "ap-005", status: "In progress", dockId: "dk-12", h: h(-1), m: 0,
    ref: "SO-771260", lt: "lt-4", tags: ["LOADER: ANDRE S.", "DOOR: 12"],
    timeline: {
      Arrived: easternToday(h(-1), 8),
      InProgress: easternToday(h(-1), 25),
    },
  }),
  // Arrived, waiting on a door.
  appt({
    id: "ap-006", status: "Arrived", dockId: "dk-21", h: h(0), m: 0,
    ref: "PO-448190", lt: "lt-2", tags: ["RECEIVER: OMAR C."],
    timeline: { Arrived: easternToday(h(0), 21) },
  }),
  // Past its slot with no arrival — late, yellow.
  appt({
    id: "ap-007", status: "Scheduled", dockId: "dk-22", h: h(-2), m: 15,
    ref: "PO-448166", lt: "lt-1", tags: ["RECEIVER: MARCUS B.", "DOOR: 22"],
  }),
  appt({
    id: "ap-008", status: "Scheduled", dockId: "dk-09", h: h(-3), m: 45,
    ref: "SO-771233", lt: "lt-5", tags: ["LOADER: NINA O."],
  }),
  // Still to come.
  appt({
    id: "ap-009", status: "Scheduled", dockId: "dk-23", h: h(1), m: 0,
    ref: "PO-448204", lt: "lt-1", tags: ["RECEIVER: DENNIS R.", "DOOR: 23"],
  }),
  appt({
    id: "ap-010", status: "Scheduled", dockId: "dk-12", h: h(1), m: 30,
    ref: "SO-771281", lt: "lt-3", tags: ["LOADER: TERRELL H."],
  }),
  appt({
    id: "ap-011", status: "Scheduled", dockId: "dk-21", h: h(2), m: 0,
    ref: "PO-448212", lt: "lt-2", tags: ["RECEIVER: KAYLA B."],
  }),
  appt({
    id: "ap-012", status: "Scheduled", dockId: "dk-09", h: h(2), m: 45,
    ref: "SO-771295", lt: "lt-4", tags: ["LOADER: RAY W."],
  }),
  appt({
    id: "ap-013", status: "Requested", dockId: "dk-22", h: h(3), m: 0,
    ref: "PO-448230", lt: "lt-1", tags: [],
  }),
  appt({
    id: "ap-014", status: "Cancelled", dockId: "dk-12", h: h(1), m: 15,
    ref: "SO-771300", lt: "lt-3", tags: ["LOADER: SASHA K."],
  }),
  appt({
    id: "ap-015", status: "NoShow", dockId: "dk-23", h: h(-2), m: 0,
    ref: "PO-448144", lt: "lt-2", tags: [],
  }),
  // Belongs to a different warehouse — must never reach the board.
  appt({
    id: "ap-999", status: "Scheduled", dockId: "dk-99", h: h(0), m: 30,
    ref: "OTHER-0001", lt: "lt-1", tags: ["RECEIVER: SOMEONE ELSE"],
  }),
];

const json = (res, body, code = 200) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;

    if (req.method === "POST" && path === "/auth/login") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const { email, password } = JSON.parse(body || "{}");
        if (!email || !password) return json(res, { message: "Unauthorized" }, 401);
        // A structurally real JWT so the diagnostic's claim decode has something
        // to read. Signature is not checked by anything here.
        const claims = Buffer.from(
          JSON.stringify({
            email,
            role: "role_owner",
            warehouseId: WAREHOUSE,
            exp: Math.floor(Date.now() / 1000) + 86400,
          })
        ).toString("base64url");
        json(res, {
          access_token: `eyJhbGciOiJIUzI1NiJ9.${claims}.demo-signature`,
          expires_in: 86400,
        });
      });
      return;
    }

    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ")) return json(res, { message: "Unauthorized" }, 401);

    if (path === "/dock") return json(res, { data: DOCKS, total: DOCKS.length });
    if (path === "/loadType") return json(res, { data: LOAD_TYPES, total: LOAD_TYPES.length });
    if (path === "/warehouse") return json(res, { data: [{ id: WAREHOUSE, name: "Demo DC" }] });
    if (path === `/warehouse/${WAREHOUSE}`) return json(res, { id: WAREHOUSE, name: "Demo DC" });
    if (path === "/appointment") {
      // Honour the nestjs-crud `s` filter the integration sends, so the demo
      // exercises the same path as production.
      let rows = APPOINTMENTS;
      const s = url.searchParams.get("s");
      if (s) {
        try {
          const f = JSON.parse(s);
          if (f.dockId?.$in) rows = rows.filter((a) => f.dockId.$in.includes(a.dockId));
          if (f.start?.$gte) rows = rows.filter((a) => a.start >= f.start.$gte);
          if (f.start?.$lte) rows = rows.filter((a) => a.start <= f.start.$lte);
        } catch {}
      }
      const limit = Number(url.searchParams.get("limit")) || 500;
      return json(res, { data: rows.slice(0, limit), total: rows.length });
    }

    json(res, { message: "Not found" }, 404);
  })
  .listen(PORT, () => console.log(`mock opendock on http://localhost:${PORT}`));
