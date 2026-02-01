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
		lines.push(nls.localize('problems.filter.helpTitle', 'Accessibility Help: Problems Panel Filter'));
		lines.push('');
		lines.push(nls.localize('problems.filter.overview', 'You are in the Problems panel filter input. This is a FILTER, not a search with match navigation. As you type, the Problems list shows only diagnostics matching your filter: errors, warnings, and information messages from your code.'));
		lines.push('');
		lines.push(nls.localize('problems.filter.behavior', 'How Filtering Works:'));
		lines.push(nls.localize('problems.filter.typing', 'As you type filter text, the Problems list updates instantly to show only matching items. Your screen reader announces the count of filtered problems. This is NOT a Find operation—there are no match highlighting or F3 navigation.'));
		lines.push(nls.localize('problems.filter.textMatch', 'Text matching checks problem messages, file names, error codes, and sources. For example, filtering "null" shows all messages containing that word.'));
		lines.push('');
		lines.push(nls.localize('problems.filter.filterPatterns', 'Filter Syntax:'));
		lines.push(nls.localize('problems.filter.include', '- Type text: Shows problems whose message, file path, or code contains that text.'));
		lines.push(nls.localize('problems.filter.exclude', '- !text: Exclude mode - Hides problems containing the text, showing all others.'));
		lines.push(nls.localize('problems.filter.example', 'Example: "node_modules" hides problems in node_modules. "!test" hides problems in test files.'));
		lines.push('');
		lines.push(nls.localize('problems.filter.severityFilters', 'Severity Filtering:'));
		lines.push(nls.localize('problems.filter.severityDesc', 'Above the filter input, you will find toggle buttons for different severity levels. These work together with text filtering:'));
		lines.push(nls.localize('problems.filter.errors', '- Errors button: Toggle to show/hide error problems.'));
		lines.push(nls.localize('problems.filter.warnings', '- Warnings button: Toggle to show/hide warning problems.'));
		lines.push(nls.localize('problems.filter.info', '- Info button: Toggle to show/hide information problems.'));
		lines.push(nls.localize('problems.filter.combined', 'Combine text filter + severity toggles: Filter "src" AND toggle Errors on to see only errors in your src folder.'));
		lines.push('');
		lines.push(nls.localize('problems.filter.scopeFilters', 'Scope Filtering:'));
		lines.push(nls.localize('problems.filter.activeFile', '- Active File Only button: When enabled, shows only problems in the currently open file.'));
		lines.push(nls.localize('problems.filter.excludedFiles', '- Excluded Files button: Toggle whether problems in files matching your exclude patterns are displayed.'));
		lines.push('');
		lines.push(nls.localize('problems.filter.navigation', 'Navigation Between Issues and Filters:'));
		lines.push(nls.localize('problems.filter.down', '- Press Down Arrow to move focus from filter into the filtered problems list below.'));
		lines.push(nls.localize('problems.filter.tab', '- Press Tab to navigate to severity toggle buttons and scope buttons.'));
		lines.push(nls.localize('problems.filter.enter', '- When a problem is focused in the list below, press Enter to go to that problem in the editor.'));
		lines.push(nls.localize('problems.filter.quickNav', '- Press {0} (anywhere in the editor) to go to the next problem globally.', this._describeCommand('editor.action.marker.nextInFiles') || 'F8'));
		lines.push(nls.localize('problems.filter.quickNavPrev', '- Press {0} to go to the previous problem globally.', this._describeCommand('editor.action.marker.prevInFiles') || 'Shift+F8'));
		lines.push('');
		lines.push(nls.localize('problems.filter.focus', 'Staying Organized:'));
		lines.push(nls.localize('problems.filter.returnFilter', 'Your filter text is preserved. Type a new filter and the list updates immediately. To clear the filter, press Escape or delete the text.'));
		lines.push(nls.localize('problems.filter.allContext', 'The Problems panel shows issues from your entire workspace. Use Active File Only to focus on a single file, or use text filtering to narrow down searches.'));
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
