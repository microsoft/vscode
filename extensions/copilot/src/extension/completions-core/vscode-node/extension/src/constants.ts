/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Commands ending with "Client" refer to the command ID used in the legacy Copilot extension.
// - These IDs should not appear in the package.json file
// - These IDs should be registered to support all functionality (except if this command needs to be supported when both extensions are loaded/active).
// Commands ending with "Chat" refer to the command ID used in the Copilot Chat extension.
// - These IDs should be used in package.json
// - These IDs should only be registered if they appear in the package.json (meaning the command palette) or if the command needs to be supported when both extensions are loaded/active.

export const CMDOpenPanelClient = 'github.copilot.generate';
export const CMDOpenPanelChat = 'github.copilot.chat.openSuggestionsPanel'; // "github.copilot.chat.generate" is already being used

export const CMDAcceptCursorPanelSolutionClient = 'github.copilot.acceptCursorPanelSolution';
export const CMDNavigatePreviousPanelSolutionClient = 'github.copilot.previousPanelSolution';
export const CMDNavigateNextPanelSolutionClient = 'github.copilot.nextPanelSolution';

export const CMDToggleStatusMenuClient = 'github.copilot.toggleStatusMenu';
export const CMDToggleStatusMenuChat = 'github.copilot.chat.toggleStatusMenu';

// Needs to be supported in both extensions when they are loaded/active. Requires a different ID.
export const CMDSendCompletionsFeedbackChat = 'github.copilot.chat.sendCompletionFeedback';

export const CMDEnableCompletionsChat = 'github.copilot.chat.completions.enable';
export const CMDDisableCompletionsChat = 'github.copilot.chat.completions.disable';
export const CMDToggleCompletionsChat = 'github.copilot.chat.completions.toggle';
export const CMDEnableCompletionsClient = 'github.copilot.completions.enable';
export const CMDDisableCompletionsClient = 'github.copilot.completions.disable';
export const CMDToggleCompletionsClient = 'github.copilot.completions.toggle';

export const CMDOpenLogsClient = 'github.copilot.openLogs';
export const CMDOpenDocumentationClient = 'github.copilot.openDocs';

// Existing chat command reused for diagnostics
export const CMDCollectDiagnosticsChat = 'github.copilot.debug.collectDiagnostics';

// Context variable that enable/disable panel-specific commands
export const CopilotPanelVisible = 'github.copilot.panelVisible';
export const ComparisonPanelVisible = 'github.copilot.comparisonPanelVisible';
export const HasMultipleCompletionModels = 'github.copilot.completions.hasMultipleModels';

export const CMDOpenModelPickerClient = 'github.copilot.openModelPicker';
export const CMDOpenModelPickerChat = 'github.copilot.chat.openModelPicker';