/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const enum TerminalContextKeyStrings {
	IsOpen = 'terminalIsOpen',
	Count = 'terminalCount',
	GroupCount = 'terminalGroupCount',
	TabsNarrow = 'isTerminalTabsNarrow',
	ProcessSupported = 'terminalProcessSupported',
	Focus = 'terminalFocus',
	EditorFocus = 'terminalEditorFocus',
	TabsFocus = 'terminalTabsFocus',
	TabsMouse = 'terminalTabsMouse',
	AltBufferActive = 'terminalAltBufferActive',
	A11yTreeFocus = 'terminalA11yTreeFocus',
	TextSelected = 'terminalTextSelected',
	FindVisible = 'terminalFindVisible',
	FindInputFocused = 'terminalFindInputFocused',
	FindFocused = 'terminalFindFocused',
	TabsSingularSelection = 'terminalTabsSingularSelection',
	SplitTerminal = 'terminalSplitTerminal'
}

export namespace TerminalContextKeys {
	/** A context key that is set when there is at least one opened integrated terminal. */
	export const KEYBINDING_CONTEXT_TERMINAL_IS_OPEN = new RawContextKey<boolean>(TerminalContextKeyStrings.IsOpen, false, true);

	/** A context key that is set when the integrated terminal has focus. */
	export const KEYBINDING_CONTEXT_TERMINAL_FOCUS = new RawContextKey<boolean>(TerminalContextKeyStrings.Focus, false, localize('terminalFocusContextKey', "Whether the terminal is focused"));

	/** A context key that is set when a terminal editor has focus. */
	export const KEYBINDING_CONTEXT_TERMINAL_EDITOR_FOCUS = new RawContextKey<boolean>(TerminalContextKeyStrings.EditorFocus, false, localize('terminalEditorFocusContextKey', "Whether a terminal in the editor area is focused"));

	/** A context key that is set to the current number of integrated terminals in the terminal groups. */
	export const KEYBINDING_CONTEXT_GROUP_TERMINAL_COUNT = new RawContextKey<number>(TerminalContextKeyStrings.Count, 0, localize('terminalCountContextKey', "The current number of terminals"));

	/** A context key that is set to the current number of integrated terminals. */
	export const KEYBINDING_CONTEXT_TERMINAL_GROUP_COUNT = new RawContextKey<number>(TerminalContextKeyStrings.GroupCount, 0, localize('terminalGroupCountContextKey', "The current number of terminal groups"));

	/** A context key that is set when the terminal tabs view is narrow. */
	export const KEYBINDING_CONTEXT_TERMINAL_IS_TABS_NARROW_FOCUS = new RawContextKey<boolean>(TerminalContextKeyStrings.TabsNarrow, false, true);

	/** A context key that is set when the integrated terminal tabs widget has focus. */
	export const KEYBINDING_CONTEXT_TERMINAL_TABS_FOCUS = new RawContextKey<boolean>(TerminalContextKeyStrings.TabsFocus, false, localize('terminalTabsFocusContextKey', "Whether the terminal tabs widget is focused"));

	/** A context key that is set when the integrated terminal tabs widget has the mouse focus. */
	export const KEYBINDING_CONTEXT_TERMINAL_TABS_MOUSE = new RawContextKey<boolean>(TerminalContextKeyStrings.TabsMouse, false, undefined);

	export const KEYBINDING_CONTEXT_TERMINAL_SHELL_TYPE_KEY = 'terminalShellType';
	/** A context key that is set to the detected shell for the most recently active terminal, this is set to the last known value when no terminals exist. */
	export const KEYBINDING_CONTEXT_TERMINAL_SHELL_TYPE = new RawContextKey<string>(KEYBINDING_CONTEXT_TERMINAL_SHELL_TYPE_KEY, undefined, { type: 'string', description: localize('terminalShellTypeContextKey', "The shell type of the active terminal") });

	export const KEYBINDING_CONTEXT_TERMINAL_ALT_BUFFER_ACTIVE = new RawContextKey<boolean>(TerminalContextKeyStrings.AltBufferActive, false, true);

	/** A context key that is set when the integrated terminal does not have focus. */
	export const KEYBINDING_CONTEXT_TERMINAL_NOT_FOCUSED = KEYBINDING_CONTEXT_TERMINAL_FOCUS.toNegated();

	/** A context key that is set when the user is navigating the accessibility tree */
	export const KEYBINDING_CONTEXT_TERMINAL_A11Y_TREE_FOCUS = new RawContextKey<boolean>(TerminalContextKeyStrings.A11yTreeFocus, false, true);

	/** A keybinding context key that is set when the integrated terminal has text selected. */
	export const KEYBINDING_CONTEXT_TERMINAL_TEXT_SELECTED = new RawContextKey<boolean>(TerminalContextKeyStrings.TextSelected, false, localize('terminalTextSelectedContextKey', "Whether text is selected in the active terminal"));
	/** A keybinding context key that is set when the integrated terminal does not have text selected. */
	export const KEYBINDING_CONTEXT_TERMINAL_TEXT_NOT_SELECTED = KEYBINDING_CONTEXT_TERMINAL_TEXT_SELECTED.toNegated();

	/**  A context key that is set when the find widget in integrated terminal is visible. */
	export const KEYBINDING_CONTEXT_TERMINAL_FIND_VISIBLE = new RawContextKey<boolean>(TerminalContextKeyStrings.FindVisible, false, true);
	/**  A context key that is set when the find widget in integrated terminal is not visible. */
	export const KEYBINDING_CONTEXT_TERMINAL_FIND_NOT_VISIBLE = KEYBINDING_CONTEXT_TERMINAL_FIND_VISIBLE.toNegated();
	/**  A context key that is set when the find widget find input in integrated terminal is focused. */
	export const KEYBINDING_CONTEXT_TERMINAL_FIND_INPUT_FOCUSED = new RawContextKey<boolean>(TerminalContextKeyStrings.FindInputFocused, false, true);
	/**  A context key that is set when the find widget in integrated terminal is focused. */
	export const KEYBINDING_CONTEXT_TERMINAL_FIND_FOCUSED = new RawContextKey<boolean>(TerminalContextKeyStrings.FindFocused, false, true);
	/**  A context key that is set when the find widget find input in integrated terminal is not focused. */
	export const KEYBINDING_CONTEXT_TERMINAL_FIND_INPUT_NOT_FOCUSED = KEYBINDING_CONTEXT_TERMINAL_FIND_INPUT_FOCUSED.toNegated();

	export const KEYBINDING_CONTEXT_TERMINAL_PROCESS_SUPPORTED = new RawContextKey<boolean>(TerminalContextKeyStrings.ProcessSupported, false, localize('terminalProcessSupportedContextKey', "Whether terminal processes can be launched"));

	export const KEYBINDING_CONTEXT_TERMINAL_TABS_SINGULAR_SELECTION = new RawContextKey<boolean>(TerminalContextKeyStrings.TabsSingularSelection, false, localize('terminalTabsSingularSelectedContextKey', "Whether one terminal tab is selected"));

	export const IS_SPLIT_TERMINAL_CONTEXT_KEY = new RawContextKey<boolean>(TerminalContextKeyStrings.SplitTerminal, false, localize('isSplitTerminalContextKey', "Whether or not the focused tab's terminal is a split terminal"));
}
