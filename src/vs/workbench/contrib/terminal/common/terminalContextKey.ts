/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum TerminalContextKey {
	IsOpen = 'terminalIsOpen',
	Count = 'terminalCount',
	GroupCount = 'terminalGroupCount',
	TabsNarrow = 'isTerminalTabsNarrow',
	ProcessSupported = 'terminalProcessSupported',
	Focus = 'terminalFocus',
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
