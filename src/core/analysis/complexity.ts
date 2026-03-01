import type { Constraint } from "../memory/types.js";

export interface ComplexityMetrics {
  lineCount: number;
  importCount: number;
  exportCount: number;
  functionCount: number;
}

export interface ConstraintViolation {
  constraint: Constraint;
  actual: number;
}

export function analyzeFile(content: string): ComplexityMetrics {
  const lines = content.split("\n");
  let importCount = 0;
  let exportCount = 0;
  let functionCount = 0;

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (/^import\s/.test(trimmed)) importCount++;
    if (/^export\s/.test(trimmed)) exportCount++;
    if (/function\s+\w+/.test(trimmed)) functionCount++;
    if (/(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\(/.test(trimmed)) functionCount++;
  }

  return {
    lineCount: lines.length,
    importCount,
    exportCount,
    functionCount,
  };
}

const METRIC_MAP: Record<string, keyof ComplexityMetrics> = {
  file_lines: "lineCount",
  import_count: "importCount",
  export_count: "exportCount",
  function_count: "functionCount",
};

export function checkConstraints(
  metrics: ComplexityMetrics,
  constraints: Constraint[],
  filePath?: string,
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const c of constraints) {
    if (c.scope && filePath && !filePath.includes(c.scope)) continue;

    const key = METRIC_MAP[c.metric];
    if (!key) continue;

    const actual = metrics[key];
    if (actual > c.limit) {
      violations.push({ constraint: c, actual });
    }
  }

  return violations;
}
