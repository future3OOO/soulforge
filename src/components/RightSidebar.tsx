import { Box, Text } from "ink";
import { useMemo } from "react";
import type { ChatMessage, Plan } from "../types/index.js";
import { ChangedFiles } from "./ChangedFiles.js";
import { PlanView } from "./PlanView.js";
import { POPUP_BG, PopupRow } from "./shared.js";

export function RightSidebar({
  plan,
  messages,
  cwd,
}: {
  plan: Plan | null;
  messages: ChatMessage[];
  cwd: string;
}) {
  // Check if there are any changed files
  const hasChanges = useMemo(() => {
    for (const msg of messages) {
      if (msg.role !== "assistant" || !msg.toolCalls) continue;
      for (const tc of msg.toolCalls) {
        if (tc.name === "edit_file" && tc.result?.success) return true;
      }
    }
    return false;
  }, [messages]);

  if (!plan && !hasChanges) return null;

  const innerW = 30;

  return (
    <Box flexDirection="column" flexShrink={0} width={34} paddingTop={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="#8B5CF6"
        width={32}
        overflowY="hidden"
      >
        {plan && <PlanView plan={plan} mode="overlay" />}
        {plan && hasChanges && (
          <PopupRow w={innerW}>
            <Text color="#444" backgroundColor={POPUP_BG}>
              {"─".repeat(innerW - 4)}
            </Text>
          </PopupRow>
        )}
        {hasChanges && <ChangedFiles messages={messages} cwd={cwd} />}
      </Box>
    </Box>
  );
}
