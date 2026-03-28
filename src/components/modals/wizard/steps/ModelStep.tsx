import { memo } from "react";
import { POPUP_BG, PopupRow } from "../../../layout/shared.js";
import { PAD, PROVIDERS } from "../data.js";
import { Gap, Hr, StepHeader } from "../primitives.js";
import { BOLD, C, ITALIC } from "../theme.js";

export const ModelStep = memo(function ModelStep({
  iw,
  hasModel,
  activeModel,
}: {
  iw: number;
  hasModel: boolean;
  activeModel: string;
}) {
  return (
    <>
      <Gap iw={iw} />
      <StepHeader iw={iw} ic="◈" title="Choose a Provider & Model" />
      <Gap iw={iw} />
      <PopupRow w={iw}>
        <text fg={C.text} bg={POPUP_BG}>
          {"  SoulForge supports multiple AI providers:"}
        </text>
      </PopupRow>
      <Gap iw={iw} />
      {PROVIDERS.map((p) => (
        <PopupRow key={p.name} w={iw}>
          <text fg={C.cyan} attributes={BOLD} bg={POPUP_BG}>
            {"    "}
            {p.name.padEnd(PAD + 2)}
          </text>
          <text fg={C.text} bg={POPUP_BG}>
            {p.desc}
          </text>
        </PopupRow>
      ))}
      <Gap iw={iw} />
      <Hr iw={iw} />
      <Gap iw={iw} />
      {hasModel ? (
        <PopupRow w={iw}>
          <text fg={C.green} attributes={BOLD} bg={POPUP_BG}>
            {"  ✓ Active model: "}
          </text>
          <text fg={C.white} attributes={BOLD} bg={POPUP_BG}>
            {activeModel}
          </text>
        </PopupRow>
      ) : (
        <>
          <PopupRow w={iw}>
            <text fg={C.amber} attributes={BOLD} bg={POPUP_BG}>
              {"  ⏎ Press Enter to open the model picker"}
            </text>
          </PopupRow>
          <Gap iw={iw} />
          <PopupRow w={iw}>
            <text fg={C.muted} attributes={ITALIC} bg={POPUP_BG}>
              {"  You can also use Ctrl+L anytime to switch models."}
            </text>
          </PopupRow>
        </>
      )}
    </>
  );
});
