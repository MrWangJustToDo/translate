// Import command files to trigger registration
import "./clear.js";
import "./compact.js";
import "./appearance.js";
import "./effort.js";
import "./help.js";
import "./mode.js";
import "./models.js";
import "./quit.js";
import "./rename.js";
import "./resume.js";
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
