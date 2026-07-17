import { escapeHtml, layout } from "./layout.js";

export interface ConnectViewModel {
  connectionId: string;
  authUrl: string;
  redirectMode: "manual" | "direct";
}

export function connectPage(vm: ConnectViewModel): string {
  const manual = `
    <p>1. Open the authorisation link and sign in with your bank:</p>
    <p><a class="btn" href="${escapeHtml(vm.authUrl)}" target="_blank" rel="noreferrer">Open bank authorisation</a></p>
    <p>2. After authorising, you will land on the TrueLayer redirect page. Copy the full URL from your browser and paste it below:</p>
    <form method="post" action="/oauth/exchange">
      <input type="hidden" name="connection_id" value="${escapeHtml(vm.connectionId)}" />
      <label>Pasted redirect URL</label>
      <input name="redirect_url" placeholder="https://console.truelayer.com/redirect-page?code=..." />
      <button type="submit">Complete connection</button>
    </form>`;

  const direct = `
    <p>Open the authorisation link and sign in with your bank. You will be redirected back automatically:</p>
    <p><a class="btn" href="${escapeHtml(vm.authUrl)}">Open bank authorisation</a></p>`;

  const body = `<div class="card">
    <h2>Authorise bank access</h2>
    ${vm.redirectMode === "manual" ? manual : direct}
  </div>`;

  return layout("Connect bank", body, "/setup");
}
