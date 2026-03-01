import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ToolResult } from "../../types";
import { analyzeFile, checkConstraints } from "../analysis/complexity";
import { MemoryManager } from "../memory/manager";

interface EditFileArgs {
  path: string;
  oldString: string;
  newString: string;
}

function formatMetricDelta(label: string, before: number, after: number): string {
  const delta = after - before;
  if (delta === 0) return "";
  const sign = delta > 0 ? "+" : "";
  return `${label}: ${String(before)}→${String(after)} (${sign}${String(delta)})`;
}

export const editFileTool = {
  name: "edit_file",
  description:
    "Edit a file by replacing an exact string match with new content. Also supports creating new files.",
  execute: async (args: EditFileArgs): Promise<ToolResult> => {
    try {
      const filePath = resolve(args.path);
      const oldStr = args.oldString;
      const newStr = args.newString;

      // Create new file
      if (oldStr === "") {
        writeFileSync(filePath, newStr, "utf-8");
        const metrics = analyzeFile(newStr);
        return {
          success: true,
          output: `Created ${filePath} (lines: ${String(metrics.lineCount)}, imports: ${String(metrics.importCount)})`,
        };
      }

      if (!existsSync(filePath)) {
        return { success: false, output: "", error: `File not found: ${filePath}` };
      }

      const content = readFileSync(filePath, "utf-8");

      if (!content.includes(oldStr)) {
        return {
          success: false,
          output: "",
          error: "old_string not found in file. Make sure it matches exactly.",
        };
      }

      const occurrences = content.split(oldStr).length - 1;
      if (occurrences > 1) {
        return {
          success: false,
          output: "",
          error: `Found ${occurrences} matches. Provide more context to make the match unique.`,
        };
      }

      const beforeMetrics = analyzeFile(content);
      const updated = content.replace(oldStr, newStr);
      const afterMetrics = analyzeFile(updated);

      // Check constraints
      const cwd = process.cwd();
      const memory = new MemoryManager(cwd);
      const constraints = memory.loadConstraints();
      const violations = checkConstraints(afterMetrics, constraints, filePath);

      const blockers = violations.filter((v) => v.constraint.action === "block");
      if (blockers.length > 0) {
        const msgs = blockers.map(
          (v) =>
            `${v.constraint.name}: ${v.constraint.metric} is ${String(v.actual)} (limit: ${String(v.constraint.limit)})`,
        );
        return {
          success: false,
          output: "",
          error: `Constraint violation(s): ${msgs.join("; ")}`,
        };
      }

      writeFileSync(filePath, updated, "utf-8");

      // Build output with metrics
      const deltas = [
        formatMetricDelta("lines", beforeMetrics.lineCount, afterMetrics.lineCount),
        formatMetricDelta("imports", beforeMetrics.importCount, afterMetrics.importCount),
      ].filter(Boolean);

      let output = `Edited ${filePath}`;
      if (deltas.length > 0) {
        output += ` (${deltas.join(", ")})`;
      }

      // Append warnings
      const warnings = violations.filter((v) => v.constraint.action === "warn");
      if (warnings.length > 0) {
        const warnMsgs = warnings.map(
          (v) =>
            `⚠ ${v.constraint.name}: ${v.constraint.metric} is ${String(v.actual)} (limit: ${String(v.constraint.limit)})`,
        );
        output += `\n${warnMsgs.join("\n")}`;
      }

      return { success: true, output };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: "", error: msg };
    }
  },
};
