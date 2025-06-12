import { computePosition, autoPlacement, autoUpdate, offset, flip, shift } from "@floating-ui/react";
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

const { setText } = useSelectText.getActions();

export const useSelect = ({
  ignoreRef,
  onClean,
  popoverEle,
}: {
  ignoreRef: RefObject<HTMLDivElement | null>;
  onClean?: () => void;
  popoverEle?: HTMLDivElement | null;
}) => {
  const cbRef = useRef<() => void>(null);

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      if (ignoreRef.current && ignoreRef.current.contains(e.target as Node)) {
        return;
      }

      if (!popoverEle) return;

      const selection = window.getSelection();

      if (selection && selection.rangeCount > 0) {
        const text = selection.toString();

        if (!text.trim()) return;

        setText(text);

        const range = selection.getRangeAt(0);

        const updatePosition = () => {
          computePosition(range, popoverEle, {
            placement: "right",
            strategy: "fixed",
            middleware: [offset(8), autoPlacement(), flip(), shift()],
          }).then(({ x, y }) => {
            Object.assign(popoverEle.style, {
              left: `${x}px`,
              top: `${y}px`,
            });
          });
        };

        const cb = autoUpdate(range, popoverEle, updatePosition, {
          animationFrame: true,
        });

        cbRef.current?.();

        cbRef.current = cb;
      }
    };

    const handleClick = (e: MouseEvent) => {
      if (ignoreRef.current && ignoreRef.current.contains(e.target as Node)) {
        return;
      }

      setText("");

      onClean?.();

      cbRef.current?.();
    };

    document.addEventListener("mouseup", handleMouseUp);

    document.addEventListener("mousedown", handleClick);

    return () => {
      document.removeEventListener("mouseup", handleMouseUp);

      document.removeEventListener("mousedown", handleClick);

      cbRef.current?.();
    };
  }, [popoverEle]);
};
