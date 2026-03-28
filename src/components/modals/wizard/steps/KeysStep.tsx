import { memo } from "react";
import { POPUP_BG, PopupRow } from "../../../layout/shared.js";
import { ENV_VARS } from "../data.js";
import { Gap, KV, SectionLabel, StepHeader } from "../primitives.js";
import { C } from "../theme.js";

export const KeysStep = memo(function KeysStep({ iw }: { iw: number }) {
  return (
    <>
      <Gap iw={iw} />
      <StepHeader iw={iw} ic="⚿" title="API Keys & Authentication" />
      <Gap iw={iw} />

      <PopupRow w={iw}>
        <text fg={C.text} bg={POPUP_BG}>
          Most providers need an API key. Several ways to configure:
        </text>
      </PopupRow>

      <Gap iw={iw} />

      <SectionLabel iw={iw} label="Keychain (recommended)" />
      <KV iw={iw} label="/keys" desc="Interactive key setup — stored in system keychain" />
      <KV iw={iw} label="/keys set" desc="Set a specific provider key directly" />

      <Gap iw={iw} />

      <SectionLabel iw={iw} label="Environment Variables" />
      {ENV_VARS.map((v) => (
        <KV key={v.key} iw={iw} label={v.key} desc={v.provider} />
      ))}

      <Gap iw={iw} />

      <SectionLabel iw={iw} label="No Key Needed" />
      <KV iw={iw} label="CLIProxyAPI" desc="Managed access — /proxy login to connect" />
      <KV iw={iw} label="Ollama" desc="Local models — runs on your machine" />

      <Gap iw={iw} />

      <PopupRow w={iw}>
        <text fg={C.subtle} bg={POPUP_BG}>
          Keys are stored securely in your system keychain. Use <span fg={C.purple}>/keys</span> to
          manage them.
        </text>
      </PopupRow>
    </>
  );
});
