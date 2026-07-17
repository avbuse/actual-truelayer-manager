import type { SyncRunner } from "./syncRunner.js";

export interface SchedulerLogger {
  info: (msg: string) => void;
  error: (msg: string) => void;
}

/**
 * Runs a live sync on a fixed interval (spec §11.2 step 6 / §13). An interval
 * of 0 disables scheduling (manual-only).
 */
export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly runner: SyncRunner,
    private readonly intervalHours: number,
    private readonly logger?: SchedulerLogger,
  ) {}

  start(): void {
    if (this.intervalHours <= 0 || this.timer) return;
    const intervalMs = this.intervalHours * 3_600_000;
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    // Do not keep the process alive solely for the scheduler.
    this.timer.unref?.();
    this.logger?.info(`Scheduler started: every ${this.intervalHours}h`);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const summary = await this.runner.run({ dryRun: false, mode: "scheduled" });
      this.logger?.info(
        `Scheduled sync ${summary.runId}: ${summary.status} (imported ${summary.imported})`,
      );
    } catch (error) {
      this.logger?.error(
        `Scheduled sync failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
    } finally {
      this.running = false;
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
