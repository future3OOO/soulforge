import { Box, Text } from "ink";
import { useMemo } from "react";

// ─── Block-level types ───

type Block =
  | { type: "paragraph"; content: string }
  | { type: "code"; content: string; lang: string }
  | { type: "heading"; content: string; level: number }
  | { type: "list"; items: string[]; ordered: boolean }
  | { type: "hr" };

// ─── Hoisted RegExp (js-hoist-regexp) ───

const HEADING_RE = /^(#{1,6})\s+(.+)/;
const HR_RE = /^(-{3,}|\*{3,}|_{3,})\s*$/;
const UL_RE = /^\s*[-*+]\s/;
const OL_RE = /^\s*\d+[.)]\s/;

// ─── Block parser ───

function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // Code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        codeLines.push(lines[i] ?? "");
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      blocks.push({ type: "code", content: codeLines.join("\n"), lang });
      continue;
    }

    // Heading
    const hMatch = HEADING_RE.exec(line);
    if (hMatch?.[1] && hMatch[2]) {
      blocks.push({ type: "heading", level: hMatch[1].length, content: hMatch[2] });
      i++;
      continue;
    }

    // Horizontal rule
    if (HR_RE.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Unordered list
    if (UL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && UL_RE.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(UL_RE, ""));
        i++;
      }
      blocks.push({ type: "list", items, ordered: false });
      continue;
    }

    // Ordered list
    if (OL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && OL_RE.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(OL_RE, ""));
        i++;
      }
      blocks.push({ type: "list", items, ordered: true });
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-special lines
    const paraLines: string[] = [];
    while (i < lines.length) {
      const l = lines[i] ?? "";
      if (
        l.trim() === "" ||
        l.startsWith("```") ||
        HEADING_RE.test(l) ||
        HR_RE.test(l) ||
        UL_RE.test(l) ||
        OL_RE.test(l)
      ) {
        break;
      }
      paraLines.push(l);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", content: paraLines.join("\n") });
    }
  }

  return blocks;
}

// ─── Inline parser ───

interface InlineSpan {
  type: "text" | "bold" | "italic" | "code" | "strikethrough";
  content: string;
}

const INLINE_RE = /(\*\*(.+?)\*\*|`(.+?)`|\*(.+?)\*|~~(.+?)~~)/;

function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const match = INLINE_RE.exec(remaining);
    if (!match || match.index === undefined) {
      spans.push({ type: "text", content: remaining });
      break;
    }

    if (match.index > 0) {
      spans.push({ type: "text", content: remaining.slice(0, match.index) });
    }

    if (match[2] !== undefined) {
      spans.push({ type: "bold", content: match[2] });
    } else if (match[3] !== undefined) {
      spans.push({ type: "code", content: match[3] });
    } else if (match[4] !== undefined) {
      spans.push({ type: "italic", content: match[4] });
    } else if (match[5] !== undefined) {
      spans.push({ type: "strikethrough", content: match[5] });
    }

    remaining = remaining.slice(match.index + match[0].length);
  }

  return spans;
}

// ─── Inline renderer ───

function InlineText({ text, color }: { text: string; color?: string }) {
  const spans = useMemo(() => parseInline(text), [text]);
  const fg = color ?? "#ccc";

  return (
    <Text wrap="wrap">
      {spans.map((span, i) => {
        const key = `${i}-${span.type}`;
        switch (span.type) {
          case "bold":
            return (
              <Text key={key} bold color={fg}>
                {span.content}
              </Text>
            );
          case "italic":
            return (
              <Text key={key} italic color={fg}>
                {span.content}
              </Text>
            );
          case "code":
            return (
              <Text key={key} backgroundColor="#2a2a3e" color="#e8e8e8">
                {` ${span.content} `}
              </Text>
            );
          case "strikethrough":
            return (
              <Text key={key} strikethrough color="#888">
                {span.content}
              </Text>
            );
          default:
            return (
              <Text key={key} color={fg}>
                {span.content}
              </Text>
            );
        }
      })}
    </Text>
  );
}

// ─── Block renderers ───

function CodeBlock({ content, lang }: { content: string; lang: string }) {
  return (
    <Box flexDirection="column" marginY={0}>
      <Box height={1} flexShrink={0}>
        {lang ? (
          <Text color="#888" dimColor wrap="truncate">
            {"  "}
            {lang}
          </Text>
        ) : (
          <Text color="#333" wrap="truncate">
            {"  "}code
          </Text>
        )}
      </Box>
      <Box borderStyle="round" borderColor="#333" paddingX={1} flexDirection="column">
        <Text color="#e0e0e0">{content}</Text>
      </Box>
    </Box>
  );
}

function HeadingBlock({ content, level }: { content: string; level: number }) {
  const prefix = level <= 1 ? "# " : level === 2 ? "## " : "### ";
  const color = level <= 1 ? "#FF0040" : level === 2 ? "#9B30FF" : "#8B5CF6";
  return (
    <Box marginTop={level <= 1 ? 1 : 0} height={1} flexShrink={0}>
      <Text bold color={color} wrap="truncate">
        {prefix}
        {content}
      </Text>
    </Box>
  );
}

function ListBlock({
  items,
  ordered,
  color,
}: {
  items: string[];
  ordered: boolean;
  color?: string;
}) {
  return (
    <Box flexDirection="column">
      {items.map((item, i) => {
        const bullet = ordered ? `${i + 1}. ` : "  - ";
        return (
          <Box key={`li-${item.slice(0, 20)}-${i}`} minHeight={1} flexShrink={0}>
            <Text color="#8B5CF6">{bullet}</Text>
            <InlineText text={item} color={color} />
          </Box>
        );
      })}
    </Box>
  );
}

function HrBlock() {
  return (
    <Box height={1} flexShrink={0}>
      <Text color="#333">{"─".repeat(40)}</Text>
    </Box>
  );
}

// ─── Main component ───

interface Props {
  text: string;
  color?: string;
}

export function Markdown({ text, color }: Props) {
  const blocks = useMemo(() => parseBlocks(text), [text]);

  return (
    <Box flexDirection="column" width="100%">
      {blocks.map((block, i) => {
        const key = `b${i}`;
        switch (block.type) {
          case "code":
            return <CodeBlock key={key} content={block.content} lang={block.lang} />;
          case "heading":
            return <HeadingBlock key={key} content={block.content} level={block.level} />;
          case "list":
            return (
              <ListBlock key={key} items={block.items} ordered={block.ordered} color={color} />
            );
          case "hr":
            return <HrBlock key={key} />;
          default:
            // Render each line of a paragraph in its own Box to prevent overlap
            return (
              <Box key={key} flexDirection="column" width="100%">
                {block.content.split("\n").map((line) => (
                  <Box
                    key={`${key}-${line.slice(0, 32)}`}
                    minHeight={1}
                    flexShrink={0}
                    width="100%"
                  >
                    <InlineText text={line} color={color} />
                  </Box>
                ))}
              </Box>
            );
        }
      })}
    </Box>
  );
}
