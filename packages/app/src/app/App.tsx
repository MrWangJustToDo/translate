import { Box } from "ink";

import { Help } from "../components/Help.js";
import { useConfig } from "../hooks/use-config.js";
import { useTheme } from "../hooks/use-theme.js";

import { Agent } from "./Agent.js";

export const App = () => {
  // Subscribe so /appearance palette mutations re-render the tree.
  useTheme((s) => s.theme);

  const helpRequested = useConfig((s) => s.helpRequested);

  if (helpRequested) {
    return (
      <Box flexDirection="column">
        <Help />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Agent />
    </Box>
  );
};
