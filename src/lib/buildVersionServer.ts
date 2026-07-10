import { prisma } from "@/lib/prisma";

// Auto-incrementing build version shown in the admin header. Starts at V2 and
// bumps by 1 each time a NEW deploy goes out — detected by the deployed commit
// (Render sets RENDER_GIT_COMMIT) changing from the last one we recorded.
//
// State lives in the Setting table (buildNumber + buildCommit), so each
// environment (dev / prod) keeps its own independent count and restarts of the
// same deploy never inflate it. No-ops locally where there's no commit id.

const START = 2;

export async function getBuildVersion(): Promise<string> {
  const commit = process.env.RENDER_GIT_COMMIT ?? "";
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { in: ["buildNumber", "buildCommit"] } },
    });
    const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    let n = Number(m.buildNumber);
    if (!Number.isFinite(n) || n < START) n = START;
    const storedCommit = m.buildCommit ?? "";

    const persist = async (num: number, sha: string) => {
      await prisma.setting.upsert({
        where: { key: "buildNumber" },
        update: { value: String(num) },
        create: { key: "buildNumber", value: String(num) },
      });
      await prisma.setting.upsert({
        where: { key: "buildCommit" },
        update: { value: sha },
        create: { key: "buildCommit", value: sha },
      });
    };

    if (commit) {
      if (!storedCommit) {
        // First deploy that records a commit — pin at the current number.
        await persist(n, commit);
      } else if (commit !== storedCommit) {
        // A new deploy went out — count up once.
        n += 1;
        await persist(n, commit);
      }
    } else if (m.buildNumber === undefined) {
      // Local/dev with no commit id — make sure the starting number exists.
      await persist(n, storedCommit);
    }

    return `V${n}`;
  } catch {
    return `V${START}`;
  }
}
