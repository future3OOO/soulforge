import { Box, Text } from "ink";
import { providerIcon, UI_ICONS } from "../core/icons.js";

interface Props {
  provider: string;
  model: string;
  cwd: string;
  messageCount: number;
}

export function StatusBar({ provider, model, cwd, messageCount }: Props) {
  return (
    <Box flexDirection="row" justifyContent="space-between" paddingX={1} height={1} width="100%">
      <Box gap={1}>
        <Text backgroundColor="#6A0DAD" color="white" bold wrap="truncate">
          {` ${providerIcon(provider)} ${provider.toUpperCase()} `}
        </Text>
        <Text color="#555">{UI_ICONS.brain}</Text>
        <Text color="#666" wrap="truncate">
          {model}
        </Text>
      </Box>
      <Box gap={1}>
        <Text color="#555">{UI_ICONS.folder}</Text>
        <Text color="#444" wrap="truncate">
          {cwd}
        </Text>
        <Text color="#333">│</Text>
        <Text color="#DC143C">{messageCount} msgs</Text>
      </Box>
    </Box>
  );
}
