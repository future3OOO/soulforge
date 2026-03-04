import { Box, Text } from "ink";
import type { Tab } from "../hooks/useTabs.js";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onSwitch: (id: string) => void;
}

function truncateLabel(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

export function TabBar({ tabs, activeTabId, onSwitch: _onSwitch }: TabBarProps) {
  if (tabs.length < 2) return null;

  return (
    <Box flexShrink={0} paddingX={1} height={1}>
      {tabs.map((tab, i) => {
        const isActive = tab.id === activeTabId;
        const label = truncateLabel(tab.label, 16);
        const num = String(i + 1);
        return (
          <Box key={tab.id}>
            {i > 0 && <Text color="#333"> · </Text>}
            <Text color={isActive ? "#8B5CF6" : "#555"} bold={isActive}>
              {num} {label}
            </Text>
          </Box>
        );
      })}
      <Text color="#333"> · </Text>
      <Text color="#444">+ new Alt+T</Text>
    </Box>
  );
}
