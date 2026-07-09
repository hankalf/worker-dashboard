import { easternDateKey } from "@/lib/time";

// Today's calendar day in the warehouse timezone as "YYYY-MM-DD".
export function todayKey(now: Date): string {
  return easternDateKey(now);
}

// If today is the hire anniversary, the years of service (>= 1); else null.
// Dates are "YYYY-MM-DD"; comparing the "MM-DD" tail avoids timezone drift.
export function anniversaryYears(
  hireDate: string | null | undefined,
  today: string
): number | null {
  if (!hireDate || hireDate.slice(5) !== today.slice(5)) return null;
  const years = Number(today.slice(0, 4)) - Number(hireDate.slice(0, 4));
  return years >= 1 ? years : null;
}

// Years of service (>= 1) if this month is the employee's hire-anniversary
// month; else null. Anniversaries are recognised on the card all month.
export function anniversaryYearsThisMonth(
  hireDate: string | null | undefined,
  today: string
): number | null {
  if (!hireDate || hireDate.slice(5, 7) !== today.slice(5, 7)) return null;
  const years = Number(today.slice(0, 4)) - Number(hireDate.slice(0, 4));
  return years >= 1 ? years : null;
}

// Whether today is the employee's birthday.
export function isBirthday(
  birthDate: string | null | undefined,
  today: string
): boolean {
  return !!birthDate && birthDate.slice(5) === today.slice(5);
}
