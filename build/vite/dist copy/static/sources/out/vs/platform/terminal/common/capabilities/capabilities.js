/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Primarily driven by the shell integration feature, a terminal capability is the mechanism for
 * progressively enhancing various features that may not be supported in all terminals/shells.
 */
export var TerminalCapability;
(function (TerminalCapability) {
    /**
     * The terminal can reliably detect the current working directory as soon as the change happens
     * within the buffer.
     */
    TerminalCapability[TerminalCapability["CwdDetection"] = 0] = "CwdDetection";
    /**
     * The terminal can reliably detect the current working directory when requested.
     */
    TerminalCapability[TerminalCapability["NaiveCwdDetection"] = 1] = "NaiveCwdDetection";
    /**
     * The terminal can reliably identify prompts, commands and command outputs within the buffer.
     */
    TerminalCapability[TerminalCapability["CommandDetection"] = 2] = "CommandDetection";
    /**
     * The terminal can often identify prompts, commands and command outputs within the buffer. It
     * may not be so good at remembering the position of commands that ran in the past. This state
     * may be enabled when something goes wrong or when using conpty for example.
     */
    TerminalCapability[TerminalCapability["PartialCommandDetection"] = 3] = "PartialCommandDetection";
    /**
     * Manages buffer marks that can be used for terminal navigation. The source of
     * the request (task, debug, etc) provides an ID, optional marker, hoverMessage, and hidden property. When
     * hidden is not provided, a generic decoration is added to the buffer and overview ruler.
     */
    TerminalCapability[TerminalCapability["BufferMarkDetection"] = 4] = "BufferMarkDetection";
    /**
     * The terminal can detect the latest environment of user's current shell.
     */
    TerminalCapability[TerminalCapability["ShellEnvDetection"] = 5] = "ShellEnvDetection";
    /**
     * The terminal can detect the prompt type being used (e.g., p10k, posh-git).
     */
    TerminalCapability[TerminalCapability["PromptTypeDetection"] = 6] = "PromptTypeDetection";
})(TerminalCapability || (TerminalCapability = {}));
export var CommandInvalidationReason;
(function (CommandInvalidationReason) {
    CommandInvalidationReason["Windows"] = "windows";
    CommandInvalidationReason["NoProblemsReported"] = "noProblemsReported";
})(CommandInvalidationReason || (CommandInvalidationReason = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FwYWJpbGl0aWVzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFTaEc7OztHQUdHO0FBQ0gsTUFBTSxDQUFOLElBQWtCLGtCQXFDakI7QUFyQ0QsV0FBa0Isa0JBQWtCO0lBQ25DOzs7T0FHRztJQUNILDJFQUFZLENBQUE7SUFDWjs7T0FFRztJQUNILHFGQUFpQixDQUFBO0lBQ2pCOztPQUVHO0lBQ0gsbUZBQWdCLENBQUE7SUFDaEI7Ozs7T0FJRztJQUNILGlHQUF1QixDQUFBO0lBRXZCOzs7O09BSUc7SUFDSCx5RkFBbUIsQ0FBQTtJQUVuQjs7T0FFRztJQUNILHFGQUFpQixDQUFBO0lBRWpCOztPQUVHO0lBQ0gseUZBQW1CLENBQUE7QUFDcEIsQ0FBQyxFQXJDaUIsa0JBQWtCLEtBQWxCLGtCQUFrQixRQXFDbkM7QUF3SUQsTUFBTSxDQUFOLElBQWtCLHlCQUdqQjtBQUhELFdBQWtCLHlCQUF5QjtJQUMxQyxnREFBbUIsQ0FBQTtJQUNuQixzRUFBeUMsQ0FBQTtBQUMxQyxDQUFDLEVBSGlCLHlCQUF5QixLQUF6Qix5QkFBeUIsUUFHMUMifQ==