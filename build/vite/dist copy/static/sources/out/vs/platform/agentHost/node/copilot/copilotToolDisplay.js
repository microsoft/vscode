/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../nls.js';
// =============================================================================
// Copilot CLI built-in tool interfaces
//
// The Copilot CLI (via @github/copilot) exposes these built-in tools. Tool names
// and parameter shapes are not typed in the SDK -- they come from the CLI server
// as plain strings. These interfaces are derived from observing the CLI's actual
// tool events and the ShellConfig class in @github/copilot.
//
// Shell tool names follow a pattern per ShellConfig:
//   shellToolName, readShellToolName, writeShellToolName,
//   stopShellToolName, listShellsToolName
// For bash: bash, read_bash, write_bash, bash_shutdown, list_bash
// For powershell: powershell, read_powershell, write_powershell, list_powershell
// =============================================================================
/**
 * Known Copilot CLI tool names. These are the `toolName` values that appear
 * in `tool.execution_start` events from the SDK.
 */
var CopilotToolName;
(function (CopilotToolName) {
    CopilotToolName["Bash"] = "bash";
    CopilotToolName["ReadBash"] = "read_bash";
    CopilotToolName["WriteBash"] = "write_bash";
    CopilotToolName["BashShutdown"] = "bash_shutdown";
    CopilotToolName["ListBash"] = "list_bash";
    CopilotToolName["PowerShell"] = "powershell";
    CopilotToolName["ReadPowerShell"] = "read_powershell";
    CopilotToolName["WritePowerShell"] = "write_powershell";
    CopilotToolName["ListPowerShell"] = "list_powershell";
    CopilotToolName["View"] = "view";
    CopilotToolName["Edit"] = "edit";
    CopilotToolName["Write"] = "write";
    CopilotToolName["Grep"] = "grep";
    CopilotToolName["Glob"] = "glob";
    CopilotToolName["Patch"] = "patch";
    CopilotToolName["WebSearch"] = "web_search";
    CopilotToolName["AskUser"] = "ask_user";
    CopilotToolName["ReportIntent"] = "report_intent";
})(CopilotToolName || (CopilotToolName = {}));
/** Set of tool names that perform file edits. */
const EDIT_TOOL_NAMES = new Set([
    "edit" /* CopilotToolName.Edit */,
    "write" /* CopilotToolName.Write */,
    "patch" /* CopilotToolName.Patch */,
]);
/**
 * Returns true if the tool modifies files on disk.
 */
export function isEditTool(toolName) {
    return EDIT_TOOL_NAMES.has(toolName);
}
/**
 * Extracts the target file path from an edit tool's parameters, if available.
 */
export function getEditFilePath(parameters) {
    if (typeof parameters === 'string') {
        try {
            parameters = JSON.parse(parameters);
        }
        catch {
            return undefined;
        }
    }
    const args = parameters;
    return args?.path;
}
/** Set of tool names that execute shell commands (bash or powershell). */
const SHELL_TOOL_NAMES = new Set([
    "bash" /* CopilotToolName.Bash */,
    "powershell" /* CopilotToolName.PowerShell */,
]);
/**
 * Tools that should not be shown to the user. These are internal tools
 * used by the CLI for its own purposes (e.g., reporting intent to the model).
 */
const HIDDEN_TOOL_NAMES = new Set([
    "report_intent" /* CopilotToolName.ReportIntent */,
]);
/**
 * Returns true if the tool should be hidden from the UI.
 */
export function isHiddenTool(toolName) {
    return HIDDEN_TOOL_NAMES.has(toolName);
}
// =============================================================================
// Display helpers
//
// These functions translate Copilot CLI tool names and arguments into
// human-readable display strings. This logic lives here -- in the agent-host
// process -- so the IPC protocol stays agent-agnostic; the renderer never needs
// to know about specific tool names.
// =============================================================================
function truncate(text, maxLength) {
    return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
}
export function getToolDisplayName(toolName) {
    switch (toolName) {
        case "bash" /* CopilotToolName.Bash */: return localize('toolName.bash', "Bash");
        case "powershell" /* CopilotToolName.PowerShell */: return localize('toolName.powershell', "PowerShell");
        case "read_bash" /* CopilotToolName.ReadBash */:
        case "read_powershell" /* CopilotToolName.ReadPowerShell */: return localize('toolName.readShell', "Read Shell Output");
        case "write_bash" /* CopilotToolName.WriteBash */:
        case "write_powershell" /* CopilotToolName.WritePowerShell */: return localize('toolName.writeShell', "Write Shell Input");
        case "bash_shutdown" /* CopilotToolName.BashShutdown */: return localize('toolName.bashShutdown', "Stop Shell");
        case "list_bash" /* CopilotToolName.ListBash */:
        case "list_powershell" /* CopilotToolName.ListPowerShell */: return localize('toolName.listShells', "List Shells");
        case "view" /* CopilotToolName.View */: return localize('toolName.view', "View File");
        case "edit" /* CopilotToolName.Edit */: return localize('toolName.edit', "Edit File");
        case "write" /* CopilotToolName.Write */: return localize('toolName.write', "Write File");
        case "grep" /* CopilotToolName.Grep */: return localize('toolName.grep', "Search");
        case "glob" /* CopilotToolName.Glob */: return localize('toolName.glob', "Find Files");
        case "patch" /* CopilotToolName.Patch */: return localize('toolName.patch', "Patch");
        case "web_search" /* CopilotToolName.WebSearch */: return localize('toolName.webSearch', "Web Search");
        case "ask_user" /* CopilotToolName.AskUser */: return localize('toolName.askUser', "Ask User");
        default: return toolName;
    }
}
export function getInvocationMessage(toolName, displayName, parameters) {
    if (SHELL_TOOL_NAMES.has(toolName)) {
        const args = parameters;
        if (args?.command) {
            const firstLine = args.command.split('\n')[0];
            return localize('toolInvoke.shellCmd', "Running `{0}`", truncate(firstLine, 80));
        }
        return localize('toolInvoke.shell', "Running {0} command", displayName);
    }
    switch (toolName) {
        case "view" /* CopilotToolName.View */: {
            const args = parameters;
            if (args?.path) {
                return localize('toolInvoke.viewFile', "Reading {0}", args.path);
            }
            return localize('toolInvoke.view', "Reading file");
        }
        case "edit" /* CopilotToolName.Edit */: {
            const args = parameters;
            if (args?.path) {
                return localize('toolInvoke.editFile', "Editing {0}", args.path);
            }
            return localize('toolInvoke.edit', "Editing file");
        }
        case "write" /* CopilotToolName.Write */: {
            const args = parameters;
            if (args?.path) {
                return localize('toolInvoke.writeFile', "Writing to {0}", args.path);
            }
            return localize('toolInvoke.write', "Writing file");
        }
        case "grep" /* CopilotToolName.Grep */: {
            const args = parameters;
            if (args?.pattern) {
                return localize('toolInvoke.grepPattern', "Searching for `{0}`", truncate(args.pattern, 80));
            }
            return localize('toolInvoke.grep', "Searching files");
        }
        case "glob" /* CopilotToolName.Glob */: {
            const args = parameters;
            if (args?.pattern) {
                return localize('toolInvoke.globPattern', "Finding files matching `{0}`", truncate(args.pattern, 80));
            }
            return localize('toolInvoke.glob', "Finding files");
        }
        default:
            return localize('toolInvoke.generic', "Using \"{0}\"", displayName);
    }
}
export function getPastTenseMessage(toolName, displayName, parameters, success) {
    if (!success) {
        return localize('toolComplete.failed', "\"{0}\" failed", displayName);
    }
    if (SHELL_TOOL_NAMES.has(toolName)) {
        const args = parameters;
        if (args?.command) {
            const firstLine = args.command.split('\n')[0];
            return localize('toolComplete.shellCmd', "Ran `{0}`", truncate(firstLine, 80));
        }
        return localize('toolComplete.shell', "Ran {0} command", displayName);
    }
    switch (toolName) {
        case "view" /* CopilotToolName.View */: {
            const args = parameters;
            if (args?.path) {
                return localize('toolComplete.viewFile', "Read {0}", args.path);
            }
            return localize('toolComplete.view', "Read file");
        }
        case "edit" /* CopilotToolName.Edit */: {
            const args = parameters;
            if (args?.path) {
                return localize('toolComplete.editFile', "Edited {0}", args.path);
            }
            return localize('toolComplete.edit', "Edited file");
        }
        case "write" /* CopilotToolName.Write */: {
            const args = parameters;
            if (args?.path) {
                return localize('toolComplete.writeFile', "Wrote to {0}", args.path);
            }
            return localize('toolComplete.write', "Wrote file");
        }
        case "grep" /* CopilotToolName.Grep */: {
            const args = parameters;
            if (args?.pattern) {
                return localize('toolComplete.grepPattern', "Searched for `{0}`", truncate(args.pattern, 80));
            }
            return localize('toolComplete.grep', "Searched files");
        }
        case "glob" /* CopilotToolName.Glob */: {
            const args = parameters;
            if (args?.pattern) {
                return localize('toolComplete.globPattern', "Found files matching `{0}`", truncate(args.pattern, 80));
            }
            return localize('toolComplete.glob', "Found files");
        }
        default:
            return localize('toolComplete.generic', "Used \"{0}\"", displayName);
    }
}
export function getToolInputString(toolName, parameters, rawArguments) {
    if (!parameters && !rawArguments) {
        return undefined;
    }
    if (SHELL_TOOL_NAMES.has(toolName)) {
        const args = parameters;
        return args?.command ?? rawArguments;
    }
    switch (toolName) {
        case "grep" /* CopilotToolName.Grep */: {
            const args = parameters;
            return args?.pattern ?? rawArguments;
        }
        default:
            // For other tools, show the formatted JSON arguments
            if (parameters) {
                try {
                    return JSON.stringify(parameters, null, 2);
                }
                catch {
                    return rawArguments;
                }
            }
            return rawArguments;
    }
}
/**
 * Returns a rendering hint for the given tool. Currently only 'terminal' is
 * supported, which tells the renderer to display the tool as a terminal command
 * block.
 */
export function getToolKind(toolName) {
    if (SHELL_TOOL_NAMES.has(toolName)) {
        return 'terminal';
    }
    return undefined;
}
/**
 * Returns the shell language identifier for syntax highlighting.
 * Used when creating terminal tool-specific data for the renderer.
 */
export function getShellLanguage(toolName) {
    switch (toolName) {
        case "powershell" /* CopilotToolName.PowerShell */: return 'powershell';
        default: return 'shellscript';
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29waWxvdFRvb2xEaXNwbGF5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L25vZGUvY29waWxvdC9jb3BpbG90VG9vbERpc3BsYXkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRTlDLGdGQUFnRjtBQUNoRix1Q0FBdUM7QUFDdkMsRUFBRTtBQUNGLGlGQUFpRjtBQUNqRixpRkFBaUY7QUFDakYsaUZBQWlGO0FBQ2pGLDREQUE0RDtBQUM1RCxFQUFFO0FBQ0YscURBQXFEO0FBQ3JELDBEQUEwRDtBQUMxRCwwQ0FBMEM7QUFDMUMsa0VBQWtFO0FBQ2xFLGlGQUFpRjtBQUNqRixnRkFBZ0Y7QUFFaEY7OztHQUdHO0FBQ0gsSUFBVyxlQXFCVjtBQXJCRCxXQUFXLGVBQWU7SUFDekIsZ0NBQWEsQ0FBQTtJQUNiLHlDQUFzQixDQUFBO0lBQ3RCLDJDQUF3QixDQUFBO0lBQ3hCLGlEQUE4QixDQUFBO0lBQzlCLHlDQUFzQixDQUFBO0lBRXRCLDRDQUF5QixDQUFBO0lBQ3pCLHFEQUFrQyxDQUFBO0lBQ2xDLHVEQUFvQyxDQUFBO0lBQ3BDLHFEQUFrQyxDQUFBO0lBRWxDLGdDQUFhLENBQUE7SUFDYixnQ0FBYSxDQUFBO0lBQ2Isa0NBQWUsQ0FBQTtJQUNmLGdDQUFhLENBQUE7SUFDYixnQ0FBYSxDQUFBO0lBQ2Isa0NBQWUsQ0FBQTtJQUNmLDJDQUF3QixDQUFBO0lBQ3hCLHVDQUFvQixDQUFBO0lBQ3BCLGlEQUE4QixDQUFBO0FBQy9CLENBQUMsRUFyQlUsZUFBZSxLQUFmLGVBQWUsUUFxQnpCO0FBMEJELGlEQUFpRDtBQUNqRCxNQUFNLGVBQWUsR0FBd0IsSUFBSSxHQUFHLENBQUM7Ozs7Q0FJcEQsQ0FBQyxDQUFDO0FBRUg7O0dBRUc7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