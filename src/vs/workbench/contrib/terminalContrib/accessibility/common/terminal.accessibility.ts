/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum TerminalAccessibilityCommandId {
	FocusAccessibleBuffer = 'workbench.action.terminal.focusAccessibleBuffer',
	AccessibleBufferGoToNextCommand = 'workbench.action.terminal.accessibleBufferGoToNextCommand',
	AccessibleBufferGoToPreviousCommand = 'workbench.action.terminal.accessibleBufferGoToPreviousCommand',
	ScrollToBottomAccessibleView = 'workbench.action.terminal.scrollToBottomAccessibleView',
	ScrollToTopAccessibleView = 'workbench.action.terminal.scrollToTopAccessibleView',
}

export const defaultTerminalAccessibilityCommandsToSkipShell = [
	TerminalAccessibilityCommandId.FocusAccessibleBuffer
];
