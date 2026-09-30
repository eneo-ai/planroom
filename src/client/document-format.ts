import { documentStatusLabels, type Role } from "@/contracts";

export const statuses = documentStatusLabels;
export const statusOptions = Object.entries(statuses).map(([value, label]) => ({
  value,
  label,
}));
export const roles: Record<Role, string> = {
  admin: "Administratör",
  editor: "Redaktör",
  viewer: "Läsare",
};
export function formatDate(value: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Stockholm",
  }).format(new Date(value));
}
