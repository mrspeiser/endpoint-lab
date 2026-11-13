import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from "react";

import * as api from "../lib/api";
import type {
  BenchSnapshot,
  BenchSummary,
  CollectionSummary,
  EngineLimits,
  ErrorView,
  HistoryEntry,
  HttpRequest,
  HttpResponse,
  StoreStatus,
} from "../types";
import { emptyRequest, FALLBACK_LIMITS } from "../types";

export interface BenchForm {
  totalRequests: string;
  concurrency: string;
  durationMs: string;
  timeoutMs: string;
  warmupRequests: string;
  authorizeRemote: boolean;
  running: boolean;
  snapshot: BenchSnapshot | null;
  summary: BenchSummary | null;
  series: Array<{ t: number; rps: number }>;
  error: ErrorView | null;
}

export interface LabState {
  mode: "request" | "benchmark";
  name: string;
  request: HttpRequest;
  saved?: { collectionId: string; requestId: string };
  sending: boolean;
  invocationId: string | null;
  response: HttpResponse | null;
  requestError: ErrorView | null;
  notice: string | null;
  collections: CollectionSummary[];
  history: HistoryEntry[];
  runs: BenchSummary[];
  storeStatus: StoreStatus | null;
  limits: EngineLimits;
  bench: BenchForm;
  compareA: string;
  compareB: string;
}

type Action =
  | { type: "mode"; mode: LabState["mode"] }
  | { type: "name"; name: string }
  | { type: "request"; request: HttpRequest }
  | { type: "replace"; name: string; request: HttpRequest; saved?: LabState["saved"]; notice: string | null }
  | { type: "sending"; sending: boolean; invocationId: string | null }
  | { type: "response"; response: HttpResponse | null; error: ErrorView | null }
  | { type: "notice"; notice: string | null }
  | { type: "library"; collections: CollectionSummary[]; history: HistoryEntry[]; runs: BenchSummary[]; storeStatus: StoreStatus | null }
  | { type: "limits"; limits: EngineLimits }
  | { type: "bench"; bench: Partial<BenchForm> }
  | { type: "progress"; snapshot: BenchSnapshot }
  | { type: "compare"; a?: string; b?: string };

const initialBench: BenchForm = {
  totalRequests: "100",
  concurrency: "10",
  durationMs: "",
  timeoutMs: "10000",
  warmupRequests: "0",
  authorizeRemote: false,
  running: false,
  snapshot: null,
  summary: null,
  series: [],
  error: null,
};

const initialState: LabState = {
  mode: "request",
  name: "Untitled",
  request: emptyRequest(),
  sending: false,
  invocationId: null,
  response: null,
  requestError: null,
  notice: null,
  collections: [],
  history: [],
  runs: [],
  storeStatus: null,
  limits: FALLBACK_LIMITS,
  bench: initialBench,
  compareA: "",
  compareB: "",
};

function reduce(state: LabState, action: Action): LabState {
  switch (action.type) {
    case "mode":
      return { ...state, mode: action.mode };
    case "name":
      return { ...state, name: action.name };
    case "request":
      return { ...state, request: action.request };
    case "replace":
      return {
        ...state,
        name: action.name,
        request: action.request,
        saved: action.saved,
        notice: action.notice,
        response: null,
        requestError: null,
      };
    case "sending":
      return { ...state, sending: action.sending, invocationId: action.invocationId };
    case "response":
      return { ...state, response: action.response, requestError: action.error, sending: false, invocationId: null };
    case "notice":
      return { ...state, notice: action.notice };
    case "library":
      return {
        ...state,
        collections: action.collections,
        history: action.history,
        runs: action.runs,
        storeStatus: action.storeStatus,
      };
    case "limits":
      return { ...state, limits: action.limits };
    case "bench":
      return { ...state, bench: { ...state.bench, ...action.bench } };
    case "progress": {
      const series = [...state.bench.series, { t: action.snapshot.elapsedMs, rps: action.snapshot.rps }];
      if (series.length > 240) series.shift();
      return { ...state, bench: { ...state.bench, snapshot: action.snapshot, series } };
    }
    case "compare":
      return {
        ...state,
        compareA: action.a ?? state.compareA,
        compareB: action.b ?? state.compareB,
      };
    default:
      return state;
  }
}

interface LabApi {
  state: LabState;
  dispatch: Dispatch<Action>;
  refresh: () => Promise<void>;
  send: () => Promise<void>;
  cancelSend: () => Promise<void>;
  createCollection: (name: string) => Promise<void>;
  renameCollection: (id: string, name: string) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  saveNew: (collectionId: string) => Promise<void>;
  updateSaved: () => Promise<void>;
  deleteSaved: (collectionId: string, requestId: string) => Promise<void>;
  openSaved: (collectionId: string, requestId: string) => Promise<void>;
  openHistory: (entry: HistoryEntry) => void;
  runBench: () => Promise<void>;
  cancelBench: () => Promise<void>;
}

const LabContext = createContext<LabApi | null>(null);

function withBlankRows(request: HttpRequest): HttpRequest {
  return {
    ...request,
    headers: request.headers.length > 0 ? request.headers : [{ name: "", value: "", enabled: true, secret: false }],
    query: request.query.length > 0 ? request.query : [{ name: "", value: "", enabled: true, secret: false }],
  };
}

function clearMaskedSecrets(request: HttpRequest): HttpRequest {
  return {
    ...request,
    headers: request.headers.map((header) =>
      header.secret && header.value === "***" ? { ...header, value: "" } : header,
    ),
    query: request.query.map((param) =>
      param.secret && param.value === "***" ? { ...param, value: "" } : param,
    ),
  };
}

export function LabProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduce, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const refresh = async () => {
    if (!api.desktopAvailable()) {
      dispatch({
        type: "notice",
        notice: "This window is the Vite preview. Open Endpoint Lab with npm run tauri dev to send requests.",
      });
      return;
    }
    try {
      const [collections, history, runs, storeStatus] = await Promise.all([
        api.listCollections(),
        api.listHistory(),
        api.listBenchmarks(),
        api.loadStoreStatus(),
      ]);
      dispatch({ type: "library", collections, history, runs, storeStatus });
    } catch (error) {
      dispatch({ type: "notice", notice: api.asError(error).message });
    }
  };

  useEffect(() => {
    void api.loadLimits().then((limits) => dispatch({ type: "limits", limits }));
    void refresh();
    // The library is loaded once when the shell mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apiValue = useMemo<LabApi>(() => {
    return {
      state,
      dispatch,
      refresh,
      async send() {
        const current = stateRef.current;
        if (current.sending && current.invocationId) {
          await api.cancelRequest(current.invocationId).catch(() => undefined);
        }
        const invocationId = crypto.randomUUID();
        dispatch({ type: "sending", sending: true, invocationId });
        dispatch({ type: "response", response: null, error: null });
        dispatch({ type: "sending", sending: true, invocationId });
        try {
          const response = await api.sendRequest(invocationId, current.request);
          dispatch({ type: "response", response, error: null });
          const history = await api.listHistory();
          dispatch({
            type: "library",
            collections: stateRef.current.collections,
            history,
            runs: stateRef.current.runs,
            storeStatus: stateRef.current.storeStatus,
          });
        } catch (error) {
          dispatch({ type: "response", response: null, error: api.asError(error) });
        }
      },
      async cancelSend() {
        const id = stateRef.current.invocationId;
        if (id) await api.cancelRequest(id).catch(() => undefined);
      },
      async createCollection(name: string) {
        await api.createCollection(name);
        await refresh();
      },
      async renameCollection(id: string, name: string) {
        await api.renameCollection(id, name);
        await refresh();
      },
      async deleteCollection(id: string) {
        await api.deleteCollection(id);
        const saved = stateRef.current.saved;
        if (saved?.collectionId === id) {
          dispatch({ type: "replace", name: stateRef.current.name, request: stateRef.current.request, notice: stateRef.current.notice });
        }
        await refresh();
      },
      async saveNew(collectionId: string) {
        const current = stateRef.current;
        const summary = await api.saveRequest(collectionId, current.name, current.request);
        dispatch({
          type: "replace",
          name: summary.name,
          request: current.request,
          saved: { collectionId, requestId: summary.id },
          notice: "Saved. Secret header and query values are in the keychain.",
        });
        await refresh();
      },
      async updateSaved() {
        const current = stateRef.current;
        if (!current.saved) return;
        const summary = await api.updateRequest(
          current.saved.collectionId,
          current.saved.requestId,
          current.name,
          current.request,
        );
        dispatch({
          type: "replace",
          name: summary.name,
          request: current.request,
          saved: current.saved,
          notice: "Updated.",
        });
        await refresh();
      },
      async deleteSaved(collectionId: string, requestId: string) {
        await api.deleteRequest(collectionId, requestId);
        const saved = stateRef.current.saved;
        if (saved?.collectionId === collectionId && saved.requestId === requestId) {
          dispatch({
            type: "replace",
            name: "Untitled",
            request: stateRef.current.request,
            notice: null,
          });
        }
        await refresh();
      },
      async openSaved(collectionId: string, requestId: string) {
        const loaded = await api.loadRequest(collectionId, requestId);
        dispatch({
          type: "replace",
          name: loaded.name,
          request: withBlankRows(loaded.request),
          saved: { collectionId, requestId },
          notice: null,
        });
        dispatch({ type: "mode", mode: "request" });
      },
      openHistory(entry: HistoryEntry) {
        const masked = entry.request.headers.some((header) => header.secret) || entry.request.query.some((param) => param.secret);
        dispatch({
          type: "replace",
          name: "From history",
          request: withBlankRows(clearMaskedSecrets(entry.request)),
          notice: masked ? "Secrets are not kept in history. Enter them again before sending." : null,
        });
        dispatch({ type: "mode", mode: "request" });
      },
      async runBench() {
        const current = stateRef.current;
        const totalRequests = Number(current.bench.totalRequests);
        const concurrency = Number(current.bench.concurrency);
        const timeoutMs = Number(current.bench.timeoutMs);
        const warmupRequests = Number(current.bench.warmupRequests);
        const durationMs = current.bench.durationMs.trim() === "" ? null : Number(current.bench.durationMs);
        dispatch({
          type: "bench",
          bench: { running: true, error: null, snapshot: null, summary: null, series: [] },
        });
        try {
          const summary = await api.runBenchmark(
            {
              request: current.request,
              totalRequests,
              concurrency,
              durationMs,
              timeoutMs,
              warmupRequests,
              authorizeRemote: current.bench.authorizeRemote,
            },
            (snapshot) => dispatch({ type: "progress", snapshot }),
          );
          dispatch({ type: "bench", bench: { running: false, summary } });
          const runs = await api.listBenchmarks();
          dispatch({
            type: "library",
            collections: stateRef.current.collections,
            history: stateRef.current.history,
            runs,
            storeStatus: stateRef.current.storeStatus,
          });
          dispatch({ type: "compare", a: summary.id });
        } catch (error) {
          dispatch({ type: "bench", bench: { running: false, error: api.asError(error) } });
        }
      },
      async cancelBench() {
        await api.cancelBenchmark().catch(() => undefined);
      },
    };
  }, [state]);

  return <LabContext.Provider value={apiValue}>{children}</LabContext.Provider>;
}

export function useLab(): LabApi {
  const value = useContext(LabContext);
  if (!value) throw new Error("useLab must be used inside LabProvider");
  return value;
}
