const NAV = [
  ["/dashboard", "Dashboard"],
  ["/setup", "Setup"],
  ["/connections", "Connections"],
  ["/mappings", "Mappings"],
  ["/logs", "Logs"],
] as const;

/** Minimal server-rendered HTML layout. Kept intentionally dependency-free. */
export function layout(
  title: string,
  body: string,
  active = "",
  flash?: { kind: "ok" | "error"; message: string },
): string {
  const nav = NAV.map(
    ([href, label]) =>
      `<a href="${href}"${href === active ? ' class="active"' : ""}>${label}</a>`,
  ).join("");

  const flashHtml = flash
    ? `<div class="flash ${flash.kind}">${escapeHtml(flash.message)}</div>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} · Actual TrueLayer Manager</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        margin: 0; line-height: 1.5; background: #0f172a; color: #e2e8f0;
      }
      header {
        padding: 1rem 1.5rem; background: #1e293b; border-bottom: 1px solid #334155;
        display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;
      }
      header h1 { margin: 0; font-size: 1.05rem; }
      nav { display: flex; gap: 0.25rem; flex-wrap: wrap; }
      nav a {
        color: #cbd5e1; text-decoration: none; padding: 0.35rem 0.7rem; border-radius: 8px; font-size: 0.9rem;
      }
      nav a:hover { background: #334155; }
      nav a.active { background: #2563eb; color: white; }
      main { max-width: 820px; margin: 0 auto; padding: 1.5rem; }
      .card {
        background: #1e293b; border: 1px solid #334155; border-radius: 12px;
        padding: 1.25rem 1.5rem; margin-bottom: 1rem;
      }
      .card h2 { margin-top: 0; font-size: 1rem; }
      label { display: block; font-size: 0.85rem; color: #94a3b8; margin: 0.6rem 0 0.2rem; }
      input, select {
        width: 100%; padding: 0.5rem 0.6rem; border-radius: 8px; border: 1px solid #334155;
        background: #0f172a; color: #e2e8f0; font-size: 0.9rem;
      }
      button, .btn {
        display: inline-block; margin-top: 0.9rem; padding: 0.5rem 1rem; border: none; border-radius: 8px;
        background: #2563eb; color: white; font-size: 0.9rem; cursor: pointer; text-decoration: none;
      }
      button.secondary, .btn.secondary { background: #334155; }
      button:hover, .btn:hover { filter: brightness(1.1); }
      table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
      th, td { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid #334155; }
      th { color: #94a3b8; font-weight: 600; }
      code { background: #0f172a; padding: 0.1rem 0.35rem; border-radius: 6px; word-break: break-all; }
      .pill { display: inline-block; font-size: 0.72rem; padding: 0.12rem 0.55rem; border-radius: 999px; }
      .pill.active, .pill.ok, .pill.success { background: #14532d; color: #bbf7d0; }
      .pill.warn, .pill.partial, .pill.setup_pending { background: #713f12; color: #fde68a; }
      .pill.error, .pill.failed, .pill.reauth_required { background: #7f1d1d; color: #fecaca; }
      .pill.muted { background: #334155; color: #cbd5e1; }
      .flash { padding: 0.7rem 1rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.9rem; }
      .flash.ok { background: #14532d; color: #bbf7d0; }
      .flash.error { background: #7f1d1d; color: #fecaca; }
      .step { display: flex; gap: 0.75rem; align-items: flex-start; margin-bottom: 0.5rem; }
      .step .num { flex: 0 0 1.6rem; height: 1.6rem; border-radius: 50%; background: #2563eb; color: white; display: grid; place-items: center; font-size: 0.8rem; font-weight: 600; }
      .step.done .num { background: #14532d; color: #bbf7d0; }
      .muted { color: #94a3b8; }
      .row { display: flex; gap: 0.75rem; flex-wrap: wrap; }
      a { color: #60a5fa; }
      footer { text-align: center; color: #64748b; font-size: 0.8rem; padding: 1.5rem; }
    </style>
  </head>
  <body>
    <header>
      <h1>Actual TrueLayer Manager</h1>
      <nav>${nav}</nav>
    </header>
    <main>${flashHtml}${body}</main>
    <footer>self-hosted · <a href="/health">/health</a> · <a href="/status">/status</a></footer>
  </body>
</html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
