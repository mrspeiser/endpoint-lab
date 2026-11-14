import { useEffect } from "react";

import { BenchmarkPane } from "./features/benchmark/BenchmarkPane";
import { BodiesColumn, CollectionsColumn, DomainsColumn, HeadersColumn, HistoryColumn, PathsColumn } from "./features/library/Columns";
import { RequestPane } from "./features/request/RequestPane";
import { ResponseView } from "./features/request/ResponseView";
import { useLab } from "./state/lab";
import "./styles.css";

function App() {
  const { state, dispatch, send } = useLab();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && state.mode === "request") {
        event.preventDefault();
        void send();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [send, state.mode]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark">EL</span>
          <div>
            <strong>Endpoint Lab</strong>
            <small>Local HTTP client</small>
          </div>
        </div>
        <div className="mode-switch" role="tablist">
          <button type="button" className={state.mode === "request" ? "active" : ""} onClick={() => dispatch({ type: "mode", mode: "request" })}>
            Request
          </button>
          <button type="button" className={state.mode === "benchmark" ? "active" : ""} onClick={() => dispatch({ type: "mode", mode: "benchmark" })}>
            Benchmark
          </button>
        </div>
        <span className="engine-tag">Rust engine</span>
      </header>
      {state.notice ? <div className="banner info">{state.notice}</div> : null}
      {state.storeStatus && !state.storeStatus.ok ? (
        <div className="banner bad" role="alert">
          Saved data could not be loaded. {state.storeStatus.message}
        </div>
      ) : null}
      <div className="workspace">
        {state.mode === "request" ? (
          <div
            className={`request-workspace${state.domainsCollapsed ? " domains-collapsed" : ""}${state.collectionsCollapsed ? " collections-collapsed" : ""}${state.pathsCollapsed ? " paths-collapsed" : ""}${state.headersCollapsed ? " headers-collapsed" : ""}${state.bodiesCollapsed ? " bodies-collapsed" : ""}`}
          >
            <DomainsColumn />
            <CollectionsColumn />
            <PathsColumn />
            <HeadersColumn />
            <BodiesColumn />
            <RequestPane />
            <ResponseView response={state.response} error={state.requestError} sending={state.sending} />
            <HistoryColumn />
          </div>
        ) : (
          <BenchmarkPane />
        )}
      </div>
    </div>
  );
}

export default App;
