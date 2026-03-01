import { useCallback, useState } from "react";
import type { FocusMode } from "../types/index.js";

interface UseEditorFocusReturn {
  focusMode: FocusMode;
  editorOpen: boolean;
  toggleFocus: () => void;
}

/**
 * Focus mode state machine.
 * Ctrl+E 3-state cycle:
 *   1. Editor closed → open + focus editor
 *   2. Editor open, editor focused → switch to chat (editor stays visible)
 *   3. Editor open, chat focused → close editor
 */
export function useEditorFocus(): UseEditorFocusReturn {
  const [focusMode, setFocusMode] = useState<FocusMode>("chat");
  const [editorOpen, setEditorOpen] = useState(false);

  const toggleFocus = useCallback(() => {
    if (!editorOpen) {
      // State 1: editor closed → open + focus editor
      setEditorOpen(true);
      setFocusMode("editor");
    } else if (focusMode === "editor") {
      // State 2: editor focused → switch to chat
      setFocusMode("chat");
    } else {
      // State 3: chat focused, editor open → close editor
      setEditorOpen(false);
      setFocusMode("chat");
    }
  }, [editorOpen, focusMode]);

  return { focusMode, editorOpen, toggleFocus };
}
