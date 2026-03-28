import { memo } from "react";
import { icon } from "../../../../core/icons.js";
import { POPUP_BG, PopupRow } from "../../../layout/shared.js";
import { SHORTCUTS } from "../data.js";
import { Gap, SectionLabel, StepHeader } from "../primitives.js";
import { BOLD, C } from "../theme.js";

export const ShortcutsStep = memo(function ShortcutsStep({ iw }: { iw: number }) {
  return (
    <>
      <Gap iw={iw} />
      <StepHeader iw={iw} ic={icon("sparkle")} title="Keyboard Shortcuts & Commands" />

      {SHORTCUTS.map((group) => (
        <box key={group.section} flexDirection="column" backgroundColor={POPUP_BG}>
          <Gap iw={iw} />
          <SectionLabel iw={iw} label={group.section} />
          {group.items.map((s) => (
            <PopupRow key={s.keys} w={iw}>
              <text fg={s.slash ? C.purple : C.cyan} attributes={BOLD} bg={POPUP_BG}>
                {"  "}
                {s.keys.padEnd(12)}
              </text>
              <text fg={C.text} bg={POPUP_BG}>
                {s.desc}
              </text>
            </PopupRow>
          ))}
        </box>
      ))}
    </>
  );
});
