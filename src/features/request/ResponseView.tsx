import { formatBytes, statusClass } from "../../lib/format";
import type { ErrorView, HttpResponse } from "../../types";

interface ResponseViewProps {
  response: HttpResponse | null;
  error: ErrorView | null;
  sending: boolean;
}

export function ResponseView({ response, error, sending }: ResponseViewProps) {
  if (sending && !response) {
    return (
      <section className="response">
        <p className="waiting">Waiting for the response…</p>
      </section>
    );
  }
  if (!response && !error) {
    return (
      <section className="response empty-state">
        <h2>Response</h2>
        <p>Send a request to inspect status, timing, headers, and body.</p>
      </section>
    );
  }
  return (
    <section className="response">
      {error ? (
        <div className="banner bad" role="alert">
          <strong>{error.code}</strong>
          <span>{error.message}</span>
        </div>
      ) : null}
      {response ? (
        <>
          <div className="response-meta">
            <span className={`pill ${statusClass(response.status)}`}>
              {response.status} {response.statusText}
            </span>
            <span>{response.elapsedMs} ms</span>
            <span>{formatBytes(response.sizeBytes, response.sizeExact)}</span>
            {response.truncated ? <span className="pill warn">Truncated preview</span> : null}
            {response.body.kind === "text" && response.body.pretty ? <span className="pill info">JSON</span> : null}
          </div>
          <h3>Headers</h3>
          {response.headers.length === 0 ? (
            <p className="muted">No response headers.</p>
          ) : (
            <dl className="header-list">
              {response.headers.map((header, index) => (
                <div key={`${header.name}-${index}`}>
                  <dt>{header.name}</dt>
                  <dd>{header.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <h3>Body</h3>
          {response.body.kind === "empty" ? <p className="muted">Empty body.</p> : null}
          {response.body.kind === "binary" ? <p className="muted">{response.body.message}</p> : null}
          {response.body.kind === "text" ? <pre>{response.body.content}</pre> : null}
        </>
      ) : null}
    </section>
  );
}
