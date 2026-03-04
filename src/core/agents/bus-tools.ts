/**
 * Bus tools — extra tools given to subagents when running in a multi_agent dispatch.
 * These let agents communicate findings to peers via the shared AgentBus.
 */

import { tool } from "ai";
import { z } from "zod";
import type { AgentBus } from "./agent-bus.js";

/**
 * Build coordination tools for a specific agent on the bus.
 */
export function buildBusTools(bus: AgentBus, agentId: string) {
  return {
    report_finding: tool({
      description:
        "Report a finding to peer agents running in parallel. " +
        "Use this when you discover something important that other agents should know about — " +
        "file locations, architectural patterns, relevant code, key decisions, etc. " +
        "Peers can read your findings in real-time.",
      inputSchema: z.object({
        label: z
          .string()
          .describe("Short label for the finding (e.g. 'Config location', 'API pattern')"),
        content: z
          .string()
          .describe("Detailed content — code snippets, file paths, analysis, etc."),
      }),
      execute: async (args) => {
        bus.postFinding({
          agentId,
          label: args.label,
          content: args.content,
          timestamp: Date.now(),
        });
        return JSON.stringify({
          success: true,
          output: `Finding "${args.label}" shared with ${bus.findingCount - 1} other finding(s) on the bus.`,
        });
      },
    }),

    check_findings: tool({
      description:
        "Check findings reported by peer agents running in parallel. " +
        "Use this to see what other agents have discovered so far. " +
        "Returns all findings from peers, or findings from a specific peer agent.",
      inputSchema: z.object({
        peerId: z
          .string()
          .optional()
          .describe("Specific peer agent ID to check (omit for all peers)"),
      }),
      execute: async (args) => {
        const findings = args.peerId ? bus.getPeerFindings(args.peerId) : bus.getFindings(agentId);

        if (findings.length === 0) {
          return JSON.stringify({
            success: true,
            output: "No findings from peers yet.",
          });
        }

        const summary = findings
          .map((f) => `[${f.agentId}] ${f.label}:\n${f.content}`)
          .join("\n\n---\n\n");

        return JSON.stringify({
          success: true,
          output: summary,
        });
      },
    }),

    check_agent_result: tool({
      description:
        "Check if a specific peer agent has completed and get its final result. " +
        "Useful when your task depends on another agent's output.",
      inputSchema: z.object({
        peerId: z.string().describe("The agent ID to check"),
      }),
      execute: async (args) => {
        const result = bus.getResult(args.peerId);
        if (!result) {
          return JSON.stringify({
            success: true,
            output: `Agent "${args.peerId}" has not completed yet. Check back later or use check_findings to see its interim findings.`,
          });
        }
        return JSON.stringify({
          success: true,
          output: `Agent "${args.peerId}" (${result.role}) completed ${result.success ? "successfully" : "with errors"}:\n\n${result.result}`,
        });
      },
    }),
  };
}
