import { useState } from "react";
import { useSettings } from "../../state/settings";

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { settings, updateSettings } = useSettings();
  const [theme, setTheme] = useState(settings.theme);

  const handleSave = () => {
    updateSettings({ theme });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Settings</h2>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body">
          <section className="settings-section">
            <h3>Appearance</h3>
            <label className="setting-row">
              <span>Theme</span>
              <select value={theme} onChange={(e) => setTheme(e.target.value as "light" | "dark")}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
          </section>
        </div>
        <footer className="modal-footer">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" onClick={handleSave}>
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}
