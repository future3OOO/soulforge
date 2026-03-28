import { memo } from "react";
import { POPUP_BG, PopupRow } from "../../layout/shared.js";
import { STEP_LABELS, STEPS } from "./data.js";
import { C } from "./theme.js";

export const ProgressBar = memo(function ProgressBar({
  iw,
  stepIdx,
}: {
  iw: number;
  stepIdx: number;
}) {
  return (
    <PopupRow w={iw}>
      <box flexDirection="row" gap={0}>
        {STEPS.map((s, i) => (
          <text
            key={s}
            fg={i <= stepIdx ? (i === stepIdx ? C.purple : C.green) : C.faint}
            bg={POPUP_BG}
          >
            {i <= stepIdx ? "●" : "○"}
            {i < STEPS.length - 1 ? " " : ""}
          </text>
        ))}
        <text fg={C.muted} bg={POPUP_BG}>
          {"  "}
          {STEP_LABELS[STEPS[stepIdx] as keyof typeof STEP_LABELS]} ({String(stepIdx + 1)}/
          {String(STEPS.length)})
        </text>
      </box>
    </PopupRow>
  );
});
