import { Box, Text } from "ink";

interface Props {
  text: string;
}

export function StreamingText({ text }: Props) {
  return (
    <Box flexDirection="column" width="100%">
      <Text color="#ccc" wrap="wrap">
        {text}
      </Text>
    </Box>
  );
}
