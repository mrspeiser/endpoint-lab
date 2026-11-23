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
  LoadedBody,
  LoadedHeaders,
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
  historyCollapsed: boolean;
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
  | { type: "selectCollection"; id: string | null; url?: string | null }
  | { type: "collapse"; domains?: boolean; collections?: boolean; paths?: boolean; headers?: boolean; bodies?: boolean; history?: boolean }
  | { type: "order"; scope: "domains" | "collections" | "paths" | "headers" | "bodies" | "history"; ids: string[] }
  | { type: "clearHistory" }
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
  historyCollapsed: false,
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
        request: action.url ? { ...state.request, url: action.url } : state.request,
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
        historyCollapsed: action.history ?? state.historyCollapsed,
      };
    case "order":
      return applyOrder(state, action.scope, action.ids);
    case "clearHistory":
      return { ...state, history: [] };
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
  createCollection: (domainId: string, name: string, baseUrl: string) => Promise<void>;
  renameCollection: (domainId: string, id: string, name: string) => Promise<void>;
  updateCollection: (domainId: string, id: string, name: string, baseUrl: string) => Promise<void>;
  deleteCollection: (domainId: string, id: string) => Promise<void>;
  savePath: (method: Method, path: string) => Promise<void>;
  updatePath: (pathId: string, method: Method, path: string) => Promise<void>;
  deletePath: (pathId: string) => Promise<void>;
  importPaths: (raw: string) => Promise<void>;
  saveHeaders: (name: string, headers?: HeaderEntry[]) => Promise<void>;
  updateHeaders: (headerId: string, name: string, headers: HeaderEntry[]) => Promise<void>;
  loadHeaderPreset: (headerId: string) => Promise<LoadedHeaders>;
  renameHeaders: (headerId: string, name: string) => Promise<void>;
  deleteHeaders: (headerId: string) => Promise<void>;
  importHeaders: (raw: string) => Promise<void>;
  openHeaders: (headerId: string) => Promise<void>;
  saveBody: (name: string, body?: RequestBody) => Promise<void>;
  updateBody: (bodyId: string, name: string, body: RequestBody) => Promise<void>;
  loadBodyPreset: (bodyId: string) => Promise<LoadedBody>;
  renameBody: (bodyId: string, name: string) => Promise<void>;
  deleteBody: (bodyId: string) => Promise<void>;
  importBodies: (raw: string) => Promise<void>;
  openBody: (bodyId: string) => Promise<void>;
  openHistory: (entry: HistoryEntry) => void;
  clearHistory: () => Promise<void>;
  reorderDomains: (ids: string[]) => Promise<void>;
  reorderCollections: (domainId: string, ids: string[]) => Promise<void>;
  reorderPaths: (ids: string[]) => Promise<void>;
  reorderHeaders: (ids: string[]) => Promise<void>;
  reorderBodies: (ids: string[]) => Promise<void>;
  reorderHistory: (ids: string[]) => Promise<void>;
  runBench: () => Promise<void>;
  cancelBench: () => Promise<void>;
}

const LabContext = createContext<LabApi | null>(null);

function ordered<T extends { id: string }>(items: T[], ids: string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const next = ids.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
  return next.length === items.length ? next : items;
}

function applyOrder(state: LabState, scope: "domains" | "collections" | "paths" | "headers" | "bodies" | "history", ids: string[]): LabState {
  if (scope === "domains") return { ...state, domains: ordered(state.domains, ids) };
  if (scope === "history") return { ...state, history: ordered(state.history, ids) };
  if (scope === "collections") {
    return {
      ...state,
      domains: state.domains.map((domain) =>
        domain.id === state.selectedDomainId ? { ...domain, collections: ordered(domain.collections, ids) } : domain,
      ),
    };
  }
  return {
    ...state,
    domains: state.domains.map((domain) => {
      if (domain.id !== state.selectedDomainId) return domain;
      return {
        ...domain,
        collections: domain.collections.map((collection) => {
          if (collection.id !== state.selectedCollectionId) return collection;
          if (scope === "paths") return { ...collection, paths: ordered(collection.paths, ids) };
          if (scope === "headers") return { ...collection, headers: ordered(collection.headers, ids) };
          return { ...collection, bodies: ordered(collection.bodies, ids) };
        }),
      };
    }),
  };
}

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
    const saveOrder = async (
      scope: "domains" | "collections" | "paths" | "headers" | "bodies" | "history",
      ids: string[],
      write: () => Promise<void>,
    ) => {
      dispatch({ type: "order", scope, ids });
      try {
        await write();
      } catch (error) {
        dispatch({ type: "notice", notice: api.asError(error).message });
        await refresh();
      }
    };
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
      async createCollection(domainId: string, name: string, baseUrl: string) {
        const created = await api.createCollection(domainId, name, baseUrl);
        dispatch({ type: "selectCollection", id: created.id, url: created.baseUrl });
        await refresh();
      },
      async renameCollection(domainId: string, id: string, name: string) {
        await api.renameCollection(domainId, id, name);
        await refresh();
      },
      async updateCollection(domainId: string, id: string, name: string, baseUrl: string) {
        await api.updateCollection(domainId, id, name, baseUrl);
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
      async importPaths(raw: string) {
        const selected = requireCollection(stateRef.current);
        const count = await api.importPaths(selected.domainId, selected.collectionId, raw);
        dispatch({ type: "notice", notice: `Imported ${count} paths.` });
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
      async updateHeaders(headerId: string, name: string, headers: HeaderEntry[]) {
        const selected = requireCollection(stateRef.current);
        await api.updateHeaders(selected.domainId, selected.collectionId, headerId, name, headers);
        await refresh();
      },
      async loadHeaderPreset(headerId: string) {
        const selected = requireCollection(stateRef.current);
        return api.loadHeaders(selected.domainId, selected.collectionId, headerId);
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
      async importHeaders(raw: string) {
        const selected = requireCollection(stateRef.current);
        const count = await api.importHeaders(selected.domainId, selected.collectionId, raw);
        dispatch({ type: "notice", notice: `Imported ${count} header sets.` });
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
      async updateBody(bodyId: string, name: string, body: RequestBody) {
        const selected = requireCollection(stateRef.current);
        await api.updateBody(selected.domainId, selected.collectionId, bodyId, name, body);
        await refresh();
      },
      async loadBodyPreset(bodyId: string) {
        const selected = requireCollection(stateRef.current);
        return api.loadBody(selected.domainId, selected.collectionId, bodyId);
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
      async importBodies(raw: string) {
        const selected = requireCollection(stateRef.current);
        const count = await api.importBodies(selected.domainId, selected.collectionId, raw);
        dispatch({ type: "notice", notice: `Imported ${count} bodies.` });
        await refresh();
      },
      async openBody(bodyId: string) {
        const selected = requireCollection(stateRef.current);
        const loaded = await api.loadBody(selected.domainId, selected.collectionId, bodyId);
        dispatch({ type: "applyBody", body: loaded.body, bodyId: loaded.id });
      },
      async clearHistory() {
        dispatch({ type: "clearHistory" });
        try {
          await api.clearHistory();
        } catch (error) {
          dispatch({ type: "notice", notice: api.asError(error).message });
          await refresh();
        }
      },
      async reorderDomains(ids: string[]) {
        await saveOrder("domains", ids, () => api.reorderDomains(ids));
      },
      async reorderCollections(domainId: string, ids: string[]) {
        await saveOrder("collections", ids, () => api.reorderCollections(domainId, ids));
      },
      async reorderPaths(ids: string[]) {
        const selected = requireCollection(stateRef.current);
        await saveOrder("paths", ids, () => api.reorderPaths(selected.domainId, selected.collectionId, ids));
      },
      async reorderHeaders(ids: string[]) {
        const selected = requireCollection(stateRef.current);
        await saveOrder("headers", ids, () => api.reorderHeaders(selected.domainId, selected.collectionId, ids));
      },
      async reorderBodies(ids: string[]) {
        const selected = requireCollection(stateRef.current);
        await saveOrder("bodies", ids, () => api.reorderBodies(selected.domainId, selected.collectionId, ids));
      },
      async reorderHistory(ids: string[]) {
        await saveOrder("history", ids, () => api.reorderHistory(ids));
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
