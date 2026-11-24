import type { CollectionSummary, HttpRequest } from "../types";

export type ExportFormat = "json" | "curl" | "http";

export function exportRequest(request: HttpRequest, format: ExportFormat): string {
  if (format === "json") {
    return JSON.stringify(request, null, 2);
  } else if (format === "http") {
    return formatAsHttp(request);
  }
  return "";
}

export function exportAsCurl(request: HttpRequest): string {
  const parts: string[] = ["curl"];

  parts.push(`-X ${request.method}`);
  parts.push(`'${request.url}'`);

  const enabledHeaders = request.headers.filter((h) => h.enabled && h.name.trim() !== "");
  for (const header of enabledHeaders) {
    const value = header.secret ? "***" : header.value;
    parts.push(`-H '${header.name}: ${value}'`);
  }

  if (request.body.kind === "json") {
    parts.push(`-H 'Content-Type: application/json'`);
    parts.push(`-d '${request.body.value.replace(/'/g, "'\\''")}'`);
  } else if (request.body.kind === "text") {
    parts.push(`-d '${request.body.value.replace(/'/g, "'\\''")}'`);
  }

  return parts.join(" \\\n  ");
}

function formatAsHttp(request: HttpRequest): string {
  const lines: string[] = [];
  
  const url = new URL(request.url);
  lines.push(`${request.method} ${url.pathname}${url.search} HTTP/1.1`);
  lines.push(`Host: ${url.host}`);
  
  const enabledHeaders = request.headers.filter((h) => h.enabled && h.name.trim() !== "");
  for (const header of enabledHeaders) {
    const value = header.secret ? "***" : header.value;
    lines.push(`${header.name}: ${value}`);
  }

  if (request.body.kind === "json") {
    if (!enabledHeaders.some((h) => h.name.toLowerCase() === "content-type")) {
      lines.push("Content-Type: application/json");
    }
    lines.push("");
    lines.push(request.body.value);
  } else if (request.body.kind === "text") {
    lines.push("");
    lines.push(request.body.value);
  }

  return lines.join("\n");
}

export function exportCollection(collection: CollectionSummary, format: ExportFormat): string {
  if (format === "json") {
    return JSON.stringify(
      {
        name: collection.name,
        baseUrl: collection.baseUrl,
        paths: collection.paths,
        headers: collection.headers,
        bodies: collection.bodies,
      },
      null,
      2
    );
  } else if (format === "http") {
    const lines: string[] = [];
    lines.push(`# Collection: ${collection.name}`);
    lines.push(`# Base URL: ${collection.baseUrl}`);
    lines.push("");

    for (const path of collection.paths) {
      lines.push(`### ${path.method} ${path.path}`);
      const fullUrl = collection.baseUrl + path.path;
      const mockRequest: HttpRequest = {
        method: path.method,
        url: fullUrl,
        headers: [],
        query: [],
        body: { kind: "none" },
        timeoutMs: 30000,
      };
      lines.push(formatAsHttp(mockRequest));
      lines.push("");
    }

    return lines.join("\n");
  } else if (format === "curl") {
    const lines: string[] = [];
    lines.push(`# Collection: ${collection.name}`);
    lines.push(`# Base URL: ${collection.baseUrl}`);
    lines.push("");

    for (const path of collection.paths) {
      lines.push(`# ${path.method} ${path.path}`);
      const fullUrl = collection.baseUrl + path.path;
      const mockRequest: HttpRequest = {
        method: path.method,
        url: fullUrl,
        headers: [],
        query: [],
        body: { kind: "none" },
        timeoutMs: 30000,
      };
      lines.push(exportAsCurl(mockRequest));
      lines.push("");
    }

    return lines.join("\n");
  }

  return "";
}
