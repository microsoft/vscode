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
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TerminalFindCommandId } from '../common/terminal.find.js';

export class TerminalFindAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 105;
	readonly name = 'terminal-find';
	readonly type = AccessibleViewType.Help;
	readonly when = TerminalContextKeys.findFocus;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const commandService = accessor.get(ICommandService);
		return new TerminalFindAccessibilityHelpProvider(commandService);
	}
}

class TerminalFindAccessibilityHelpProvider extends Disposable implements IAccessibleViewContentProvider {
	readonly id = AccessibleViewProviderId.TerminalFindHelp;
	readonly verbositySettingKey = AccessibilityVerbositySettingId.Find;
	readonly options: IAccessibleViewOptions = { type: AccessibleViewType.Help };

	constructor(
		private readonly _commandService: ICommandService
	) {
		super();
	}

	onClose(): void {
		// The Escape key that closes the accessible help will also propagate
		// and close the terminal find widget. Re-open the find widget after
		// the Escape event has fully propagated through all handlers.
		setTimeout(() => {
			this._commandService.executeCommand(TerminalFindCommandId.FindFocus);
		}, 200);
	}

	provideContent(): string {
		const content: string[] = [];

		// Header
		content.push(localize('terminal.header', "Accessibility Help: Terminal Find"));
		content.push(localize('terminal.context', "You are in the Terminal Find input. This searches the entire terminal buffer: both the current output and the scrollback history."));
		content.push('');

		// Current Search Status
		content.push(localize('terminal.statusHeader', "Current Search Status:"));
		content.push(localize('terminal.statusDesc', "You are searching the terminal buffer."));
		content.push('');

		// Inside the Terminal Find Input
		content.push(localize('terminal.inputHeader', "Inside the Terminal Find Input (What It Does):"));
		content.push(localize('terminal.inputDesc', "While you are in the Terminal Find input, your focus stays in the field. You can type, edit your search term, or navigate matches without leaving the input. When you navigate to a match, the terminal scrolls to show it, but your focus remains in the Find input."));
		content.push('');

		// What You Hear
		content.push(localize('terminal.hearHeader', "What You Hear Each Time You Move to a Match:"));
		content.push(localize('terminal.hearDesc', "Each navigation step gives you a complete spoken update:"));
		content.push(localize('terminal.hear1', "1) The full line that contains the match is read first, so you get immediate context."));
		content.push(localize('terminal.hear2', "2) Your position among the matches is announced, so you know how far you are through the results."));
		content.push(localize('terminal.hear3', "3) The exact line and column are announced, so you know precisely where the match is in the buffer."));
		content.push('');

		// Focus Behavior
		content.push(localize('terminal.focusHeader', "Focus Behavior (Important):"));
		content.push(localize('terminal.focusDesc1', "When you navigate from the Terminal Find input, the terminal buffer updates in the background while your focus stays in the input. This is intentional, so you can keep refining your search without losing your place."));
		content.push(localize('terminal.focusDesc2', "The terminal automatically scrolls to show the match you navigate to."));
		content.push(localize('terminal.focusDesc3', "If you want to close Find and return focus to the terminal command line, press Escape. Focus moves to the command input at the bottom of the terminal."));
		content.push('');

		// Keyboard Navigation Summary
		content.push(localize('terminal.keyboardHeader', "Keyboard Navigation Summary:"));
		content.push('');
		content.push(localize('terminal.keyNavHeader', "While focused IN the Find input:"));
		content.push(localize('terminal.keyEnter', "- Enter: Move to the next match while staying in the Find input."));
		content.push(localize('terminal.keyShiftEnter', "- Shift+Enter: Move to the previous match while staying in the Find input."));
		content.push('');
		content.push(localize('terminal.keyNavNote', "Note: Terminal Find keeps focus in the Find input. If you need to return to the terminal command line, press Escape to close Find."));
		content.push('');

		// Find Options
		content.push(localize('terminal.optionsHeader', "Find Options:"));
		content.push(localize('terminal.optionCase', "- Match Case: Only exact case matches are included."));
		content.push(localize('terminal.optionWord', "- Whole Word: Only full words are matched."));
		content.push(localize('terminal.optionRegex', "- Regular Expression: Use pattern matching for advanced searches."));
		content.push('');

		// Settings
		content.push(localize('terminal.settingsHeader', "Settings You Can Adjust ({0} opens Settings):", '<keybinding:workbench.action.openSettings>'));
		content.push(localize('terminal.settingsDesc', "Terminal Find has limited configuration options. Most behavior is controlled by the terminal itself."));
		content.push(localize('terminal.settingVerbosity', "- `accessibility.verbosity.find`: Controls whether the Terminal Find input announces the Accessibility Help hint."));
		content.push('');

		// Closing
		content.push(localize('terminal.closingHeader', "Closing:"));
		content.push(localize('terminal.closingDesc', "Press Escape to close Terminal Find. Focus moves to the terminal command line, and your search history is available on next Find."));

		return content.join('\n');
	}
}
