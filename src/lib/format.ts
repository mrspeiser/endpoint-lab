import type { HttpRequest } from "../types";

const SENSITIVE = [
  "authorization",
  "cookie",
  "proxy-authorization",
  "set-cookie",
  "x-api-key",
  "api-key",
  "apikey",
  "x-api-token",
  "x-auth-token",
  "x-access-token",
  "token",
  "access-token",
  "secret",
  "password",
  "passwd",
  "auth",
];

export function isSensitiveName(name: string): boolean {
  const normalized = name.trim().toLowerCase().replaceAll("_", "-");
  if (!normalized) return false;
  return (
    SENSITIVE.includes(normalized) ||
    normalized.includes("api-key") ||
    normalized.includes("apikey") ||
    normalized.includes("token") ||
    normalized.includes("secret") ||
    normalized.includes("password") ||
    normalized.includes("authorization")
  );
}

export function isLoopbackUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
    if (host.toLowerCase() === "localhost" || host === "::1") return true;
    const ipv4 = host.split(".");
    return ipv4.length === 4 && ipv4[0] === "127" && ipv4.every((part) => /^\d+$/.test(part));
  } catch {
    return false;
  }
}

export function replaceUrlPath(raw: string, path: string): string | null {
  try {
    const url = new URL(raw.trim());
    url.pathname = path.startsWith("/") ? path : `/${path}`;
    return url.toString();
  } catch {
    return null;
  }
}

export function previewUrl(request: HttpRequest): string {
  try {
    const url = new URL(request.url.trim());
    for (const param of request.query) {
      if (param.enabled && param.name.trim()) {
        url.searchParams.append(param.name.trim(), param.value);
      }
    }
    return url.toString();
  } catch {
    return request.url;
  }
}

export function formatBytes(bytes: number, exact = true): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const shown = unit === 0 ? `${Math.round(bytes)} B` : `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
  return exact ? shown : `at least ${shown}`;
}

export function formatUs(us: number): string {
  if (!Number.isFinite(us) || us <= 0) return "0 µs";
  if (us < 1000) return `${Math.round(us)} µs`;
  const ms = us / 1000;
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 2 : 1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatRps(rps: number): string {
  if (!Number.isFinite(rps)) return "0";
  if (rps >= 100) return rps.toFixed(0);
  if (rps >= 10) return rps.toFixed(1);
  return rps.toFixed(2);
}

export function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatHistLabel(leUs: number, last: boolean): string {
  if (last) return `>${formatUs(leUs).replace(/ .*/, "")}`;
  return formatUs(leUs);
}

export function statusClass(status: number): string {
  if (status >= 500) return "bad";
  if (status >= 400) return "warn";
  if (status >= 300) return "info";
  if (status >= 200) return "ok";
  return "muted";
}
