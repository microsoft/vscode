/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../nls.js';

export namespace AccessibilityHelpNLS {
	export const accessibilityHelpTitle = nls.localize('accessibilityHelpTitle', "Accessibility Help");
	export const openingDocs = nls.localize("openingDocs", "Opening the Accessibility documentation page.");
	export const readonlyDiffEditor = nls.localize("readonlyDiffEditor", "You are in a read-only pane of a diff editor.");
	export const editableDiffEditor = nls.localize("editableDiffEditor", "You are in a pane of a diff editor.");
	export const readonlyEditor = nls.localize("readonlyEditor", "You are in a read-only code editor.");
	export const editableEditor = nls.localize("editableEditor", "You are in a code editor.");
	export const defaultWindowTitleIncludesEditorState = nls.localize("defaultWindowTitleIncludesEditorState", "activeEditorState - such as modified, problems, and more, is included as a part of the window.title setting by default. Disable it with accessibility.windowTitleOptimized.");
	export const defaultWindowTitleExcludingEditorState = nls.localize("defaultWindowTitleExcludingEditorState", "activeEditorState - such as modified, problems, and more, is currently not included as a part of the window.title setting by default. Enable it with accessibility.windowTitleOptimized.");
	export const toolbar = nls.localize("toolbar", "Around the workbench, when the screen reader announces you've landed in a toolbar, use narrow keys to navigate between the toolbar's actions.");
	export const changeConfigToOnMac = nls.localize("changeConfigToOnMac", "Configure the application to be optimized for usage with a Screen Reader (Command+E).");
	export const changeConfigToOnWinLinux = nls.localize("changeConfigToOnWinLinux", "Configure the application to be optimized for usage with a Screen Reader (Control+E).");
	export const auto_on = nls.localize("auto_on", "The application is configured to be optimized for usage with a Screen Reader.");
	export const auto_off = nls.localize("auto_off", "The application is configured to never be optimized for usage with a Screen Reader.");
	export const screenReaderModeEnabled = nls.localize("screenReaderModeEnabled", "Screen Reader Optimized Mode enabled.");
	export const screenReaderModeDisabled = nls.localize("screenReaderModeDisabled", "Screen Reader Optimized Mode disabled.");
	export const tabFocusModeOnMsg = nls.localize("tabFocusModeOnMsg", "Pressing Tab in the current editor will move focus to the next focusable element. Toggle this behavior{0}.", '<keybinding:editor.action.toggleTabFocusMode>');
	export const tabFocusModeOffMsg = nls.localize("tabFocusModeOffMsg", "Pressing Tab in the current editor will insert the tab character. Toggle this behavior{0}.", '<keybinding:editor.action.toggleTabFocusMode>');
	export const stickScroll = nls.localize("stickScrollKb", "Focus Sticky Scroll{0} to focus the currently nested scopes.", '<keybinding:editor.action.focusStickyDebugConsole>');
	export const suggestActions = nls.localize("suggestActionsKb", "Trigger the suggest widget{0} to show possible inline suggestions.", '<keybinding:editor.action.triggerSuggest>');
	export const acceptSuggestAction = nls.localize("acceptSuggestAction", "Accept suggestion{0} to accept the currently selected suggestion.", '<keybinding:acceptSelectedSuggestion>');
	export const toggleSuggestionFocus = nls.localize("toggleSuggestionFocus", "Toggle focus between the suggest widget and the editor{0} and toggle details focus with{1} to learn more about the suggestion.", '<keybinding:focusSuggestion>', '<keybinding:toggleSuggestionFocus>');
	export const codeFolding = nls.localize("codeFolding", "Use code folding to collapse blocks of code and focus on the code you're interested in via the Toggle Folding Command{0}.", '<keybinding:editor.toggleFold>');
	export const intellisense = nls.localize("intellisense", "Use Intellisense to improve coding efficiency and reduce errors. Trigger suggestions{0}.", '<keybinding:editor.action.triggerSuggest>');
	export const showOrFocusHover = nls.localize("showOrFocusHover", "Show or focus the hover{0} to read information about the current symbol.", '<keybinding:editor.action.showHover>');
	export const goToSymbol = nls.localize("goToSymbol", "Go to Symbol{0} to quickly navigate between symbols in the current file.", '<keybinding:workbench.action.gotoSymbol>');
	export const showAccessibilityHelpAction = nls.localize("showAccessibilityHelpAction", "Show Accessibility Help");
	export const listSignalSounds = nls.localize("listSignalSoundsCommand", "Run the command: List Signal Sounds for an overview of all sounds and their current status.");
	export const listAlerts = nls.localize("listAnnouncementsCommand", "Run the command: List Signal Announcements for an overview of announcements and their current status.");
	export const quickChat = nls.localize("quickChatCommand", "Toggle quick chat{0} to open or close a chat session.", '<keybinding:workbench.action.quickchat.toggle>');
	export const startInlineChat = nls.localize("startInlineChatCommand", "Start inline chat{0} to create an in editor chat session.", '<keybinding:inlineChat.start>');
	export const startDebugging = nls.localize('debug.startDebugging', "The Debug: Start Debugging command{0} will start a debug session.", '<keybinding:workbench.action.debug.start>');
	export const setBreakpoint = nls.localize('debugConsole.setBreakpoint', "The Debug: Inline Breakpoint command{0} will set or unset a breakpoint at the current cursor position in the active editor.", '<keybinding:editor.debug.action.toggleInlineBreakpoint>');
	export const addToWatch = nls.localize('debugConsole.addToWatch', "The Debug: Add to Watch command{0} will add the selected text to the watch view.", '<keybinding:editor.debug.action.selectionToWatch>');
	export const debugExecuteSelection = nls.localize('debugConsole.executeSelection', "The Debug: Execute Selection command{0} will execute the selected text in the debug console.", '<keybinding:editor.debug.action.selectionToRepl>');
	export const chatEditorModification = nls.localize('chatEditorModification', "The editor contains pending modifications that have been made by chat.");
	export const chatEditorRequestInProgress = nls.localize('chatEditorRequestInProgress', "The editor is currently waiting for modifications to be made by chat.");
	export const chatEditActions = nls.localize('chatEditing.navigation', 'Navigate between edits in the editor with navigate previous{0} and next{1} and accept{2}, reject{3} or view the diff{4} for the current change. Accept edits across all files{5}.', '<keybinding:chatEditor.action.navigatePrevious>', '<keybinding:chatEditor.action.navigateNext>', '<keybinding:chatEditor.action.acceptHunk>', '<keybinding:chatEditor.action.undoHunk>', '<keybinding:chatEditor.action.toggleDiff>', '<keybinding:chatEditor.action.acceptAllEdits>');
}

export namespace InspectTokensNLS {
	export const inspectTokensAction = nls.localize('inspectTokens', "Developer: Inspect Tokens");
}

export namespace GoToLineNLS {
	export const gotoLineActionLabel = nls.localize('gotoLineActionLabel', "Go to Line/Column...");
}

export namespace QuickHelpNLS {
	export const helpQuickAccessActionLabel = nls.localize('helpQuickAccess', "Show all Quick Access Providers");
}

export namespace QuickCommandNLS {
	export const quickCommandActionLabel = nls.localize('quickCommandActionLabel', "Command Palette");
	export const quickCommandHelp = nls.localize('quickCommandActionHelp', "Show And Run Commands");
}

export namespace QuickOutlineNLS {
	export const quickOutlineActionLabel = nls.localize('quickOutlineActionLabel', "Go to Symbol...");
	export const quickOutlineByCategoryActionLabel = nls.localize('quickOutlineByCategoryActionLabel', "Go to Symbol by Category...");
}

export namespace StandaloneCodeEditorNLS {
	export const editorViewAccessibleLabel = nls.localize('editorViewAccessibleLabel', "Editor content");
}

export namespace ToggleHighContrastNLS {
	export const toggleHighContrast = nls.localize('toggleHighContrast', "Toggle High Contrast Theme");
}

export namespace StandaloneServicesNLS {
	export const bulkEditServiceSummary = nls.localize('bulkEditServiceSummary', "Made {0} edits in {1} files");
}
