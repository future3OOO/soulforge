import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ArchitecturalDecision, Constraint, Invariant } from "./types.js";

export class MemoryManager {
  private dir: string;

  constructor(cwd: string) {
    this.dir = join(cwd, ".soulforge", "memory");
  }

  ensureDir(): void {
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
  }

  exists(): boolean {
    return existsSync(this.dir);
  }

  loadDecisions(): ArchitecturalDecision[] {
    const path = join(this.dir, "decisions.jsonl");
    if (!existsSync(path)) return [];
    try {
      return readFileSync(path, "utf-8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as ArchitecturalDecision);
    } catch {
      return [];
    }
  }

  appendDecision(d: Omit<ArchitecturalDecision, "id" | "timestamp">): ArchitecturalDecision {
    this.ensureDir();
    const decision: ArchitecturalDecision = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...d,
    };
    const path = join(this.dir, "decisions.jsonl");
    appendFileSync(path, `${JSON.stringify(decision)}\n`, "utf-8");
    return decision;
  }

  loadInvariants(): Invariant[] {
    const path = join(this.dir, "invariants.json");
    if (!existsSync(path)) return [];
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as Invariant[];
    } catch {
      return [];
    }
  }

  saveInvariants(invariants: Invariant[]): void {
    this.ensureDir();
    const path = join(this.dir, "invariants.json");
    writeFileSync(path, JSON.stringify(invariants, null, 2), "utf-8");
  }

  loadConstraints(): Constraint[] {
    const path = join(this.dir, "constraints.json");
    if (!existsSync(path)) return [];
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as Constraint[];
    } catch {
      return [];
    }
  }

  saveConstraints(constraints: Constraint[]): void {
    this.ensureDir();
    const path = join(this.dir, "constraints.json");
    writeFileSync(path, JSON.stringify(constraints, null, 2), "utf-8");
  }

  buildMemoryContext(): string | null {
    if (!this.exists()) return null;

    const parts: string[] = [];
    const invariants = this.loadInvariants();
    const constraints = this.loadConstraints();
    const decisions = this.loadDecisions();

    if (invariants.length > 0) {
      parts.push("### Invariants");
      for (const inv of invariants) {
        parts.push(`- **${inv.name}**: ${inv.rule}${inv.scope ? ` (scope: ${inv.scope})` : ""}`);
      }
    }

    if (constraints.length > 0) {
      parts.push("", "### Constraints");
      for (const c of constraints) {
        parts.push(
          `- **${c.name}**: ${c.metric} ≤ ${String(c.limit)}${c.scope ? ` (${c.scope})` : ""} [${c.action}]`,
        );
      }
    }

    if (decisions.length > 0) {
      const recent = decisions.slice(-10);
      parts.push("", "### Recent Decisions");
      for (const d of recent) {
        const date = new Date(d.timestamp).toISOString().slice(0, 10);
        parts.push(
          `- [${date}] **${d.summary}**: ${d.rationale}${d.tags ? ` (${d.tags.join(", ")})` : ""}`,
        );
      }
    }

    return parts.length > 0 ? parts.join("\n") : null;
  }
}
