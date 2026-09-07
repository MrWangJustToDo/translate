import { createState } from "reactivity-store";

import { createFeedbackQueue, INPUT_FEEDBACK_DISPLAY_MS } from "../utils/input-feedback-queue.js";
import {
  appendHistoryEntry,
  createImagePlaceholder,
  createPastePlaceholder,
  extractSubmittedInput,
  getImageIndex,
  getPasteIndex,
  hasImagePlaceholder,
  isImagePlaceholder,
  isLargePaste,
  isPastePlaceholder,
  PASTE_MERGE_WINDOW_MS,
  removeAttachmentAtIndex,
  removePasteAtIndex,
} from "../utils/user-input-helpers.js";

import type { Attachment } from "../types/attachment.js";
import type { PendingPaste } from "../utils/user-input-helpers.js";
import type { Key } from "ink";

export {
  IMAGE_PLACEHOLDER_END,
  IMAGE_PLACEHOLDER_START,
  PASTE_PLACEHOLDER_END,
  PASTE_PLACEHOLDER_START,
  createImagePlaceholder,
  createPastePlaceholder,
  formatPastePlaceholder,
  getImageIndex,
  getPasteIndex,
  isImagePlaceholder,
  isLargePaste,
  isPastePlaceholder,
} from "../utils/user-input-helpers.js";

export type { PendingPaste } from "../utils/user-input-helpers.js";

// ============================================================================
// Types
// ============================================================================

export interface UserInputState {
  /** Current input value (may contain image placeholder characters) */
  value: string;
  /** Input history */
  history: string[];
  /** Current history index (-1 means current input) */
  historyIndex: number;
  /** Snapshot of the in-progress input kept while navigating history */
  draftInput: DraftInput | null;
  /** Whether input is focused/active */
  focused: boolean;
  /** Cursor position */
  cursorPosition: number;
  /** Whether all text is selected (Ctrl+A) */
  selectAll: boolean;
  /** */
  loading: boolean;
  /** Pending file attachments (indexed by placeholder character) */
  attachments: Attachment[];
  /** Currently selected attachment index (-1 means none selected) */
  selectedAttachment: number;
  /** Next image index to use for placeholder */
  nextImageIndex: number;
  /** Pending large pastes (indexed by placeholder character) */
  pendingPastes: (PendingPaste | undefined)[];
  /** Next paste index to use for placeholder */
  nextPasteIndex: number;
  /** Currently expanded paste placeholder index (null = all collapsed) */
  expandedPasteIndex: number | null;
  /** Timestamp of the last `paste` action (-1 = none), used to merge stdin
   *  chunks of a single bracketed paste into one placeholder. */
  lastPasteAt: number;
  /** Transient input error message */
  inputError: string | null;
  /** Transient input feedback message */
  inputFeedback: { message: string; level: "success" | "info" | "error" } | null;

  // debug only
  event: any[];
}

/**
 * Snapshot of the current (unsubmitted) input, kept so history navigation can
 * return to it. Preserves placeholder-backed state (attachments + collapsed
 * pastes) alongside the raw value and cursor.
 */
export interface DraftInput {
  value: string;
  cursorPosition: number;
  attachments: Attachment[];
  nextImageIndex: number;
  pendingPastes: (PendingPaste | undefined)[];
  nextPasteIndex: number;
  expandedPasteIndex: number | null;
}

const initialState: UserInputState = {
  event: [],
  value: "",
  history: [],
  historyIndex: -1,
  draftInput: null,
  focused: true,
  cursorPosition: 0,
  selectAll: false,
  loading: false,
  attachments: [],
  selectedAttachment: -1,
  nextImageIndex: 0,
  pendingPastes: [],
  nextPasteIndex: 0,
  expandedPasteIndex: null,
  lastPasteAt: -1,
  inputError: null,
  inputFeedback: null,
};

let feedbackQueueController: ReturnType<typeof createFeedbackQueue> | null = null;

function getFeedbackQueue(state: UserInputState) {
  if (!feedbackQueueController) {
    feedbackQueueController = createFeedbackQueue({
      displayMs: INPUT_FEEDBACK_DISPLAY_MS,
      onShow: (item) => {
        state.inputFeedback = { message: item.message, level: item.level };
        state.inputError = null;
      },
      onClear: () => {
        state.inputFeedback = null;
      },
    });
  }
  return feedbackQueueController;
}

/**
 * Clear all placeholder-backed state (image attachments + collapsed pastes).
 * Used by selectAll replacement, clear, submit and reset.
 */
function resetInputPlaceholders(state: UserInputState): void {
  state.attachments = [];
  state.nextImageIndex = 0;
  state.pendingPastes = [];
  state.nextPasteIndex = 0;
  state.expandedPasteIndex = null;
}

/**
 * If the char being deleted is a placeholder (image or collapsed paste), prune
 * its backing state. Shared by backspace and deleteForward.
 */
function removePlaceholderAt(state: UserInputState, char: string): void {
  if (char && isImagePlaceholder(char)) {
    state.attachments = removeAttachmentAtIndex(state.attachments, getImageIndex(char));
  }
  if (char && isPastePlaceholder(char)) {
    const index = getPasteIndex(char);
    state.pendingPastes = removePasteAtIndex(state.pendingPastes, index);
    if (state.expandedPasteIndex === index) {
      state.expandedPasteIndex = null;
    }
  }
}

/**
 * Snapshot the current in-progress input so history navigation can return to
 * it. Only saves when there is something worth restoring (empty input keeps
 * draftInput = null).
 */
function saveDraft(state: UserInputState): void {
  if (!state.value && state.attachments.length === 0 && state.pendingPastes.length === 0) {
    return;
  }
  state.draftInput = {
    value: state.value,
    cursorPosition: state.cursorPosition,
    attachments: state.attachments,
    nextImageIndex: state.nextImageIndex,
    pendingPastes: state.pendingPastes,
    nextPasteIndex: state.nextPasteIndex,
    expandedPasteIndex: state.expandedPasteIndex,
  };
}

/** Discard the saved draft (editing starts a new input; nothing to return to). */
function clearDraft(state: UserInputState): void {
  state.draftInput = null;
}

/**
 * Restore the saved draft after navigating back to index -1. Clears the
 * snapshot (it has been consumed).
 */
function restoreDraft(state: UserInputState): void {
  const draft = state.draftInput;
  state.draftInput = null;
  if (!draft) {
    state.value = "";
    state.cursorPosition = 0;
    return;
  }
  state.value = draft.value;
  state.cursorPosition = draft.cursorPosition;
  state.attachments = draft.attachments;
  state.nextImageIndex = draft.nextImageIndex;
  state.pendingPastes = draft.pendingPastes;
  state.nextPasteIndex = draft.nextPasteIndex;
  state.expandedPasteIndex = draft.expandedPasteIndex;
  state.lastPasteAt = -1;
}

/**
 * Load a history entry into the input. History stores already-expanded plain
 * text (placeholders are expanded at submit time), so placeholder-backed state
 * is cleared to avoid leaving orphan entries.
 */
function restoreHistoryEntry(state: UserInputState): void {
  state.value = state.history[state.historyIndex] ?? "";
  state.cursorPosition = state.value.length;
  state.lastPasteAt = -1;
  resetInputPlaceholders(state);
}

/**
 * Collapse an expanded paste placeholder once the cursor moves away from it,
 * so a dangling multi-line preview does not sit under a cursor on unrelated
 * text (display positions only line up with value offsets while collapsed).
 */
function autoCollapsePaste(state: UserInputState): void {
  const expanded = state.expandedPasteIndex;
  if (expanded === null) return;
  const pos = state.value.indexOf(createPastePlaceholder(expanded));
  if (pos === -1) {
    state.expandedPasteIndex = null;
    return;
  }
  const cur = state.cursorPosition;
  if (cur !== pos && cur !== pos + 1 && cur !== pos - 1) {
    state.expandedPasteIndex = null;
  }
}

/**
 * Insert already-newline-normalized text at the cursor. If selectAll is on,
 * replaces everything (clearing attachments and pastes). Shared by typing
 * (append) and small pastes.
 */
function insertCharsAtCursor(state: UserInputState, chars: string): void {
  clearDraft(state);
  if (state.selectAll) {
    state.value = chars;
    state.cursorPosition = chars.length;
    resetInputPlaceholders(state);
    state.selectAll = false;
    state.historyIndex = -1;
    return;
  }

  const pos = state.cursorPosition;
  state.value = state.value.slice(0, pos) + chars + state.value.slice(pos);
  state.cursorPosition = pos + chars.length;
  state.historyIndex = -1;
}

// ============================================================================
// State Hook
// ============================================================================

/**
 * Global user input state hook (zustand-like API from reactivity-store)
 *
 * @example
 * ```tsx
 * // Use in components (reactive)
 * const { value, focused } = useUserInput();
 *
 * // Select specific state (reactive, optimized re-renders)
 * const value = useUserInput((s) => s.value);
 *
 * // Get actions (non-reactive, can call anywhere)
 * const { setValue, append, backspace, submit } = useUserInput.getActions();
 * ```
 */
export const useUserInput = createState(() => ({ ...initialState }), {
  withActions: (state) => ({
    /**
     * Set the entire input value
     */
    setValue: (value: string) => {
      clearDraft(state);
      state.value = value;
      state.cursorPosition = value.length;
      state.historyIndex = -1;
      state.selectAll = false;
    },

    /**
     * Select all text (Ctrl+A)
     */
    setSelectAll: (selected: boolean) => {
      state.selectAll = selected && state.value.length > 0;
    },

    addEvent: (chart: string, key: Key) => {
      state.event.push({ chart, key });
    },

    /**
     * Insert character(s) at cursor position
     * If selectAll is true, replaces everything with the new chars.
     */
    append: (chars: string) => {
      // Convert \r\n and \r to \n for proper newline handling
      chars = chars.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      insertCharsAtCursor(state, chars);
    },

    /**
     * Insert pasted text at cursor position. Large pastes (more than
     * {@link LARGE_PASTE_LINE_THRESHOLD} lines or
     * {@link LARGE_PASTE_CHAR_THRESHOLD} chars) collapse into a single
     * placeholder character so the input stays bounded; the real text is
     * stored in pendingPastes and expanded back on submit (mirrors gemini-cli).
     * Small pastes behave like typing.
     */
    paste: (text: string) => {
      // Convert \r\n and \r to \n for proper newline handling
      text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const now = Date.now();
      const isContinuation = state.lastPasteAt >= 0 && now - state.lastPasteAt <= PASTE_MERGE_WINDOW_MS;
      state.lastPasteAt = now;
      clearDraft(state);

      // react-terminal forwards each stdin chunk as a separate input event, so a
      // single large bracketed paste can arrive split across several consecutive
      // `paste` calls. Merge chunks that land right after a placeholder we just
      // created within the merge window so one paste collapses into a single
      // placeholder (no duplicate placeholders or stray trailing text).
      if (isContinuation && !state.selectAll && state.nextPasteIndex > 0) {
        const lastIndex = state.nextPasteIndex - 1;
        const pos = state.cursorPosition;
        if (state.value[pos - 1] === createPastePlaceholder(lastIndex)) {
          const lastPaste = state.pendingPastes[lastIndex];
          if (lastPaste) {
            const mergedText = lastPaste.text + text;
            const newPastes = [...state.pendingPastes];
            newPastes[lastIndex] = { text: mergedText, lineCount: mergedText.split("\n").length };
            state.pendingPastes = newPastes;
            state.historyIndex = -1;
            return;
          }
        }
      }

      if (!isLargePaste(text)) {
        insertCharsAtCursor(state, text);
        return;
      }

      const index = state.nextPasteIndex;
      const placeholder = createPastePlaceholder(index);

      if (state.selectAll) {
        state.value = placeholder;
        state.cursorPosition = 1;
        resetInputPlaceholders(state);
        state.pendingPastes = [{ text, lineCount: text.split("\n").length }];
        state.nextPasteIndex = 1;
        state.expandedPasteIndex = null;
        state.selectAll = false;
        state.historyIndex = -1;
      } else {
        const newPastes = [...state.pendingPastes];
        newPastes[index] = { text, lineCount: text.split("\n").length };
        state.pendingPastes = newPastes;

        const pos = state.cursorPosition;
        state.value = state.value.slice(0, pos) + placeholder + state.value.slice(pos);
        state.cursorPosition = pos + 1;

        state.nextPasteIndex = index + 1;
        state.expandedPasteIndex = null;
        state.historyIndex = -1;
      }

      getFeedbackQueue(state).enqueue({
        message: "Press Ctrl+O to expand pasted text",
        level: "info",
      });
    },

    /**
     * Toggle expand/collapse for the paste placeholder under the cursor
     * (Ctrl+O). When expanded, the full pasted text is shown inline; the
     * placeholder is still a single input character.
     */
    togglePasteExpansion: () => {
      const value = state.value;
      const pos = state.cursorPosition;
      const candidates = [value[pos - 1], value[pos], value[pos + 1]];
      for (const char of candidates) {
        if (char && isPastePlaceholder(char)) {
          const index = getPasteIndex(char);
          state.expandedPasteIndex = state.expandedPasteIndex === index ? null : index;
          return;
        }
      }
    },

    /**
     * Delete character before cursor (backspace)
     * If selectAll is true, clears everything.
     * If the character is an image placeholder, also removes the attachment.
     */
    backspace: () => {
      // If all selected, clear everything
      if (state.selectAll) {
        clearDraft(state);
        state.value = "";
        state.cursorPosition = 0;
        state.historyIndex = -1;
        resetInputPlaceholders(state);
        state.selectAll = false;
        return;
      }

      if (state.cursorPosition > 0) {
        clearDraft(state);
        const pos = state.cursorPosition;
        const charToDelete = state.value[pos - 1];

        // Prune attachment / paste state when deleting a placeholder
        removePlaceholderAt(state, charToDelete);

        state.value = state.value.slice(0, pos - 1) + state.value.slice(pos);
        state.cursorPosition = pos - 1;
        state.historyIndex = -1;
      }
    },

    /**
     * Delete character after cursor (forward delete)
     * If the character is an image placeholder, also removes the attachment
     */
    deleteForward: () => {
      if (state.cursorPosition < state.value.length) {
        clearDraft(state);
        const pos = state.cursorPosition;
        const charToDelete = state.value[pos];

        // Prune attachment / paste state when deleting a placeholder
        removePlaceholderAt(state, charToDelete);

        state.value = state.value.slice(0, pos) + state.value.slice(pos + 1);
        state.historyIndex = -1;
      }
    },

    /**
     * Move cursor left.
     */
    moveCursorLeft: () => {
      state.selectAll = false;
      if (state.cursorPosition > 0) {
        state.cursorPosition -= 1;
      }
      autoCollapsePaste(state);
    },

    /**
     * Move cursor right.
     */
    moveCursorRight: () => {
      state.selectAll = false;
      if (state.cursorPosition < state.value.length) {
        state.cursorPosition += 1;
      }
      autoCollapsePaste(state);
    },

    /**
     * Clear input
     */
    clear: () => {
      clearDraft(state);
      state.value = "";
      state.cursorPosition = 0;
      state.historyIndex = -1;
      state.lastPasteAt = -1;
      resetInputPlaceholders(state);
    },

    /**
     * Submit current input and optionally add to history.
     * Returns submitted text (image PUA placeholders replaced with `[Image #N: filename]` refs)
     * and attachments in appearance order.
     *
     * @param addToHistory - whether to append the submitted text to input history
     *   (default: true). Set to false for transient inputs like deny reasons or
     *   ask_user freeform answers that should not pollute normal input history.
     */
    submit: (addToHistory = true): { text: string; attachments: Attachment[] } => {
      const { text, attachments } = extractSubmittedInput(state.value, state.attachments, state.pendingPastes);
      if (addToHistory) {
        state.history = appendHistoryEntry(state.history, text);
      }

      state.value = "";
      state.cursorPosition = 0;
      state.historyIndex = -1;
      state.selectedAttachment = -1;
      state.lastPasteAt = -1;
      resetInputPlaceholders(state);
      clearDraft(state);
      return { text, attachments };
    },

    /**
     * Navigate to previous history entry
     */
    historyPrev: () => {
      if (state.history.length === 0) return;

      if (state.historyIndex === -1) {
        // Leaving the current input: snapshot it so we can return later.
        saveDraft(state);
        state.historyIndex = state.history.length - 1;
      } else if (state.historyIndex > 0) {
        state.historyIndex -= 1;
      }

      restoreHistoryEntry(state);
    },

    /**
     * Navigate to next history entry
     */
    historyNext: () => {
      if (state.historyIndex === -1) return;

      if (state.historyIndex < state.history.length - 1) {
        state.historyIndex += 1;
        restoreHistoryEntry(state);
      } else {
        // Back to the current input: restore the saved draft if there was one.
        state.historyIndex = -1;
        restoreDraft(state);
      }
    },

    /**
     * Set focus state
     */
    setFocused: (focused: boolean) => {
      state.focused = focused;
    },

    setLoading: (l?: boolean) => {
      state.loading = !!l;
    },

    /**
     * Add a file attachment and insert placeholder at cursor position
     */
    addAttachment: (attachment: Attachment) => {
      const imageIndex = state.nextImageIndex;
      const placeholder = createImagePlaceholder(imageIndex);

      // Store attachment at the index
      const newAttachments = [...state.attachments];
      newAttachments[imageIndex] = attachment;
      state.attachments = newAttachments;

      // Insert placeholder at cursor position
      const pos = state.cursorPosition;
      state.value = state.value.slice(0, pos) + placeholder + state.value.slice(pos);
      state.cursorPosition = pos + 1;

      state.nextImageIndex = imageIndex + 1;
      state.selectedAttachment = -1;
      state.historyIndex = -1;
      clearDraft(state);
    },

    /**
     * Check if there are any image attachments in the current value
     */
    hasAttachments: (): boolean => {
      return hasImagePlaceholder(state.value);
    },

    /**
     * Show an error notification.
     */
    setInputError: (error: string | null) => {
      state.inputError = error;
      if (error) {
        getFeedbackQueue(state).clear();
      }
    },

    /**
     * Queue a feedback notification near the input. Items display sequentially and auto-dismiss.
     */
    setInputFeedback: (text: string | null, type: "success" | "info" | "error" = "info") => {
      const queue = getFeedbackQueue(state);
      if (text) {
        queue.enqueue({ message: text, level: type });
      } else {
        queue.clear();
      }
    },

    /**
     * Reset to initial state
     */
    reset: () => {
      getFeedbackQueue(state).clear();
      clearDraft(state);
      state.value = "";
      state.history = [];
      state.historyIndex = -1;
      state.focused = true;
      state.cursorPosition = 0;
      state.selectAll = false;
      state.loading = false;
      state.selectedAttachment = -1;
      resetInputPlaceholders(state);
      state.inputError = null;
      state.inputFeedback = null;
    },
  }),

  withDeepSelector: false,

  withStableSelector: true,

  // withNamespace: "useUserInput",
});

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Get input actions (non-reactive)
 */
export const getInputActions = () => useUserInput.getActions();
