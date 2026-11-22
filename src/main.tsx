import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { LabProvider } from "./state/lab";

const root = document.getElementById("root") as HTMLElement;

function leaveCaseAlone(node: Node) {
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
    node.autocapitalize = "none";
    return;
  }
  if (node instanceof HTMLElement) {
    node.querySelectorAll("input, textarea").forEach((field) => {
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) field.autocapitalize = "none";
    });
  }
}

leaveCaseAlone(root);
new MutationObserver((records) => {
  for (const record of records) record.addedNodes.forEach(leaveCaseAlone);
}).observe(root, { childList: true, subtree: true });

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <LabProvider>
      <App />
    </LabProvider>
  </React.StrictMode>,
);
