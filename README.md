# Warehouse Dashboard

A warehouse job dashboard with a dark-mode admin panel for managing jobs, tabs (job categories), employees, positions, and roles.

- **Dashboard** (`/`) — public, no login needed, with a light/dark mode toggle. Shows jobs grouped into tabs (e.g. Receiving, Shipping, Inventory) with status, assigned employee, and due date. Put it on a wall screen or let anyone open it on any device.
- **Admin panel** (`/admin`) — login required, dark themed. Full CRUD for jobs, employees, positions, roles, and tabs, plus job assignment and status updates.
- **Employees** are managed by admins. Each employee has a position and a set of **roles** (what they can do — e.g. Picking, Forklift). Employees who need admin access get a username + password and can sign in; everyone else has no account.
- **CSV import** — bulk-add employees from a CSV file (Admin Panel > Employees), with a downloadable sample showing the format. Unknown positions and roles are created automatically.
- **Stack** — Next.js (App Router, TypeScript), Prisma + PostgreSQL, Auth.js (NextAuth v5) with username/password credentials.

## Documentation

- **[docs/SOP.md](docs/SOP.md)** — the standard operating procedure: how to run the
  board day to day, every admin tab, the screen fleet, and the Opendock
  integration. Written for supervisors and admins, not developers. Also as
  [PDF](docs/Worker-Dashboard-SOP.pdf) and
  [Word](docs/Worker-Dashboard-SOP.docx) — rebuild both with
  `scripts/docs/build-sop-docs.mjs`.
- **[docs/SOP-video-script.md](docs/SOP-video-script.md)** — the recorded video
  walkthrough: its chapter list, where the file is kept (deliberately not in
  this repo — it is a large binary), and how to re-record it after UI changes
  with `scripts/sop-video/`.

## Local development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — a PostgreSQL connection string
   - `NEXTAUTH_SECRET` — any random string (`npx auth secret` can generate one)
   - `EMBED_FRAME_ANCESTORS` — optional; who may embed the dashboard in an
     iframe. Defaults to Monday; see [Embedding the dashboard](#embedding-the-dashboard-in-another-app-monday-etc)
3. Apply the database schema:
   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```
4. Seed the first admin account (defaults to `admin` / `admin123` unless you set `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`):
   ```bash
   npx prisma db seed
   ```
5. Start the dev server:
   ```bash
   npm run dev
   ```
6. Sign in at [http://localhost:3000/login](http://localhost:3000/login), then add employees from **Admin Panel > Employees** (tick "Admin access" for anyone who should be able to sign in) and change the seeded password.

No local Postgres install? Prisma can run one for you: `npx prisma dev --name warehouse -d` starts a local Postgres and prints a `DATABASE_URL` to put in `.env`. If you use it, also set `PG_IDLE_TIMEOUT_MS=1` in `.env` — that server drops idle connections, so the app must release them immediately.

## Deploying to Railway

`railway.json` sets the build (Nixpacks) and the start command, which migrates,
seeds, and then launches the server on Railway's `$PORT`. Point the service at
this repo, add a PostgreSQL plugin so `DATABASE_URL` is injected, and set
`NEXTAUTH_SECRET` (plus `SUPERADMIN_PASSWORD` if you want a known super-admin
password).

**Node version.** The stack needs **Node 22+** — Prisma 7 refuses to install on
anything below 20.19, and `@prisma/streams-local` wants 22. Nixpacks defaults to
Node 18, so the version is pinned in three places: `NIXPACKS_NODE_VERSION` in
`nixpacks.toml`, `engines.node` in `package.json`, and `.nvmrc` / `.node-version`.
If a build still reports `v18.x` and dies on
`Prisma only supports Node.js versions 20.19+`, add a service variable
`NIXPACKS_NODE_VERSION=22` in the Railway dashboard — that setting wins over
everything in the repo.

## Deploying to Render

This repo includes a `render.yaml` Blueprint that provisions both services in one step:

1. Push this repo to GitHub (or GitLab/Bitbucket).
2. In the Render dashboard, choose **New > Blueprint** and point it at the repo. Render will read `render.yaml` and create:
   - a **web service** (`warehouse-dashboard`) running `npm run build` / `npm run start`, with `prisma migrate deploy` run automatically as a pre-deploy step
   - a **PostgreSQL database** (`warehouse-db`), wired to the web service's `DATABASE_URL` automatically
3. `NEXTAUTH_SECRET` is generated automatically by Render. Set `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` in the web service's environment variables if you want a specific first admin login, then run the seed once from the Render shell:
   ```bash
   npx prisma db seed
   ```
4. Once deployed, Render gives you a public URL (`https://<service-name>.onrender.com`) — that's your live dashboard + admin panel.

**Locked out?** Set `SEED_ADMIN_USERNAME` (defaults to `admin`) and a new `SEED_ADMIN_PASSWORD` in the web service's environment, then redeploy. On startup the seed resets that account's password and restores full admin access — the account-recovery path when no admin can sign in.

**Access levels:** each employee's *Panel access* is No login, **Lead**, **Supervisor**, **Admin** (full control of their own location), or **SuperUser** (full control of every location). Supervisor/Lead/Admin are confined to the location their account belongs to; only a SuperUser can switch locations, manage locations, and drive the fleet — and only a SuperUser can grant SuperUser.

**Built-in superadmin:** a protected `superadmin` SuperUser account is always seeded and can't be deleted or demoted, so a deployment can't lock itself out. Set `SUPERADMIN_PASSWORD` in the environment to set/reset its password (on first create without it, a default of `superadmin` is used — set the variable and redeploy to secure it).

**Note:** Render's free PostgreSQL databases expire after 30 days. For anything beyond a demo, upgrade `warehouse-db` to a paid plan in `render.yaml` (or the dashboard) before that happens.

## Self-hosting (mini PC / LAN)

Two paths, both bundling the app + Postgres via Docker Compose:

- **Build locally** — `docker-compose.yml` builds from `Dockerfile.selfhost`. Needs ~4–6 GB free for the build:
  ```bash
  cp .env.docker.example .env    # set NEXTAUTH_SECRET, SUPERADMIN_PASSWORD, …
  docker compose up -d --build
  ```
- **Run a prebuilt image (recommended for modest boxes)** — GitHub Actions builds the image on every push to `master` and publishes it to `ghcr.io/hankalf/worker-dashboard`, so the box only pulls & runs it (no compile). If the package is private, run `docker login ghcr.io -u <github-user>` once (PAT with `read:packages`), then:
  ```bash
  cp .env.docker.example .env
  docker compose -f docker-compose.prebuilt.yml pull
  docker compose -f docker-compose.prebuilt.yml up -d
  ```
  Update later with `docker compose -f docker-compose.prebuilt.yml pull && docker compose -f docker-compose.prebuilt.yml up -d`.

Either way the container migrates, seeds the admin/superadmin, and serves on `http://<box-ip>:${APP_PORT:-3000}`. Point wall displays at `/screen/<token>`.

## Embedding the dashboard in another app (Monday, etc.)

The dashboard can run inside an iframe in another product — a Monday board view,
for example. Two things have to be true, and having one without the other is
what makes it look broken:

**The other site must be allowed to frame it.** Sent as a
`Content-Security-Policy: frame-ancestors` header. `EMBED_FRAME_ANCESTORS`
controls it and **defaults to Monday**:

```
EMBED_FRAME_ANCESTORS="https://*.monday.com https://*.monday.app"
```

Space- or comma-separated; `'self'` is always included. Set it to `none` to
forbid embedding. Monday nests app views (`*.monday.app`) inside
`*.monday.com`, and `frame-ancestors` is checked against every frame in the
chain, so both are needed. `X-Frame-Options` is deliberately never sent — it
has no wildcard syntax and browsers honour the stricter of the two, so adding
it would override this.

**Cookies must survive being third-party.** Inside an iframe the browser treats
the dashboard's cookies as cross-site, and the default `SameSite=Lax` means
they are not sent at all. The login POST succeeds, the session cookie comes
back, and the next request arrives with no session — which reads as "I can't
log in" even though the password was fine. So when embedding is enabled the
session, CSRF, callback-url and active-location cookies are issued with
`SameSite=None; Secure; Partitioned`.

`Partitioned` ([CHIPS](https://developers.google.com/privacy-sandbox/3pcd/chips))
is what keeps this from being a blanket third-party cookie: the cookie is stored
against the embedding site, so a session created inside Monday is only ever sent
back inside Monday. Chrome is phasing out unpartitioned third-party cookies, so
the alternative is a session that stops working later rather than one that works
now.

Two consequences worth knowing up front:

- **Signing in at the dashboard's own URL and signing in inside Monday are two
  separate logins.** Partitioned cookies live in separate jars per embedding
  site. That is inherent to CHIPS, not a choice this code makes.
- **It only applies in production.** `SameSite=None` is invalid without
  `Secure`, and `Secure` cookies are dropped over plain HTTP, so enabling it in
  local development would break signing in at `localhost` rather than fix
  anything. Testing the embed locally needs HTTPS (a tunnel such as `ngrok`),
  not a code change.

`EMBED_FRAME_ANCESTORS` is read when the server starts, so changing it needs a
redeploy (Railway redeploys on a variable change by default). Note the small
asymmetry if you set it to `none`: the cookies revert as soon as the process
restarts, but the CSP header is baked into the build output and goes on being
sent until the next deploy. Framing stops working either way, because the
session cookie is no longer sent.

## Project structure

```
prisma/schema.prisma                Data model: Employee, Role, Position, Tab, Job
prisma/seed.ts                      Creates the first admin employee
public/employee-import-sample.csv   Sample CSV for bulk employee import
src/lib/auth.ts                     NextAuth config (Node runtime, used by API routes/pages)
src/lib/auth.config.ts              Edge-safe subset of the auth config, used by src/proxy.ts
src/lib/csv.ts                      Dependency-free CSV parser for the import endpoint
src/proxy.ts                        Redirects logged-out visitors away from /admin/*
src/app/api/                        REST endpoints: jobs, employees (+import), positions, roles, tabs
src/app/page.tsx                    Public dashboard (light/dark toggle)
src/app/admin/                      Dark-mode admin panel pages
render.yaml                         Render Blueprint (web service + Postgres)
```
