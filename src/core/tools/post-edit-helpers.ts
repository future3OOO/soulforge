import { readBufferContent } from "../editor/instance.js";
import { autoFormatAfterEdit } from "./auto-format.js";
import { updateLastAfterHash } from "./edit-stack.js";

interface DiagnosticsContext {
  beforeDiags: import("../intelligence/types.js").Diagnostic[];
  router: import("../intelligence/router.js").CodeIntelligenceRouter;
  language: import("../intelligence/types.js").Language;
}

/**
 * Kick off pre-edit diagnostics in parallel — don't block the file write.
 * Skip if intelligence hasn't been initialized (avoids cold-starting LSP/tree-sitter from edit tools).
 */
export function startPreEditDiagnostics(filePath: string): Promise<DiagnosticsContext | null> {
  return import("../intelligence/index.js")
    .then(async (intel) => {
      if (!intel.isIntelligenceReady()) return null;
      const client = intel.getIntelligenceClient();
      const router = intel.getIntelligenceRouter(process.cwd());
      const language = client
        ? await client.routerDetectLanguage(filePath)
        : router.detectLanguage(filePath);
      let diags: import("../intelligence/types.js").Diagnostic[] | null = null;
      if (client) {
        const tracked = await client.routerGetDiagnostics(filePath);
        diags = tracked?.value ?? null;
      } else {
        diags = await router.executeWithFallback(language, "getDiagnostics", (b) =>
          b.getDiagnostics ? b.getDiagnostics(filePath) : Promise.resolve(null),
        );
      }
      return { beforeDiags: diags ?? [], router, language } as DiagnosticsContext;
    })
    .catch((): null => null);
}

/**
 * Auto-format after edit and append format status to output.
 * Returns the (possibly modified) output string.
 */
export async function appendAutoFormatResult(
  filePath: string,
  updatedContent: string,
  output: string,
  tabId?: string,
): Promise<string> {
  let result = output;
  const formatted = await autoFormatAfterEdit(filePath);
  if (formatted) {
    const postFormatContent = await readBufferContent(filePath);
    updateLastAfterHash(filePath, postFormatContent, tabId);
    const postLines = postFormatContent.split("\n").length;
    const preLines = updatedContent.split("\n").length;
    if (postLines !== preLines) {
      result += ` (formatted, line count changed ${String(preLines)}→${String(postLines)} — re-read affected range before next edit)`;
    } else {
      result += " (formatted)";
    }
  }
  return result;
}

/**
 * Post-edit diagnostics: same-file only (skip expensive cross-file findImporters).
 * Appends diagnostic diff to output if new issues were introduced.
 */
export async function appendPostEditDiagnostics(
  diagsPromise: Promise<DiagnosticsContext | null>,
  filePath: string,
  output: string,
): Promise<string> {
  let result = output;
  try {
    const diagCtx = await Promise.race([
      diagsPromise,
      new Promise<null>((r) => setTimeout(() => r(null), 500)),
    ]);
    if (diagCtx) {
      const { formatPostEditResult, sameFileDiagnostics } = await import(
        "../intelligence/post-edit.js"
      );
      const diffResult = await Promise.race([
        sameFileDiagnostics(diagCtx.router, filePath, diagCtx.language, diagCtx.beforeDiags),
        new Promise<null>((r) => setTimeout(() => r(null), 800)),
      ]);
      if (diffResult) {
        const diffOutput = formatPostEditResult(diffResult);
        if (diffOutput) result += `\n${diffOutput}`;
      }
    }
  } catch {}
  return result;
}

/**
 * Count occurrences of a substring without allocating split arrays.
 * O(n) scan using indexOf — cheaper than content.split(needle).length - 1
 * for large files with long needles.
 */
export function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let pos = haystack.indexOf(needle, 0);
  while (pos !== -1) {
    count++;
    pos = haystack.indexOf(needle, pos + needle.length);
  }
  return count;
}
