import { useEffect } from "react";

import { Sidebar } from "./features/collections/Sidebar";
import { BenchmarkPane } from "./features/benchmark/BenchmarkPane";
import { RequestPane } from "./features/request/RequestPane";
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
        <Sidebar />
        <main>{state.mode === "request" ? <RequestPane /> : <BenchmarkPane />}</main>
      </div>
    </div>
  );
}

export default App;
