/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { AccessibleViewProviderId, AccessibleViewType, IAccessibleViewContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { getReplView, Repl } from './repl.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { localize } from '../../../../nls.js';
import { CONTEXT_IN_DEBUG_REPL } from '../common/debug.js';

export class ReplAccessibilityHelp implements IAccessibleViewImplementation {
	priority = 120;
	name = 'replHelp';
	when = ContextKeyExpr.or(
		ContextKeyExpr.equals('focusedView', 'workbench.panel.repl.view'),
		CONTEXT_IN_DEBUG_REPL
	);
	type: AccessibleViewType = AccessibleViewType.Help;
	getProvider(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const replView = getReplView(viewsService);
		if (!replView) {
			return undefined;
		}
		return new ReplAccessibilityHelpProvider(replView);
	}
}

class ReplAccessibilityHelpProvider extends Disposable implements IAccessibleViewContentProvider {
	public readonly id = AccessibleViewProviderId.ReplHelp;
	public readonly verbositySettingKey = AccessibilityVerbositySettingId.Find;
	public readonly options = { type: AccessibleViewType.Help };
	constructor(private readonly _replView: Repl) {
		super();
	}

	public onClose(): void {
		this._replView.focusFilter();
	}

	public provideContent(): string {
		const content: string[] = [];

		// Header
		content.push(localize('repl.header', "Accessibility Help: Debug Console Filter"));
		content.push(localize('repl.context', "You are in the Debug Console filter input. This is a filter that instantly hides console messages that do not match your filter, showing only the messages you want to see."));
		content.push('');

		// Current Filter Status
		content.push(localize('repl.statusHeader', "Current Filter Status:"));
		content.push(localize('repl.statusDesc', "You are filtering the console output."));
		content.push('');

		// Inside the Filter Input
		content.push(localize('repl.inputHeader', "Inside the Filter Input (What It Does):"));
		content.push(localize('repl.inputDesc', "While you are in the filter input, your focus stays in the field. You can type, edit, or adjust your filter without leaving the input. As you type, the console instantly updates to show only messages matching your filter."));
		content.push('');

		// What Happens When You Filter
		content.push(localize('repl.filterHeader', "What Happens When You Filter:"));
		content.push(localize('repl.filterDesc', "Each time you change the filter text, the console instantly regenerates to show only matching messages. Your screen reader announces how many messages are now visible. This is live feedback: text searches console output, variable values, and log messages."));
		content.push('');

		// Focus Behavior
		content.push(localize('repl.focusHeader', "Focus Behavior (Important):"));
		content.push(localize('repl.focusDesc1', "Your focus stays in the filter input while the console updates in the background. This is intentional, so you can keep typing without losing your place."));
		content.push(localize('repl.focusDesc2', "If you want to review the filtered console output, press Down Arrow to move focus from the filter into the console messages above."));
		content.push(localize('repl.focusDesc3', "Important: The console input area is at the bottom of the console, separate from the filter. To evaluate expressions, navigate to the console input (after the filtered messages) and type your expression."));
		content.push('');

		// Distinguishing Filter from Console Input
		content.push(localize('repl.distinguishHeader', "Distinguishing Filter from Console Input:"));
		content.push(localize('repl.distinguishFilter', "The filter input is where you are now. It hides or shows messages without running code."));
		content.push(localize('repl.distinguishConsole', "The console input is at the bottom of the console, after all displayed messages. That is where you type and press Enter to evaluate expressions during debugging."));
		content.push(localize('repl.distinguishSwitch', "To switch to the console input and evaluate an expression, use {0} to focus the console input.", '<keybinding:workbench.panel.repl.view.focus>'));
		content.push('');

		// Filter Syntax
		content.push(localize('repl.syntaxHeader', "Filter Syntax and Patterns:"));
		content.push(localize('repl.syntaxText', "- Type text: Shows only messages containing that text."));
		content.push(localize('repl.syntaxExclude', "- !text (exclude): Hides messages containing the text, showing all others."));
		content.push('');

		// Keyboard Navigation Summary
		content.push(localize('repl.keyboardHeader', "Keyboard Navigation Summary:"));
		content.push(localize('repl.keyDown', "- Down Arrow: Move focus from filter into the console output."));
		content.push(localize('repl.keyTab', "- Tab: Move to other console controls if available."));
		content.push(localize('repl.keyEscape', "- Escape: Clear the filter or close the filter."));
		content.push(localize('repl.keyFocus', "- {0}: Focus the console input to evaluate expressions.", '<keybinding:workbench.panel.repl.view.focus>'));
		content.push('');

		// Settings
		content.push(localize('repl.settingsHeader', "Settings You Can Adjust ({0} opens Settings):", '<keybinding:workbench.action.openSettings>'));
		content.push(localize('repl.settingsIntro', "These settings affect the Debug Console."));
		content.push(localize('repl.settingVerbosity', "- `accessibility.verbosity.find`: Controls whether the filter input announces the Accessibility Help hint."));
		content.push(localize('repl.settingCloseOnEnd', "- `debug.console.closeOnEnd`: Automatically close the Debug Console when the debugging session ends."));
		content.push(localize('repl.settingFontSize', "- `debug.console.fontSize`: Font size in the console."));
		content.push(localize('repl.settingFontFamily', "- `debug.console.fontFamily`: Font family in the console."));
		content.push(localize('repl.settingWordWrap', "- `debug.console.wordWrap`: Wrap lines in the console."));
		content.push(localize('repl.settingHistory', "- `debug.console.historySuggestions`: Suggest previously typed input."));
		content.push(localize('repl.settingCollapse', "- `debug.console.collapseIdenticalLines`: Collapse repeated messages with a count."));
		content.push(localize('repl.settingMaxLines', "- `debug.console.maximumLines`: Maximum number of messages to keep in the console."));
		content.push('');

		// Closing
		content.push(localize('repl.closingHeader', "Closing:"));
		content.push(localize('repl.closingDesc', "Press Escape to clear the filter, or close the Debug Console. Your filter text is preserved if you reopen the console."));

		return content.join('\n');
	}
}

