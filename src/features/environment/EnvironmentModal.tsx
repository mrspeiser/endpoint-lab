import { useState } from "react";
import { useEnvironment } from "../../state/environment";
import type { EnvironmentVariable } from "../../types";

interface EnvironmentModalProps {
  onClose: () => void;
}

export function EnvironmentModal({ onClose }: EnvironmentModalProps) {
  const { currentEnvironment, environments, variables, setCurrentEnvironment, createEnvironment, updateVariable, deleteVariable, addVariable } = useEnvironment();
  const [newEnvName, setNewEnvName] = useState("");
  const [showNewEnv, setShowNewEnv] = useState(false);

  const handleAddVariable = () => {
    addVariable({ name: "", value: "", enabled: true });
  };

  const handleUpdateVariable = (index: number, field: keyof EnvironmentVariable, value: string | boolean) => {
    updateVariable(index, { [field]: value });
  };

  const handleCreateEnvironment = () => {
    if (newEnvName.trim()) {
      createEnvironment(newEnvName.trim());
      setNewEnvName("");
      setShowNewEnv(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog modal-wide" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div className="env-header">
            <h2>Environment Variables</h2>
            <div className="env-controls">
              <select 
                value={currentEnvironment} 
                onChange={(e) => setCurrentEnvironment(e.target.value)}
                aria-label="Select environment"
              >
                {environments.map((env) => (
                  <option key={env} value={env}>{env}</option>
                ))}
              </select>
              {showNewEnv ? (
                <div className="inline-form">
                  <input
                    type="text"
                    value={newEnvName}
                    placeholder="Environment name"
                    onChange={(e) => setNewEnvName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateEnvironment();
                      if (e.key === "Escape") setShowNewEnv(false);
                    }}
                    autoFocus
                  />
                  <button type="button" onClick={handleCreateEnvironment}>Add</button>
                  <button type="button" onClick={() => setShowNewEnv(false)}>Cancel</button>
                </div>
              ) : (
                <button type="button" onClick={() => setShowNewEnv(true)}>New Environment</button>
              )}
            </div>
          </div>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body">
          <div className="env-info">
            <p className="muted">
              Use variables in your requests with <code>{'{{variableName}}'}</code> syntax in URLs, headers, and bodies.
            </p>
          </div>
          <div className="env-table">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "40px" }}>
                    <input type="checkbox" disabled style={{ opacity: 0.3 }} />
                  </th>
                  <th>Variable</th>
                  <th>Value</th>
                  <th style={{ width: "60px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {variables.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty-state">
                      No variables defined. Click "Add Variable" to create one.
                    </td>
                  </tr>
                ) : (
                  variables.map((variable, index) => (
                    <tr key={index}>
                      <td>
                        <input
                          type="checkbox"
                          checked={variable.enabled}
                          onChange={(e) => handleUpdateVariable(index, "enabled", e.target.checked)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={variable.name}
                          placeholder="VARIABLE_NAME"
                          onChange={(e) => handleUpdateVariable(index, "name", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={variable.value}
                          placeholder="value"
                          onChange={(e) => handleUpdateVariable(index, "value", e.target.value)}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="ghost danger-text"
                          onClick={() => deleteVariable(index)}
                          aria-label="Delete variable"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={handleAddVariable} style={{ marginTop: "12px" }}>
            Add Variable
          </button>
        </div>
        <footer className="modal-footer">
          <button type="button" className="primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
