import { useState } from "react";
import { useLab } from "../../state/lab";
import { exportCollection, exportRequest, exportAsCurl, type ExportFormat } from "../../lib/export";

interface ExportModalProps {
  onClose: () => void;
}

type ExportType = "collection" | "request";

export function ExportModal({ onClose }: ExportModalProps) {
  const { state } = useLab();
  const [exportType, setExportType] = useState<ExportType>("request");
  const [format, setFormat] = useState<ExportFormat>("json");
  const [output, setOutput] = useState("");
  const [copied, setCopied] = useState(false);

  const selectedCollection = state.domains
    .find((d) => d.id === state.selectedDomainId)
    ?.collections.find((c) => c.id === state.selectedCollectionId);

  const handleExport = () => {
    try {
      let result = "";
      
      if (exportType === "request") {
        if (format === "curl") {
          result = exportAsCurl(state.request);
        } else {
          result = exportRequest(state.request, format);
        }
      } else if (exportType === "collection" && selectedCollection) {
        result = exportCollection(selectedCollection, format);
      }
      
      setOutput(result);
      setCopied(false);
    } catch (error) {
      setOutput(`Error: ${error instanceof Error ? error.message : "Export failed"}`);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([output], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `endpoint-lab-export.${format === "curl" ? "sh" : format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog modal-wide" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Export</h2>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body">
          <div className="export-controls">
            <label className="setting-row">
              <span>Export Type</span>
              <select value={exportType} onChange={(e) => setExportType(e.target.value as ExportType)}>
                <option value="request">Current Request</option>
                <option value="collection" disabled={!selectedCollection}>
                  Collection {selectedCollection ? `(${selectedCollection.name})` : "(select a collection)"}
                </option>
              </select>
            </label>
            <label className="setting-row">
              <span>Format</span>
              <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
                <option value="json">JSON</option>
                <option value="curl">cURL</option>
                <option value="http">HTTP</option>
              </select>
            </label>
            <button type="button" className="primary" onClick={handleExport}>
              Generate
            </button>
          </div>

          {output && (
            <div className="export-output">
              <div className="output-header">
                <span className="muted">Output</span>
                <div className="output-actions">
                  <button type="button" className="ghost" onClick={handleCopy}>
                    {copied ? "✓ Copied" : "Copy"}
                  </button>
                  <button type="button" className="ghost" onClick={handleDownload}>
                    Download
                  </button>
                </div>
              </div>
              <textarea
                className="export-textarea"
                value={output}
                readOnly
                rows={20}
              />
            </div>
          )}
        </div>
        <footer className="modal-footer">
          <button type="button" onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>
  );
}
