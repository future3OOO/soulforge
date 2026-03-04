/**
 * AgentBus — Shared coordination layer for parallel subagents.
 *
 * Each bus instance lives for the duration of a single `multi_agent` dispatch.
 * Subagents post findings to the bus, and can query findings from peers.
 * The bus is immutable-append-only (no deletions) to avoid race conditions.
 */

export interface BusFinding {
  /** Which agent posted this */
  agentId: string;
  /** Short label for the finding */
  label: string;
  /** Full content — code snippets, analysis, file paths, etc. */
  content: string;
  /** Timestamp */
  timestamp: number;
}

export interface AgentTask {
  /** Unique ID for this agent within the dispatch group */
  agentId: string;
  /** "explore" or "code" */
  role: "explore" | "code";
  /** The task description sent to the subagent */
  task: string;
  /** Optional dependencies — agent IDs that must complete first */
  dependsOn?: string[];
}

export interface AgentResult {
  agentId: string;
  role: "explore" | "code";
  task: string;
  result: string;
  success: boolean;
  error?: string;
}

export class AgentBus {
  private findings: BusFinding[] = [];
  private results = new Map<string, AgentResult>();
  private completionCallbacks = new Map<string, Array<() => void>>();

  /** Post a finding visible to all agents on the bus */
  postFinding(finding: BusFinding): void {
    this.findings.push(finding);
  }

  /** Get all findings, optionally excluding a specific agent's own findings */
  getFindings(excludeAgentId?: string): BusFinding[] {
    if (!excludeAgentId) return [...this.findings];
    return this.findings.filter((f) => f.agentId !== excludeAgentId);
  }

  /** Get findings from a specific peer agent */
  getPeerFindings(peerId: string): BusFinding[] {
    return this.findings.filter((f) => f.agentId === peerId);
  }

  /** Record a completed agent result */
  setResult(result: AgentResult): void {
    this.results.set(result.agentId, result);
    // Fire completion callbacks
    const cbs = this.completionCallbacks.get(result.agentId);
    if (cbs) {
      for (const cb of cbs) cb();
      this.completionCallbacks.delete(result.agentId);
    }
  }

  /** Get a completed agent's result (undefined if still running) */
  getResult(agentId: string): AgentResult | undefined {
    return this.results.get(agentId);
  }

  /** Get all completed results */
  getAllResults(): AgentResult[] {
    return [...this.results.values()];
  }

  /** Wait for a specific agent to complete */
  waitForAgent(agentId: string): Promise<AgentResult> {
    const existing = this.results.get(agentId);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve) => {
      const cbs = this.completionCallbacks.get(agentId) ?? [];
      cbs.push(() => {
        const result = this.results.get(agentId);
        if (result) resolve(result);
      });
      this.completionCallbacks.set(agentId, cbs);
    });
  }

  /** Summary of all findings for injection into agent prompts */
  summarizeFindings(excludeAgentId?: string): string {
    const findings = this.getFindings(excludeAgentId);
    if (findings.length === 0) return "No findings from peer agents yet.";
    return findings.map((f) => `[${f.agentId}] ${f.label}:\n${f.content}`).join("\n\n---\n\n");
  }

  /** Get the list of all agent IDs that have been registered */
  get completedAgentIds(): string[] {
    return [...this.results.keys()];
  }

  get findingCount(): number {
    return this.findings.length;
  }
}
