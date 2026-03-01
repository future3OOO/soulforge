import { existsSync } from "node:fs";
import { join } from "node:path";
import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ContextManager } from "../core/context/manager.js";
import {
  type InstalledSkill,
  installSkill,
  listInstalledSkills,
  loadSkill,
  type SkillSearchResult,
  searchSkills,
} from "../core/skills/manager.js";

const POPUP_WIDTH = 90;
const POPUP_BG = "#111122";
const POPUP_HL = "#1a1a3e";
const MAX_VISIBLE = 12;

type Tab = "search" | "installed" | "active";
const TABS: Tab[] = ["search", "installed", "active"];
const TAB_LABELS: Record<Tab, string> = {
  search: "Search",
  installed: "Installed",
  active: "Active",
};

interface Props {
  visible: boolean;
  contextManager: ContextManager;
  onClose: () => void;
  onSystemMessage: (msg: string) => void;
}

function Row({ children, bg, w }: { children: React.ReactNode; bg?: string; w: number }) {
  const fill = bg ?? POPUP_BG;
  return (
    <Box width={w} height={1}>
      <Box position="absolute">
        <Text backgroundColor={fill}>{" ".repeat(w)}</Text>
      </Box>
      <Box position="absolute">
        <Text backgroundColor={fill}>{"  "}</Text>
        {children}
      </Box>
    </Box>
  );
}

export function SkillSearch({ visible, contextManager, onClose, onSystemMessage }: Props) {
  const [tab, setTab] = useState<Tab>("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SkillSearchResult[]>([]);
  const [installed, setInstalled] = useState<InstalledSkill[]>([]);
  const [activeSkills, setActiveSkills] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [searching, setSearching] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [pendingInstall, setPendingInstall] = useState<SkillSearchResult | null>(null);
  const [scopeCursor, setScopeCursor] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isInProject = existsSync(join(process.cwd(), ".git"));

  const innerW = POPUP_WIDTH - 2;

  // Local filtering for installed/active tabs
  const filterQuery = query.toLowerCase().trim();
  const filteredInstalled = filterQuery
    ? installed.filter((s) => s.name.toLowerCase().includes(filterQuery))
    : installed;
  const filteredActive = filterQuery
    ? activeSkills.filter((s) => s.toLowerCase().includes(filterQuery))
    : activeSkills;

  const refreshInstalled = useCallback(() => {
    setInstalled(listInstalledSkills());
  }, []);

  const refreshActive = useCallback(() => {
    setActiveSkills(contextManager.getActiveSkills());
  }, [contextManager]);

  // Reset state when popup opens
  useEffect(() => {
    if (visible) {
      setTab("search");
      setQuery("");
      setResults([]);
      setCursor(0);
      refreshInstalled();
      refreshActive();
    }
  }, [visible, refreshInstalled, refreshActive]);

  // Debounced search
  useEffect(() => {
    if (!visible || tab !== "search") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(() => {
      searchSkills(query.trim())
        .then((r) => {
          setResults(r);
          setCursor(0);
        })
        .catch(() => {
          setResults([]);
        })
        .finally(() => setSearching(false));
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, visible, tab]);

  // Reset filter + refresh when switching tabs
  useEffect(() => {
    setQuery("");
    setResults([]);
    setCursor(0);
    setScrollOffset(0);
    if (tab === "installed") refreshInstalled();
    if (tab === "active") refreshActive();
  }, [tab, refreshInstalled, refreshActive]);

  const currentList = (): number => {
    if (tab === "search") return results.length;
    if (tab === "installed") return filteredInstalled.length;
    return filteredActive.length;
  };

  const adjustScroll = (nextCursor: number) => {
    setScrollOffset((prev) => {
      if (nextCursor < prev) return nextCursor;
      if (nextCursor >= prev + MAX_VISIBLE) return nextCursor - MAX_VISIBLE + 1;
      return prev;
    });
  };

  useInput(
    (_input, key) => {
      // Scope picker mode
      if (pendingInstall) {
        if (key.escape) {
          setPendingInstall(null);
          return;
        }
        if (key.upArrow || key.downArrow) {
          setScopeCursor((prev) => (prev === 0 ? 1 : 0));
          return;
        }
        if (key.return) {
          const isGlobal = isInProject ? scopeCursor === 1 : true;
          doInstall(pendingInstall, isGlobal);
          setPendingInstall(null);
          return;
        }
        return;
      }

      // Escape to close
      if (key.escape) {
        onClose();
        return;
      }

      // Tab to cycle tabs
      if (key.tab) {
        const idx = TABS.indexOf(tab);
        const next = TABS[(idx + 1) % TABS.length] as Tab;
        setTab(next);
        return;
      }

      // Navigation
      if (key.upArrow) {
        const len = currentList();
        setCursor((prev) => {
          const next = prev > 0 ? prev - 1 : Math.max(0, len - 1);
          adjustScroll(next);
          return next;
        });
        return;
      }
      if (key.downArrow) {
        const len = currentList();
        setCursor((prev) => {
          const next = prev < len - 1 ? prev + 1 : 0;
          adjustScroll(next);
          return next;
        });
        return;
      }

      // Enter action
      if (key.return) {
        handleAction();
        return;
      }

      // Backspace / delete for filter input
      if (key.backspace || key.delete) {
        setQuery((prev) => prev.slice(0, -1));
        setCursor(0);
        setScrollOffset(0);
        return;
      }

      // Typing for filter input
      if (_input && !key.ctrl && !key.meta) {
        setQuery((prev) => prev + _input);
        setCursor(0);
        setScrollOffset(0);
      }
    },
    { isActive: visible },
  );

  const doInstall = (skill: SkillSearchResult, global: boolean) => {
    setInstalling(true);
    installSkill(skill.source, skill.skillId, global)
      .then(() => {
        onSystemMessage(`Skill "${skill.name}" installed ${global ? "globally" : "to project"}.`);
        refreshInstalled();
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        onSystemMessage(`Failed to install "${skill.name}": ${msg}`);
      })
      .finally(() => setInstalling(false));
  };

  const handleAction = () => {
    if (tab === "search") {
      const skill = results[cursor];
      if (!skill || installing) return;
      if (isInProject) {
        // Show scope picker
        setPendingInstall(skill);
        setScopeCursor(0);
      } else {
        // No project — install globally
        doInstall(skill, true);
      }
    } else if (tab === "installed") {
      const skill = filteredInstalled[cursor];
      if (!skill) return;
      const content = loadSkill(skill.path);
      contextManager.addSkill(skill.name, content);
      onSystemMessage(`Skill "${skill.name}" loaded into AI context.`);
      refreshActive();
    } else {
      const name = filteredActive[cursor];
      if (!name) return;
      contextManager.removeSkill(name);
      onSystemMessage(`Skill "${name}" unloaded from AI context.`);
      refreshActive();
    }
  };

  if (!visible) return null;

  const tabIdx = TABS.indexOf(tab);

  return (
    <Box
      position="absolute"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      width="100%"
      height="100%"
    >
      <Box flexDirection="column" borderStyle="round" borderColor="#8B5CF6" width={POPUP_WIDTH}>
        {/* Title */}
        <Row w={innerW}>
          <Text color="white" bold backgroundColor={POPUP_BG}>
            {"\uDB82\uDD2A"} Skills
          </Text>
        </Row>

        {/* Tabs */}
        <Row w={innerW}>
          {TABS.map((t, i) => (
            <Text key={t} backgroundColor={POPUP_BG}>
              {i > 0 ? (
                <Text color="#333" backgroundColor={POPUP_BG}>
                  {" │ "}
                </Text>
              ) : (
                ""
              )}
              <Text
                color={i === tabIdx ? "#FF0040" : "#666"}
                bold={i === tabIdx}
                backgroundColor={POPUP_BG}
              >
                {TAB_LABELS[t]}
              </Text>
            </Text>
          ))}
        </Row>

        {/* Separator */}
        <Row w={innerW}>
          <Text color="#333" backgroundColor={POPUP_BG}>
            {"─".repeat(innerW - 4)}
          </Text>
        </Row>

        {/* Filter input — shown on all tabs */}
        <Row w={innerW}>
          <Text color="#9B30FF" backgroundColor={POPUP_BG}>
            {" "}
          </Text>
          <Text color={query ? "white" : "#555"} backgroundColor={POPUP_BG}>
            {query ||
              (tab === "search"
                ? "type to search skills.sh..."
                : tab === "installed"
                  ? "type to filter installed..."
                  : "type to filter active...")}
          </Text>
          <Text color="#FF0040" backgroundColor={POPUP_BG}>
            {"█"}
          </Text>
        </Row>
        <Row w={innerW}>
          <Text>{""}</Text>
        </Row>

        {/* Tab content */}
        {tab === "search" && (
          <>
            {searching ? (
              <Row w={innerW}>
                <Text color="#9B30FF" backgroundColor={POPUP_BG}>
                  searching...
                </Text>
              </Row>
            ) : results.length === 0 && query ? (
              <Row w={innerW}>
                <Text color="#555" backgroundColor={POPUP_BG}>
                  no results
                </Text>
              </Row>
            ) : (
              results.slice(scrollOffset, scrollOffset + MAX_VISIBLE).map((skill, i) => {
                const idx = scrollOffset + i;
                const isActive = idx === cursor;
                const bg = isActive ? POPUP_HL : POPUP_BG;
                return (
                  <Row key={skill.id} bg={bg} w={innerW}>
                    <Text backgroundColor={bg} color={isActive ? "#FF0040" : "#555"}>
                      {isActive ? "› " : "  "}
                    </Text>
                    <Text
                      backgroundColor={bg}
                      color={isActive ? "#FF0040" : "#aaa"}
                      bold={isActive}
                    >
                      {skill.skillId}
                    </Text>
                    <Text backgroundColor={bg} color="#555">
                      {" "}
                      {skill.source}
                    </Text>
                    <Text backgroundColor={bg} color="#444">
                      {" "}
                      {skill.installs.toLocaleString()}↓
                    </Text>
                  </Row>
                );
              })
            )}
            {results.length > MAX_VISIBLE && (
              <Row w={innerW}>
                <Text color="#555" backgroundColor={POPUP_BG}>
                  {scrollOffset > 0 ? "↑ " : "  "}
                  {cursor + 1}/{results.length}
                  {scrollOffset + MAX_VISIBLE < results.length ? " ↓" : ""}
                </Text>
              </Row>
            )}

            {pendingInstall && (
              <>
                <Row w={innerW}>
                  <Text>{""}</Text>
                </Row>
                <Row w={innerW}>
                  <Text color="white" bold backgroundColor={POPUP_BG}>
                    Install "{pendingInstall.skillId}" to:
                  </Text>
                </Row>
                {(["Project", "Global"] as const).map((label, i) => {
                  const isActive = i === scopeCursor;
                  const bg = isActive ? POPUP_HL : POPUP_BG;
                  return (
                    <Row key={label} bg={bg} w={innerW}>
                      <Text backgroundColor={bg} color={isActive ? "#FF0040" : "#555"}>
                        {isActive ? "› " : "  "}
                      </Text>
                      <Text
                        backgroundColor={bg}
                        color={isActive ? "#FF0040" : "#aaa"}
                        bold={isActive}
                      >
                        {label}
                      </Text>
                      <Text backgroundColor={bg} color="#555">
                        {" "}
                        {i === 0
                          ? ".agents/skills/ (this repo)"
                          : "~/.agents/skills/ (all projects)"}
                      </Text>
                    </Row>
                  );
                })}
              </>
            )}

            {installing && (
              <Row w={innerW}>
                <Text color="#9B30FF" backgroundColor={POPUP_BG}>
                  installing...
                </Text>
              </Row>
            )}
          </>
        )}

        {tab === "installed" &&
          (filteredInstalled.length === 0 ? (
            <Row w={innerW}>
              <Text color="#555" backgroundColor={POPUP_BG}>
                {query ? "no matching skills" : "no installed skills found"}
              </Text>
            </Row>
          ) : (
            filteredInstalled.slice(scrollOffset, scrollOffset + MAX_VISIBLE).map((skill, i) => {
              const idx = scrollOffset + i;
              const isActive = idx === cursor;
              const isLoaded = activeSkills.includes(skill.name);
              const bg = isActive ? POPUP_HL : POPUP_BG;
              return (
                <Row key={skill.path} bg={bg} w={innerW}>
                  <Text backgroundColor={bg} color={isActive ? "#FF0040" : "#555"}>
                    {isActive ? "› " : "  "}
                  </Text>
                  <Text backgroundColor={bg} color={isActive ? "#FF0040" : "#aaa"} bold={isActive}>
                    {skill.name}
                  </Text>
                  {isLoaded && (
                    <Text backgroundColor={bg} color="#00FF00">
                      {" "}
                      ●
                    </Text>
                  )}
                </Row>
              );
            })
          ))}
        {tab === "installed" && filteredInstalled.length > MAX_VISIBLE && (
          <Row w={innerW}>
            <Text color="#555" backgroundColor={POPUP_BG}>
              {scrollOffset > 0 ? "↑ " : "  "}
              {cursor + 1}/{filteredInstalled.length}
              {scrollOffset + MAX_VISIBLE < filteredInstalled.length ? " ↓" : ""}
            </Text>
          </Row>
        )}

        {tab === "active" &&
          (filteredActive.length === 0 ? (
            <Row w={innerW}>
              <Text color="#555" backgroundColor={POPUP_BG}>
                {query ? "no matching skills" : "no active skills — load from Installed tab"}
              </Text>
            </Row>
          ) : (
            filteredActive.slice(scrollOffset, scrollOffset + MAX_VISIBLE).map((name, i) => {
              const idx = scrollOffset + i;
              const isActive = idx === cursor;
              const bg = isActive ? POPUP_HL : POPUP_BG;
              return (
                <Row key={name} bg={bg} w={innerW}>
                  <Text backgroundColor={bg} color={isActive ? "#FF0040" : "#555"}>
                    {isActive ? "› " : "  "}
                  </Text>
                  <Text
                    backgroundColor={bg}
                    color={isActive ? "#FF0040" : "#00FF00"}
                    bold={isActive}
                  >
                    {name}
                  </Text>
                </Row>
              );
            })
          ))}
        {tab === "active" && filteredActive.length > MAX_VISIBLE && (
          <Row w={innerW}>
            <Text color="#555" backgroundColor={POPUP_BG}>
              {scrollOffset > 0 ? "↑ " : "  "}
              {cursor + 1}/{filteredActive.length}
              {scrollOffset + MAX_VISIBLE < filteredActive.length ? " ↓" : ""}
            </Text>
          </Row>
        )}

        {/* Spacer */}
        <Row w={innerW}>
          <Text>{""}</Text>
        </Row>
        {/* Hints */}
        <Row w={innerW}>
          <Text color="#555" backgroundColor={POPUP_BG}>
            ↑↓ nav ⏎ {tab === "search" ? "install" : tab === "installed" ? "load" : "unload"} ⇥ tab
            esc close
          </Text>
        </Row>
      </Box>
    </Box>
  );
}
