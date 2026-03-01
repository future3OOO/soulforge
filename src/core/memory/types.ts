export interface ArchitecturalDecision {
  id: string;
  timestamp: number;
  summary: string;
  rationale: string;
  tags?: string[];
}

export interface Invariant {
  name: string;
  rule: string;
  scope?: string;
}

export interface Constraint {
  name: string;
  metric: string; // "file_lines" | "import_count" | "export_count"
  limit: number;
  scope?: string;
  action: "warn" | "block";
}
