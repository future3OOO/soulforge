import { useEffect, useState } from "react";
import { providerIcon } from "../core/icons.js";
import { checkProviders, type ProviderStatus } from "../core/llm/provider.js";
import { checkPrerequisites } from "../core/setup/prerequisites.js";

function Status({ ok, label, dim }: { ok: boolean; label: string; dim?: boolean }) {
  return (
    <text fg={ok ? "#4a7" : dim ? "#b87333" : "#f44"}>
      {ok ? "✓" : dim ? "○" : "✗"} {label}
    </text>
  );
}

export function HealthCheck() {
  const [provs, setProvs] = useState<ProviderStatus[] | null>(null);
  const prereqs = checkPrerequisites();

  useEffect(() => {
    checkProviders().then(setProvs);
  }, []);

  const loaded = provs !== null;
  const anyMissing =
    loaded &&
    (prereqs.some((p) => !p.installed && p.prerequisite.required) ||
      provs.every((p) => !p.available));

  return (
    <box flexDirection="column" gap={0}>
      <box gap={1} justifyContent="center" flexWrap="wrap" flexDirection="row">
        <text fg="#555">providers</text>
        {!loaded ? (
          <text fg="#555">scanning…</text>
        ) : (
          (() => {
            const active = provs.filter((p) => p.available);
            const shown = active.slice(0, 5);
            const extra = active.length - shown.length;
            return (
              <>
                {shown.map((p) => (
                  <text key={p.id} fg="#4a7">
                    ✓ {providerIcon(p.id)} <span fg="#4a7">{p.name}</span>
                  </text>
                ))}
                {extra > 0 && <text fg="#555">+{String(extra)}</text>}
                {active.length === 0 && <text fg="#555">none configured</text>}
              </>
            );
          })()
        )}
      </box>
      <box gap={1} justifyContent="center" flexWrap="wrap" flexDirection="row">
        <text fg="#555">{"   tools"}</text>
        {prereqs.map((t) => (
          <Status
            key={t.prerequisite.name}
            ok={t.installed}
            label={t.prerequisite.name}
            dim={!t.prerequisite.required}
          />
        ))}
      </box>
      {anyMissing && (
        <box justifyContent="center" marginTop={1}>
          <text fg="#444">/setup to install missing</text>
        </box>
      )}
    </box>
  );
}
