import type { ToolResult } from "../../types/index.js";

interface WebSearchArgs {
  query: string;
  count?: number;
}

export const webSearchTool = {
  name: "web_search",
  description:
    "Search the web for current information. Use this when you need up-to-date data, documentation, or answers that may not be in the codebase. Returns search result snippets.",
  execute: async (args: WebSearchArgs): Promise<ToolResult> => {
    const query = args.query;
    const count = args.count ?? 5;

    try {
      // Use DuckDuckGo HTML search (no API key required)
      const encoded = encodeURIComponent(query);
      const url = `https://html.duckduckgo.com/html/?q=${encoded}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "SoulForge/1.0 (Terminal IDE)",
        },
      });

      if (!res.ok) {
        return {
          success: false,
          output: "",
          error: `Search failed: HTTP ${String(res.status)}`,
        };
      }

      const html = await res.text();

      // Parse results from DuckDuckGo HTML response
      const results: string[] = [];
      const resultRegex =
        /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      let match = resultRegex.exec(html);
      while (match && results.length < count) {
        const title = (match[2] ?? "").trim();
        const snippet = (match[3] ?? "")
          .replace(/<\/?b>/g, "")
          .replace(/<[^>]*>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#x27;/g, "'")
          .trim();
        const href = decodeURIComponent((match[1] ?? "").replace(/.*uddg=/, "").replace(/&.*/, ""));
        if (title && snippet) {
          results.push(`**${title}**\n${href}\n${snippet}`);
        }
        match = resultRegex.exec(html);
      }

      if (results.length === 0) {
        // Fallback: try simpler parsing
        const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
        let sMatch = snippetRegex.exec(html);
        while (sMatch && results.length < count) {
          const text = (sMatch[1] ?? "")
            .replace(/<[^>]*>/g, "")
            .replace(/&amp;/g, "&")
            .trim();
          if (text) results.push(text);
          sMatch = snippetRegex.exec(html);
        }
      }

      if (results.length === 0) {
        return {
          success: true,
          output: `No results found for: ${query}`,
        };
      }

      return {
        success: true,
        output: `Search results for "${query}":\n\n${results.join("\n\n---\n\n")}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: "", error: `Search error: ${msg}` };
    }
  },
};
