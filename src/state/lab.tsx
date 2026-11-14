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
  DomainSummary,
  EngineLimits,
  ErrorView,
  HeaderEntry,
  HistoryEntry,
  HttpRequest,
  HttpResponse,
  Method,
  RequestBody,
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
  request: HttpRequest;
  sending: boolean;
  invocationId: string | null;
  response: HttpResponse | null;
  requestError: ErrorView | null;
  notice: string | null;
  domains: DomainSummary[];
  selectedDomainId: string | null;
  selectedCollectionId: string | null;
  selectedPathId: string | null;
  selectedHeaderId: string | null;
  selectedBodyId: string | null;
  domainsCollapsed: boolean;
  collectionsCollapsed: boolean;
  pathsCollapsed: boolean;
  headersCollapsed: boolean;
  bodiesCollapsed: boolean;
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
  | { type: "request"; request: HttpRequest }
  | { type: "replace"; request: HttpRequest; notice: string | null }
  | { type: "applyHeaders"; headers: HeaderEntry[]; headerId: string }
  | { type: "applyBody"; body: RequestBody; bodyId: string }
  | { type: "applyPath"; method: Method; url: string; pathId: string }
  | { type: "selectHeader"; id: string }
  | { type: "selectBody"; id: string }
  | { type: "selectDomain"; id: string | null }
  | { type: "selectCollection"; id: string | null }
  | { type: "collapse"; domains?: boolean; collections?: boolean; paths?: boolean; headers?: boolean; bodies?: boolean }
  | { type: "sending"; sending: boolean; invocationId: string | null }
  | { type: "response"; response: HttpResponse | null; error: ErrorView | null }
  | { type: "notice"; notice: string | null }
  | { type: "library"; domains: DomainSummary[]; history: HistoryEntry[]; runs: BenchSummary[]; storeStatus: StoreStatus | null }
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
  request: emptyRequest(),
  sending: false,
  invocationId: null,
  response: null,
  requestError: null,
  notice: null,
  domains: [],
  selectedDomainId: null,
  selectedCollectionId: null,
  selectedPathId: null,
  selectedHeaderId: null,
  selectedBodyId: null,
  domainsCollapsed: false,
  collectionsCollapsed: false,
  pathsCollapsed: false,
  headersCollapsed: false,
  bodiesCollapsed: false,
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
    case "request":
      return { ...state, request: action.request };
    case "replace":
      return {
        ...state,
        request: action.request,
        notice: action.notice,
        response: null,
        requestError: null,
        selectedPathId: null,
        selectedHeaderId: null,
        selectedBodyId: null,
      };
    case "applyHeaders":
      return {
        ...state,
        request: { ...state.request, headers: action.headers },
        selectedHeaderId: action.headerId,
      };
    case "applyBody":
      return {
        ...state,
        request: { ...state.request, body: action.body },
        selectedBodyId: action.bodyId,
      };
    case "applyPath":
      return {
        ...state,
        request: { ...state.request, method: action.method, url: action.url },
        selectedPathId: action.pathId,
      };
    case "selectHeader":
      return { ...state, selectedHeaderId: action.id };
    case "selectBody":
      return { ...state, selectedBodyId: action.id };
    case "selectDomain":
      return action.id === state.selectedDomainId
        ? state
        : {
            ...state,
            selectedDomainId: action.id,
            selectedCollectionId: null,
            selectedPathId: null,
            selectedHeaderId: null,
            selectedBodyId: null,
          };
    case "selectCollection":
      return {
        ...state,
        selectedCollectionId: action.id,
        selectedPathId: null,
        selectedHeaderId: null,
        selectedBodyId: null,
      };
    case "collapse":
      return {
        ...state,
        domainsCollapsed: action.domains ?? state.domainsCollapsed,
        collectionsCollapsed: action.collections ?? state.collectionsCollapsed,
        pathsCollapsed: action.paths ?? state.pathsCollapsed,
        headersCollapsed: action.headers ?? state.headersCollapsed,
        bodiesCollapsed: action.bodies ?? state.bodiesCollapsed,
      };
    case "sending":
      return { ...state, sending: action.sending, invocationId: action.invocationId };
    case "response":
      return { ...state, response: action.response, requestError: action.error, sending: false, invocationId: null };
    case "notice":
      return { ...state, notice: action.notice };
    case "library": {
      const domain = action.domains.find((item) => item.id === state.selectedDomainId);
      const collection = domain?.collections.find((item) => item.id === state.selectedCollectionId);
      return {
        ...state,
        domains: action.domains,
        history: action.history,
        runs: action.runs,
        storeStatus: action.storeStatus,
        selectedDomainId: domain ? state.selectedDomainId : null,
        selectedCollectionId: collection ? state.selectedCollectionId : null,
        selectedPathId: collection?.paths.some((item) => item.id === state.selectedPathId)
          ? state.selectedPathId
          : null,
        selectedHeaderId: collection?.headers.some((item) => item.id === state.selectedHeaderId)
          ? state.selectedHeaderId
          : null,
        selectedBodyId: collection?.bodies.some((item) => item.id === state.selectedBodyId)
          ? state.selectedBodyId
          : null,
      };
    }
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
  createDomain: (name: string) => Promise<void>;
  renameDomain: (id: string, name: string) => Promise<void>;
  deleteDomain: (id: string) => Promise<void>;
  createCollection: (domainId: string, name: string) => Promise<void>;
  renameCollection: (domainId: string, id: string, name: string) => Promise<void>;
  deleteCollection: (domainId: string, id: string) => Promise<void>;
  savePath: (method: Method, path: string) => Promise<void>;
  updatePath: (pathId: string, method: Method, path: string) => Promise<void>;
  deletePath: (pathId: string) => Promise<void>;
  saveHeaders: (name: string, headers?: HeaderEntry[]) => Promise<void>;
  updateHeaders: (name: string) => Promise<void>;
  renameHeaders: (headerId: string, name: string) => Promise<void>;
  deleteHeaders: (headerId: string) => Promise<void>;
  openHeaders: (headerId: string) => Promise<void>;
  saveBody: (name: string, body?: RequestBody) => Promise<void>;
  updateBody: (name: string) => Promise<void>;
  renameBody: (bodyId: string, name: string) => Promise<void>;
  deleteBody: (bodyId: string) => Promise<void>;
  openBody: (bodyId: string) => Promise<void>;
  openHistory: (entry: HistoryEntry) => void;
  runBench: () => Promise<void>;
  cancelBench: () => Promise<void>;
}

const LabContext = createContext<LabApi | null>(null);

function requireCollection(state: LabState): { domainId: string; collectionId: string } {
  if (!state.selectedDomainId || !state.selectedCollectionId) {
    throw { code: "invalid_config", message: "Choose a collection first." };
  }
  return { domainId: state.selectedDomainId, collectionId: state.selectedCollectionId };
}

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
      const [domains, history, runs, storeStatus] = await Promise.all([
        api.listDomains(),
        api.listHistory(),
        api.listBenchmarks(),
        api.loadStoreStatus(),
      ]);
      dispatch({ type: "library", domains, history, runs, storeStatus });
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
            domains: stateRef.current.domains,
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
      async createDomain(name: string) {
        const created = await api.createDomain(name);
        dispatch({ type: "selectDomain", id: created.id });
        await refresh();
      },
      async renameDomain(id: string, name: string) {
        await api.renameDomain(id, name);
        await refresh();
      },
      async deleteDomain(id: string) {
        await api.deleteDomain(id);
        if (stateRef.current.selectedDomainId === id) dispatch({ type: "selectDomain", id: null });
        await refresh();
      },
      async createCollection(domainId: string, name: string) {
        const created = await api.createCollection(domainId, name);
        dispatch({ type: "selectCollection", id: created.id });
        await refresh();
      },
      async renameCollection(domainId: string, id: string, name: string) {
        await api.renameCollection(domainId, id, name);
        await refresh();
      },
      async deleteCollection(domainId: string, id: string) {
        await api.deleteCollection(domainId, id);
        if (stateRef.current.selectedCollectionId === id) dispatch({ type: "selectCollection", id: null });
        await refresh();
      },
      async savePath(method: Method, path: string) {
        const selected = requireCollection(stateRef.current);
        await api.savePath(selected.domainId, selected.collectionId, method, path);
        await refresh();
      },
      async updatePath(pathId: string, method: Method, path: string) {
        const selected = requireCollection(stateRef.current);
        await api.updatePath(selected.domainId, selected.collectionId, pathId, method, path);
        await refresh();
      },
      async deletePath(pathId: string) {
        const selected = requireCollection(stateRef.current);
        await api.deletePath(selected.domainId, selected.collectionId, pathId);
        await refresh();
      },
      async saveHeaders(name: string, headers?: HeaderEntry[]) {
        const current = stateRef.current;
        const selected = requireCollection(current);
        const rows = headers ?? current.request.headers;
        const summary = await api.saveHeaders(selected.domainId, selected.collectionId, name, rows);
        if (!headers) {
          dispatch({ type: "selectHeader", id: summary.id });
          dispatch({ type: "notice", notice: "Saved headers. Secret values are in the keychain." });
        }
        await refresh();
      },
      async updateHeaders(name: string) {
        const current = stateRef.current;
        const selected = requireCollection(current);
        if (!current.selectedHeaderId) return;
        await api.updateHeaders(
          selected.domainId,
          selected.collectionId,
          current.selectedHeaderId,
          name,
          current.request.headers,
        );
        dispatch({ type: "notice", notice: "Updated headers." });
        await refresh();
      },
      async renameHeaders(headerId: string, name: string) {
        const selected = requireCollection(stateRef.current);
        await api.renameHeaders(selected.domainId, selected.collectionId, headerId, name);
        await refresh();
      },
      async deleteHeaders(headerId: string) {
        const selected = requireCollection(stateRef.current);
        await api.deleteHeaders(selected.domainId, selected.collectionId, headerId);
        await refresh();
      },
      async openHeaders(headerId: string) {
        const selected = requireCollection(stateRef.current);
        const loaded = await api.loadHeaders(selected.domainId, selected.collectionId, headerId);
        dispatch({
          type: "applyHeaders",
          headers: loaded.headers.length > 0 ? loaded.headers : [{ name: "", value: "", enabled: true, secret: false }],
          headerId: loaded.id,
        });
      },
      async saveBody(name: string, body?: RequestBody) {
        const current = stateRef.current;
        const selected = requireCollection(current);
        const payload = body ?? current.request.body;
        const summary = await api.saveBody(selected.domainId, selected.collectionId, name, payload);
        if (!body) {
          dispatch({ type: "selectBody", id: summary.id });
          dispatch({ type: "notice", notice: "Saved body." });
        }
        await refresh();
      },
      async updateBody(name: string) {
        const current = stateRef.current;
        const selected = requireCollection(current);
        if (!current.selectedBodyId) return;
        await api.updateBody(selected.domainId, selected.collectionId, current.selectedBodyId, name, current.request.body);
        dispatch({ type: "notice", notice: "Updated body." });
        await refresh();
      },
      async renameBody(bodyId: string, name: string) {
        const selected = requireCollection(stateRef.current);
        await api.renameBody(selected.domainId, selected.collectionId, bodyId, name);
        await refresh();
      },
      async deleteBody(bodyId: string) {
        const selected = requireCollection(stateRef.current);
        await api.deleteBody(selected.domainId, selected.collectionId, bodyId);
        await refresh();
      },
      async openBody(bodyId: string) {
        const selected = requireCollection(stateRef.current);
        const loaded = await api.loadBody(selected.domainId, selected.collectionId, bodyId);
        dispatch({ type: "applyBody", body: loaded.body, bodyId: loaded.id });
      },
      openHistory(entry: HistoryEntry) {
        const masked = entry.request.headers.some((header) => header.secret) || entry.request.query.some((param) => param.secret);
        dispatch({
          type: "replace",
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
            domains: stateRef.current.domains,
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
