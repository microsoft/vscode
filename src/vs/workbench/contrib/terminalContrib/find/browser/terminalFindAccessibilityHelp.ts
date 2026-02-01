/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { AccessibleViewProviderId, AccessibleViewType, AccessibleContentProvider, IAccessibleViewContentProvider, IAccessibleViewOptions } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';

export class TerminalFindAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 105;
	readonly name = 'terminal-find';
	readonly type = AccessibleViewType.Help;
	readonly when = TerminalContextKeys.findFocus;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const terminalService = accessor.get(ITerminalService);
		return new TerminalFindAccessibilityHelpProvider(terminalService);
	}
}

class TerminalFindAccessibilityHelpProvider extends Disposable implements IAccessibleViewContentProvider {
	readonly id = AccessibleViewProviderId.TerminalFindHelp;
	readonly verbositySettingKey = AccessibilityVerbositySettingId.Find;
	readonly options: IAccessibleViewOptions = { type: AccessibleViewType.Help };

	constructor(
		private readonly _terminalService: ITerminalService
	) {
		super();
	}

	onClose(): void {
		this._terminalService.activeInstance?.focus();
	}

	provideContent(): string {
		const content: string[] = [];

		// Header
		content.push(localize('msg.terminalFindHeader', "Accessibility Help: Terminal Find"));
		content.push(localize('msg.terminalFindContext', "You are in the Terminal Find input. This searches everything visible in the terminal: current output and scrollback history."));
		content.push('');
		content.push(localize('msg.terminalBuffer', "What Terminal Find Searches:"));
		content.push(localize('msg.terminalBufferDetail', "Terminal Find searches through the entire terminal buffer, not just what\\'s visible on screen. This includes scrollback history. As you type, VS Code announces match count like \\\"2 of 8 matches\\\"."));

		content.push('');
		content.push(localize('msg.terminalNavHeader', "Keyboard Navigation:"));
		content.push(localize('msg.terminalTyping', "As you type search text, matches are found in real time. Your screen reader announces the match count."));
		content.push('');
		content.push(localize('msg.terminalNavEnter', "- Press Enter while in the Find input to jump to the next match. The match is highlighted in yellow in the terminal."));
		content.push(localize('msg.terminalNavShiftEnter', "- Press Shift+Enter to jump to the previous match."));
		content.push(localize('msg.terminalNavEscape', "- Press Escape to close the find widget and return focus to the terminal.\\'s command line."));

		content.push('');
		content.push(localize('msg.terminalFocusBehavior', "Focus Behavior:"));
		content.push(localize('msg.terminalFocusDetail', "When you press Enter to navigate to a match, the terminal automatically scrolls to show that match. Your screen reader announces the line containing the match. If you want to keep adjusting the search without leaving the Find input, use Shift+Enter to navigate backward instead."));

		content.push('');
		content.push(localize('msg.terminalOptionsHeader', "Search Options:"));
		content.push(localize('msg.terminalOptionCase', "-{0}Match Case - Only find exact case matches.", '<keybinding:workbench.action.terminal.toggleFindCaseSensitive>'));
		content.push(localize('msg.terminalOptionWord', "-{0}Whole Word - Only find complete words, not partial matches.", '<keybinding:workbench.action.terminal.toggleFindWholeWord>'));
		content.push(localize('msg.terminalOptionRegex', "-{0}Regular Expression - Use regex patterns like \\\"error|warning\\\" to find multiple patterns.", '<keybinding:workbench.action.terminal.toggleFindRegex>'));

		return content.join('\n');
	}
}
