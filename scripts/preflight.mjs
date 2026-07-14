// Runtime preflight: verify required config is present before we try to reach
// the database, so a misconfigured host fails with an obvious message instead
// of Prisma's generic "Connection url is empty".
const required = {
  DATABASE_URL:
    "the PostgreSQL connection string (Railway: reference ${{Postgres.DATABASE_URL}})",
  NEXTAUTH_SECRET:
    "any long random string for signing sessions (openssl rand -base64 32)",
};

const missing = Object.keys(required).filter(
  (key) => !process.env[key] || !process.env[key].trim()
);

if (missing.length) {
  console.error(
    "\n────────────────────────────────────────────────────────────"
  );
  console.error(" Startup blocked: missing required environment variable(s)");
  console.error(
    "────────────────────────────────────────────────────────────"
  );
  for (const key of missing) {
    console.error(`  • ${key} — ${required[key]}`);
  }
  console.error(
    "\n Set these on your host and redeploy. On Railway: open the app"
  );
  console.error(
    " service → Variables. On Docker/compose: put them in your .env."
  );
  console.error(
    "────────────────────────────────────────────────────────────\n"
  );
  process.exit(1);
}

console.log("[preflight] Required environment variables present.");
