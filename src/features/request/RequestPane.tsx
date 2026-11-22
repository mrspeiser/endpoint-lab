import { useEffect, useRef, useState } from "react";

import { previewUrl } from "../../lib/format";
import { useLab } from "../../state/lab";
import type { Method, RequestBody } from "../../types";
import { KeyValueTable } from "./KeyValueTable";

const METHODS: Method[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];
type Tab = "query" | "headers" | "body" | "timeout";
const EDITOR_WIDTH_KEY = "endpoint-lab.editor-width";
const EDITOR_MIN = 280;
const EDITOR_MAX = 1100;

function clampEditorWidth(width: number): number {
  return Math.min(EDITOR_MAX, Math.max(EDITOR_MIN, Math.round(width)));
}

function rememberEditorWidth(width: number) {
  localStorage.setItem(EDITOR_WIDTH_KEY, String(width));
}

export function RequestPane() {
  const { state, dispatch, send, cancelSend } = useLab();
  const [tab, setTab] = useState<Tab>("query");
  const [editorWidth, setEditorWidth] = useState<number | null>(null);
  const paneRef = useRef<HTMLElement>(null);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const widthRef = useRef<number | null>(null);
  const { request } = state;
  const bodyValue = request.body.kind === "none" ? "" : request.body.value;

  const setBody = (body: RequestBody) => dispatch({ type: "request", request: { ...request, body } });

  const applyWidth = (width: number) => {
    const next = clampEditorWidth(width);
    const workspace = paneRef.current?.closest(".request-workspace");
    if (workspace instanceof HTMLElement) workspace.style.setProperty("--editor", `${next}px`);
    widthRef.current = next;
    setEditorWidth(next);
    return next;
  };

  useEffect(() => {
    const raw = localStorage.getItem(EDITOR_WIDTH_KEY);
    const saved = raw === null ? Number.NaN : Number(raw);
    if (Number.isFinite(saved)) applyWidth(saved);
    // Restore the saved pane width once, after the workspace is in the document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
      <section className="column editor" ref={paneRef}>
        <div
          className="pane-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Request pane width"
          aria-valuemin={EDITOR_MIN}
          aria-valuemax={EDITOR_MAX}
          aria-valuenow={editorWidth ?? undefined}
          tabIndex={0}
          onPointerDown={(event) => {
            const pane = paneRef.current;
            if (!pane) return;
            drag.current = { startX: event.clientX, startWidth: pane.getBoundingClientRect().width };
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // The pointer is already gone, so later move events still update the width.
            }
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            applyWidth(drag.current.startWidth + event.clientX - drag.current.startX);
          }}
          onPointerUp={() => {
            drag.current = null;
            if (widthRef.current !== null) rememberEditorWidth(widthRef.current);
          }}
          onKeyDown={(event) => {
            const current = paneRef.current?.getBoundingClientRect().width ?? editorWidth ?? EDITOR_MIN;
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const next = applyWidth(current + (event.key === "ArrowRight" ? 16 : -16));
            rememberEditorWidth(next);
          }}
        />
        <div className="editor-body">
        <div className="request-actions">
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
          <button type="button" className="primary" disabled={state.sending || request.url.trim() === ""} onClick={() => void send()}>
            Send
          </button>
          <button type="button" disabled={!state.sending} onClick={() => void cancelSend()}>
            Cancel
          </button>
        </div>
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
        </div>
      </section>
  );
}
