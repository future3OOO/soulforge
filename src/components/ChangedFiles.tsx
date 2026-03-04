import { relative } from "node:path";
import { Box, Text } from "ink";
import { useMemo } from "react";
import type { ChatMessage } from "../types/index.js";
import { POPUP_BG, PopupRow } from "./shared.js";

interface FileEntry {
  path: string;
  editCount: number;
  created: boolean;
}

interface TreeNode {
  name: string;
  fullPath: string;
  children: TreeNode[];
  file?: FileEntry;
}

function buildTree(files: FileEntry[], cwd: string): TreeNode {
  const root: TreeNode = { name: "", fullPath: "", children: [] };

  for (const file of files) {
    const rel = relative(cwd, file.path) || file.path;
    const parts = rel.split("/");
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;
      const isLast = i === parts.length - 1;
      let child = current.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, fullPath: parts.slice(0, i + 1).join("/"), children: [] };
        current.children.push(child);
      }
      if (isLast) {
        child.file = file;
      }
      current = child;
    }
  }

  // Collapse single-child directories: a/b/c → a/b/c
  const collapse = (node: TreeNode): TreeNode => {
    node.children = node.children.map(collapse);
    if (node.children.length === 1 && !node.file) {
      const only = node.children[0];
      if (only && !only.file) {
        return {
          name: `${node.name}/${only.name}`,
          fullPath: only.fullPath,
          children: only.children,
          file: only.file,
        };
      }
    }
    return node;
  };

  root.children = root.children.map(collapse);
  return root;
}

function TreeRow({ node, prefix, isLast }: { node: TreeNode; prefix: string; isLast: boolean }) {
  const connector = isLast ? "└── " : "├── ";
  const childPrefix = isLast ? "    " : "│   ";
  const isDir = !node.file && node.children.length > 0;

  return (
    <>
      <Box height={1} flexShrink={0}>
        <Text wrap="truncate">
          <Text color="#333">
            {prefix}
            {connector}
          </Text>
          {isDir ? (
            <Text color="#8B5CF6">{node.name}/</Text>
          ) : (
            <>
              <Text color={node.file?.created ? "#2d5" : "#FF8C00"}>{node.name}</Text>
              {node.file && node.file.editCount > 1 && (
                <Text color="#555"> ({String(node.file.editCount)})</Text>
              )}
            </>
          )}
        </Text>
      </Box>
      {node.children.map((child, i) => (
        <TreeRow
          key={child.fullPath}
          node={child}
          prefix={`${prefix}${childPrefix}`}
          isLast={i === node.children.length - 1}
        />
      ))}
    </>
  );
}

interface Props {
  messages: ChatMessage[];
  cwd: string;
}

export function ChangedFiles({ messages, cwd }: Props) {
  const files = useMemo(() => {
    const fileMap = new Map<string, FileEntry>();

    for (const msg of messages) {
      if (msg.role !== "assistant" || !msg.toolCalls) continue;
      for (const tc of msg.toolCalls) {
        if (tc.name === "edit_file" && typeof tc.args.path === "string" && tc.result?.success) {
          const path = tc.args.path as string;
          const existing = fileMap.get(path);
          const isCreate = typeof tc.args.oldString === "string" && tc.args.oldString === "";
          if (existing) {
            existing.editCount++;
            if (isCreate) existing.created = true;
          } else {
            fileMap.set(path, { path, editCount: 1, created: isCreate });
          }
        }
      }
    }

    return [...fileMap.values()].sort((a, b) => a.path.localeCompare(b.path));
  }, [messages]);

  if (files.length === 0) return null;

  const tree = buildTree(files, cwd);

  return (
    <Box flexDirection="column">
      {/* Title */}
      <PopupRow w={30}>
        <Text color="#9B30FF" bold backgroundColor={POPUP_BG}>
          {"\uF07C"} Changes
        </Text>
        <Text color="#555" backgroundColor={POPUP_BG}>
          {"  "}
          {String(files.length)} file{files.length === 1 ? "" : "s"}
        </Text>
      </PopupRow>
      {/* Separator */}
      <PopupRow w={30}>
        <Text color="#333" backgroundColor={POPUP_BG}>
          {"─".repeat(26)}
        </Text>
      </PopupRow>
      {/* Tree */}
      <Box flexDirection="column" paddingLeft={1}>
        {tree.children.map((child, i) => (
          <TreeRow
            key={child.fullPath}
            node={child}
            prefix=""
            isLast={i === tree.children.length - 1}
          />
        ))}
      </Box>
    </Box>
  );
}
