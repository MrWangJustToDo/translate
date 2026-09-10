import { Box, Text } from "ink";

import { useSize } from "../hooks";

import type { ReactNode } from "react";

export interface HalfLinePaddedBoxProps {
  /** Background color for the padded box (hex or named color) */
  backgroundColor: string;
  /** Skip the tinted ▄/▀ bars and solid fill entirely — spacing becomes
   *  plain empty rows so content that paints its own backgrounds (e.g.
   *  diffs) sits on the untouched terminal background. */
  transparentBody?: boolean;
  /** Content width override (defaults to screenWidth) */
  width?: number;
  children?: ReactNode;
}

/**
 * A container with a solid background and half-line padding at the top
 * and bottom using block characters (▄/▀). Inspired by Gemini CLI.
 */
export const HalfLinePaddedBox = ({
  backgroundColor,
  transparentBody,
  width: widthOverride,
  children,
}: HalfLinePaddedBoxProps) => {
  const screenWidth = useSize((s) => s.state.screenWidth);
  const w = widthOverride ?? screenWidth;

  if (transparentBody) {
    return (
      <Box flexDirection="column" width={w}>
        <Box height={1} />
        {children}
        {/* <Box height={1} /> */}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={w}>
      <Text color={backgroundColor}>{"▄".repeat(w)}</Text>
      <Box width={w} backgroundColor={backgroundColor}>
        {children}
      </Box>
      <Text color={backgroundColor}>{"▀".repeat(w)}</Text>
    </Box>
  );
};
