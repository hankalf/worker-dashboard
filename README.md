# Warehouse Dashboard

A warehouse job dashboard with a dark-mode admin panel for managing jobs, tabs (job categories), employees, positions, and roles.

- **Dashboard** (`/`) — public, no login needed, with a light/dark mode toggle. Shows jobs grouped into tabs (e.g. Receiving, Shipping, Inventory) with status, assigned employee, and due date. Put it on a wall screen or let anyone open it on any device.
- **Admin panel** (`/admin`) — login required, dark themed. Full CRUD for jobs, employees, positions, roles, and tabs, plus job assignment and status updates.
- **Employees** are managed by admins. Each employee has a position and a set of **roles** (what they can do — e.g. Picking, Forklift). Employees who need admin access get a username + password and can sign in; everyone else has no account.
- **CSV import** — bulk-add employees from a CSV file (Admin Panel > Employees), with a downloadable sample showing the format. Unknown positions and roles are created automatically.
- **Stack** — Next.js (App Router, TypeScript), Prisma + PostgreSQL, Auth.js (NextAuth v5) with username/password credentials.

## Local development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — a PostgreSQL connection string
   - `NEXTAUTH_SECRET` — any random string (`npx auth secret` can generate one)
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

**Note:** Render's free PostgreSQL databases expire after 30 days. For anything beyond a demo, upgrade `warehouse-db` to a paid plan in `render.yaml` (or the dashboard) before that happens.

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
