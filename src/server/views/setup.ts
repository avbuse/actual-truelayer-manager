import { escapeHtml, layout } from "./layout.js";

export interface SetupViewModel {
  demoMode: boolean;
  warnings?: string[];
  actual: { configured: boolean; serverUrl?: string; syncId?: string };
  truelayer: { configured: boolean; clientId?: string; redirectMode: string };
  connectionCount: number;
  mappingCount: number;
  scheduleHours: number;
  flash?: { kind: "ok" | "error"; message: string };
}

function stepBadge(done: boolean, index: number): string {
  return `<div class="step ${done ? "done" : ""}"><div class="num">${done ? "\u2713" : index}</div>`;
}

export function setupPage(vm: SetupViewModel): string {
  const demoBanner = vm.demoMode
    ? `<div class="flash ok">Demo mode is active — a simulated bank and Actual budget are used, so you can complete the whole flow without real credentials. Set <code>TRUELAYER_CLIENT_ID</code> and <code>ACTUAL_SERVER_URL</code> for live mode.</div>`
    : "";

  const warningBanners = (vm.warnings ?? [])
    .map((w) => `<div class="flash error">${escapeHtml(w)}</div>`)
    .join("");

  const body = `
    ${demoBanner}
    ${warningBanners}
    <div class="card">
      ${stepBadge(vm.actual.configured, 1)}
        <div style="flex:1">
          <strong>Step 1 · Connect to Actual Budget</strong>
          <form method="post" action="/setup/actual">
            <label>Actual server URL</label>
            <input name="server_url" value="${escapeHtml(vm.actual.serverUrl ?? (vm.demoMode ? "http://actual-budget:5006" : ""))}" placeholder="http://actual-budget:5006" />
            <label>Actual sync ID</label>
            <input name="sync_id" value="${escapeHtml(vm.actual.syncId ?? (vm.demoMode ? "demo-sync-id" : ""))}" placeholder="budget sync id" />
            <label>Actual password</label>
            <input name="password" type="password" placeholder="${vm.actual.configured ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (unchanged)" : "password"}" />
            <label>Actual E2E encryption password (optional)</label>
            <input name="encryption_password" type="password" placeholder="optional" />
            <button type="submit">Test &amp; save connection</button>
          </form>
        </div>
      </div>
    </div>

    <div class="card">
      ${stepBadge(vm.truelayer.configured, 2)}
        <div style="flex:1">
          <strong>Step 2 · Configure TrueLayer credentials</strong>
          <form method="post" action="/setup/truelayer">
            <label>TrueLayer client ID</label>
            <input name="client_id" value="${escapeHtml(vm.truelayer.clientId ?? (vm.demoMode ? "demo-client-id" : ""))}" />
            <label>TrueLayer client secret</label>
            <input name="client_secret" type="password" placeholder="${vm.truelayer.configured ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (unchanged)" : "client secret"}" />
            <label>Redirect mode</label>
            <select name="redirect_mode">
              <option value="manual"${vm.truelayer.redirectMode === "manual" ? " selected" : ""}>manual_redirect_page</option>
              <option value="direct"${vm.truelayer.redirectMode === "direct" ? " selected" : ""}>direct_callback</option>
            </select>
            <button type="submit">Save TrueLayer config</button>
          </form>
        </div>
      </div>
    </div>

    <div class="card">
      ${stepBadge(vm.connectionCount > 0, 3)}
        <div style="flex:1">
          <strong>Step 3 · Connect a bank</strong>
          <p class="muted">${vm.connectionCount} connection(s) so far.${vm.demoMode ? " In demo mode the bank connects instantly." : ""}</p>
          <form method="post" action="/connections/add">
            <label>Display name</label>
            <input name="display_name" value="${vm.demoMode ? "Demo Bank" : ""}" placeholder="e.g. Lloyds Personal" />
            <label>Connection type</label>
            <select name="connection_type">
              <option value="bank_account">Bank account</option>
              <option value="credit_card">Credit card</option>
            </select>
            <button type="submit">Add connection</button>
          </form>
        </div>
      </div>
    </div>

    <div class="card">
      ${stepBadge(vm.mappingCount > 0, 4)}
        <div style="flex:1">
          <strong>Step 4 &amp; 5 · Map accounts</strong>
          <p class="muted">${vm.mappingCount} account(s) mapped. <a href="/mappings">Open mappings &rarr;</a></p>
        </div>
      </div>
    </div>

    <div class="card">
      ${stepBadge(false, 6)}
        <div style="flex:1">
          <strong>Step 6 · Dry run &amp; sync</strong>
          <p class="muted">Run a dry-run or live sync from the <a href="/dashboard">dashboard</a>.</p>
        </div>
      </div>
    </div>

    <div class="card">
      ${stepBadge(vm.scheduleHours > 0, 7)}
        <div style="flex:1">
          <strong>Step 7 · Enable scheduled sync</strong>
          <form method="post" action="/setup/schedule">
            <label>Sync interval (hours, 0 = manual only)</label>
            <input name="interval_hours" type="number" min="0" value="${vm.scheduleHours}" />
            <button type="submit">Save schedule</button>
          </form>
        </div>
      </div>
    </div>`;

  return layout("Setup", body, "/setup", vm.flash);
}
