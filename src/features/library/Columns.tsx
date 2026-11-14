import { useState, type ReactNode } from "react";

import { formatWhen, replaceUrlPath } from "../../lib/format";
import { useLab } from "../../state/lab";
import type { DomainSummary, HeaderEntry, Method, RequestBody } from "../../types";
import { KeyValueTable } from "../request/KeyValueTable";

const METHODS: Method[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];

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
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          const next = name.trim();
          if (!next) return;
          setError(null);
          void lab.createDomain(next).then(() => setName("")).catch((caught: unknown) => setError(messageOf(caught)));
        }}
      >
        <input value={name} placeholder="New domain" aria-label="New domain name" onChange={(event) => setName(event.target.value)} />
        <button type="submit">Add</button>
      </form>
      {state.domains.length === 0 ? <p className="muted">No domains yet.</p> : null}
      {state.domains.map((domain) => (
        <ItemRow
          key={domain.id}
          title={domain.name}
          selected={domain.id === state.selectedDomainId}
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
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          const next = name.trim();
          if (!state.selectedDomainId) {
            setError("Choose a domain first.");
            return;
          }
          if (!next) return;
          setError(null);
          void lab
            .createCollection(state.selectedDomainId, next)
            .then(() => setName(""))
            .catch((caught: unknown) => setError(messageOf(caught)));
        }}
      >
        <input
          value={name}
          placeholder="New collection"
          aria-label="New collection name"
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit">Add</button>
      </form>
      {!domain ? <p className="muted">Select a domain.</p> : null}
      {domain && domain.collections.length === 0 ? <p className="muted">No collections in this domain.</p> : null}
      {domain?.collections.map((collection) => (
        <ItemRow
          key={collection.id}
          title={collection.name}
          selected={collection.id === state.selectedCollectionId}
          onOpen={() => dispatch({ type: "selectCollection", id: collection.id })}
          onRename={(next) => lab.renameCollection(domain.id, collection.id, next)}
          onDelete={() => lab.deleteCollection(domain.id, collection.id)}
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
        className="path-add"
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
        <select aria-label="Method" value={method} onChange={(event) => setMethod(event.target.value as Method)}>
          {METHODS.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <input value={path} placeholder="/v1/users" aria-label="Path" onChange={(event) => setPath(event.target.value)} />
        <button type="submit">Add</button>
      </form>
      {!collection ? <p className="muted">Select a collection.</p> : null}
      {collection && collection.paths.length === 0 ? <p className="muted">No saved paths.</p> : null}
      {collection?.paths.map((item) => (
        <ItemRow
          key={item.id}
          title={item.path}
          badge={item.method}
          selected={item.id === state.selectedPathId}
          onOpen={() => {
            const next = replaceUrlPath(state.request.url, item.path);
            if (!next) {
              setError("Enter a valid URL before applying a path.");
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
  const [dialog, setDialog] = useState<null | "new" | "from">(null);
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
      <div className="preset-actions">
        <button type="button" onClick={() => setDialog("new")}>New</button>
        <button type="button" onClick={() => setDialog("from")}>From request</button>
      </div>
      {!collection ? <p className="muted">Select a collection.</p> : null}
      {collection && collection.headers.length === 0 ? <p className="muted">No saved headers.</p> : null}
      {collection?.headers.map((item) => (
        <ItemRow
          key={item.id}
          title={item.name}
          selected={item.id === state.selectedHeaderId}
          onOpen={() => void lab.openHeaders(item.id).catch((caught: unknown) => setError(messageOf(caught)))}
          onRename={(next) => lab.renameHeaders(item.id, next)}
          onDelete={() => lab.deleteHeaders(item.id)}
        />
      ))}
      {error ? <p className="form-error">{error}</p> : null}
      {dialog === "new" ? (
        <HeaderPresetDialog
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
    </section>
  );
}

export function BodiesColumn() {
  const lab = useLab();
  const { state, dispatch } = lab;
  const collection = selectedCollection(state.domains, state.selectedDomainId, state.selectedCollectionId);
  const [dialog, setDialog] = useState<null | "new" | "from">(null);
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
      <div className="preset-actions">
        <button type="button" onClick={() => setDialog("new")}>New</button>
        <button type="button" onClick={() => setDialog("from")}>From request</button>
      </div>
      {!collection ? <p className="muted">Select a collection.</p> : null}
      {collection && collection.bodies.length === 0 ? <p className="muted">No saved bodies.</p> : null}
      {collection?.bodies.map((item) => (
        <ItemRow
          key={item.id}
          title={item.name}
          detail={item.kind}
          selected={item.id === state.selectedBodyId}
          onOpen={() => void lab.openBody(item.id).catch((caught: unknown) => setError(messageOf(caught)))}
          onRename={(next) => lab.renameBody(item.id, next)}
          onDelete={() => lab.deleteBody(item.id)}
        />
      ))}
      {error ? <p className="form-error">{error}</p> : null}
      {dialog === "new" ? (
        <BodyPresetDialog
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
    </section>
  );
}

export function HistoryColumn() {
  const { state, openHistory } = useLab();
  return (
    <section className="column history-column">
      <h2>History</h2>
      {state.history.length === 0 ? <p className="muted">Recent requests will show up here.</p> : null}
      {state.history.map((entry) => (
        <button key={entry.id} type="button" className="history-item" onClick={() => openHistory(entry)}>
          <span className={`verb verb-${entry.request.method.toLowerCase()}`}>{entry.request.method}</span>
          <span>
            <strong>{entry.ok ? entry.status ?? "OK" : entry.error ?? "Failed"}</strong>
            <small>
              {entry.request.url} · {formatWhen(entry.atMs)}
            </small>
          </span>
        </button>
      ))}
    </section>
  );
}

function ItemRow({
  title,
  detail,
  badge,
  selected,
  onOpen,
  onRename,
  onDelete,
  editor,
}: {
  title: string;
  detail?: string;
  badge?: string;
  selected: boolean;
  onOpen: () => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  editor?: (finish: () => void) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [pendingDelete, setPendingDelete] = useState(false);

  return (
    <div className="saved-row">
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
          <button type="button" className={selected ? "saved picked" : "saved"} onClick={onOpen}>
            <span className="saved-label">
              {badge ? <span className={`verb verb-${badge.toLowerCase()}`}>{badge}</span> : null}
              <strong>{title}</strong>
              {detail ? <small>{detail}</small> : null}
            </span>
          </button>
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
    </div>
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
  hasCollection,
  onClose,
  onSave,
}: {
  hasCollection: boolean;
  onClose: () => void;
  onSave: (name: string, headers: HeaderEntry[]) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [rows, setRows] = useState<HeaderEntry[]>([{ name: "", value: "", enabled: true, secret: false }]);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="New headers" onClose={onClose}>
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
            setError("Name the header set first.");
            return;
          }
          setError(null);
          void onSave(next, rows).catch((caught: unknown) => setError(messageOf(caught)));
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
  hasCollection,
  onClose,
  onSave,
}: {
  hasCollection: boolean;
  onClose: () => void;
  onSave: (name: string, body: RequestBody) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<RequestBody["kind"]>("json");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="New body" onClose={onClose}>
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
            setError("Name the body first.");
            return;
          }
          setError(null);
          const body: RequestBody = kind === "none" ? { kind: "none" } : { kind, value };
          void onSave(next, body).catch((caught: unknown) => setError(messageOf(caught)));
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
