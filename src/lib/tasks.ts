// Side-task (Job) due-date helpers. A task's due date is stored as UTC midnight
// of the picked calendar day (see the jobs API), so we read it back in UTC and
// compare it against the warehouse's Eastern calendar day.
import { easternDateKey } from "./time";

// How a task's due date sits relative to "now":
//   overdue    — due day is in the past and the task isn't done yet
//   due-today  — due day is today and the task isn't done yet
//   none       — no due date, already done, or due in the future
export type DueState = "none" | "overdue" | "due-today";

// The UTC calendar day ("YYYY-MM-DD") of a stored due date.
function dueDateKey(dueDate: string | Date): string {
  const d = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  return d.toISOString().slice(0, 10);
}

// Classify a side task's due date relative to `now`. Done tasks and tasks with
// no due date are never flagged, so finished/undated work never nags.
export function taskDueState(
  dueDate: string | Date | null,
  status: string,
  now: Date
): DueState {
  if (!dueDate || status === "DONE") return "none";
  const due = dueDateKey(dueDate);
  const today = easternDateKey(now);
  if (due < today) return "overdue";
  if (due === today) return "due-today";
  return "none";
}

export const DUE_STATE_LABEL: Record<Exclude<DueState, "none">, string> = {
  overdue: "Overdue",
  "due-today": "Due today",
};

// Badge classes for a due state; `none` returns null (no badge shown).
export function dueStateBadgeClass(state: DueState): string | null {
  if (state === "overdue")
    return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
  if (state === "due-today")
    return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  return null;
}
