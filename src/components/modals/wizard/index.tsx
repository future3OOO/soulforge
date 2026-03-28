import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Overlay, POPUP_BG } from "../../layout/shared.js";
import { MAX_W, STEPS } from "./data.js";
import { FooterNav } from "./FooterNav.js";
import { ProgressBar } from "./ProgressBar.js";
import { Hr } from "./primitives.js";
import { FeaturesStep } from "./steps/FeaturesStep.js";
import { KeysStep } from "./steps/KeysStep.js";
import { ModelStep } from "./steps/ModelStep.js";
import { ReadyStep } from "./steps/ReadyStep.js";
import { ShortcutsStep } from "./steps/ShortcutsStep.js";
import { WelcomeStep } from "./steps/WelcomeStep.js";

interface Props {
  visible: boolean;
  hasModel: boolean;
  activeModel: string;
  onSelectModel: () => void;
  onClose: () => void;
}

export const FirstRunWizard = memo(function FirstRunWizard({
  visible,
  hasModel,
  activeModel,
  onSelectModel,
  onClose,
}: Props) {
  const { width: termCols, height: termRows } = useTerminalDimensions();
  const pw = Math.min(MAX_W, Math.floor(termCols * 0.92));
  const iw = pw - 2;

  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx] ?? "welcome";
  const navigatedBack = useRef(false);

  // Reset on open
  useEffect(() => {
    if (!visible) return;
    setStepIdx(0);
    navigatedBack.current = false;
  }, [visible]);

  // Auto-advance past model step (forward flow only)
  useEffect(() => {
    if (visible && step === "model" && hasModel && !navigatedBack.current) {
      setStepIdx((i) => i + 1);
    }
  }, [visible, step, hasModel]);

  // Navigation
  const goForward = useCallback(() => {
    navigatedBack.current = false;
    if (step === "model" && !hasModel) {
      onSelectModel();
      return;
    }
    if (stepIdx < STEPS.length - 1) setStepIdx((i) => i + 1);
    else onClose();
  }, [step, hasModel, stepIdx, onSelectModel, onClose]);

  const goBack = useCallback(() => {
    if (stepIdx > 0) {
      navigatedBack.current = true;
      setStepIdx((i) => i - 1);
    }
  }, [stepIdx]);

  useKeyboard(
    useCallback(
      (evt) => {
        if (!visible) return;
        if (evt.name === "escape") {
          onClose();
          return;
        }
        if (evt.name === "return" || evt.name === "right" || evt.name === "l") {
          goForward();
          return;
        }
        if (evt.name === "left" || evt.name === "h") {
          goBack();
          return;
        }
      },
      [visible, onClose, goForward, goBack],
    ),
  );

  if (!visible) return null;

  const maxH = Math.max(24, Math.floor(termRows * 0.7));

  return (
    <Overlay>
      <box
        flexDirection="column"
        borderStyle="rounded"
        border={true}
        borderColor="#8B5CF6"
        backgroundColor={POPUP_BG}
        width={pw}
        height={maxH}
      >
        <ProgressBar iw={iw} stepIdx={stepIdx} />
        <Hr iw={iw} />

        {step === "welcome" && <WelcomeStep iw={iw} />}
        {step === "model" && <ModelStep iw={iw} hasModel={hasModel} activeModel={activeModel} />}
        {step === "keys" && <KeysStep iw={iw} />}
        {step === "features" && <FeaturesStep iw={iw} />}
        {step === "shortcuts" && <ShortcutsStep iw={iw} />}
        {step === "ready" && <ReadyStep iw={iw} />}

        <box flexGrow={1} backgroundColor={POPUP_BG} />
        <Hr iw={iw} />
        <FooterNav iw={iw} stepIdx={stepIdx} step={step} hasModel={hasModel} />
      </box>
    </Overlay>
  );
});
