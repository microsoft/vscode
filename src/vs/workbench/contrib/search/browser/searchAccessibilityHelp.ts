/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { AccessibleViewProviderId, AccessibleViewType, AccessibleContentProvider, IAccessibleViewContentProvider, IAccessibleViewOptions } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { SearchContext } from '../common/constants.js';
import { ISearchViewModelWorkbenchService } from './searchTreeModel/searchViewModelWorkbenchService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { getSearchView } from './searchActionsBase.js';

export class SearchAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 105;
	readonly name = 'search';
	readonly type = AccessibleViewType.Help;
	readonly when = SearchContext.SearchInputBoxFocusedKey;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const searchViewModelService = accessor.get(ISearchViewModelWorkbenchService);
		const viewsService = accessor.get(IViewsService);

		const searchModel = searchViewModelService.searchModel;
		if (!searchModel) {
			return undefined;
		}

		return new SearchAccessibilityHelpProvider(searchModel, viewsService);
	}
}

class SearchAccessibilityHelpProvider extends Disposable implements IAccessibleViewContentProvider {
	readonly id = AccessibleViewProviderId.SearchHelp;
	readonly verbositySettingKey = AccessibilityVerbositySettingId.Find;
	readonly options: IAccessibleViewOptions = { type: AccessibleViewType.Help };

	constructor(
		private readonly _searchModel: { searchResult: { count: () => number }; replaceActive: boolean },
		private readonly _viewsService: IViewsService
	) {
		super();
	}

	onClose(): void {
		getSearchView(this._viewsService)?.focus();
	}

	provideContent(): string {
		const content: string[] = [];
		const resultCount = this._searchModel.searchResult.count();
		const isReplaceMode = this._searchModel.replaceActive;

		// Header
		content.push(localize('search.header', "Accessibility Help: Search Across Files"));
		content.push(localize('search.context', "You are in the Search view. This workspace-wide tool lets you find text or patterns across all files in your workspace."));
		content.push('');

		// Current Search Status
		content.push(localize('search.statusHeader', "Current Search Status:"));
		content.push(localize('search.statusIntro', "You are searching across your workspace."));
		if (resultCount !== undefined) {
			if (resultCount === 0) {
				content.push(localize('search.noResults', "No results found. Check your search term or adjust options below."));
			} else {
				content.push(localize('search.resultCount', "{0} results found.", resultCount));
			}
		} else {
			content.push(localize('search.noSearch', "Type a search term to find results."));
		}
		content.push('');

		// Inside the Search Input
		content.push(localize('search.inputHeader', "Inside the Search Input (What It Does):"));
		content.push(localize('search.inputDesc', "While you are in the Search input, your focus stays in the field. You can type your search term and navigate the search results list without leaving the input. When you navigate to a result, the editor updates in the background to show the match."));
		content.push('');

		// What You Hear
		content.push(localize('search.hearHeader', "What You Hear Each Time You Move to a Result:"));
		content.push(localize('search.hearDesc', "Each navigation step gives you a complete spoken update:"));
		content.push(localize('search.hear1', "1) The file name where the result is located is read first, so you know which file contains the match."));
		content.push(localize('search.hear2', "2) The full line that contains the match is read, so you get immediate context."));
		content.push(localize('search.hear3', "3) Your position among the results is announced, so you know how far you are through the results."));
		content.push(localize('search.hear4', "4) The exact line and column are announced, so you know precisely where the match is in the file."));
		content.push('');

		// Focus Behavior
		content.push(localize('search.focusHeader', "Focus Behavior (Important):"));
		content.push(localize('search.focusDesc1', "When you navigate from the Search input, the editor updates while your focus stays in the search field. This is intentional, so you can keep refining your search without losing your place."));
		content.push(localize('search.focusDesc2', "If you press Tab, focus moves to the results tree below the input, and you can navigate results and open them. When you press Enter on a result, the match is shown in the editor."));
		content.push(localize('search.focusDesc3', "If you want to focus the editor to edit text at a search result, use {0} to navigate to the result and automatically focus the editor there.", '<keybinding:search.action.focusNextSearchResult>'));
		content.push('');

		// Keyboard Navigation Summary
		content.push(localize('search.keyboardHeader', "Keyboard Navigation Summary:"));
		content.push('');
		content.push(localize('search.keyNavSearchHeader', "While focused IN the Search input:"));
		content.push(localize('search.keyEnter', "- Enter: Run or refresh the search."));
		content.push(localize('search.keyTab', "- Tab: Move focus to the results tree below."));
		content.push('');
		content.push(localize('search.keyNavResultsHeader', "Navigating search results:"));
		content.push(localize('search.keyArrow', "- Down Arrow: Navigate through results in the tree."));
		content.push(localize('search.keyResultEnter', "- Enter (when a result is focused): Navigate to that result in the editor."));
		content.push('');
		content.push(localize('search.keyNavGlobalHeader', "From anywhere (Search input or editor):"));
		content.push(localize('search.keyF4', "- {0}: Jump to the next result and focus the editor.", '<keybinding:search.action.focusNextSearchResult>'));
		content.push(localize('search.keyShiftF4', "- {0}: Jump to the previous result and focus the editor.", '<keybinding:search.action.focusPreviousSearchResult>'));
		content.push('');

		// Search Options
		content.push(localize('search.optionsHeader', "Search Options in the Dialog:"));
		content.push(localize('search.optionCase', "- Match Case: Only exact case matches are included."));
		content.push(localize('search.optionWord', "- Whole Word: Only full words are matched."));
		content.push(localize('search.optionRegex', "- Regular Expression: Use pattern matching for advanced searches."));
		content.push('');

		// Replace Mode
		if (isReplaceMode) {
			content.push(localize('search.replaceHeader', "Replace Across Files (Replace Mode Active):"));
			content.push(localize('search.replaceDesc1', "Tab to the Replace input and type your replacement text."));
			content.push(localize('search.replaceDesc2', "You can replace individual matches or all matches at once."));
			content.push(localize('search.replaceWarning', "Warning: This action affects multiple files. Make sure you have searched for exactly what you want to replace."));
			content.push('');
		}

		// Settings
		content.push(localize('search.settingsHeader', "Settings You Can Adjust ({0} opens Settings):", '<keybinding:workbench.action.openSettings>'));
		content.push(localize('search.settingsIntro', "These settings affect how Search across files behaves."));
		content.push(localize('search.settingVerbosity', "- `accessibility.verbosity.find`: Controls whether the Search input announces the Accessibility Help hint."));
		content.push(localize('search.settingSmartCase', "- `search.smartCase`: Use case-insensitive search if your search term is all lowercase."));
		content.push(localize('search.settingSearchOnType', "- `search.searchOnType`: Search all files as you type."));
		content.push(localize('search.settingDebounce', "- `search.searchOnTypeDebouncePeriod`: Wait time in milliseconds before searching as you type."));
		content.push(localize('search.settingMaxResults', "- `search.maxResults`: Maximum number of search results to show."));
		content.push(localize('search.settingCollapse', "- `search.collapseResults`: Expand or collapse results."));
		content.push(localize('search.settingLineNumbers', "- `search.showLineNumbers`: Show line numbers for results."));
		content.push(localize('search.settingSortOrder', "- `search.sortOrder`: Sort results by file name, type, modified time, or match count."));
		content.push(localize('search.settingContextLines', "- `search.searchEditor.defaultNumberOfContextLines`: Number of context lines shown around matches."));
		content.push(localize('search.settingViewMode', "- `search.defaultViewMode`: Show results as list or tree."));
		content.push(localize('search.settingActions', "- `search.actionsPosition`: Position of action buttons."));

		// Replace-specific setting
		if (isReplaceMode) {
			content.push(localize('search.settingReplacePreview', "- `search.useReplacePreview`: Open preview when replacing matches."));
		}

		// Platform-specific setting
		if (isMacintosh) {
			content.push('');
			content.push(localize('search.macSettingHeader', "Platform-Specific Setting (macOS only):"));
			content.push(localize('search.macSetting', "- `search.globalFindClipboard`: Uses the shared macOS Find clipboard when available."));
		}

		content.push('');
		content.push(localize('search.closingHeader', "Closing:"));
		content.push(localize('search.closingDesc', "Press Escape to close Search. Focus returns to the editor, and your search history is preserved."));

		return content.join('\n');
	}
}
