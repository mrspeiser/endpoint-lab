import { Channel, invoke, isTauri } from "@tauri-apps/api/core";

import type {
  BenchConfig,
  BenchSnapshot,
  BenchSummary,
  BodySummary,
  CollectionSummary,
  DomainSummary,
  EngineLimits,
  ErrorView,
  HeaderEntry,
  HeaderSummary,
  HistoryEntry,
  HttpRequest,
  HttpResponse,
  LoadedBody,
  LoadedHeaders,
  Method,
  PathSummary,
  RequestBody,
  StoreStatus,
} from "../types";
import { FALLBACK_LIMITS } from "../types";

export function desktopAvailable(): boolean {
  return isTauri();
}

export function asError(error: unknown): ErrorView {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string") {
      return {
        code: typeof record.code === "string" ? record.code : "internal",
        message: record.message,
      };
    }
  }
  if (typeof error === "string") {
    try {
      const parsed = JSON.parse(error) as unknown;
      if (parsed && typeof parsed === "object" && "message" in parsed) {
        return asError(parsed);
      }
    } catch {
      return { code: "internal", message: error };
    }
    return { code: "internal", message: error };
  }
  return { code: "internal", message: "The request failed." };
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw asError(error);
  }
}

export function loadLimits(): Promise<EngineLimits> {
  if (!desktopAvailable()) return Promise.resolve(FALLBACK_LIMITS);
  return call<EngineLimits>("engine_limits").catch(() => FALLBACK_LIMITS);
}

export function loadStoreStatus(): Promise<StoreStatus> {
  return call<StoreStatus>("store_status");
}

export function sendRequest(invocationId: string, request: HttpRequest): Promise<HttpResponse> {
  return call<HttpResponse>("send_request", { invocationId, request });
}

export function cancelRequest(invocationId: string): Promise<void> {
  return call("cancel_request", { invocationId });
}

export function listDomains(): Promise<DomainSummary[]> {
  return call("list_domains");
}

export function createDomain(name: string): Promise<DomainSummary> {
  return call("create_domain", { name });
}

export function renameDomain(id: string, name: string): Promise<void> {
  return call("rename_domain", { id, name });
}

export function deleteDomain(id: string): Promise<void> {
  return call("delete_domain", { id });
}

export function reorderDomains(ids: string[]): Promise<void> {
  return call("reorder_domains", { ids });
}

export function createCollection(domainId: string, name: string, baseUrl: string): Promise<CollectionSummary> {
  return call("create_collection", { domainId, name, baseUrl });
}

export function renameCollection(domainId: string, id: string, name: string): Promise<void> {
  return call("rename_collection", { domainId, id, name });
}

export function updateCollection(domainId: string, id: string, name: string, baseUrl: string): Promise<void> {
  return call("update_collection", { domainId, id, name, baseUrl });
}

export function deleteCollection(domainId: string, id: string): Promise<void> {
  return call("delete_collection", { domainId, id });
}

export function reorderCollections(domainId: string, ids: string[]): Promise<void> {
  return call("reorder_collections", { domainId, ids });
}

export function saveHeaders(
  domainId: string,
  collectionId: string,
  name: string,
  headers: HeaderEntry[],
): Promise<HeaderSummary> {
  return call("save_headers", { domainId, collectionId, name, headers });
}

export function renameHeaders(
  domainId: string,
  collectionId: string,
  headerId: string,
  name: string,
): Promise<void> {
  return call("rename_headers", { domainId, collectionId, headerId, name });
}

export function updateHeaders(
  domainId: string,
  collectionId: string,
  headerId: string,
  name: string,
  headers: HeaderEntry[],
): Promise<HeaderSummary> {
  return call("update_headers", { domainId, collectionId, headerId, name, headers });
}

export function deleteHeaders(domainId: string, collectionId: string, headerId: string): Promise<void> {
  return call("delete_headers", { domainId, collectionId, headerId });
}

export function importHeaders(domainId: string, collectionId: string, raw: string): Promise<number> {
  return call("import_headers", { domainId, collectionId, raw });
}

export function reorderHeaders(domainId: string, collectionId: string, ids: string[]): Promise<void> {
  return call("reorder_headers", { domainId, collectionId, ids });
}

export function loadHeaders(
  domainId: string,
  collectionId: string,
  headerId: string,
): Promise<LoadedHeaders> {
  return call("load_headers", { domainId, collectionId, headerId });
}

export function savePath(
  domainId: string,
  collectionId: string,
  method: Method,
  path: string,
): Promise<PathSummary> {
  return call("save_path", { domainId, collectionId, method, path });
}

export function updatePath(
  domainId: string,
  collectionId: string,
  pathId: string,
  method: Method,
  path: string,
): Promise<PathSummary> {
  return call("update_path", { domainId, collectionId, pathId, method, path });
}

export function deletePath(domainId: string, collectionId: string, pathId: string): Promise<void> {
  return call("delete_path", { domainId, collectionId, pathId });
}

export function importPaths(domainId: string, collectionId: string, raw: string): Promise<number> {
  return call("import_paths", { domainId, collectionId, raw });
}

export function reorderPaths(domainId: string, collectionId: string, ids: string[]): Promise<void> {
  return call("reorder_paths", { domainId, collectionId, ids });
}

export function saveBody(
  domainId: string,
  collectionId: string,
  name: string,
  body: RequestBody,
): Promise<BodySummary> {
  return call("save_body", { domainId, collectionId, name, body });
}

export function renameBody(
  domainId: string,
  collectionId: string,
  bodyId: string,
  name: string,
): Promise<void> {
  return call("rename_body", { domainId, collectionId, bodyId, name });
}

export function updateBody(
  domainId: string,
  collectionId: string,
  bodyId: string,
  name: string,
  body: RequestBody,
): Promise<BodySummary> {
  return call("update_body", { domainId, collectionId, bodyId, name, body });
}

export function deleteBody(domainId: string, collectionId: string, bodyId: string): Promise<void> {
  return call("delete_body", { domainId, collectionId, bodyId });
}

export function importBodies(domainId: string, collectionId: string, raw: string): Promise<number> {
  return call("import_bodies", { domainId, collectionId, raw });
}

export function reorderBodies(domainId: string, collectionId: string, ids: string[]): Promise<void> {
  return call("reorder_bodies", { domainId, collectionId, ids });
}

export function loadBody(domainId: string, collectionId: string, bodyId: string): Promise<LoadedBody> {
  return call("load_body", { domainId, collectionId, bodyId });
}

export function listHistory(): Promise<HistoryEntry[]> {
  return call("list_history");
}

export function clearHistory(): Promise<void> {
  return call("clear_history");
}

export function reorderHistory(ids: string[]): Promise<void> {
  return call("reorder_history", { ids });
}

export function listBenchmarks(): Promise<BenchSummary[]> {
  return call("list_benchmarks");
}

export function cancelBenchmark(): Promise<void> {
  return call("cancel_benchmark");
}

export function runBenchmark(
  config: BenchConfig,
  onProgress: (snapshot: BenchSnapshot) => void,
): Promise<BenchSummary> {
  const channel = new Channel<BenchSnapshot>(onProgress);
  return call<BenchSummary>("run_benchmark", { config, onProgress: channel });
}
