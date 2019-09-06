/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';

export namespace AccessibilityHelpNLS {
	export const noSelection = nls.localize("noSelection", "No selection");
	export const singleSelectionRange = nls.localize("singleSelectionRange", "Line {0}, Column {1} ({2} selected)");
	export const singleSelection = nls.localize("singleSelection", "Line {0}, Column {1}");
	export const multiSelectionRange = nls.localize("multiSelectionRange", "{0} selections ({1} characters selected)");
	export const multiSelection = nls.localize("multiSelection", "{0} selections");
	export const emergencyConfOn = nls.localize("emergencyConfOn", "Now changing the setting `accessibilitySupport` to 'on'.");
	export const openingDocs = nls.localize("openingDocs", "Now opening the Editor Accessibility documentation page.");
	export const readonlyDiffEditor = nls.localize("readonlyDiffEditor", " in a read-only pane of a diff editor.");
	export const editableDiffEditor = nls.localize("editableDiffEditor", " in a pane of a diff editor.");
	export const readonlyEditor = nls.localize("readonlyEditor", " in a read-only code editor");
	export const editableEditor = nls.localize("editableEditor", " in a code editor");
	export const changeConfigToOnMac = nls.localize("changeConfigToOnMac", "To configure the editor to be optimized for usage with a Screen Reader press Command+E now.");
	export const changeConfigToOnWinLinux = nls.localize("changeConfigToOnWinLinux", "To configure the editor to be optimized for usage with a Screen Reader press Control+E now.");
	export const auto_on = nls.localize("auto_on", "The editor is configured to be optimized for usage with a Screen Reader.");
	export const auto_off = nls.localize("auto_off", "The editor is configured to never be optimized for usage with a Screen Reader, which is not the case at this time.");
	export const tabFocusModeOnMsg = nls.localize("tabFocusModeOnMsg", "Pressing Tab in the current editor will move focus to the next focusable element. Toggle this behavior by pressing {0}.");
	export const tabFocusModeOnMsgNoKb = nls.localize("tabFocusModeOnMsgNoKb", "Pressing Tab in the current editor will move focus to the next focusable element. The command {0} is currently not triggerable by a keybinding.");
	export const tabFocusModeOffMsg = nls.localize("tabFocusModeOffMsg", "Pressing Tab in the current editor will insert the tab character. Toggle this behavior by pressing {0}.");
	export const tabFocusModeOffMsgNoKb = nls.localize("tabFocusModeOffMsgNoKb", "Pressing Tab in the current editor will insert the tab character. The command {0} is currently not triggerable by a keybinding.");
	export const openDocMac = nls.localize("openDocMac", "Press Command+H now to open a browser window with more information related to editor accessibility.");
	export const openDocWinLinux = nls.localize("openDocWinLinux", "Press Control+H now to open a browser window with more information related to editor accessibility.");
	export const outroMsg = nls.localize("outroMsg", "You can dismiss this tooltip and return to the editor by pressing Escape or Shift+Escape.");
	export const showAccessibilityHelpAction = nls.localize("showAccessibilityHelpAction", "Show Accessibility Help");
}

export namespace InspectTokensNLS {
	export const inspectTokensAction = nls.localize('inspectTokens', "Developer: Inspect Tokens");
}

export namespace GoToLineNLS {
	export const gotoLineLabelValidLineAndColumn = nls.localize('gotoLineLabelValidLineAndColumn', "Go to line {0} and character {1}");
	export const gotoLineLabelValidLine = nls.localize('gotoLineLabelValidLine', "Go to line {0}");
	export const gotoLineLabelEmptyWithLineLimit = nls.localize('gotoLineLabelEmptyWithLineLimit', "Type a line number between 1 and {0} to navigate to");
	export const gotoLineLabelEmptyWithLineAndColumnLimit = nls.localize('gotoLineLabelEmptyWithLineAndColumnLimit', "Type a character between 1 and {0} to navigate to");
	export const gotoLineAriaLabel = nls.localize('gotoLineAriaLabel', "Current Line: {0}. Go to line {1}.");
	export const gotoLineActionInput = nls.localize('gotoLineActionInput', "Type a line number, followed by an optional colon and a character number to navigate to");
	export const gotoLineActionLabel = nls.localize('gotoLineActionLabel', "Go to Line...");
}

export namespace QuickCommandNLS {
	export const ariaLabelEntryWithKey = nls.localize('ariaLabelEntryWithKey', "{0}, {1}, commands");
	export const ariaLabelEntry = nls.localize('ariaLabelEntry', "{0}, commands");
	export const quickCommandActionInput = nls.localize('quickCommandActionInput', "Type the name of an action you want to execute");
	export const quickCommandActionLabel = nls.localize('quickCommandActionLabel', "Command Palette");
}

export namespace QuickOutlineNLS {
	export const entryAriaLabel = nls.localize('entryAriaLabel', "{0}, symbols");
	export const quickOutlineActionInput = nls.localize('quickOutlineActionInput', "Type the name of an identifier you wish to navigate to");
	export const quickOutlineActionLabel = nls.localize('quickOutlineActionLabel', "Go to Symbol...");
	export const _symbols_ = nls.localize('symbols', "symbols ({0})");
	export const _modules_ = nls.localize('modules', "modules ({0})");
	export const _class_ = nls.localize('class', "classes ({0})");
	export const _interface_ = nls.localize('interface', "interfaces ({0})");
	export const _method_ = nls.localize('method', "methods ({0})");
	export const _function_ = nls.localize('function', "functions ({0})");
	export const _property_ = nls.localize('property', "properties ({0})");
	export const _variable_ = nls.localize('variable', "variables ({0})");
	export const _variable2_ = nls.localize('variable2', "variables ({0})");
	export const _constructor_ = nls.localize('_constructor', "constructors ({0})");
	export const _call_ = nls.localize('call', "calls ({0})");
}

export namespace StandaloneCodeEditorNLS {
	export const editorViewAccessibleLabel = nls.localize('editorViewAccessibleLabel', "Editor content");
	export const accessibilityHelpMessageIE = nls.localize('accessibilityHelpMessageIE', "Press Ctrl+F1 for Accessibility Options.");
	export const accessibilityHelpMessage = nls.localize('accessibilityHelpMessage', "Press Alt+F1 for Accessibility Options.");
}

export namespace ToggleHighContrastNLS {
	export const toggleHighContrast = nls.localize('toggleHighContrast', "Toggle High Contrast Theme");
}

export namespace SimpleServicesNLS {
	export const bulkEditServiceSummary = nls.localize('bulkEditServiceSummary', "Made {0} edits in {1} files");
}
