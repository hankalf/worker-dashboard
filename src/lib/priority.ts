// Side-task priority is stored as an Int; higher = more urgent (and sorts first).
export const PRIORITY_LEVELS: { value: number; label: string }[] = [
  { value: 0, label: "Normal" },
  { value: 1, label: "High" },
  { value: 2, label: "Urgent" },
];

export function priorityLabel(p: number): string {
  return p >= 2 ? "Urgent" : p === 1 ? "High" : "Normal";
}

// Badge classes; Normal returns null (no badge shown).
export function priorityBadgeClass(p: number): string | null {
  if (p >= 2)
    return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
  if (p === 1)
    return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  return null;
}
