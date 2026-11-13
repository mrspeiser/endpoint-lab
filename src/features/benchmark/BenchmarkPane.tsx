import { formatBytes, formatRps, formatUs, formatWhen, isLoopbackUrl, previewUrl } from "../../lib/format";
import { useLab } from "../../state/lab";
import type { BenchSummary } from "../../types";
import { Histogram, Sparkline } from "./Charts";

export function BenchmarkPane() {
  const { state, dispatch, runBench, cancelBench } = useLab();
  const { bench, request, limits } = state;
  const loopback = isLoopbackUrl(request.url);
  const remoteBlocked = !loopback && !bench.authorizeRemote;
  const snapshot = bench.snapshot;
  const summary = bench.summary;
  const live = summary ?? snapshot;
  const progress = progressPercent(bench);
  const runA = state.runs.find((run) => run.id === state.compareA) ?? summary ?? undefined;
  const runB = state.runs.find((run) => run.id === state.compareB);

  return (
    <div className="bench-layout">
      <section className="bench-config">
        <h2>Load</h2>
        <p className="muted">
          Uses the request in the editor. Rust sends the traffic. The first runs should target localhost.
        </p>
        <p className="preview-url">{request.method} {previewUrl(request)}</p>
        <div className="form-grid">
          <NumberField label="Requests" value={bench.totalRequests} max={limits.maxRequests} onChange={(totalRequests) => dispatch({ type: "bench", bench: { totalRequests } })} />
          <NumberField label="Concurrency" value={bench.concurrency} max={limits.maxConcurrency} onChange={(concurrency) => dispatch({ type: "bench", bench: { concurrency } })} />
          <NumberField label="Duration ms" value={bench.durationMs} max={limits.maxDurationMs} optional onChange={(durationMs) => dispatch({ type: "bench", bench: { durationMs } })} />
          <NumberField label="Timeout ms" value={bench.timeoutMs} max={limits.maxTimeoutMs} onChange={(timeoutMs) => dispatch({ type: "bench", bench: { timeoutMs } })} />
          <NumberField label="Warm-up" value={bench.warmupRequests} max={limits.maxRequests} onChange={(warmupRequests) => dispatch({ type: "bench", bench: { warmupRequests } })} />
        </div>
        {loopback ? (
          <p className="muted">Loopback targets can be tested without extra confirmation.</p>
        ) : (
          <label className="check">
            <input
              type="checkbox"
              checked={bench.authorizeRemote}
              onChange={(event) => dispatch({ type: "bench", bench: { authorizeRemote: event.target.checked } })}
            />
            I am authorized to load-test this host. High concurrency is never sent to a remote host automatically.
          </label>
        )}
        <div className="button-row">
          <button type="button" className="primary" disabled={bench.running || remoteBlocked || request.url.trim() === ""} onClick={() => void runBench()}>
            Run
          </button>
          <button type="button" disabled={!bench.running} onClick={() => void cancelBench()}>
            Cancel
          </button>
        </div>
        {remoteBlocked ? <p className="form-error">Check the authorization box before running against this host.</p> : null}
        {bench.error ? (
          <div className="banner bad" role="alert">
            <strong>{bench.error.code}</strong>
            <span>{bench.error.message}</span>
          </div>
        ) : null}
        <div className="progress" aria-hidden="true">
          <span className={bench.running && snapshot?.phase === "warmup" ? "indeterminate" : ""} style={{ width: `${progress}%` }} />
        </div>
        <p className="muted">
          {snapshot?.phase === "warmup" ? "Warming up. These requests are excluded from the summary." : "Progress updates about four times a second."}
        </p>
      </section>
      <section className="bench-results">
        <div className="stat-grid">
          <Stat label="Completed" value={String(live?.total ?? 0)} />
          <Stat label="Success" value={String(live?.success ?? 0)} />
          <Stat label="HTTP errors" value={String(live?.httpErrors ?? 0)} />
          <Stat label="Transport" value={String(live?.transportErrors ?? 0)} />
          <Stat label="RPS" value={formatRps(live?.rps ?? 0)} />
          <Stat label="p50" value={formatUs(live?.latency.p50Us ?? 0)} />
          <Stat label="p95" value={formatUs(live?.latency.p95Us ?? 0)} />
          <Stat label="p99" value={formatUs(live?.latency.p99Us ?? 0)} />
          <Stat label="Bytes" value={formatBytes(live?.bytes ?? 0)} />
        </div>
        <h3>Throughput</h3>
        <Sparkline points={bench.series} />
        <h3>Latency</h3>
        <Histogram bars={live?.histogram ?? []} />
        {live && live.errors.length > 0 ? (
          <>
            <h3>Errors</h3>
            <ul className="error-list">
              {live.errors.map((error) => (
                <li key={error.cause}>
                  <span>{error.cause}</span>
                  <strong>{error.count}</strong>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {summary ? <SummaryBlock summary={summary} /> : null}
        <h3>Compare runs</h3>
        <div className="form-grid">
          <label className="field">
            Run A
            <select value={state.compareA} onChange={(event) => dispatch({ type: "compare", a: event.target.value })}>
              <option value="">Select</option>
              {state.runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {formatWhen(run.startedAtMs)} · {formatRps(run.rps)} rps
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Run B
            <select value={state.compareB} onChange={(event) => dispatch({ type: "compare", b: event.target.value })}>
              <option value="">Select</option>
              {state.runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {formatWhen(run.startedAtMs)} · {formatRps(run.rps)} rps
                </option>
              ))}
            </select>
          </label>
        </div>
        {runA && runB ? <Compare left={runA} right={runB} /> : <p className="muted">Pick two saved runs to compare throughput and latency.</p>}
      </section>
    </div>
  );
}

function NumberField({
  label,
  value,
  max,
  optional,
  onChange,
}: {
  label: string;
  value: string;
  max: number;
  optional?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      {label}
      <input
        inputMode="numeric"
        value={value}
        placeholder={optional ? "optional" : undefined}
        aria-label={label}
        onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ""))}
      />
      <span className="muted">Max {max.toLocaleString()}</span>
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SummaryBlock({ summary }: { summary: BenchSummary }) {
  return (
    <div className="summary-block">
      <h3>Final summary</h3>
      <p>
        {summary.method} {summary.url} · {summary.elapsedMs} ms
        {summary.cancelled ? " · cancelled" : ""}
      </p>
      <p className="muted">
        mean {formatUs(summary.latency.meanUs)} · min {formatUs(summary.latency.minUs)} · max {formatUs(summary.latency.maxUs)}
      </p>
    </div>
  );
}

function Compare({ left, right }: { left: BenchSummary; right: BenchSummary }) {
  const rows: Array<[string, number, number]> = [
    ["RPS", left.rps, right.rps],
    ["p50 µs", left.latency.p50Us, right.latency.p50Us],
    ["p95 µs", left.latency.p95Us, right.latency.p95Us],
    ["p99 µs", left.latency.p99Us, right.latency.p99Us],
    ["HTTP errors", left.httpErrors, right.httpErrors],
    ["Transport errors", left.transportErrors, right.transportErrors],
  ];
  return (
    <table className="compare">
      <thead>
        <tr>
          <th>Metric</th>
          <th>A</th>
          <th>B</th>
          <th>Delta</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, a, b]) => {
          const delta = b - a;
          const sign = delta > 0 ? "+" : "";
          return (
            <tr key={label}>
              <td>{label}</td>
              <td>{formatNumber(a)}</td>
              <td>{formatNumber(b)}</td>
              <td>
                {sign}
                {formatNumber(delta)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function progressPercent(bench: {
  running: boolean;
  totalRequests: string;
  durationMs: string;
  snapshot: { phase: string; elapsedMs: number; total: number } | null;
}): number {
  if (!bench.running && bench.snapshot?.phase !== "measure" && !bench.snapshot) return 0;
  if (bench.snapshot?.phase === "warmup") return 100;
  const duration = Number(bench.durationMs);
  if (duration > 0 && bench.snapshot) return Math.min(100, (bench.snapshot.elapsedMs / duration) * 100);
  const total = Number(bench.totalRequests);
  if (total > 0 && bench.snapshot) return Math.min(100, (bench.snapshot.total / total) * 100);
  return bench.running ? 8 : 0;
}
