import { layout } from "./layout.js";

const WIZARD_STEPS = [
  "Connect to Actual Budget",
  "Configure TrueLayer app credentials",
  "Connect bank via OAuth",
  "Select bank accounts/cards",
  "Map them to Actual accounts",
  "Run dry-run sync",
  "Enable scheduled sync",
];

export function setupPage(): string {
  const steps = WIZARD_STEPS.map(
    (label, index) => `
      <div class="step">
        <div class="num">${index + 1}</div>
        <div><strong>${label}</strong></div>
      </div>`,
  ).join("");

  const body = `
    <div class="card">
      <h2>Setup wizard <span class="pill">scaffold</span></h2>
      <p>
        This is the Phase 0 scaffold of the setup wizard. The guided flow below is
        implemented in later phases; the server, routing, health checks, and
        configuration loading are working now.
      </p>
      ${steps}
    </div>
    <div class="card">
      <h2>Next steps</h2>
      <p>
        Check <code>GET /health</code> for liveness and <code>GET /status</code>
        for a machine-readable status document.
      </p>
    </div>`;

  return layout("Setup", body);
}
