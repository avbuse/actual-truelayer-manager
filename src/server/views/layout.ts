/** Minimal server-rendered HTML layout. Kept intentionally dependency-free. */
export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} · Actual TrueLayer Manager</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        margin: 0;
        line-height: 1.5;
        background: #0f172a;
        color: #e2e8f0;
      }
      header {
        padding: 1.25rem 1.5rem;
        background: #1e293b;
        border-bottom: 1px solid #334155;
      }
      header h1 { margin: 0; font-size: 1.15rem; }
      header p { margin: 0.25rem 0 0; color: #94a3b8; font-size: 0.85rem; }
      main { max-width: 720px; margin: 0 auto; padding: 1.5rem; }
      .card {
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 12px;
        padding: 1.25rem 1.5rem;
        margin-bottom: 1rem;
      }
      .card h2 { margin-top: 0; font-size: 1rem; }
      .step { display: flex; gap: 0.75rem; align-items: flex-start; }
      .step .num {
        flex: 0 0 1.75rem;
        height: 1.75rem;
        border-radius: 50%;
        background: #2563eb;
        color: white;
        display: grid;
        place-items: center;
        font-size: 0.85rem;
        font-weight: 600;
      }
      code { background: #0f172a; padding: 0.1rem 0.35rem; border-radius: 6px; }
      .pill {
        display: inline-block;
        font-size: 0.75rem;
        padding: 0.15rem 0.6rem;
        border-radius: 999px;
        background: #14532d;
        color: #bbf7d0;
      }
      a { color: #60a5fa; }
      footer { text-align: center; color: #64748b; font-size: 0.8rem; padding: 1.5rem; }
    </style>
  </head>
  <body>
    <header>
      <h1>Actual TrueLayer Manager</h1>
      <p>Sync UK Open Banking transactions from TrueLayer into Actual Budget</p>
    </header>
    <main>${body}</main>
    <footer>Phase 0 scaffold · self-hosted · <a href="/health">/health</a> · <a href="/status">/status</a></footer>
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
