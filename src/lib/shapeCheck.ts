import fixture from "../fixtures/ipc-shapes.json";

import type {
  BenchPhase,
  BenchSnapshot,
  BenchSummary,
  HttpRequest,
  HttpResponse,
  Method,
  RequestBody,
  ResponseBody,
} from "../types";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] as const satisfies readonly Method[];
const PHASES = ["warmup", "measure", "done"] as const satisfies readonly BenchPhase[];

function methodOf(value: string): Method {
  const found = METHODS.find((item) => item === value);
  if (!found) throw new Error(`fixture method ${value}`);
  return found;
}

function phaseOf(value: string): BenchPhase {
  const found = PHASES.find((item) => item === value);
  if (!found) throw new Error(`fixture phase ${value}`);
  return found;
}

function requestBody(body: { kind: string; value?: string }): RequestBody {
  if (body.kind === "none") return { kind: "none" };
  if (body.kind === "json" && body.value !== undefined) return { kind: "json", value: body.value };
  if (body.kind === "text" && body.value !== undefined) return { kind: "text", value: body.value };
  throw new Error(`fixture request body ${body.kind}`);
}

function responseBody(body: { kind: string; content?: string; pretty?: boolean; message?: string }): ResponseBody {
  if (body.kind === "empty") return { kind: "empty" };
  if (body.kind === "text" && body.content !== undefined && body.pretty !== undefined) {
    return { kind: "text", content: body.content, pretty: body.pretty };
  }
  if (body.kind === "binary" && body.message !== undefined) return { kind: "binary", message: body.message };
  throw new Error(`fixture response body ${body.kind}`);
}

// Shape contract for the Tauri IPC payloads. The numbers are examples, not measurements.
export function ipcShapeContract(): {
  request: HttpRequest;
  response: HttpResponse;
  snapshot: BenchSnapshot;
  summary: BenchSummary;
} {
  return {
    request: {
      ...fixture.request,
      method: methodOf(fixture.request.method),
      body: requestBody(fixture.request.body),
    },
    response: {
      ...fixture.response,
      body: responseBody(fixture.response.body),
    },
    snapshot: {
      ...fixture.snapshot,
      phase: phaseOf(fixture.snapshot.phase),
    },
    summary: {
      ...fixture.summary,
      method: methodOf(fixture.summary.method),
    },
  };
}
