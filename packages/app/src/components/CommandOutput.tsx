import { Box, Text } from "ink";

import { COMMAND_OUTPUT_MAX_VISIBLE, useCommandOutput } from "../hooks/use-command-output.js";
import { COLORS } from "../theme/colors.js";

import { ScrollableList } from "./ScrollableList.js";

/**
 * Render a single content line. Empty strings are replaced with a space to
 * ensure they still occupy one line of terminal height -- otherwise Ink
 * collapses them to zero height, causing visible height changes on scroll.
 * Long lines are truncated (wrap="truncate") so every line stays exactly one
 * row high -- wrapping would make a line 2+ rows tall and cause the visible
 * height to jump while scrolling.
 */
const renderLine = (line: string) => (
  <Text color={COLORS.muted} wrap="truncate">
    {line || " "}
  </Text>
);

export const CommandOutput = () => {
  const lines = useCommandOutput((s) => s.lines);
  const title = useCommandOutput((s) => s.title);
  const node = useCommandOutput((s) => s.node ?? null);
  const scrollOffset = useCommandOutput((s) => s.scrollOffset);

  if (!lines) return null;

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {title && (
        <Text color={COLORS.primary} bold>
          {title}
        </Text>
      )}
      <ScrollableList
        items={lines as string[]}
        maxVisible={COMMAND_OUTPUT_MAX_VISIBLE}
        scrollOffset={scrollOffset}
        renderItem={renderLine}
      />
      {node && (
        <Box marginTop={1} marginBottom={1}>
          {node}
        </Box>
      )}
    </Box>
  );
};
