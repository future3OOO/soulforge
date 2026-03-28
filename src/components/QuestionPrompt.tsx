import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useState } from "react";
import { icon } from "../core/icons.js";
import type { PendingQuestion } from "../types/index.js";
import { Markdown } from "./chat/Markdown.js";

interface Props {
  question: PendingQuestion;
  isActive: boolean;
  onAnswer?: (answer: string) => void;
}

const OTHER_IDX = -1;

export function QuestionPrompt({ question, isActive, onAnswer }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [typing, setTyping] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const totalOptions = question.options.length + 1;

  useKeyboard((evt) => {
    if (!isActive) return;

    if (typing) {
      if (evt.name === "escape") {
        setTyping(false);
        evt.stopPropagation();
      }
      return;
    }

    if (evt.name === "up" || evt.name === "left") {
      setSelectedIdx((prev) => {
        const cur = prev === OTHER_IDX ? totalOptions - 1 : prev;
        const next = cur > 0 ? cur - 1 : totalOptions - 1;
        return next === totalOptions - 1 ? OTHER_IDX : next;
      });
      evt.stopPropagation();
      return;
    }
    if (evt.name === "down" || evt.name === "right") {
      setSelectedIdx((prev) => {
        const cur = prev === OTHER_IDX ? totalOptions - 1 : prev;
        const next = (cur + 1) % totalOptions;
        return next === totalOptions - 1 ? OTHER_IDX : next;
      });
      evt.stopPropagation();
      return;
    }
    if (evt.name === "return") {
      evt.stopPropagation();
      if (selectedIdx === OTHER_IDX) {
        setTyping(true);
        setInputValue("");
        return;
      }
      const selected = question.options[selectedIdx];
      if (selected) {
        onAnswer?.(selected.label);
        question.resolve(selected.value);
      }
      return;
    }
    if (evt.name === "escape" && question.allowSkip) {
      question.resolve("__skipped__");
      evt.stopPropagation();
    }
  });

  const handleInputSubmit = () => {
    const trimmed = inputValue.trim();
    if (trimmed) {
      onAnswer?.(trimmed);
      question.resolve(trimmed);
    }
  };

  return (
    <box
      flexDirection="column"
      borderStyle="rounded"
      border={true}
      borderColor="#FF8C00"
      paddingX={1}
      width="100%"
    >
      <box>
        <text fg="#FF8C00" attributes={TextAttributes.BOLD}>
          {icon("question")} Question
        </text>
      </box>
      <box>
        <Markdown text={question.question} />
      </box>
      {typing ? (
        <box flexDirection="row" gap={1}>
          <text fg="#FF8C00">{" ›"}</text>
          <input
            value={inputValue}
            onInput={setInputValue}
            onSubmit={handleInputSubmit}
            focused={isActive}
            flexGrow={1}
            placeholder="type your answer..."
          />
        </box>
      ) : (
        <box flexDirection="column">
          {question.options.map((opt, i) => {
            const isSelected = i === selectedIdx;
            return (
              <text key={opt.value}>
                <span fg={isSelected ? "#FF8C00" : "#555"}>{isSelected ? " › " : "   "}</span>
                <span
                  fg={isSelected ? "#FFF" : "#888"}
                  attributes={isSelected ? TextAttributes.BOLD : undefined}
                >
                  {opt.label}
                </span>
              </text>
            );
          })}
          <text>
            <span fg={selectedIdx === OTHER_IDX ? "#FF8C00" : "#555"}>
              {selectedIdx === OTHER_IDX ? " › " : "   "}
            </span>
            <span
              fg={selectedIdx === OTHER_IDX ? "#FFF" : "#888"}
              attributes={selectedIdx === OTHER_IDX ? TextAttributes.BOLD : undefined}
            >
              Other
            </span>
          </text>
          <text fg="#444">
            {"  "}↑↓ select · ⏎ confirm
            {question.allowSkip ? " · esc skip" : ""}
          </text>
        </box>
      )}
    </box>
  );
}
