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

export const useSelect = ({ ref }: { ref: RefObject<HTMLDivElement | null> }) => {
  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      if (ref.current && ref.current.contains(e.target as Node)) {
        return;
      }
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const text = selection.toString();
        setText(text);
        setPosition(e.clientX + 10, e.clientY + 10);
      }
    };

    const handleClick = () => {
      setText("");
    };

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleClick);

    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleClick);
    };
  }, []);
};
