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
		lines.push(nls.localize('output.filter.helpTitle', 'Accessibility Help: Output Panel Filter'));
		lines.push('');
		lines.push(nls.localize('output.filter.overview', 'You are in the Output panel filter input. This is NOT a search with match navigation like the Editor Find. Instead, it is a live filter: as you type, the Output panel shows only lines matching your filter text.'));
		lines.push('');
		lines.push(nls.localize('output.filter.behavior', 'How Filtering Works:'));
		lines.push(nls.localize('output.filter.typing', 'As you type filter text, the Output panel instantly updates to show only matching lines. Your screen reader announces the number of lines visible after filtering.'));
		lines.push(nls.localize('output.filter.noNavigation', 'Unlike Find, there is no Enter key to navigate to matches. The filter reduces what you see in real time.'));
		lines.push(nls.localize('output.filter.liveUpdate', 'New output from your running program is appended to the panel even while filtering is active. Matching new lines appear instantly.'));
		lines.push('');
		lines.push(nls.localize('output.filter.filterPatterns', 'Filter Syntax:'));
		lines.push(nls.localize('output.filter.include', '- Type text to match: Shows only lines containing that text (case-insensitive by default).'));
		lines.push(nls.localize('output.filter.exclude', '- !text: Exclude mode - Hides lines containing \'text\', showing only non-matching lines.'));
		lines.push(nls.localize('output.filter.escape', '- \\\\!: Escape the exclamation mark - Use \\\\ to search for literal "!" characters.'));
		lines.push(nls.localize('output.filter.multiple', '- text1, text2: Match multiple patterns - Separate with commas to show lines matching ANY pattern.'));
		lines.push(nls.localize('output.filter.example', 'Example: "ERROR, WARN" shows lines containing either ERROR or WARN. "!DEBUG" hides DEBUG lines.'));
		lines.push('');
		lines.push(nls.localize('output.filter.logLevels', 'Log Level Filtering (For Log Outputs):'));
		lines.push(nls.localize('output.filter.logLevelDesc', 'If you are viewing a log channel, use additional filtering buttons to show/hide levels like Trace, Debug, Info, Warning, and Error. Combine text filtering with log level buttons for powerful filtering.'));
		lines.push('');
		lines.push(nls.localize('output.filter.navigation', 'Keyboard Navigation:'));
		lines.push(nls.localize('output.filter.down', '- Press Down Arrow ({0}) to move focus from the filter input into the output content below.', this._describeCommand('list.focusDown') || 'Down'));
		lines.push(nls.localize('output.filter.tab', '- Press Tab to move focus to output filtering buttons or other controls.'));
		lines.push(nls.localize('output.filter.clear', '- Press {0} to clear the filter text (this returns the command for your system)', this._describeCommand('workbench.actions.workbench.panel.output.clearFilterText') || 'Escape'));
		lines.push('');
		lines.push(nls.localize('output.filter.focus', 'Staying in Focus:'));
		lines.push(nls.localize('output.filter.editFilter', 'Focus stays in the filter input as you type. To review filtered output, press Down Arrow. Current filter text is preserved when you navigate.'));
		lines.push('');
		lines.push(nls.localize('output.filter.settings', 'Output Settings:'));
		lines.push(nls.localize('output.filter.smartScroll', 'See "Settings > Output" for options like Auto Scroll and Log Level defaults. Search "output.smartScroll" to keep the view scrolled to the latest output.'));
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
