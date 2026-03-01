import { Box, Text } from "ink";
import type { ChatMessage } from "../types";
import { Markdown } from "./Markdown.js";

interface Props {
  messages: ChatMessage[];
}

const ROLE_STYLES = {
  user: { icon: "", label: "You", color: "#FF0040" as const },
  assistant: { icon: "󰚩", label: "Forge", color: "#9B30FF" as const },
  system: { icon: "", label: "System", color: "#555" as const },
};

export function MessageList({ messages }: Props) {
  return (
    <Box flexDirection="column" paddingX={1} width="100%">
      {messages.map((msg, idx) => {
        const style = ROLE_STYLES[msg.role];
        const isLast = idx === messages.length - 1;
        return (
          <Box
            key={msg.timestamp}
            flexDirection="column"
            marginBottom={isLast ? 0 : 1}
            width="100%"
          >
            {/* Header: single line — icon role time */}
            <Box height={1} flexShrink={0} width="100%">
              <Text color={style.color} bold wrap="truncate">
                {style.icon} {style.label}
              </Text>
              <Text color="#333" wrap="truncate">
                {" "}
                {formatTime(msg.timestamp)}
              </Text>
            </Box>

            {/* Content */}
            <Box marginLeft={3} flexDirection="column" width="100%">
              <Markdown text={msg.content} color={msg.role === "assistant" ? "#ccc" : "#eee"} />
            </Box>

            {/* Tool calls — each on its own single line */}
            {msg.toolCalls?.map((tc) => (
              <Box key={tc.id} marginLeft={3} height={1} flexShrink={0} width="100%">
                <Text wrap="truncate">
                  <Text color="#DC143C">{">"} </Text>
                  <Text color="#666">
                    {tc.name}({JSON.stringify(tc.args).slice(0, 60)})
                  </Text>
                  {tc.result && (
                    <Text color={tc.result.success ? "#2d5" : "#f44"}>
                      {" "}
                      {tc.result.success ? "ok" : "err"}
                    </Text>
                  )}
                </Text>
              </Box>
            ))}
          </Box>
        );
      })}
    </Box>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour12: true,
    hour: "numeric",
    minute: "2-digit",
  });
}
