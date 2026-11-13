import fixture from "../fixtures/ipc-shapes.json";

import type { BenchSnapshot, BenchSummary, HttpRequest, HttpResponse } from "../types";

// Shape contract for the Tauri IPC payloads. The numbers are examples, not measurements.
export function ipcShapeContract(): {
  request: HttpRequest;
  response: HttpResponse;
  snapshot: BenchSnapshot;
  summary: BenchSummary;
} {
  return {
    request: fixture.request,
    response: fixture.response,
    snapshot: fixture.snapshot,
    summary: fixture.summary,
  };
}
