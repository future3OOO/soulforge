import type { LanguageModelV3ToolCall } from "@ai-sdk/provider";
import type { ModelMessage } from "ai";
import { jsonrepair } from "jsonrepair";

/**
 * Sanitize tool-call inputs in messages to prevent Anthropic API rejections.
 *
 * When the model generates malformed tool call args (unparseable JSON or non-object
 * JSON like a string/array/number), the AI SDK stores the raw value as `input` and
 * marks the call `invalid: true`. On the next step, the SDK replays these tool_use
 * blocks as-is. The Anthropic API requires `tool_use.input` to be a dictionary —
 * sending a raw string or array causes:
 *   "messages.N.content.M.tool_use.input: Input should be a valid dictionary"
 *
 * This prepareStep hook ensures all tool-call inputs are plain objects.
 */
export function sanitizeMessages(messages: ModelMessage[]): ModelMessage[] {
  let dirty = false;
  const cleaned = messages.map((msg) => {
    if (msg.role !== "assistant" || typeof msg.content === "string") return msg;
    if (!Array.isArray(msg.content)) return msg;

    let contentDirty = false;
    const content = msg.content.map((part) => {
      if (part.type !== "tool-call") return part;
      const input = part.input;
      if (typeof input === "object" && input !== null && !Array.isArray(input)) return part;
      contentDirty = true;
      return { ...part, input: {} };
    });

    if (!contentDirty) return msg;
    dirty = true;
    return { ...msg, content };
  });

  return dirty ? cleaned : messages;
}

/** prepareStep hook that sanitizes tool-call inputs. */
export function sanitizeToolInputsStep({
  messages,
}: {
  messages: ModelMessage[];
}): { messages: ModelMessage[] } | undefined {
  const cleaned = sanitizeMessages(messages);
  return cleaned !== messages ? { messages: cleaned } : undefined;
}

/**
 * Attempt to repair malformed tool call JSON from weaker models.
 *
 * Uses the `jsonrepair` library which handles:
 * - Trailing commas in objects/arrays
 * - Truncated JSON (unclosed brackets from output token limits)
 * - Unquoted property names and string values
 * - Single quotes instead of double quotes
 * - Special quote characters, comments, and more
 *
 * Returns the repaired tool call or null if repair isn't possible.
 */
export async function repairToolCall({
  toolCall,
}: {
  toolCall: LanguageModelV3ToolCall;
}): Promise<LanguageModelV3ToolCall | null> {
  const trimmed = toolCall.input.trim();
  if (!trimmed) return null;

  let repaired: string;
  try {
    repaired = jsonrepair(trimmed);
  } catch {
    return null;
  }

  // Verify the result is a valid JSON object (not array, string, number, etc.)
  try {
    const parsed = JSON.parse(repaired);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  } catch {
    return null;
  }

  // Nothing changed — no repair was needed
  if (repaired === trimmed) return null;

  return { ...toolCall, input: repaired };
}
