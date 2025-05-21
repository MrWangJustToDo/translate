import { useEffect, useRef } from "react";
import { createState } from "reactivity-store";

import type { RefObject } from "react";

export const useSelectText = createState(() => ({ state: "" }), {
  withActions: (s) => ({
    setText: (text: string) => {
      s.state = text;
    },
  }),
});

export const useSelectPosition = createState(() => ({ state: { x: 0, y: 0 } }), {
  withActions: (s) => ({
    setPosition: (x: number, y: number) => {
      s.state.x = x;
      s.state.y = y;
    },
  }),
});

const { setText } = useSelectText.getActions();

const { setPosition } = useSelectPosition.getActions();

export const useSelect = ({ ref, onClean }: { ref: RefObject<HTMLDivElement | null>; onClean?: () => void }) => {
  const originRef = useRef<{ x: number; y: number }>(null);

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      if (ref.current && ref.current.contains(e.target as Node)) {
        return;
      }

      const selection = window.getSelection();

      if (selection && selection.rangeCount > 0) {
        const text = selection.toString();

        if (!text.trim()) return;

        setText(text);

        const { clientX, clientY } = e;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        let targetX = rect.right + 8;
        let targetY = rect.bottom + 5;
        const origin = originRef.current;
        if (origin) {
          const isRightToLeft = clientX < origin.x;
          const isBottomToTop = clientY < origin.y && origin.y - clientY >= rect.height - 5;
          targetX = isRightToLeft ? rect.left - 8 - 30 : rect.right + 8;
          targetY = isBottomToTop ? rect.top - 5 - 30 : rect.bottom + 5;
        }
        if (targetX > window.innerWidth) {
          targetX = window.innerWidth - 8;
        }
        if (targetY > window.innerHeight) {
          targetY = window.innerHeight - 5 - rect.height;
        }

        setPosition(targetX, targetY);
      }
    };

    const handleClick = (e: MouseEvent) => {
      if (ref.current && ref.current.contains(e.target as Node)) return;

      setText("");

      onClean?.();

      originRef.current = { x: e.clientX, y: e.clientY };
    };

    document.addEventListener("mouseup", handleMouseUp);

    document.addEventListener("mousedown", handleClick);

    return () => {
      document.removeEventListener("mouseup", handleMouseUp);

      document.removeEventListener("mousedown", handleClick);
    };
  }, []);
};
