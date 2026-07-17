import { redactString } from "../crypto/redact.js";

export interface LogEntry {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
}

/**
 * A small ring buffer of recent, redacted application log lines surfaced on the
 * `/logs` page (spec §12.5). All messages are passed through the redaction
 * utility before being stored.
 */
export class LogBuffer {
  private readonly entries: LogEntry[] = [];

  constructor(private readonly capacity = 200) {}

  private push(level: LogEntry["level"], message: string): void {
    this.entries.push({
      at: new Date().toISOString(),
      level,
      message: redactString(message),
    });
    if (this.entries.length > this.capacity) {
      this.entries.shift();
    }
  }

  info(message: string): void {
    this.push("info", message);
  }

  warn(message: string): void {
    this.push("warn", message);
  }

  error(message: string): void {
    this.push("error", message);
  }

  recent(limit = 100): LogEntry[] {
    return this.entries.slice(-limit).reverse();
  }
}
