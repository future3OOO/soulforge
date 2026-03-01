import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useCallback, useEffect, useState } from "react";
import { getGitDiff, getGitStatus, gitAdd, gitCommit } from "../core/git/status.js";

const POPUP_WIDTH = 56;
const POPUP_BG = "#111122";
const POPUP_HL = "#1a1a3e";

interface Props {
  visible: boolean;
  cwd: string;
  onClose: () => void;
  onCommitted: (msg: string) => void;
  onRefresh: () => void;
}

function Row({ children, bg, w }: { children: React.ReactNode; bg?: string; w: number }) {
  const fill = bg ?? POPUP_BG;
  return (
    <Box width={w} height={1}>
      <Box position="absolute">
        <Text backgroundColor={fill}>{" ".repeat(w)}</Text>
      </Box>
      <Box position="absolute">
        <Text backgroundColor={fill}>{"  "}</Text>
        {children}
      </Box>
    </Box>
  );
}

export function GitCommitModal({ visible, cwd, onClose, onCommitted, onRefresh }: Props) {
  const [message, setMessage] = useState("");
  const [stagedFiles, setStagedFiles] = useState<string[]>([]);
  const [modifiedFiles, setModifiedFiles] = useState<string[]>([]);
  const [untrackedFiles, setUntrackedFiles] = useState<string[]>([]);
  const [diffSummary, setDiffSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stageAll, setStageAll] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setMessage("");
    setError(null);
    setStageAll(false);

    Promise.all([getGitStatus(cwd), getGitDiff(cwd, true)])
      .then(([status, diff]) => {
        setStagedFiles(status.staged);
        setModifiedFiles(status.modified);
        setUntrackedFiles(status.untracked);
        const lines = diff.split("\n").length;
        setDiffSummary(lines > 1 ? `${String(lines)} lines changed` : "no staged changes");
      })
      .catch(() => {});
  }, [visible, cwd]);

  const handleCommit = useCallback(async () => {
    if (!message.trim()) {
      setError("Commit message cannot be empty");
      return;
    }

    if (stageAll || stagedFiles.length === 0) {
      const allFiles = [...modifiedFiles, ...untrackedFiles];
      if (allFiles.length > 0) {
        await gitAdd(cwd, allFiles);
      }
    }

    const result = await gitCommit(cwd, message.trim());
    if (result.ok) {
      onCommitted(message.trim());
      onRefresh();
      onClose();
    } else {
      setError(result.output || "Commit failed");
    }
  }, [
    message,
    stageAll,
    stagedFiles,
    modifiedFiles,
    untrackedFiles,
    cwd,
    onCommitted,
    onRefresh,
    onClose,
  ]);

  useInput(
    (_input, key) => {
      if (key.escape) {
        onClose();
        return;
      }
      if (key.tab) {
        setStageAll((prev) => !prev);
        return;
      }
    },
    { isActive: visible },
  );

  if (!visible) return null;

  const innerW = POPUP_WIDTH - 2;
  const totalChanges = stagedFiles.length + modifiedFiles.length + untrackedFiles.length;

  return (
    <Box
      position="absolute"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      width="100%"
      height="100%"
    >
      <Box flexDirection="column" borderStyle="round" borderColor="#FF8C00" width={POPUP_WIDTH}>
        <Row w={innerW}>
          <Text color="white" bold backgroundColor={POPUP_BG}>
            {"󰊢"} Git Commit
          </Text>
        </Row>
        <Row w={innerW}>
          <Text color="#333" backgroundColor={POPUP_BG}>
            {"─".repeat(innerW - 4)}
          </Text>
        </Row>

        {/* Staged files */}
        {stagedFiles.length > 0 && (
          <Row w={innerW}>
            <Text color="#2d5" backgroundColor={POPUP_BG}>
              ● {String(stagedFiles.length)} staged
            </Text>
          </Row>
        )}
        {modifiedFiles.length > 0 && (
          <Row w={innerW}>
            <Text color="#FF8C00" backgroundColor={POPUP_BG}>
              ● {String(modifiedFiles.length)} modified
            </Text>
          </Row>
        )}
        {untrackedFiles.length > 0 && (
          <Row w={innerW}>
            <Text color="#f44" backgroundColor={POPUP_BG}>
              ● {String(untrackedFiles.length)} untracked
            </Text>
          </Row>
        )}
        {totalChanges === 0 && (
          <Row w={innerW}>
            <Text color="#555" backgroundColor={POPUP_BG}>
              No changes to commit
            </Text>
          </Row>
        )}

        <Row w={innerW}>
          <Text color="#555" backgroundColor={POPUP_BG}>
            {diffSummary}
          </Text>
        </Row>

        {/* Stage all toggle */}
        {(modifiedFiles.length > 0 || untrackedFiles.length > 0) && (
          <Row w={innerW} bg={stageAll ? POPUP_HL : POPUP_BG}>
            <Text
              color={stageAll ? "#FF0040" : "#666"}
              backgroundColor={stageAll ? POPUP_HL : POPUP_BG}
            >
              [Tab] {stageAll ? "✓" : "○"} Stage all changes
            </Text>
          </Row>
        )}

        <Row w={innerW}>
          <Text>{""}</Text>
        </Row>

        {/* Commit message input */}
        <Row w={innerW}>
          <Text color="#aaa" backgroundColor={POPUP_BG}>
            Message:
          </Text>
        </Row>
        <Box paddingX={2}>
          <Box borderStyle="round" borderColor="#6A0DAD" paddingX={1} width={innerW - 2}>
            <TextInput
              value={message}
              onChange={setMessage}
              onSubmit={handleCommit}
              placeholder="describe your changes..."
              focus={visible}
            />
          </Box>
        </Box>

        {error && (
          <Row w={innerW}>
            <Text color="#f44" backgroundColor={POPUP_BG}>
              {error}
            </Text>
          </Row>
        )}

        <Row w={innerW}>
          <Text>{""}</Text>
        </Row>
        <Row w={innerW}>
          <Text color="#555" backgroundColor={POPUP_BG}>
            ⏎ commit tab stage-all esc cancel
          </Text>
        </Row>
      </Box>
    </Box>
  );
}
