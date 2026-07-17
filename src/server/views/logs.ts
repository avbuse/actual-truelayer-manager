import type { LogEntry } from "../../logging/logBuffer.js";
import { escapeHtml, layout } from "./layout.js";

export function logsPage(entries: LogEntry[]): string {
  const rows =
    entries.length === 0
      ? `<tr><td colspan="3" class="muted">No log entries yet.</td></tr>`
      : entries
          .map(
            (e) =>
              `<tr><td class="muted">${escapeHtml(e.at)}</td><td><span class="pill ${e.level === "error" ? "error" : e.level === "warn" ? "warn" : "muted"}">${e.level}</span></td><td>${escapeHtml(e.message)}</td></tr>`,
          )
          .join("");

  const body = `<div class="card">
    <h2>Recent logs</h2>
    <p class="muted">Secrets are redacted before logging.</p>
    <table><thead><tr><th>Time</th><th>Level</th><th>Message</th></tr></thead><tbody>${rows}</tbody></table>
  </div>`;

  return layout("Logs", body, "/logs");
}
