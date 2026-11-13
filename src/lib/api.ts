import { Channel, invoke, isTauri } from "@tauri-apps/api/core";

import type {
  BenchConfig,
  BenchSnapshot,
  BenchSummary,
  CollectionSummary,
  EngineLimits,
  ErrorView,
  HistoryEntry,
  HttpRequest,
  HttpResponse,
  LoadedRequest,
  RequestSummary,
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

export function listCollections(): Promise<CollectionSummary[]> {
  return call("list_collections");
}

export function createCollection(name: string): Promise<CollectionSummary> {
  return call("create_collection", { name });
}

export function renameCollection(id: string, name: string): Promise<void> {
  return call("rename_collection", { id, name });
}

export function deleteCollection(id: string): Promise<void> {
  return call("delete_collection", { id });
}

export function saveRequest(
  collectionId: string,
  name: string,
  request: HttpRequest,
): Promise<RequestSummary> {
  return call("save_request", { collectionId, name, request });
}

export function updateRequest(
  collectionId: string,
  requestId: string,
  name: string,
  request: HttpRequest,
): Promise<RequestSummary> {
  return call("update_request", { collectionId, requestId, name, request });
}

export function deleteRequest(collectionId: string, requestId: string): Promise<void> {
  return call("delete_request", { collectionId, requestId });
}

export function loadRequest(collectionId: string, requestId: string): Promise<LoadedRequest> {
  return call("load_request", { collectionId, requestId });
}

export function listHistory(): Promise<HistoryEntry[]> {
  return call("list_history");
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
