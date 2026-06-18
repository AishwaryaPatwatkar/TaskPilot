import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  // Simple class merger without the clsx dependency for now
  return inputs
    .flat()
    .filter(Boolean)
    .join(" ");
}

export function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatRelative(iso: string): string {
  try {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return `${Math.round(diff)}s ago`;
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
    return `${Math.round(diff / 86400)}d ago`;
  } catch {
    return iso;
  }
}

export function truncateId(id: string): string {
  return id.slice(0, 8) + "…";
}
