# Warehouse Dashboard — self-host image (mini PC / LAN box)
# Multi-stage build: install deps, generate the Prisma client, build Next,
# then ship a lean runtime that migrates the DB and starts the server.

# ---- deps: install all dependencies (incl. dev) for the build ----------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# openssl is needed by Prisma's query engine at build + runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# Skip lifecycle scripts here (prisma/sharp postinstall) — we generate Prisma
# explicitly in the build stage against the copied schema.
RUN npm ci --ignore-scripts

# ---- build: generate Prisma client + compile the Next app --------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma client is gitignored (src/generated/prisma) — generate it now.
RUN npx prisma generate
# NEXTAUTH_SECRET is only needed at runtime; a placeholder keeps the build happy.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runner: production runtime ---------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# App artifacts and the full dependency tree (Prisma migrate/seed run at start).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/src/generated ./src/generated
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json

# Run as the unprivileged node user shipped in the base image.
RUN chown -R node:node /app
USER node

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Apply pending migrations, ensure an admin exists (idempotent seed), then serve.
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && npm run start"]
