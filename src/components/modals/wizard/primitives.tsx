import { memo } from "react";
import { POPUP_BG, PopupRow } from "../../layout/shared.js";
import { BOLD, C } from "./theme.js";

export const Gap = memo(function Gap({ iw, n = 1 }: { iw: number; n?: number }) {
  const rows = [];
  for (let i = 0; i < n; i++)
    rows.push(
      <PopupRow key={i} w={iw}>
        <text bg={POPUP_BG}> </text>
      </PopupRow>,
    );
  return <>{rows}</>;
});

export const Hr = memo(function Hr({ iw }: { iw: number }) {
  return (
    <PopupRow w={iw}>
      <text fg={C.faint} bg={POPUP_BG}>
        {"─".repeat(iw - 4)}
      </text>
    </PopupRow>
  );
});

export const StepHeader = memo(function StepHeader({
  iw,
  ic,
  title,
}: {
  iw: number;
  ic: string;
  title: string;
}) {
  return (
    <PopupRow w={iw}>
      <text fg={C.purple} attributes={BOLD} bg={POPUP_BG}>
        {ic}
      </text>
      <text fg={C.white} attributes={BOLD} bg={POPUP_BG}>
        {" "}
        {title}
      </text>
    </PopupRow>
  );
});

export const SectionLabel = memo(function SectionLabel({
  iw,
  label,
}: {
  iw: number;
  label: string;
}) {
  return (
    <PopupRow w={iw}>
      <text fg={C.muted} attributes={BOLD} bg={POPUP_BG}>
        {label}
      </text>
    </PopupRow>
  );
});

export const KV = memo(function KV({
  iw,
  label,
  desc,
}: {
  iw: number;
  label: string;
  desc: string;
}) {
  return (
    <PopupRow w={iw}>
      <text fg={C.cyan} attributes={BOLD} bg={POPUP_BG}>
        {"  "}
        {label.padEnd(30)}
      </text>
      <text fg={C.text} bg={POPUP_BG}>
        {desc}
      </text>
    </PopupRow>
  );
});

export const Feat = memo(function Feat({
  iw,
  ic,
  title,
  keys,
  desc,
}: {
  iw: number;
  ic: string;
  title: string;
  keys: string;
  desc: string;
}) {
  return (
    <PopupRow w={iw}>
      <text fg={C.purple} bg={POPUP_BG}>
        {"  "}
        {ic}{" "}
      </text>
      <text fg={C.white} attributes={BOLD} bg={POPUP_BG}>
        {title}
      </text>
      <text fg={C.cyan} bg={POPUP_BG}>
        {" "}
        ({keys})
      </text>
      <text fg={C.subtle} bg={POPUP_BG}>
        {" — "}
        {desc}
      </text>
    </PopupRow>
  );
});
