import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useState } from "react";
import { icon } from "../core/icons.js";
import type { Plan } from "../types/index.js";

interface Props {
  onAccept: () => void;
  onClearAndImplement: () => void;
  onRevise: (feedback: string) => void;
  onCancel: () => void;
  isActive: boolean;
  plan: Plan;
  planFile: string;
}

const ACCENT = "#00BFFF";
const STEP_COLOR = "#8B5CF6";
const DIM = "#555";
const CANCEL_COLOR = "#FF0040";

interface Option {
  id: string;
  label: string;
  icon: string;
  color: string;
  description?: string;
}

const OPTIONS: Option[] = [
  {
    id: "implement",
    label: "Implement",
    icon: "\u23CE",
    color: ACCENT,
    description: "execute the plan as-is",
  },
  {
    id: "clear_implement",
    label: "Clear & Implement",
    icon: "\u21BB",
    color: "#FF8C00",
    description: "clear context, then execute",
  },
  {
    id: "revise",
    label: "Revise",
    icon: "\uF040",
    color: STEP_COLOR,
    description: "provide feedback to improve the plan",
  },
  {
    id: "cancel",
    label: "Cancel",
    icon: "\uF00D",
    color: CANCEL_COLOR,
    description: "discard the plan",
  },
];

export function PlanReviewPrompt({
  onAccept,
  onClearAndImplement,
  onRevise,
  onCancel,
  isActive,
  plan,
  planFile,
}: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [reviseInput, setReviseInput] = useState("");
  const isReviseSelected = OPTIONS[selectedIdx]?.id === "revise";

  const executeOption = (idx: number) => {
    const opt = OPTIONS[idx];
    if (!opt) return;
    switch (opt.id) {
      case "implement":
        onAccept();
        break;
      case "clear_implement":
        onClearAndImplement();
        break;
      case "revise":
        if (reviseInput.trim()) {
          onRevise(reviseInput.trim());
          setReviseInput("");
        }
        break;
      case "cancel":
        onCancel();
        break;
    }
  };

  useKeyboard((evt) => {
    if (!isActive) return;

    if (evt.name === "escape") {
      onCancel();
      return;
    }

    if (evt.name === "up") {
      setSelectedIdx((prev) => (prev > 0 ? prev - 1 : OPTIONS.length - 1));
      return;
    }
    if (evt.name === "down") {
      setSelectedIdx((prev) => (prev + 1) % OPTIONS.length);
      return;
    }
    if (evt.name === "tab") {
      setSelectedIdx((prev) => (prev + 1) % OPTIONS.length);
      return;
    }

    if (evt.name === "return") {
      executeOption(selectedIdx);
      return;
    }
  });

  return (
    <box
      flexDirection="column"
      borderStyle="rounded"
      border={true}
      borderColor={ACCENT}
      paddingX={1}
      width="100%"
    >
      <box gap={1} flexDirection="row">
        <text fg={ACCENT} attributes={TextAttributes.BOLD}>
          {icon("plan")} {plan.title}
        </text>
        <text fg="#333">{"\u2502"}</text>
        <text fg="#444">{String(plan.steps.length)} steps</text>
        <text fg="#333">{"\u2502"}</text>
        <text fg="#444">{planFile}</text>
      </box>

      {plan.steps.map((step) => (
        <box key={step.id} height={1} flexShrink={0}>
          <text truncate>
            <span fg="#555">{"  "}○ </span>
            <span fg="#999">{step.label}</span>
          </text>
        </box>
      ))}

      <box height={1} />

      {OPTIONS.map((opt, i) => {
        const selected = i === selectedIdx;
        const optColor = selected ? opt.color : DIM;
        return (
          <box key={opt.id} flexDirection="column">
            <box gap={1} flexDirection="row">
              <text fg={selected ? opt.color : "#333"}>{selected ? " \u203A" : "  "}</text>
              <text fg={optColor}>{opt.icon}</text>
              <text
                fg={selected ? "#eee" : "#888"}
                attributes={selected ? TextAttributes.BOLD : undefined}
              >
                {opt.label}
              </text>
              {opt.description && <text fg={selected ? "#777" : "#444"}>{opt.description}</text>}
            </box>
            {opt.id === "revise" && selected && (
              <box flexDirection="row" paddingLeft={3} marginTop={0}>
                <text fg={STEP_COLOR}>{"\u276F"} </text>
                <input
                  value={reviseInput}
                  onInput={setReviseInput}
                  flexGrow={1}
                  onSubmit={() => {
                    if (reviseInput.trim()) {
                      onRevise(reviseInput.trim());
                      setReviseInput("");
                    }
                  }}
                  focused={isActive && isReviseSelected}
                  placeholder="what should change..."
                />
              </box>
            )}
          </box>
        );
      })}

      <box height={1} />

      <box>
        <text fg="#444">
          {"  "}↑↓ select{"  "}⏎ confirm{"  "}esc cancel
        </text>
      </box>
    </box>
  );
}
