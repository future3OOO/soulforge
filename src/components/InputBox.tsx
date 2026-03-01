import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  onSubmit: (value: string) => void;
  isLoading: boolean;
  isFocused?: boolean;
}

const SPINNER_FRAMES = [
  "\u28CB",
  "\u28D9",
  "\u28F9",
  "\u28F8",
  "\u28FC",
  "\u28F4",
  "\u28E6",
  "\u28E7",
  "\u28C7",
  "\u28CF",
];

const COMMANDS = [
  { cmd: "/help", icon: "\uF059", desc: "Show available commands" },
  { cmd: "/clear", icon: "\uF01B4", desc: "Clear chat history" },
  { cmd: "/editor", icon: "\uF044", desc: "Toggle editor panel" },
  { cmd: "/open", icon: "\uF07C", desc: "Open file in editor" },
  { cmd: "/skills", icon: "\uDB82\uDD2A", desc: "Browse & install skills" },
  { cmd: "/commit", icon: "󰊢", desc: "AI-assisted git commit" },
  { cmd: "/diff", icon: "󰊢", desc: "Show current diff" },
  { cmd: "/status", icon: "󰊢", desc: "Git status" },
  { cmd: "/branch", icon: "󰊢", desc: "Show/create branch" },
  { cmd: "/init", icon: "󰊢", desc: "Initialize git repo" },
  { cmd: "/summarize", icon: "\uF066", desc: "Compress conversation" },
  { cmd: "/context", icon: "\uF1C0", desc: "Show/clear context budget" },
  { cmd: "/mode", icon: "\uF013", desc: "Switch forge mode" },
  { cmd: "/quit", icon: "\uF08B", desc: "Exit SoulForge" },
];

function CtrlGuard({ flagRef }: { flagRef: React.RefObject<boolean> }) {
  useInput((_input, key) => {
    if (key.ctrl) {
      flagRef.current = true;
    }
  });
  return null;
}

export function InputBox({ onSubmit, isLoading, isFocused }: Props) {
  const [value, setValue] = useState("");
  const [spinnerIdx, setSpinnerIdx] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const skipNextChange = useRef(false);

  const focused = isFocused ?? true;

  // Filter commands based on current input
  const showAutocomplete = value.startsWith("/") && !isLoading && focused;
  const query = value.toLowerCase();
  const matches = showAutocomplete ? COMMANDS.filter((c) => c.cmd.startsWith(query)) : [];
  const hasMatches = matches.length > 0 && value !== matches[0]?.cmd;

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset selection when input changes
  useEffect(() => {
    setSelectedIdx(0);
  }, [value]);

  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setSpinnerIdx((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, [isLoading]);

  useEffect(() => {
    if (!focused) {
      skipNextChange.current = false;
    }
  }, [focused]);

  // Handle autocomplete navigation
  useInput(
    (_input, key) => {
      if (!hasMatches) return;

      if (key.tab || key.downArrow) {
        setSelectedIdx((prev) => (prev + 1) % matches.length);
        return;
      }
      if (key.upArrow) {
        setSelectedIdx((prev) => (prev > 0 ? prev - 1 : matches.length - 1));
        return;
      }
    },
    { isActive: hasMatches },
  );

  const handleChange = useCallback((newValue: string) => {
    if (skipNextChange.current) {
      skipNextChange.current = false;
      return;
    }
    setValue(newValue);
  }, []);

  const handleSubmit = (input: string) => {
    if (isLoading) return;

    // If autocomplete is showing and user hits enter, complete the command
    if (hasMatches && matches[selectedIdx]) {
      const completed = matches[selectedIdx].cmd;
      // If command takes args (like /open), add a space
      if (completed === "/open") {
        setValue(`${completed} `);
      } else {
        onSubmit(completed);
        setValue("");
      }
      return;
    }

    if (input.trim() === "") return;
    onSubmit(input.trim());
    setValue("");
  };

  return (
    <Box flexDirection="column" width="100%" flexShrink={0}>
      {/* Autocomplete dropdown — renders above input */}
      {hasMatches && (
        <Box flexDirection="column" paddingX={2} marginBottom={0}>
          {matches.map((match, i) => {
            const isSelected = i === selectedIdx;
            return (
              <Box key={match.cmd} gap={1}>
                <Text color={isSelected ? "#FF0040" : "#333"}>{isSelected ? "›" : " "}</Text>
                <Text color={isSelected ? "#FF0040" : "#9B30FF"} bold={isSelected}>
                  {match.cmd}
                </Text>
                <Text color={isSelected ? "#666" : "#444"}>{match.desc}</Text>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Input */}
      <Box
        borderStyle="round"
        borderColor={focused ? "#6A0DAD" : "#333"}
        paddingX={1}
        flexDirection="row"
        alignItems="center"
        width="100%"
      >
        {isLoading ? (
          <>
            <Text color="#FF0040" bold>
              {SPINNER_FRAMES[spinnerIdx]}
            </Text>
            <Text color="#666"> forging...</Text>
          </>
        ) : (
          <>
            <Text color="#FF0040" bold>
              {">"}{" "}
            </Text>
            <CtrlGuard flagRef={skipNextChange} />
            <TextInput
              value={value}
              onChange={handleChange}
              onSubmit={handleSubmit}
              placeholder="speak to the forge..."
              focus={focused}
            />
          </>
        )}
      </Box>
    </Box>
  );
}
