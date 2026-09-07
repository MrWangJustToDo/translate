// Import command files to trigger registration
import "./auto.js";
import "./clear.js";
import "./compact.js";
import "./display.js";
import "./effort.js";
import "./help.js";
import "./models.js";
import "./plan.js";
import "./quit.js";
import "./rename.js";
import "./resume.js";
import "./shortcuts.js";
import "./theme.js";
import "./usage.js";

export {
  clearExtensionCommands,
  dispatchCommand,
  getAllCommands,
  getCommand,
  registerExtensionCommand,
} from "./utils/registry.js";
export { splitExtensionCommandArgs, syncExtensionCommands } from "./utils/sync-extension-commands.js";
export { COMMAND_FREEFORM_VALUE, typedArgsAfterCommand, withFreeformOption } from "./utils/command-options.js";

export type { Command, CommandContext, CommandOption, CommandResult } from "./utils/types.js";
