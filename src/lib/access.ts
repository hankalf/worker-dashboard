// Panel-access levels, ordered by privilege. Client-safe (no DB/server imports)
// so both the nav and route guards can share it.
//
//  NONE       — no panel login
//  LEAD       — Admin Dashboard, Notices, Assign, Lunches, Side Tasks
//  SUPERVISOR — the above + Attendance
//  ADMIN      — full control (incl. Setup)
export type AccessLevel = "NONE" | "LEAD" | "SUPERVISOR" | "ADMIN";

export const ACCESS_RANK: Record<AccessLevel, number> = {
  NONE: 0,
  LEAD: 1,
  SUPERVISOR: 2,
  ADMIN: 3,
};

// True when `level` meets or exceeds `min`.
export function atLeast(
  level: string | null | undefined,
  min: AccessLevel
): boolean {
  const r = ACCESS_RANK[(level as AccessLevel) ?? "NONE"] ?? 0;
  return r >= ACCESS_RANK[min];
}
