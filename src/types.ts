export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

export interface HeaderEntry {
  name: string;
  value: string;
  enabled: boolean;
  secret: boolean;
  secretRef?: string;
}

export interface QueryParam {
  name: string;
  value: string;
  enabled: boolean;
  secret: boolean;
  secretRef?: string;
}

export type RequestBody =
  | { kind: "none" }
  | { kind: "json"; value: string }
  | { kind: "text"; value: string };

export interface UrlSecretRef {
  slot: string;
  secretRef: string;
}

export interface HttpRequest {
  method: Method;
  url: string;
  headers: HeaderEntry[];
  query: QueryParam[];
  body: RequestBody;
  timeoutMs: number;
  urlSecretRefs?: UrlSecretRef[];
}

export interface HeaderView {
  name: string;
  value: string;
}

export type ResponseBody =
  | { kind: "empty" }
  | { kind: "text"; content: string; pretty: boolean }
  | { kind: "binary"; message: string };

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: HeaderView[];
  body: ResponseBody;
  sizeBytes: number;
  sizeExact: boolean;
  truncated: boolean;
  elapsedMs: number;
}

export interface ErrorView {
  code: string;
  message: string;
}

export type BenchPhase = "warmup" | "measure" | "done";

export interface ErrorCount {
  cause: string;
  count: number;
}

export interface HistBar {
  leUs: number;
  count: number;
}

export interface LatencySummary {
  meanUs: number;
  minUs: number;
  maxUs: number;
  p50Us: number;
  p90Us: number;
  p95Us: number;
  p99Us: number;
}

export interface BenchSnapshot {
  phase: BenchPhase;
  elapsedMs: number;
  total: number;
  success: number;
  httpErrors: number;
  transportErrors: number;
  cancelledAttempts: number;
  inFlight: number;
  rps: number;
  latency: LatencySummary;
  bytes: number;
  errors: ErrorCount[];
  histogram: HistBar[];
}

export interface BenchSummary {
  id: string;
  startedAtMs: number;
  elapsedMs: number;
  method: Method;
  url: string;
  totalRequests: number;
  concurrency: number;
  durationMs: number | null;
  timeoutMs: number;
  warmupRequests: number;
  total: number;
  success: number;
  httpErrors: number;
  transportErrors: number;
  cancelledAttempts: number;
  rps: number;
  latency: LatencySummary;
  bytes: number;
  errors: ErrorCount[];
  histogram: HistBar[];
  cancelled: boolean;
}

export interface BenchConfig {
  request: HttpRequest;
  totalRequests: number;
  concurrency: number;
  durationMs: number | null;
  timeoutMs: number;
  warmupRequests: number;
  authorizeRemote: boolean;
}

export interface EngineLimits {
  maxRequests: number;
  maxConcurrency: number;
  maxDurationMs: number;
  maxTimeoutMs: number;
  defaultTimeoutMs: number;
  previewLimitBytes: number;
  historyLimit: number;
  benchmarkHistoryLimit: number;
}

export interface StoreStatus {
  ok: boolean;
  message: string | null;
}

export interface RequestSummary {
  id: string;
  name: string;
  method: Method;
  url: string;
  updatedAtMs: number;
}

export interface CollectionSummary {
  id: string;
  name: string;
  requests: RequestSummary[];
}

export interface LoadedRequest {
  id: string;
  collectionId: string;
  name: string;
  request: HttpRequest;
}

export interface HistoryEntry {
  id: string;
  atMs: number;
  request: HttpRequest;
  ok: boolean;
  status: number | null;
  elapsedMs: number | null;
  error: string | null;
}

export const FALLBACK_LIMITS: EngineLimits = {
  maxRequests: 100_000,
  maxConcurrency: 200,
  maxDurationMs: 600_000,
  maxTimeoutMs: 120_000,
  defaultTimeoutMs: 30_000,
  previewLimitBytes: 1_048_576,
  historyLimit: 200,
  benchmarkHistoryLimit: 50,
};

export function emptyRequest(): HttpRequest {
  return {
    method: "GET",
    url: "http://127.0.0.1:8080/",
    headers: [{ name: "", value: "", enabled: true, secret: false }],
    query: [{ name: "", value: "", enabled: true, secret: false }],
    body: { kind: "none" },
    timeoutMs: 30_000,
  };
}
