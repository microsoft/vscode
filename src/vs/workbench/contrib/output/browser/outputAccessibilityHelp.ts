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
import { OUTPUT_FILTER_FOCUS_CONTEXT } from '../../../services/output/common/output.js';

export class OutputAccessibilityHelp implements IAccessibleViewImplementation {
	readonly type = AccessibleViewType.Help;
	readonly priority = 105;
	readonly name = 'outputFilter';
	readonly when = OUTPUT_FILTER_FOCUS_CONTEXT;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider {
		return new OutputAccessibilityHelpProvider(accessor.get(IKeybindingService));
	}
}

class OutputAccessibilityHelpProvider extends Disposable implements IAccessibleViewContentProvider {
	readonly id = AccessibleViewProviderId.OutputFindHelp;
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
		lines.push(nls.localize('output.header', 'Accessibility Help: Output Panel Filter'));
		lines.push(nls.localize('output.context', 'You are in the Output panel filter input. This is NOT a navigating search. Instead, it instantly hides lines that do not match your filter, showing only the lines you want to see.'));
		lines.push('');

		// Current Filter Status
		lines.push(nls.localize('output.statusHeader', 'Current Filter Status:'));
		lines.push(nls.localize('output.statusDesc', 'You are filtering the output.'));
		lines.push('');

		// Inside the Filter Input
		lines.push(nls.localize('output.inputHeader', 'Inside the Filter Input (What It Does):'));
		lines.push(nls.localize('output.inputDesc', 'While you are in the filter input, your focus stays in the field. You can type, edit, or adjust your filter without leaving the input. As you type, the Output panel instantly updates to show only lines matching your filter.'));
		lines.push('');

		// What Happens When You Filter
		lines.push(nls.localize('output.filterHeader', 'What Happens When You Filter:'));
		lines.push(nls.localize('output.filterDesc1', 'Each time you change the filter text, the panel instantly regenerates to show only matching lines. Your screen reader announces how many lines are now visible. This is live feedback: as you type or delete characters, the displayed lines update immediately.'));
		lines.push(nls.localize('output.filterDesc2', 'New output from your running program is appended to the panel and automatically filtered, so matching new output appears instantly.'));
		lines.push('');

		// Focus Behavior
		lines.push(nls.localize('output.focusHeader', 'Focus Behavior (Important):'));
		lines.push(nls.localize('output.focusDesc1', 'Your focus stays in the filter input while the panel updates in the background. This is intentional, so you can keep typing without losing your place.'));
		lines.push(nls.localize('output.focusDesc2', 'If you want to review the filtered output, press Down Arrow to move focus from the filter into the output content below.'));
		lines.push(nls.localize('output.focusDesc3', 'If you want to clear the filter and see all output, press Escape or delete all filter text.'));
		lines.push('');

		// Filter Syntax
		lines.push(nls.localize('output.syntaxHeader', 'Filter Syntax and Patterns:'));
		lines.push(nls.localize('output.syntaxText', '- Type text: Shows only lines containing that text (case-insensitive by default).'));
		lines.push(nls.localize('output.syntaxExclude', '- !text (exclude): Hides lines containing \'text\', showing all other lines.'));
		lines.push(nls.localize('output.syntaxEscape', '- \\\\! (escape): Use backslash to search for a literal "!" character.'));
		lines.push(nls.localize('output.syntaxMultiple', '- text1, text2 (multiple patterns): Separate patterns with commas to show lines matching ANY pattern.'));
		lines.push(nls.localize('output.syntaxExample', 'Example: typing "error, warning" shows lines containing either "error" or "warning".'));
		lines.push('');

		// Keyboard Navigation Summary
		lines.push(nls.localize('output.keyboardHeader', 'Keyboard Navigation Summary:'));
		lines.push(nls.localize('output.keyDown', '- Down Arrow: Move focus from filter into the output content.'));
		lines.push(nls.localize('output.keyTab', '- Tab: Move to log level filter buttons if available.'));
		lines.push(nls.localize('output.keyEscape', '- Escape: Clear the filter and return to showing all output.'));
		lines.push('');

		// Settings
		lines.push(nls.localize('output.settingsHeader', 'Settings You Can Adjust ({0} opens Settings):', this._describeCommand('workbench.action.openSettings') || 'Ctrl+,'));
		lines.push(nls.localize('output.settingsIntro', 'These settings affect how the Output panel works.'));
		lines.push(nls.localize('output.settingVerbosity', '- `accessibility.verbosity.find`: Controls whether the filter input announces the Accessibility Help hint.'));
		lines.push(nls.localize('output.settingSmartScroll', '- `output.smartScroll.enabled`: Automatically scroll to the latest output when messages arrive.'));
		lines.push('');

		// Closing
		lines.push(nls.localize('output.closingHeader', 'Closing:'));
		lines.push(nls.localize('output.closingDesc', 'Press Escape to clear the filter and see all output, or close the Output panel. Your filter text is preserved if you reopen the panel.'));

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
