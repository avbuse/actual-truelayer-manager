import type {
  BankConnectionRow,
  SyncRunRow,
} from "../../db/types.js";
import { escapeHtml, layout } from "./layout.js";

export interface DashboardViewModel {
  demoMode: boolean;
  warnings?: string[];
  actual: { status: string; serverUrl?: string; syncId?: string };
  connections: (BankConnectionRow & { mappedAccounts: number })[];
  lastSync?: SyncRunRow;
  scheduleHours: number;
  flash?: { kind: "ok" | "error"; message: string };
}

function money(minor: number): string {
  return `£${(minor / 100).toFixed(2)}`;
}

export function dashboardPage(vm: DashboardViewModel): string {
  const connectionRows =
    vm.connections.length === 0
      ? `<tr><td colspan="4" class="muted">No connections yet. <a href="/setup">Add one &rarr;</a></td></tr>`
      : vm.connections
          .map(
            (c) => `<tr>
              <td>${escapeHtml(c.display_name)}</td>
              <td><span class="pill ${c.status}">${c.status}</span></td>
              <td>${c.consent_expires_at ? escapeHtml(c.consent_expires_at.slice(0, 10)) : "—"}</td>
              <td>${c.mappedAccounts}</td>
            </tr>`,
          )
          .join("");

  const last = vm.lastSync;
  const lastSyncHtml = last
    ? `<table>
        <tr><th>Status</th><td><span class="pill ${last.status}">${last.status}</span></td></tr>
        <tr><th>Fetched</th><td>${last.fetched_count}</td></tr>
        <tr><th>Imported</th><td>${last.imported_count}</td></tr>
        <tr><th>Duplicates</th><td>${last.duplicate_count}</td></tr>
        <tr><th>Failed</th><td>${last.failed_count}</td></tr>
        <tr><th>Finished</th><td>${last.finished_at ? escapeHtml(last.finished_at) : "—"}</td></tr>
      </table>`
    : `<p class="muted">No syncs run yet.</p>`;

  const warningBanners = (vm.warnings ?? [])
    .map((w) => `<div class="flash error">${escapeHtml(w)}</div>`)
    .join("");

  const body = `
    ${warningBanners}
    <div class="card">
      <h2>Actual Budget</h2>
      <table>
        <tr><th>Status</th><td><span class="pill ${vm.actual.status === "ok" ? "ok" : "muted"}">${vm.actual.status}</span></td></tr>
        <tr><th>Server</th><td>${vm.actual.serverUrl ? escapeHtml(vm.actual.serverUrl) : "—"}</td></tr>
        <tr><th>Sync ID</th><td>${vm.actual.syncId ? escapeHtml(vm.actual.syncId) : "—"}</td></tr>
      </table>
    </div>

    <div class="card">
      <h2>Connections</h2>
      <table>
        <thead><tr><th>Name</th><th>Status</th><th>Consent expires</th><th>Mapped</th></tr></thead>
        <tbody>${connectionRows}</tbody>
      </table>
    </div>

    <div class="card">
      <h2>Last sync</h2>
      ${lastSyncHtml}
    </div>

    <div class="card">
      <h2>Actions</h2>
      <div class="row">
        <form method="post" action="/sync-now"><input type="hidden" name="mode" value="dry_run" /><button class="secondary" type="submit">Run dry-run</button></form>
        <form method="post" action="/sync-now"><input type="hidden" name="mode" value="live" /><button type="submit">Sync now (live)</button></form>
        <a class="btn secondary" href="/mappings">Edit mappings</a>
        <a class="btn secondary" href="/logs">View logs</a>
      </div>
      <p class="muted" style="margin-top:0.8rem">Scheduled sync: ${vm.scheduleHours > 0 ? `every ${vm.scheduleHours}h` : "manual only"}</p>
    </div>`;

  return layout("Dashboard", body, "/dashboard", vm.flash);
}

export { money };
