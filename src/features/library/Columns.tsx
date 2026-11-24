import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { formatWhen, joinBaseUrl, replaceUrlPath } from "../../lib/format";
import { useLab } from "../../state/lab";
import type { DomainSummary, HeaderEntry, LoadedBody, LoadedHeaders, Method, RequestBody } from "../../types";
import { KeyValueTable } from "../request/KeyValueTable";

const METHODS: Method[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];
const PATH_IMPORT = `{
  "paths": [
    { "method": "GET", "path": "/v1/users" }
  ]
}`;
const HEADER_IMPORT = `{
  "headers": [
    {
      "name": "JSON",
      "headers": [
        { "name": "Accept", "value": "application/json" }
      ]
    }
  ]
}`;
const BODY_IMPORT = `{
  "bodies": [
    { "name": "Create user", "body": { "kind": "json", "value": "{\\"name\\":\\"ada\\"}" } }
  ]
}`;

export function DomainsColumn() {
  const lab = useLab();
  const { state, dispatch } = lab;
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (state.domainsCollapsed) {
    return (
      <button type="button" className="rail" aria-label="Expand domains" onClick={() => dispatch({ type: "collapse", domains: false })}>
        Domains
      </button>
    );
  }

  return (
    <section className="column library-column">
      <header className="side-head">
        <h2>Domains</h2>
        <button type="button" className="ghost" aria-label="Collapse domains" onClick={() => dispatch({ type: "collapse", domains: true })}>
          Hide
        </button>
      </header>
      <form
        className="column-create"
        onSubmit={(event) => {
          event.preventDefault();
          const next = name.trim();
          if (!next) return;
          setError(null);
          void lab.createDomain(next).then(() => setName("")).catch((caught: unknown) => setError(messageOf(caught)));
        }}
      >
        <ActionMenu>
          <button type="submit" role="menuitem">Add</button>
        </ActionMenu>
        <input value={name} placeholder="New domain" aria-label="New domain name" onChange={(event) => setName(event.target.value)} />
      </form>
      {state.domains.length === 0 ? <p className="muted">No domains yet.</p> : null}
      {state.domains.map((domain) => (
        <ItemRow
          key={domain.id}
          title={domain.name}
          selected={domain.id === state.selectedDomainId}
          dragId={domain.id}
          onDropItem={(sourceId, after) => {
            const next = dropOrder(state.domains.map((item) => item.id), sourceId, domain.id, after);
            if (next) void lab.reorderDomains(next);
          }}
          onOpen={() => dispatch({ type: "selectDomain", id: domain.id })}
          onRename={(next) => lab.renameDomain(domain.id, next)}
          onDelete={() => lab.deleteDomain(domain.id)}
        />
      ))}
      {error ? <p className="form-error">{error}</p> : null}
    </section>
  );
}

export function CollectionsColumn() {
  const lab = useLab();
  const { state, dispatch } = lab;
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const domain = state.domains.find((item) => item.id === state.selectedDomainId);

  if (state.collectionsCollapsed) {
    return (
      <button
        type="button"
        className="rail"
        aria-label="Expand collections"
        onClick={() => dispatch({ type: "collapse", collections: false })}
      >
        Collections
      </button>
    );
  }

  return (
    <section className="column library-column">
      <header className="side-head">
        <h2>Collections</h2>
        <button
          type="button"
          className="ghost"
          aria-label="Collapse collections"
          onClick={() => dispatch({ type: "collapse", collections: true })}
        >
          Hide
        </button>
      </header>
      <form
        className="collection-create"
        onSubmit={(event) => {
          event.preventDefault();
          const next = name.trim();
          const nextBase = baseUrl.trim();
          if (!state.selectedDomainId) {
            setError("Choose a domain first.");
            return;
          }
          if (!next) {
            setError("Name the collection first.");
            return;
          }
          if (!nextBase) {
            setError("Enter a base URL.");
            return;
          }
          setError(null);
          void lab
            .createCollection(state.selectedDomainId, next, nextBase)
            .then(() => {
              setName("");
              setBaseUrl("");
            })
            .catch((caught: unknown) => setError(messageOf(caught)));
        }}
      >
        <ActionMenu>
          <button type="submit" role="menuitem">Add</button>
        </ActionMenu>
        <input
          value={name}
          placeholder="New collection"
          aria-label="New collection name"
          onChange={(event) => setName(event.target.value)}
        />
        <input
          value={baseUrl}
          placeholder="http://127.0.0.1:8080/v1"
          aria-label="Collection base URL"
          onChange={(event) => setBaseUrl(event.target.value)}
        />
      </form>
      {!domain ? <p className="muted">Select a domain.</p> : null}
      {domain && domain.collections.length === 0 ? <p className="muted">No collections in this domain.</p> : null}
      {domain?.collections.map((collection) => (
        <ItemRow
          key={collection.id}
          title={collection.name}
          detail={collection.baseUrl}
          stacked
          selected={collection.id === state.selectedCollectionId}
          dragId={collection.id}
          onDropItem={(sourceId, after) => {
            const next = dropOrder(
              domain.collections.map((item) => item.id),
              sourceId,
              collection.id,
              after,
            );
            if (next) void lab.reorderCollections(domain.id, next);
          }}
          onOpen={() =>
            dispatch({
              type: "selectCollection",
              id: collection.id,
              url: collection.baseUrl.trim() ? collection.baseUrl : null,
            })
          }
          onRename={() => Promise.resolve()}
          onDelete={() => lab.deleteCollection(domain.id, collection.id)}
          editor={(finish) => (
            <CollectionEditor
              name={collection.name}
              baseUrl={collection.baseUrl}
              onSave={async (nextName, nextBase) => {
                await lab.updateCollection(domain.id, collection.id, nextName, nextBase);
                finish();
              }}
            />
          )}
        />
      ))}
      {error ? <p className="form-error">{error}</p> : null}
    </section>
  );
}

export function PathsColumn() {
  const lab = useLab();
  const { state, dispatch } = lab;
  const collection = selectedCollection(state.domains, state.selectedDomainId, state.selectedCollectionId);
  const [method, setMethod] = useState<Method>("GET");
  const [path, setPath] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.pathsCollapsed) {
    return (
      <button type="button" className="rail" aria-label="Expand paths" onClick={() => dispatch({ type: "collapse", paths: false })}>
        Paths
      </button>
    );
  }

  return (
    <section className="column library-column">
      <header className="side-head">
        <h2>Paths</h2>
        <button type="button" className="ghost" aria-label="Collapse paths" onClick={() => dispatch({ type: "collapse", paths: true })}>
          Hide
        </button>
      </header>
      <form
        className="path-create"
        onSubmit={(event) => {
          event.preventDefault();
          if (!collection) {
            setError("Choose a collection first.");
            return;
          }
          if (!path.trim()) {
            setError("Enter a path.");
            return;
          }
          setError(null);
          void lab
            .savePath(method, path)
            .then(() => setPath(""))
            .catch((caught: unknown) => setError(messageOf(caught)));
        }}
      >
        <ActionMenu>
          <button type="submit" role="menuitem">Add</button>
          <button type="button" role="menuitem" onClick={() => setImporting(true)}>Import</button>
        </ActionMenu>
        <select aria-label="Method" value={method} onChange={(event) => setMethod(event.target.value as Method)}>
          {METHODS.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <input value={path} placeholder="/v1/users" aria-label="Path" onChange={(event) => setPath(event.target.value)} />
      </form>
      {importing ? (
        <ImportDialog
          title="Import paths"
          placeholder={PATH_IMPORT}
          hasCollection={Boolean(collection)}
          onClose={() => setImporting(false)}
          onImport={(raw) => lab.importPaths(raw)}
        />
      ) : null}
      {!collection ? <p className="muted">Select a collection.</p> : null}
      {collection && collection.paths.length === 0 ? <p className="muted">No saved paths.</p> : null}
      {collection?.paths.map((item) => (
        <ItemRow
          key={item.id}
          title={item.path}
          badge={item.method}
          selected={item.id === state.selectedPathId}
          dragId={item.id}
          onDropItem={(sourceId, after) => {
            const next = dropOrder(collection.paths.map((path) => path.id), sourceId, item.id, after);
            if (next) void lab.reorderPaths(next);
          }}
          onOpen={() => {
            const base = collection.baseUrl.trim();
            const next = base ? joinBaseUrl(base, item.path) : replaceUrlPath(state.request.url, item.path);
            if (!next) {
              setError(base ? "The collection base URL is not valid." : "Enter a valid URL before applying a path.");
              return;
            }
            setError(null);
            dispatch({ type: "applyPath", method: item.method, url: next, pathId: item.id });
          }}
          onRename={() => Promise.resolve()}
          onDelete={() => lab.deletePath(item.id)}
          editor={(finish) => (
            <PathEditor
              method={item.method}
              path={item.path}
              onSave={async (nextMethod, nextPath) => {
                await lab.updatePath(item.id, nextMethod, nextPath);
                finish();
              }}
            />
          )}
        />
      ))}
      {error ? <p className="form-error">{error}</p> : null}
    </section>
  );
}

export function HeadersColumn() {
  const lab = useLab();
  const { state, dispatch } = lab;
  const collection = selectedCollection(state.domains, state.selectedDomainId, state.selectedCollectionId);
  const [dialog, setDialog] = useState<null | "new" | "from" | "import">(null);
  const [editing, setEditing] = useState<LoadedHeaders | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (state.headersCollapsed) {
    return (
      <button type="button" className="rail" aria-label="Expand headers" onClick={() => dispatch({ type: "collapse", headers: false })}>
        Headers
      </button>
    );
  }

  return (
    <section className="column library-column">
      <header className="side-head">
        <h2>Headers</h2>
        <button type="button" className="ghost" aria-label="Collapse headers" onClick={() => dispatch({ type: "collapse", headers: true })}>
          Hide
        </button>
      </header>
      <ActionMenu>
        <button type="button" role="menuitem" onClick={() => setDialog("new")}>Add</button>
        <button type="button" role="menuitem" onClick={() => setDialog("from")}>From request</button>
        <button type="button" role="menuitem" onClick={() => setDialog("import")}>Import</button>
      </ActionMenu>
      {!collection ? <p className="muted">Select a collection.</p> : null}
      {collection && collection.headers.length === 0 ? <p className="muted">No saved headers.</p> : null}
      {collection?.headers.map((item) => (
        <ItemRow
          key={item.id}
          title={item.name}
          selected={item.id === state.selectedHeaderId}
          dragId={item.id}
          onDropItem={(sourceId, after) => {
            const next = dropOrder(collection.headers.map((header) => header.id), sourceId, item.id, after);
            if (next) void lab.reorderHeaders(next);
          }}
          onOpen={() => void lab.openHeaders(item.id).catch((caught: unknown) => setError(messageOf(caught)))}
          onEdit={() => {
            void lab
              .loadHeaderPreset(item.id)
              .then(setEditing)
              .catch((caught: unknown) => setError(messageOf(caught)));
          }}
          onRename={(next) => lab.renameHeaders(item.id, next)}
          onDelete={() => lab.deleteHeaders(item.id)}
        />
      ))}
      {error ? <p className="form-error">{error}</p> : null}
      {editing ? (
        <HeaderPresetDialog
          title="Edit headers"
          hasCollection
          initialName={editing.name}
          initialRows={editing.headers.length > 0 ? editing.headers : [{ name: "", value: "", enabled: true, secret: false }]}
          saveOnClose
          onClose={() => setEditing(null)}
          onSave={async (name, headers) => {
            await lab.updateHeaders(editing.id, name, headers);
            setEditing(null);
          }}
        />
      ) : null}
      {dialog === "new" ? (
        <HeaderPresetDialog
          title="New headers"
          hasCollection={Boolean(collection)}
          onClose={() => setDialog(null)}
          onSave={async (name, headers) => {
            await lab.saveHeaders(name, headers);
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === "from" ? (
        <NameDialog
          title="Save request headers"
          label="Name"
          hasCollection={Boolean(collection)}
          onClose={() => setDialog(null)}
          onSave={async (name) => {
            await lab.saveHeaders(name);
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === "import" ? (
        <ImportDialog
          title="Import headers"
          placeholder={HEADER_IMPORT}
          hasCollection={Boolean(collection)}
          onClose={() => setDialog(null)}
          onImport={(raw) => lab.importHeaders(raw)}
        />
      ) : null}
    </section>
  );
}

export function BodiesColumn() {
  const lab = useLab();
  const { state, dispatch } = lab;
  const collection = selectedCollection(state.domains, state.selectedDomainId, state.selectedCollectionId);
  const [dialog, setDialog] = useState<null | "new" | "from" | "import">(null);
  const [editing, setEditing] = useState<LoadedBody | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (state.bodiesCollapsed) {
    return (
      <button type="button" className="rail" aria-label="Expand bodies" onClick={() => dispatch({ type: "collapse", bodies: false })}>
        Bodies
      </button>
    );
  }

  return (
    <section className="column library-column">
      <header className="side-head">
        <h2>Bodies</h2>
        <button type="button" className="ghost" aria-label="Collapse bodies" onClick={() => dispatch({ type: "collapse", bodies: true })}>
          Hide
        </button>
      </header>
      <ActionMenu>
        <button type="button" role="menuitem" onClick={() => setDialog("new")}>Add</button>
        <button type="button" role="menuitem" onClick={() => setDialog("from")}>From request</button>
        <button type="button" role="menuitem" onClick={() => setDialog("import")}>Import</button>
      </ActionMenu>
      {!collection ? <p className="muted">Select a collection.</p> : null}
      {collection && collection.bodies.length === 0 ? <p className="muted">No saved bodies.</p> : null}
      {collection?.bodies.map((item) => (
        <ItemRow
          key={item.id}
          title={item.name}
          detail={item.kind}
          selected={item.id === state.selectedBodyId}
          dragId={item.id}
          onDropItem={(sourceId, after) => {
            const next = dropOrder(collection.bodies.map((body) => body.id), sourceId, item.id, after);
            if (next) void lab.reorderBodies(next);
          }}
          onOpen={() => void lab.openBody(item.id).catch((caught: unknown) => setError(messageOf(caught)))}
          onEdit={() => {
            void lab
              .loadBodyPreset(item.id)
              .then(setEditing)
              .catch((caught: unknown) => setError(messageOf(caught)));
          }}
          onRename={(next) => lab.renameBody(item.id, next)}
          onDelete={() => lab.deleteBody(item.id)}
        />
      ))}
      {error ? <p className="form-error">{error}</p> : null}
      {editing ? (
        <BodyPresetDialog
          title="Edit body"
          hasCollection
          initialName={editing.name}
          initialBody={editing.body}
          saveOnClose
          onClose={() => setEditing(null)}
          onSave={async (name, body) => {
            await lab.updateBody(editing.id, name, body);
            setEditing(null);
          }}
        />
      ) : null}
      {dialog === "new" ? (
        <BodyPresetDialog
          title="New body"
          hasCollection={Boolean(collection)}
          onClose={() => setDialog(null)}
          onSave={async (name, body) => {
            await lab.saveBody(name, body);
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === "from" ? (
        <NameDialog
          title="Save request body"
          label="Name"
          hasCollection={Boolean(collection)}
          onClose={() => setDialog(null)}
          onSave={async (name) => {
            await lab.saveBody(name);
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === "import" ? (
        <ImportDialog
          title="Import bodies"
          placeholder={BODY_IMPORT}
          hasCollection={Boolean(collection)}
          onClose={() => setDialog(null)}
          onImport={(raw) => lab.importBodies(raw)}
        />
      ) : null}
    </section>
  );
}

export function HistoryColumn() {
  const lab = useLab();
  const { state, dispatch, openHistory } = lab;
  const [confirmClear, setConfirmClear] = useState(false);

  if (state.historyCollapsed) {
    return (
      <button type="button" className="rail history-rail" aria-label="Expand history" onClick={() => dispatch({ type: "collapse", history: false })}>
        History
      </button>
    );
  }

  return (
    <section className="column history-column">
      <header className="side-head">
        <h2>History</h2>
        <button
          type="button"
          className={confirmClear ? "ghost danger-text" : "ghost"}
          disabled={state.history.length === 0}
          onClick={() => {
            if (confirmClear) {
              setConfirmClear(false);
              void lab.clearHistory();
              return;
            }
            setConfirmClear(true);
          }}
        >
          {confirmClear ? "Confirm" : "Clear"}
        </button>
        <button type="button" className="ghost" aria-label="Collapse history" onClick={() => dispatch({ type: "collapse", history: true })}>
          Hide
        </button>
      </header>
      {state.history.length === 0 ? <p className="muted">Recent requests will show up here.</p> : null}
      {state.history.map((entry) => (
        <ItemRow
          key={entry.id}
          title={entry.ok ? String(entry.status ?? "OK") : entry.error ?? "Failed"}
          detail={`${entry.request.url} · ${formatWhen(entry.atMs)}`}
          badge={entry.request.method}
          selected={false}
          dragId={entry.id}
          onDropItem={(sourceId, after) => {
            const next = dropOrder(
              state.history.map((item) => item.id),
              sourceId,
              entry.id,
              after,
            );
            if (next) void lab.reorderHistory(next);
          }}
          onOpen={() => openHistory(entry)}
          onRename={() => Promise.resolve()}
          onDelete={() => Promise.resolve()}
          history
        />
      ))}
    </section>
  );
}

function ItemRow({
  title,
  detail,
  badge,
  stacked = false,
  selected,
  dragId,
  onDropItem,
  onOpen,
  onEdit,
  onRename,
  onDelete,
  editor,
  history = false,
}: {
  title: string;
  detail?: string;
  badge?: string;
  stacked?: boolean;
  selected: boolean;
  dragId?: string;
  onDropItem?: (sourceId: string, after: boolean) => void;
  onOpen: () => void;
  onEdit?: () => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  editor?: (finish: () => void) => ReactNode;
  history?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [pendingDelete, setPendingDelete] = useState(false);
  const liveDrag = useRowDrag();
  const dragging = liveDrag?.sourceId === dragId;
  const over =
    liveDrag && dragId && liveDrag.targetId === dragId && liveDrag.sourceId !== dragId
      ? liveDrag.after
        ? "after"
        : "before"
      : null;

  if (dragId && onDropItem) dropHandlers.set(dragId, onDropItem);
  useEffect(() => {
    if (!dragId) return;
    return () => {
      dropHandlers.delete(dragId);
    };
  }, [dragId]);

  return (
    <div
      className={`saved-row${history ? " history-row" : ""}${over ? ` drop-${over}` : ""}${dragging ? " dragging" : ""}`}
      data-row-id={dragId}
    >
      {editing ? (
        editor ? (
          editor(() => setEditing(false))
        ) : (
          <form
            className="inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              const next = draft.trim();
              if (!next) return;
              void onRename(next).then(() => setEditing(false));
            }}
          >
            <input value={draft} aria-label={`Rename ${title}`} onChange={(event) => setDraft(event.target.value)} />
            <button type="submit" className="icon" aria-label={`Save ${title}`}>
              <CheckIcon />
            </button>
          </form>
        )
      ) : (
        <>
          {dragId ? (
            <span
              className="grip"
              role="button"
              tabIndex={0}
              aria-label={`Reorder ${title}`}
              onPointerDown={(event) => beginRowDrag(event, dragId)}
            >
              <GripIcon />
            </span>
          ) : null}
          <button type="button" className={selected ? "saved picked" : "saved"} onClick={onOpen}>
            <span className={stacked ? "saved-label stacked" : "saved-label"}>
              {badge ? <span className={`verb verb-${badge.toLowerCase()}`}>{badge}</span> : null}
              <strong>{title}</strong>
              {detail ? <small>{detail}</small> : null}
            </span>
          </button>
          {onEdit ? (
            <button type="button" className="icon" aria-label={`Edit ${title}`} onClick={onEdit}>
              <EditIcon />
            </button>
          ) : null}
          {history ? null : (
            <>
              <button
                type="button"
                className="icon"
                aria-label={`Rename ${title}`}
                onClick={() => {
                  setDraft(title);
                  setEditing(true);
                }}
              >
                <PencilIcon />
              </button>
              <button
                type="button"
                className={pendingDelete ? "icon danger-text armed" : "icon danger-text"}
                aria-label={pendingDelete ? "Confirm delete" : `Delete ${title}`}
                onClick={() => {
                  if (pendingDelete) {
                    void onDelete().then(() => setPendingDelete(false));
                  } else {
                    setPendingDelete(true);
                  }
                }}
              >
                <CloseIcon />
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

function CollectionEditor({
  name,
  baseUrl,
  onSave,
}: {
  name: string;
  baseUrl: string;
  onSave: (name: string, baseUrl: string) => Promise<void>;
}) {
  const [nextName, setNextName] = useState(name);
  const [nextBase, setNextBase] = useState(baseUrl);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="collection-edit"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmedName = nextName.trim();
        const trimmedBase = nextBase.trim();
        if (!trimmedName) {
          setError("Name the collection first.");
          return;
        }
        if (!trimmedBase) {
          setError("Enter a base URL.");
          return;
        }
        setError(null);
        void onSave(trimmedName, trimmedBase).catch((caught: unknown) => setError(messageOf(caught)));
      }}
    >
      <input value={nextName} aria-label={`Rename ${name}`} onChange={(event) => setNextName(event.target.value)} />
      <input value={nextBase} aria-label="Base URL" onChange={(event) => setNextBase(event.target.value)} />
      <button type="submit" className="icon" aria-label="Save collection">
        <CheckIcon />
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}

function PathEditor({
  method,
  path,
  onSave,
}: {
  method: Method;
  path: string;
  onSave: (method: Method, path: string) => Promise<void>;
}) {
  const [nextMethod, setNextMethod] = useState(method);
  const [nextPath, setNextPath] = useState(path);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="inline-form path-add"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        void onSave(nextMethod, nextPath).catch((caught: unknown) => setError(messageOf(caught)));
      }}
    >
      <select aria-label="Method" value={nextMethod} onChange={(event) => setNextMethod(event.target.value as Method)}>
        {METHODS.map((item) => (
          <option key={item}>{item}</option>
        ))}
      </select>
      <input value={nextPath} aria-label="Path" onChange={(event) => setNextPath(event.target.value)} />
      <button type="submit" className="icon" aria-label="Save path">
        <CheckIcon />
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}

function HeaderPresetDialog({
  title,
  hasCollection,
  initialName = "",
  initialRows,
  saveOnClose = false,
  onClose,
  onSave,
}: {
  title: string;
  hasCollection: boolean;
  initialName?: string;
  initialRows?: HeaderEntry[];
  saveOnClose?: boolean;
  onClose: () => void;
  onSave: (name: string, headers: HeaderEntry[]) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [rows, setRows] = useState<HeaderEntry[]>(initialRows ?? [{ name: "", value: "", enabled: true, secret: false }]);
  const [error, setError] = useState<string | null>(null);
  const closing = useRef(false);
  const persist = () => {
    if (closing.current) return;
    if (!hasCollection) {
      setError("Choose a collection first.");
      return;
    }
    const next = name.trim();
    if (!next) {
      setError("Name the header set first.");
      return;
    }
    closing.current = true;
    setError(null);
    void onSave(next, rows).catch((caught: unknown) => {
      closing.current = false;
      setError(messageOf(caught));
    });
  };
  return (
    <Modal title={title} onClose={saveOnClose ? persist : onClose}>
      {hasCollection ? null : <p className="form-error">Choose a collection first.</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          persist();
        }}
      >
        <label className="field">
          Name
          <input value={name} aria-label="Header set name" onChange={(event) => setName(event.target.value)} />
        </label>
        <KeyValueTable
          rows={rows}
          secretColumn
          namePlaceholder="Accept"
          valuePlaceholder="application/json"
          onChange={setRows}
        />
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" className="primary" disabled={!hasCollection}>
          Save
        </button>
      </form>
    </Modal>
  );
}

function BodyPresetDialog({
  title,
  hasCollection,
  initialName = "",
  initialBody,
  saveOnClose = false,
  onClose,
  onSave,
}: {
  title: string;
  hasCollection: boolean;
  initialName?: string;
  initialBody?: RequestBody;
  saveOnClose?: boolean;
  onClose: () => void;
  onSave: (name: string, body: RequestBody) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [kind, setKind] = useState<RequestBody["kind"]>(initialBody?.kind ?? "json");
  const [value, setValue] = useState(initialBody && initialBody.kind !== "none" ? initialBody.value : "");
  const [error, setError] = useState<string | null>(null);
  const closing = useRef(false);
  const persist = () => {
    if (closing.current) return;
    if (!hasCollection) {
      setError("Choose a collection first.");
      return;
    }
    const next = name.trim();
    if (!next) {
      setError("Name the body first.");
      return;
    }
    closing.current = true;
    setError(null);
    const body: RequestBody = kind === "none" ? { kind: "none" } : { kind, value };
    void onSave(next, body).catch((caught: unknown) => {
      closing.current = false;
      setError(messageOf(caught));
    });
  };
  return (
    <Modal title={title} onClose={saveOnClose ? persist : onClose}>
      {hasCollection ? null : <p className="form-error">Choose a collection first.</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          persist();
        }}
      >
        <label className="field">
          Name
          <input value={name} aria-label="Body name" onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="segmented">
          {(["none", "json", "text"] as const).map((item) => (
            <button key={item} type="button" className={kind === item ? "active" : ""} onClick={() => setKind(item)}>
              {item === "none" ? "None" : item === "json" ? "JSON" : "Text"}
            </button>
          ))}
        </div>
        {kind === "none" ? (
          <p className="muted">This preset sends no body.</p>
        ) : (
          <textarea
            aria-label="Body"
            spellCheck={false}
            value={value}
            placeholder={kind === "json" ? '{"hello":"world"}' : "Plain text"}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" className="primary" disabled={!hasCollection}>
          Save
        </button>
      </form>
    </Modal>
  );
}

function ActionMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="action-menu" ref={root}>
      <button
        type="button"
        className="icon"
        aria-label="Open add menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MenuIcon />
      </button>
      {open ? (
        <div className="action-menu-panel" role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

function ImportDialog({
  title,
  placeholder,
  hasCollection,
  onClose,
  onImport,
}: {
  title: string;
  placeholder: string;
  hasCollection: boolean;
  onClose: () => void;
  onImport: (raw: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <Modal title={title} onClose={onClose}>
      {hasCollection ? null : <p className="form-error">Choose a collection first.</p>}
      <textarea
        aria-label="Import JSON"
        value={text}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="preset-actions">
        <button type="button" onClick={() => fileRef.current?.click()}>
          Choose file
        </button>
        <input
          ref={fileRef}
          className="import-file"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void file.text().then(setText).catch((caught: unknown) => setError(messageOf(caught)));
          }}
        />
        <button
          type="button"
          className="primary"
          disabled={!hasCollection || text.trim().length === 0}
          onClick={() => {
            setError(null);
            void onImport(text).then(onClose).catch((caught: unknown) => setError(messageOf(caught)));
          }}
        >
          Import
        </button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
    </Modal>
  );
}

function NameDialog({
  title,
  label,
  hasCollection,
  onClose,
  onSave,
}: {
  title: string;
  label: string;
  hasCollection: boolean;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={title} onClose={onClose}>
      {hasCollection ? null : <p className="form-error">Choose a collection first.</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!hasCollection) {
            setError("Choose a collection first.");
            return;
          }
          const next = name.trim();
          if (!next) {
            setError("Enter a name first.");
            return;
          }
          setError(null);
          void onSave(next).catch((caught: unknown) => setError(messageOf(caught)));
        }}
      >
        <label className="field">
          {label}
          <input value={name} aria-label={label} onChange={(event) => setName(event.target.value)} />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" className="primary" disabled={!hasCollection}>
          Save
        </button>
      </form>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M11.2 1.8l3 3L5.4 13.6 2 14l.4-3.4L11.2 1.8z" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

type RowDrag = { sourceId: string; targetId: string | null; after: boolean };

let rowDrag: RowDrag | null = null;
const rowDragListeners = new Set<() => void>();
const dropHandlers = new Map<string, (sourceId: string, after: boolean) => void>();

function setRowDrag(next: RowDrag | null) {
  rowDrag = next;
  document.body.classList.toggle("row-dragging", next !== null);
  rowDragListeners.forEach((listener) => listener());
}

function useRowDrag(): RowDrag | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((value) => value + 1);
    rowDragListeners.add(listener);
    return () => {
      rowDragListeners.delete(listener);
    };
  }, []);
  return rowDrag;
}

function dropSlot(sourceId: string, clientY: number): { targetId: string; after: boolean } | null {
  const source = document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(sourceId)}"]`);
  const column = source?.parentElement;
  if (!column) return null;
  const rows = [...column.querySelectorAll<HTMLElement>(":scope > [data-row-id]")];
  let best: { targetId: string; after: boolean; score: number } | null = null;
  for (const row of rows) {
    const targetId = row.dataset.rowId;
    if (!targetId) continue;
    const rect = row.getBoundingClientRect();
    if (rect.height === 0) continue;
    const after = clientY > rect.top + rect.height / 2;
    const edge = after ? rect.bottom : rect.top;
    const inside = clientY >= rect.top && clientY <= rect.bottom;
    const score = inside ? 0 : Math.abs(clientY - edge);
    if (!best || score < best.score) best = { targetId, after, score };
  }
  return best ? { targetId: best.targetId, after: best.after } : null;
}

function beginRowDrag(event: ReactPointerEvent<HTMLElement>, sourceId: string) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const handle = event.currentTarget;
  handle.setPointerCapture(event.pointerId);
  const place = (clientY: number) => {
    const slot = dropSlot(sourceId, clientY);
    setRowDrag({ sourceId, targetId: slot?.targetId ?? null, after: slot?.after ?? false });
  };
  const move = (ev: PointerEvent) => place(ev.clientY);
  const finish = (ev: PointerEvent) => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", finish);
    handle.removeEventListener("pointercancel", finish);
    const slot = dropSlot(sourceId, ev.clientY);
    setRowDrag(null);
    if (slot && slot.targetId !== sourceId) dropHandlers.get(slot.targetId)?.(sourceId, slot.after);
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
  place(event.clientY);
}

function dropOrder(ids: string[], sourceId: string, targetId: string, after: boolean): string[] | null {
  if (sourceId === targetId) return null;
  const from = ids.indexOf(sourceId);
  let to = ids.indexOf(targetId);
  if (from < 0 || to < 0) return null;
  if (after) to += 1;
  const insertAt = from < to ? to - 1 : to;
  if (insertAt === from) return null;
  const next = ids.slice();
  const [item] = next.splice(from, 1);
  next.splice(insertAt, 0, item);
  return next;
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M2.5 4h11M2.5 8h11M2.5 12h11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <circle cx="5" cy="4" r="1.15" fill="currentColor" />
      <circle cx="11" cy="4" r="1.15" fill="currentColor" />
      <circle cx="5" cy="8" r="1.15" fill="currentColor" />
      <circle cx="11" cy="8" r="1.15" fill="currentColor" />
      <circle cx="5" cy="12" r="1.15" fill="currentColor" />
      <circle cx="11" cy="12" r="1.15" fill="currentColor" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M2.5 3.5h11M2.5 8h11M2.5 12.5h7" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M3 8.2l3.2 3.3L13 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function selectedCollection(domains: DomainSummary[], domainId: string | null, collectionId: string | null) {
  return domains.find((domain) => domain.id === domainId)?.collections.find((collection) => collection.id === collectionId);
}

function messageOf(error: unknown): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Could not update the library.";
}
