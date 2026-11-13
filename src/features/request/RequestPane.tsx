import { useState } from "react";

import { previewUrl } from "../../lib/format";
import { useLab } from "../../state/lab";
import type { Method, RequestBody } from "../../types";
import { KeyValueTable } from "./KeyValueTable";
import { ResponseView } from "./ResponseView";

const METHODS: Method[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];
type Tab = "query" | "headers" | "body" | "timeout";

export function RequestPane() {
  const { state, dispatch, send, cancelSend } = useLab();
  const [tab, setTab] = useState<Tab>("query");
  const { request } = state;
  const bodyValue = request.body.kind === "none" ? "" : request.body.value;

  const setBody = (body: RequestBody) => dispatch({ type: "request", request: { ...request, body } });

  return (
    <div className="request-layout">
      <section className="editor">
        <div className="url-row">
          <select
            className={`method method-${request.method.toLowerCase()}`}
            aria-label="Method"
            value={request.method}
            onChange={(event) =>
              dispatch({
                type: "request",
                request: { ...request, method: event.target.value as Method },
              })
            }
          >
            {METHODS.map((method) => (
              <option key={method}>{method}</option>
            ))}
          </select>
          <input
            className="url"
            aria-label="URL"
            value={request.url}
            spellCheck={false}
            placeholder="http://127.0.0.1:8080/health"
            onChange={(event) => dispatch({ type: "request", request: { ...request, url: event.target.value } })}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void send();
              }
            }}
          />
          <button type="button" className="primary" disabled={state.sending || request.url.trim() === ""} onClick={() => void send()}>
            Send
          </button>
          <button type="button" disabled={!state.sending} onClick={() => void cancelSend()}>
            Cancel
          </button>
        </div>
        <p className="preview-url">{previewUrl(request)}</p>
        <div className="tabs" role="tablist">
          {(
            [
              ["query", "Query"],
              ["headers", "Headers"],
              ["body", "Body"],
              ["timeout", "Timeout"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        {tab === "query" ? (
          <KeyValueTable
            rows={request.query}
            namePlaceholder="page"
            valuePlaceholder="1"
            onChange={(query) => dispatch({ type: "request", request: { ...request, query } })}
          />
        ) : null}
        {tab === "headers" ? (
          <KeyValueTable
            rows={request.headers}
            secretColumn
            namePlaceholder="Accept"
            valuePlaceholder="application/json"
            onChange={(headers) => dispatch({ type: "request", request: { ...request, headers } })}
          />
        ) : null}
        {tab === "body" ? (
          <div className="body-editor">
            <div className="segmented">
              {(["none", "json", "text"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={request.body.kind === kind ? "active" : ""}
                  onClick={() => setBody(kind === "none" ? { kind: "none" } : { kind, value: bodyValue })}
                >
                  {kind === "none" ? "None" : kind === "json" ? "JSON" : "Text"}
                </button>
              ))}
            </div>
            {request.body.kind === "none" ? (
              <p className="muted">No body will be sent. GET and HEAD never send a body.</p>
            ) : (
              <textarea
                aria-label="Request body"
                spellCheck={false}
                value={bodyValue}
                placeholder={request.body.kind === "json" ? '{"hello":"world"}' : "Plain text"}
                onChange={(event) => setBody({ kind: request.body.kind as "json" | "text", value: event.target.value })}
              />
            )}
          </div>
        ) : null}
        {tab === "timeout" ? (
          <label className="field">
            Timeout (ms)
            <input
              type="number"
              min={1}
              max={state.limits.maxTimeoutMs}
              value={request.timeoutMs}
              onChange={(event) =>
                dispatch({
                  type: "request",
                  request: { ...request, timeoutMs: Number(event.target.value) },
                })
              }
            />
            <span className="muted">Default is {state.limits.defaultTimeoutMs} ms. Maximum is {state.limits.maxTimeoutMs} ms.</span>
          </label>
        ) : null}
      </section>
      <ResponseView response={state.response} error={state.requestError} sending={state.sending} />
    </div>
  );
}
