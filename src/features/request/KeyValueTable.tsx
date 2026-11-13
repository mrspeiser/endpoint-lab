import { isSensitiveName } from "../../lib/format";

export interface KeyValueRow {
  name: string;
  value: string;
  enabled: boolean;
  secret: boolean;
  secretRef?: string;
}

interface KeyValueTableProps {
  rows: KeyValueRow[];
  onChange: (rows: KeyValueRow[]) => void;
  secretColumn?: boolean;
  namePlaceholder: string;
  valuePlaceholder: string;
}

export function KeyValueTable({
  rows,
  onChange,
  secretColumn = false,
  namePlaceholder,
  valuePlaceholder,
}: KeyValueTableProps) {
  const update = (index: number, patch: Partial<KeyValueRow>) => {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  };

  return (
    <div className="kv">
      <div className={`kv-head ${secretColumn ? "with-secret" : ""}`}>
        <span />
        <span>Name</span>
        <span>Value</span>
        {secretColumn ? <span>Secret</span> : null}
        <span />
      </div>
      {rows.map((row, index) => {
        const forced = secretColumn && isSensitiveName(row.name);
        return (
          <div className={`kv-row ${secretColumn ? "with-secret" : ""}`} key={index}>
            <input
              type="checkbox"
              checked={row.enabled}
              aria-label={`Enable ${row.name || "row"}`}
              onChange={(event) => update(index, { enabled: event.target.checked })}
            />
            <input
              value={row.name}
              placeholder={namePlaceholder}
              aria-label="Name"
              onChange={(event) => {
                const name = event.target.value;
                update(index, { name, secret: row.secret || isSensitiveName(name) });
              }}
            />
            <input
              value={row.value}
              placeholder={valuePlaceholder}
              aria-label="Value"
              type={row.secret || forced ? "password" : "text"}
              onChange={(event) => update(index, { value: event.target.value })}
            />
            {secretColumn ? (
              <input
                type="checkbox"
                checked={row.secret || forced}
                disabled={forced}
                aria-label="Store this value in the keychain"
                onChange={(event) => update(index, { secret: event.target.checked })}
              />
            ) : null}
            <button
              type="button"
              className="ghost danger-text"
              aria-label="Remove row"
              onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
            >
              Remove
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="ghost"
        onClick={() => onChange([...rows, { name: "", value: "", enabled: true, secret: false }])}
      >
        Add row
      </button>
    </div>
  );
}
