/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { AccessibleViewType, AccessibleContentProvider, IAccessibleViewContentProvider, AccessibleViewProviderId } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import * as nls from '../../../../nls.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { MarkersContextKeys } from '../common/markers.js';

export class ProblemsAccessibilityHelp implements IAccessibleViewImplementation {
	readonly type = AccessibleViewType.Help;
	readonly priority = 105;
	readonly name = 'problemsFilter';
	readonly when = MarkersContextKeys.MarkerViewFilterFocusContextKey;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider {
		return new ProblemsAccessibilityHelpProvider(accessor.get(IKeybindingService));
	}
}

class ProblemsAccessibilityHelpProvider extends Disposable implements IAccessibleViewContentProvider {
	readonly id = AccessibleViewProviderId.ProblemsFilterHelp;
	readonly verbositySettingKey = AccessibilityVerbositySettingId.Find;
	readonly options = { type: AccessibleViewType.Help };

	constructor(
		private readonly _keybindingService: IKeybindingService,
	) {
		super();
	}

	provideContent(): string {
		const lines: string[] = [];

		// Header
		lines.push(nls.localize('problems.header', 'Accessibility Help: Problems Panel Filter'));
		lines.push(nls.localize('problems.context', 'You are in the Problems panel filter input. This is a filter, not a navigating search. It instantly hides problems that do not match your filter, showing only the problems you want to see.'));
		lines.push('');

		// Current Filter Status
		lines.push(nls.localize('problems.statusHeader', 'Current Filter Status:'));
		lines.push(nls.localize('problems.statusDesc', 'You are filtering the problems.'));
		lines.push('');

		// Inside the Filter Input
		lines.push(nls.localize('problems.inputHeader', 'Inside the Filter Input (What It Does):'));
		lines.push(nls.localize('problems.inputDesc', 'While you are in the filter input, your focus stays in the field. You can type, edit, or adjust your filter without leaving the input. As you type, the Problems panel instantly updates to show only problems matching your filter.'));
		lines.push('');

		// What Happens When You Filter
		lines.push(nls.localize('problems.filterHeader', 'What Happens When You Filter:'));
		lines.push(nls.localize('problems.filterDesc1', 'Each time you change the filter text, the panel instantly regenerates to show only matching problems. Your screen reader announces how many problems are now visible. This is live feedback: as you type or delete characters, the displayed problems update immediately.'));
		lines.push(nls.localize('problems.filterDesc2', 'The panel searches problem messages, file names, and error codes, so you can filter by any of these details.'));
		lines.push('');

		// Focus Behavior
		lines.push(nls.localize('problems.focusHeader', 'Focus Behavior (Important):'));
		lines.push(nls.localize('problems.focusDesc1', 'Your focus stays in the filter input while the panel updates in the background. This is intentional, so you can keep typing without losing your place.'));
		lines.push(nls.localize('problems.focusDesc2', 'If you want to navigate the filtered problems, press Down Arrow to move focus from the filter into the problems list below.'));
		lines.push(nls.localize('problems.focusDesc3', 'When a problem is focused, press Enter to navigate to that problem in the editor.'));
		lines.push(nls.localize('problems.focusDesc4', 'If you want to clear the filter and see all problems, press Escape or delete all filter text.'));
		lines.push('');

		// Filter Syntax
		lines.push(nls.localize('problems.syntaxHeader', 'Filter Syntax and Patterns:'));
		lines.push(nls.localize('problems.syntaxText', '- Type text: Shows problems whose message, file path, or code contains that text.'));
		lines.push(nls.localize('problems.syntaxExclude', '- !text (exclude): Hides problems containing the text, showing all others.'));
		lines.push(nls.localize('problems.syntaxExample', 'Example: typing "node_modules" hides all problems in node_modules.'));
		lines.push('');

		// Severity and Scope Filtering
		lines.push(nls.localize('problems.severityHeader', 'Severity and Scope Filtering:'));
		lines.push(nls.localize('problems.severityIntro', 'Above the filter input are toggle buttons for severity levels and scope:'));
		lines.push(nls.localize('problems.severityErrors', '- Errors button: Toggle to show or hide error problems.'));
		lines.push(nls.localize('problems.severityWarnings', '- Warnings button: Toggle to show or hide warning problems.'));
		lines.push(nls.localize('problems.severityInfo', '- Info button: Toggle to show or hide informational problems.'));
		lines.push(nls.localize('problems.severityActiveFile', '- Active File Only button: When enabled, shows only problems in the currently open file.'));
		lines.push(nls.localize('problems.severityConclusion', 'These buttons work together with your text filter.'));
		lines.push('');

		// Keyboard Navigation Summary
		lines.push(nls.localize('problems.keyboardHeader', 'Keyboard Navigation Summary:'));
		lines.push(nls.localize('problems.keyDown', '- Down Arrow: Move focus from filter into the problems list.'));
		lines.push(nls.localize('problems.keyTab', '- Tab: Move to severity and scope toggle buttons.'));
		lines.push(nls.localize('problems.keyEnter', '- Enter (on a problem): Navigate to that problem in the editor.'));
		lines.push(nls.localize('problems.keyF8', '- {0}: Move to the next problem globally from anywhere in the editor.', this._describeCommand('editor.action.marker.nextInFiles') || 'F8'));
		lines.push(nls.localize('problems.keyShiftF8', '- {0}: Move to the previous problem globally from anywhere in the editor.', this._describeCommand('editor.action.marker.prevInFiles') || 'Shift+F8'));
		lines.push(nls.localize('problems.keyEscape', '- Escape: Clear the filter and return to showing all problems.'));
		lines.push('');

		// Settings
		lines.push(nls.localize('problems.settingsHeader', 'Settings You Can Adjust ({0} opens Settings):', this._describeCommand('workbench.action.openSettings') || 'Ctrl+,'));
		lines.push(nls.localize('problems.settingsIntro', 'These settings affect the Problems panel.'));
		lines.push(nls.localize('problems.settingVerbosity', '- `accessibility.verbosity.find`: Controls whether the filter input announces the Accessibility Help hint.'));
		lines.push(nls.localize('problems.settingAutoReveal', '- `problems.autoReveal`: Automatically reveal problems in the editor when you select them.'));
		lines.push(nls.localize('problems.settingViewMode', '- `problems.defaultViewMode`: Show problems as a table or tree.'));
		lines.push(nls.localize('problems.settingSortOrder', '- `problems.sortOrder`: Sort problems by severity or position.'));
		lines.push(nls.localize('problems.settingShowCurrent', '- `problems.showCurrentInStatus`: Show the current problem in the status bar.'));
		lines.push('');

		// Closing
		lines.push(nls.localize('problems.closingHeader', 'Closing:'));
		lines.push(nls.localize('problems.closingDesc', 'Press Escape to clear the filter and see all problems. Your filter text is preserved if you reopen the panel. Problems are shown from your entire workspace; use Active File Only to focus on a single file.'));

		return lines.join('\n');
	}

	private _describeCommand(commandId: string): string | undefined {
		const kb = this._keybindingService.lookupKeybinding(commandId);
		return kb?.getAriaLabel() ?? undefined;
	}

	onClose(): void {
		// No-op
	}
}
