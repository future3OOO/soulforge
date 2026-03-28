import { memo } from "react";
import { POPUP_BG, PopupRow } from "../../layout/shared.js";
import { STEPS, type Step } from "./data.js";
import { C } from "./theme.js";

export const FooterNav = memo(function FooterNav({
  iw,
  stepIdx,
  step,
  hasModel,
}: {
  iw: number;
  stepIdx: number;
  step: Step;
  hasModel: boolean;
}) {
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === STEPS.length - 1;
  const actionLabel =
    step === "model" && !hasModel ? "⏎ open model picker" : isLast ? "⏎ start forging" : "⏎/→ next";

  return (
    <PopupRow w={iw}>
      <text fg={C.muted} bg={POPUP_BG}>
        {isFirst ? "" : "← back │ "}
        {actionLabel}
        <span fg={C.faint}>{" │ esc skip"}</span>
      </text>
    </PopupRow>
  );
});
