import { memo, useEffect, useRef, useState } from "react";
import { icon } from "../../../../core/icons.js";
import { POPUP_BG, PopupRow } from "../../../layout/shared.js";
import {
  BLINK_COUNT,
  BLINK_INITIAL_MS,
  BLINK_MS,
  TYPEWRITER_MS,
  WELCOME_BULLETS,
  WELCOME_TITLE,
} from "../data.js";
import { Gap } from "../primitives.js";
import { BOLD, C, ITALIC } from "../theme.js";

function useTypewriter(text: string, ms: number) {
  const [len, setLen] = useState(0);
  const [cursorOn, setCursorOn] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let i = 0;
    const tick = () => {
      if (i < text.length) {
        i++;
        setLen(i);
        timer.current = setTimeout(tick, ms);
      } else {
        let blinks = 0;
        const blink = () => {
          if (blinks >= BLINK_COUNT * 2) {
            setCursorOn(false);
            return;
          }
          blinks++;
          setCursorOn((v) => !v);
          timer.current = setTimeout(blink, BLINK_MS);
        };
        timer.current = setTimeout(blink, BLINK_INITIAL_MS);
      }
    };
    timer.current = setTimeout(tick, BLINK_INITIAL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [text, ms]);

  return { typed: text.slice(0, len), cursorOn };
}

export const WelcomeStep = memo(function WelcomeStep({ iw }: { iw: number }) {
  const { typed, cursorOn } = useTypewriter(WELCOME_TITLE, TYPEWRITER_MS);
  const ghostIc = icon("ghost");

  return (
    <>
      <Gap iw={iw} n={2} />
      <PopupRow w={iw}>
        <text fg={C.purple} attributes={BOLD} bg={POPUP_BG}>
          {"   "}
          {ghostIc}{" "}
        </text>
        <text fg={C.white} attributes={BOLD} bg={POPUP_BG}>
          {typed}
        </text>
        <text fg={C.purple} bg={POPUP_BG}>
          {cursorOn ? "▌" : " "}
        </text>
      </PopupRow>
      <Gap iw={iw} />
      <PopupRow w={iw}>
        <text fg={C.text} attributes={ITALIC} bg={POPUP_BG}>
          {"   AI-Powered Terminal IDE by proxySoul"}
        </text>
      </PopupRow>
      <Gap iw={iw} n={2} />
      {WELCOME_BULLETS.map((b) => (
        <PopupRow key={b} w={iw}>
          <text fg={C.purple} bg={POPUP_BG}>
            {"   ◆ "}
          </text>
          <text fg={C.text} bg={POPUP_BG}>
            {b}
          </text>
        </PopupRow>
      ))}
      <Gap iw={iw} n={2} />
      <PopupRow w={iw}>
        <text fg={C.muted} attributes={ITALIC} bg={POPUP_BG}>
          {"   Press → or Enter to begin setup"}
        </text>
      </PopupRow>
    </>
  );
});
