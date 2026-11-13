import { useState } from "react";

import { formatWhen } from "../../lib/format";
import { useLab } from "../../state/lab";

export function Sidebar() {
  const lab = useLab();
  const { state } = lab;
  const [collectionName, setCollectionName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [saveCollection, setSaveCollection] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  return (
    <aside className="sidebar">
      <section>
        <header className="side-head">
          <h2>Collections</h2>
        </header>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const name = collectionName.trim();
            if (!name) return;
            void lab.createCollection(name).then(() => setCollectionName("")).catch((error: unknown) => {
              setSaveError(messageOf(error));
            });
          }}
        >
          <input
            value={collectionName}
            placeholder="New collection"
            aria-label="New collection name"
            onChange={(event) => setCollectionName(event.target.value)}
          />
          <button type="submit">Add</button>
        </form>
        {state.collections.length === 0 ? <p className="muted">No saved collections yet.</p> : null}
        {state.collections.map((collection) => (
          <div key={collection.id} className="collection">
            {editing === collection.id ? (
              <form
                className="inline-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void lab.renameCollection(collection.id, editName).then(() => setEditing(null));
                }}
              >
                <input value={editName} aria-label="Collection name" onChange={(event) => setEditName(event.target.value)} />
                <button type="submit">Save</button>
              </form>
            ) : (
              <div className="collection-title">
                <strong>{collection.name}</strong>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setEditing(collection.id);
                    setEditName(collection.name);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="ghost danger-text"
                  onClick={() => {
                    if (pendingDelete === collection.id) {
                      void lab.deleteCollection(collection.id);
                      setPendingDelete(null);
                    } else {
                      setPendingDelete(collection.id);
                    }
                  }}
                >
                  {pendingDelete === collection.id ? "Confirm" : "Delete"}
                </button>
              </div>
            )}
            {collection.requests.map((saved) => (
              <div key={saved.id} className="saved-row">
                <button type="button" className="saved" onClick={() => void lab.openSaved(collection.id, saved.id)}>
                  <span className={`verb verb-${saved.method.toLowerCase()}`}>{saved.method}</span>
                  <span>
                    <strong>{saved.name}</strong>
                    <small>{saved.url}</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="ghost danger-text"
                  aria-label={`Delete ${saved.name}`}
                  onClick={() => void lab.deleteSaved(collection.id, saved.id)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        ))}
      </section>
      <section className="save-box">
        <h2>Save request</h2>
        <label className="field">
          Name
          <input value={state.name} onChange={(event) => lab.dispatch({ type: "name", name: event.target.value })} />
        </label>
        <label className="field">
          Collection
          <select value={saveCollection} onChange={(event) => setSaveCollection(event.target.value)}>
            <option value="">Select</option>
            {state.collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </select>
        </label>
        <div className="button-row">
          <button
            type="button"
            onClick={() => {
              if (!saveCollection) {
                setSaveError("Choose a collection first.");
                return;
              }
              setSaveError(null);
              void lab.saveNew(saveCollection).catch((error: unknown) => setSaveError(messageOf(error)));
            }}
          >
            Save new
          </button>
          <button
            type="button"
            disabled={!state.saved}
            onClick={() => {
              setSaveError(null);
              void lab.updateSaved().catch((error: unknown) => setSaveError(messageOf(error)));
            }}
          >
            Update
          </button>
        </div>
        {saveError ? <p className="form-error">{saveError}</p> : null}
      </section>
      <section className="history">
        <h2>History</h2>
        {state.history.length === 0 ? <p className="muted">Recent requests will show up here.</p> : null}
        {state.history.map((entry) => (
          <button key={entry.id} type="button" className="history-item" onClick={() => lab.openHistory(entry)}>
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
    </aside>
  );
}

function messageOf(error: unknown): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Could not save the request.";
}
