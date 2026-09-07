import { Box } from "ink";
import { useEffect, useState } from "react";

import { useUserInput } from "../hooks/use-user-input.js";
import { KeyLabel, approveDenyLabel, newlineEnterLabel } from "../utils/keyboard-labels.js";

import { MultiLineInput } from "./MultiLineInput.js";

const ROTATE_INTERVAL_MS = 8000;

/**
 * Rotating placeholder hints shown while the input is empty: quick-start
 * prompts, operation tips, slash commands, and keyboard shortcuts.
 */
const ROTATING_HINTS: readonly string[] = [
  'Try: "Explain this codebase"',
  'Try: "Fix the bug in this module"',
  'Try: "Write tests for this function"',
  `${KeyLabel.enter} submits · ${newlineEnterLabel()} inserts a newline`,
  `${approveDenyLabel()} approves or denies a tool call`,
  `${KeyLabel.slash} opens all commands`,
  "/help lists commands · /shortcuts lists keys",
  "/resume continues your last session",
  "/mode switches plan / auto / normal",
  `${KeyLabel.ctrlE} workspace · ${KeyLabel.ctrlT} tasks · ${KeyLabel.ctrlY} extensions`,
  `${KeyLabel.shiftTab} cycles Normal → Auto → Plan mode`,
  `${KeyLabel.esc} aborts the current run`,
];

export const UserInput = () => {
  const value = useUserInput((s) => s.value);
  const cursorPosition = useUserInput((s) => s.cursorPosition);
  const selectAll = useUserInput((s) => s.selectAll);
  const pendingPastes = useUserInput((s) => s.pendingPastes);
  const expandedPasteIndex = useUserInput((s) => s.expandedPasteIndex);

  const [hintIndex, setHintIndex] = useState(0);

  // Rotate the placeholder hint while the input is empty; pause once the user
  // starts typing so the hint never churns under the cursor.
  useEffect(() => {
    if (value) return;
    const id = setInterval(() => {
      setHintIndex((i) => (i + 1) % ROTATING_HINTS.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [value]);

  return (
    <Box flexDirection="column">
      <MultiLineInput
        value={value}
        placeholder={ROTATING_HINTS[hintIndex]}
        cursorPosition={cursorPosition}
        selectAll={selectAll}
        pendingPastes={pendingPastes}
        expandedPasteIndex={expandedPasteIndex}
      />
    </Box>
  );
};
