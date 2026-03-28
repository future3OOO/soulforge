import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../../core/theme/index.js";
import { usePopupScroll } from "../../hooks/usePopupScroll.js";
import type { ConfigScope } from "../layout/shared.js";
import { CONFIG_SCOPES, Overlay, PopupRow } from "../layout/shared.js";

const MAX_POPUP_WIDTH = 60;
const CHROME_ROWS = 7;

export interface CommandPickerOption {
  value: string;
  label: string;
  description?: string;
  icon?: string;
  color?: string;
  disabled?: boolean;
}

export interface PickerToggle {
  key: string;
  label: string;
  value: boolean;
  onToggle: () => void;
}

export interface CommandPickerConfig {
  title: string;
  icon?: string;
  options: CommandPickerOption[];
  currentValue?: string;
  scopeEnabled?: boolean;
  initialScope?: ConfigScope;
  maxWidth?: number;
  keepOpen?: boolean;
  searchable?: boolean;
  toggles?: PickerToggle[];
  onSelect: (value: string, scope?: ConfigScope) => void;
  onScopeMove?: (value: string, fromScope: ConfigScope, toScope: ConfigScope) => void;
  onCursorChange?: (value: string) => void;
  onCancel?: () => void;
}

interface Props {
  visible: boolean;
  config: CommandPickerConfig | null;
  onClose: () => void;
}

/** Simple fuzzy match — returns score and matched indices, or null if no match */
function fuzzyScore(query: string, target: string): { score: number; indices: number[] } | null {
  if (query.length === 0) return { score: 0, indices: [] };
  const lower = target.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  const indices: number[] = [];
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) {
      indices.push(i);
      qi++;
    }
  }
  if (qi < q.length) return null;
  let score = 0;
  for (let k = 0; k < indices.length; k++) {
    if (indices[k] === 0) score += 10;
    if (k > 0 && (indices[k] as number) === (indices[k - 1] as number) + 1) score += 5;
  }
  score -= indices.length > 0 ? (indices[0] as number) : 0;
  return { score, indices };
}

export function CommandPicker({ visible, config, onClose }: Props) {
  const t = useTheme();
  const { width: termCols, height: termRows } = useTerminalDimensions();
  const containerRows = termRows - 2;
  const maxW = config?.maxWidth ?? MAX_POPUP_WIDTH;
  const popupWidth = Math.min(maxW, Math.floor(termCols * 0.8));
  const innerW = popupWidth - 2;
  const maxVisible = Math.max(4, Math.floor(containerRows * 0.8) - CHROME_ROWS);
  const { cursor, setCursor, scrollOffset, setScrollOffset, adjustScroll } =
    usePopupScroll(maxVisible);
  const [scope, setScope] = useState<ConfigScope>("project");
  const [search, setSearch] = useState("");
  const [toggleState, setToggleState] = useState<Record<string, boolean>>({});

  const filteredOptions = useMemo(() => {
    if (!config?.searchable || search.length === 0) return config?.options ?? [];
    const scored: Array<{ option: CommandPickerOption; score: number }> = [];
    for (const option of config.options) {
      const hit =
        fuzzyScore(search, option.label) ??
        fuzzyScore(search, option.value) ??
        (option.description ? fuzzyScore(search, option.description) : null);
      if (hit) scored.push({ option, score: hit.score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.option);
  }, [config?.options, config?.searchable, search]);

  const prevVisibleRef = useRef(false);
  const prevOptionsRef = useRef<CommandPickerOption[] | null>(null);
  useEffect(() => {
    if (!visible || !config) {
      prevVisibleRef.current = visible;
      prevOptionsRef.current = null;
      setSearch("");
      return;
    }
    const justOpened = !prevVisibleRef.current;
    prevVisibleRef.current = true;
    if (justOpened) {
      setSearch("");
      if (config.toggles) {
        const initial: Record<string, boolean> = {};
        for (const tg of config.toggles) initial[tg.key] = tg.value;
        setToggleState(initial);
      }
      let idx = filteredOptions.findIndex((o) => o.value === config.currentValue);
      if (idx < 0) idx = filteredOptions.findIndex((o) => !o.disabled);
      const startIdx = idx >= 0 ? idx : 0;
      setCursor(startIdx);
      setScrollOffset(Math.max(0, startIdx - Math.floor(maxVisible / 2)));
      if (config.scopeEnabled) setScope(config.initialScope ?? "project");
    } else if (prevOptionsRef.current && prevOptionsRef.current !== filteredOptions) {
      setCursor((prev) => {
        const prevValue = prevOptionsRef.current?.[prev]?.value;
        if (prevValue) {
          const newIdx = filteredOptions.findIndex((o) => o.value === prevValue);
          if (newIdx >= 0) return newIdx;
        }
        return Math.min(prev, Math.max(0, filteredOptions.length - 1));
      });
    }
    prevOptionsRef.current = filteredOptions;
  }, [visible, config, filteredOptions, setCursor, setScrollOffset, maxVisible]);

  // Reset cursor when search text changes (not on initial open)
  const prevSearch = useRef("");
  useEffect(() => {
    if (!config?.searchable) return;
    if (search !== prevSearch.current) {
      prevSearch.current = search;
      if (search.length > 0) {
        setCursor(0);
        setScrollOffset(0);
      }
    }
  }, [search, config?.searchable, setCursor, setScrollOffset]);

  // Fire onCursorChange for live preview
  const prevCursorValue = useRef<string | null>(null);
  useEffect(() => {
    if (!visible || !config?.onCursorChange) return;
    const val = filteredOptions[cursor]?.value;
    if (val && val !== prevCursorValue.current) {
      prevCursorValue.current = val;
      config.onCursorChange(val);
    }
  }, [cursor, visible, config, filteredOptions]);

  useKeyboard((evt) => {
    if (!visible || !config) return;

    if (evt.name === "escape") {
      config.onCancel?.();
      onClose();
      return;
    }

    // Toggle handling (e.g. 't' for transparent)
    if (config.toggles) {
      for (const toggle of config.toggles) {
        if (evt.name === toggle.key) {
          setToggleState((prev) => ({ ...prev, [toggle.key]: !prev[toggle.key] }));
          toggle.onToggle();
          return;
        }
      }
    }

    // Search input handling
    if (config.searchable) {
      if (evt.name === "backspace" || evt.name === "delete") {
        setSearch((prev) => prev.slice(0, -1));
        return;
      }
      if (
        evt.name &&
        evt.name.length === 1 &&
        !evt.ctrl &&
        !evt.meta &&
        evt.name !== "j" &&
        evt.name !== "k"
      ) {
        setSearch((prev) => prev + evt.name);
        return;
      }
    }

    if (evt.name === "up" || evt.name === "k") {
      setCursor((prev) => {
        let next = prev > 0 ? prev - 1 : filteredOptions.length - 1;
        const start = next;
        while (filteredOptions[next]?.disabled) {
          next = next > 0 ? next - 1 : filteredOptions.length - 1;
          if (next === start) break;
        }
        adjustScroll(next);
        return next;
      });
      return;
    }

    if (evt.name === "down" || evt.name === "j") {
      setCursor((prev) => {
        let next = prev < filteredOptions.length - 1 ? prev + 1 : 0;
        const start = next;
        while (filteredOptions[next]?.disabled) {
          next = next < filteredOptions.length - 1 ? next + 1 : 0;
          if (next === start) break;
        }
        adjustScroll(next);
        return next;
      });
      return;
    }

    if (evt.name === "return") {
      const option = filteredOptions[cursor];
      if (option && !option.disabled) {
        const cb = config.onSelect;
        const val = option.value;
        const s = config.scopeEnabled ? scope : undefined;
        if (!config.keepOpen) onClose();
        cb(val, s);
      }
      return;
    }

    if (config.scopeEnabled) {
      if (evt.name === "left" || evt.name === "right") {
        setScope((prev) => {
          const idx = CONFIG_SCOPES.indexOf(prev);
          const next =
            evt.name === "left"
              ? CONFIG_SCOPES[(idx - 1 + CONFIG_SCOPES.length) % CONFIG_SCOPES.length]
              : CONFIG_SCOPES[(idx + 1) % CONFIG_SCOPES.length];
          const val = filteredOptions[cursor]?.value;
          if (next !== prev && val && config.onScopeMove) {
            config.onScopeMove(val, prev, next as ConfigScope);
          }
          return next as ConfigScope;
        });
        return;
      }
    }
  });

  if (!visible || !config) return null;

  const POPUP_BG = t.bgPopup;
  const POPUP_HL = t.bgPopupHighlight;

  return (
    <Overlay>
      <box
        flexDirection="column"
        borderStyle="rounded"
        border={true}
        borderColor={t.brandAlt}
        width={popupWidth}
      >
        <PopupRow w={innerW}>
          {config.icon && (
            <text fg={t.brand} bg={POPUP_BG}>
              {config.icon}{" "}
            </text>
          )}
          <text fg={t.textPrimary} attributes={TextAttributes.BOLD} bg={POPUP_BG}>
            {config.title}
          </text>
        </PopupRow>

        {config.searchable && (
          <PopupRow w={innerW}>
            <text fg={t.textMuted} bg={POPUP_BG}>
              {"🔍 "}
            </text>
            <text fg={t.textPrimary} bg={POPUP_BG}>
              {search || ""}
            </text>
            <text fg={t.brand} bg={POPUP_BG}>
              {"▌"}
            </text>
            {search.length === 0 && (
              <text fg={t.textDim} bg={POPUP_BG}>
                {" type to filter..."}
              </text>
            )}
          </PopupRow>
        )}

        <PopupRow w={innerW}>
          <text fg={t.textFaint} bg={POPUP_BG}>
            {"─".repeat(innerW - 4)}
          </text>
        </PopupRow>

        <box
          flexDirection="column"
          height={Math.min(
            filteredOptions.reduce((sum, o) => sum + 1 + (o.description ? 1 : 0), 0) || 1,
            maxVisible,
          )}
          overflow="hidden"
        >
          {filteredOptions.length === 0 ? (
            <PopupRow w={innerW}>
              <text fg={t.textMuted} bg={POPUP_BG}>
                {"  No matches"}
              </text>
            </PopupRow>
          ) : (
            filteredOptions.slice(scrollOffset, scrollOffset + maxVisible).map((option, vi) => {
              const i = vi + scrollOffset;
              const isActive = i === cursor;
              const isCurrent = option.value === config.currentValue;
              const isDisabled = option.disabled === true;
              const bg = isActive && !isDisabled ? POPUP_HL : POPUP_BG;
              const activeColor = option.color ?? t.brandSecondary;
              const labelFg = isDisabled
                ? t.textDim
                : isActive
                  ? activeColor
                  : isCurrent
                    ? t.success
                    : t.textPrimary;

              return (
                <box key={option.value} flexDirection="column">
                  <PopupRow bg={bg} w={innerW}>
                    <text bg={bg} fg={isActive && !isDisabled ? activeColor : t.textMuted}>
                      {isActive && !isDisabled ? "› " : "  "}
                    </text>
                    {option.icon && (
                      <text
                        bg={bg}
                        fg={isDisabled ? t.textFaint : isActive ? activeColor : t.textSecondary}
                      >
                        {option.icon}{" "}
                      </text>
                    )}
                    <text
                      bg={bg}
                      fg={labelFg}
                      attributes={isActive && !isDisabled ? TextAttributes.BOLD : undefined}
                    >
                      {option.label}
                    </text>
                    {isCurrent && !isDisabled && (
                      <text bg={bg} fg={t.success}>
                        {" "}
                        ✓
                      </text>
                    )}
                  </PopupRow>
                  {option.description && (
                    <PopupRow bg={bg} w={innerW}>
                      <text
                        bg={bg}
                        fg={isDisabled ? t.textFaint : isActive ? t.textSecondary : t.textMuted}
                        truncate
                      >
                        {"    "}
                        {option.icon ? "  " : ""}
                        {option.description.length > innerW - 10
                          ? `${option.description.slice(0, innerW - 13)}…`
                          : option.description}
                      </text>
                    </PopupRow>
                  )}
                </box>
              );
            })
          )}
        </box>
        {filteredOptions.length > maxVisible && (
          <PopupRow w={innerW}>
            <text fg={t.textMuted} bg={POPUP_BG}>
              {scrollOffset > 0 ? "↑ " : "  "}
              {String(cursor + 1)}/{String(filteredOptions.length)}
              {scrollOffset + maxVisible < filteredOptions.length ? " ↓" : ""}
            </text>
          </PopupRow>
        )}

        <PopupRow w={innerW}>
          <text>{""}</text>
        </PopupRow>

        {config.toggles && config.toggles.length > 0 && (
          <>
            <PopupRow w={innerW}>
              <text fg={t.textFaint} bg={POPUP_BG}>
                {"─".repeat(innerW - 4)}
              </text>
            </PopupRow>
            {config.toggles.map((toggle) => {
              const on = toggleState[toggle.key] ?? toggle.value;
              return (
                <PopupRow key={toggle.key} w={innerW}>
                  <text bg={POPUP_BG} fg={on ? t.success : t.textDim}>
                    {"  "}
                    {on ? "◉" : "◯"}{" "}
                  </text>
                  <text bg={POPUP_BG} fg={on ? t.textPrimary : t.textMuted}>
                    {toggle.label}
                  </text>
                  <text bg={POPUP_BG} fg={t.textMuted}>
                    {"  "}
                    <span fg={on ? t.success : t.textDim} attributes={TextAttributes.BOLD}>
                      {"<"}
                      {toggle.key === "tab" ? "TAB" : toggle.key}
                      {">"}
                    </span>
                  </text>
                </PopupRow>
              );
            })}
          </>
        )}

        {config.scopeEnabled && (
          <PopupRow w={innerW}>
            <text bg={POPUP_BG} fg={t.textMuted}>
              {"Save to: "}
            </text>
            {CONFIG_SCOPES.map((s) => (
              <text
                key={s}
                bg={POPUP_BG}
                fg={s === scope ? t.brandAlt : t.textDim}
                attributes={s === scope ? TextAttributes.BOLD : undefined}
              >
                {s === scope ? `[${s}]` : ` ${s} `}
                {"  "}
              </text>
            ))}
          </PopupRow>
        )}

        <PopupRow w={innerW}>
          <text fg={t.textMuted} bg={POPUP_BG}>
            {"↑↓"} navigate | {"⏎"} select{config.searchable ? " | type to filter" : ""}
            {config.toggles
              ? ` | ${config.toggles.map((tg) => `${tg.key === "tab" ? "⇥" : tg.key} ${tg.label.toLowerCase()}`).join(" | ")}`
              : ""}
            {config.scopeEnabled ? " | ← → scope" : ""} | esc
          </text>
        </PopupRow>
      </box>
    </Overlay>
  );
}
