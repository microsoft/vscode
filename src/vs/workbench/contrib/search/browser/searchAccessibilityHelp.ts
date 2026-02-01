/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { AccessibleViewProviderId, AccessibleViewType, AccessibleContentProvider, IAccessibleViewContentProvider, IAccessibleViewOptions } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { SearchContext } from '../common/constants.js';
import { ISearchViewModelWorkbenchService } from './searchTreeModel/searchViewModelWorkbenchService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';

export class SearchAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 105;
	readonly name = 'search';
	readonly type = AccessibleViewType.Help;
	readonly when = SearchContext.SearchInputBoxFocusedKey;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const searchViewModelService = accessor.get(ISearchViewModelWorkbenchService);
		const commandService = accessor.get(ICommandService);

		const searchModel = searchViewModelService.searchModel;
		if (!searchModel) {
			return undefined;
		}

		return new SearchAccessibilityHelpProvider(searchModel, commandService);
	}
}

class SearchAccessibilityHelpProvider extends Disposable implements IAccessibleViewContentProvider {
	readonly id = AccessibleViewProviderId.SearchHelp;
	readonly verbositySettingKey = AccessibilityVerbositySettingId.Find;
	readonly options: IAccessibleViewOptions = { type: AccessibleViewType.Help };

	constructor(
		private readonly _searchModel: { searchResult: { count: () => number }; replaceActive: boolean },
		private readonly _commandService: ICommandService
	) {
		super();
	}

	onClose(): void {
		this._commandService.executeCommand('workbench.action.findInFiles');
	}

	provideContent(): string {
		const content: string[] = [];
		const resultCount = this._searchModel.searchResult.count();
		const isReplaceMode = this._searchModel.replaceActive;

		content.push(localize('msg.searchHeader', "Accessibility Help: Search Across Files"));
		content.push(localize('msg.searchContext', "Welcome to the Search Across Files widget. This powerful tool finds text, code patterns, and references across your entire workspace."));
		content.push('');
		content.push(localize('msg.searchIntro', "Current Search Status:"));

		if (resultCount !== undefined) {
			if (resultCount === 0) {
				content.push(localize('msg.searchNoResults', "No results found. Check your search term, or try adjusting case sensitivity, whole word, or regular expression options below."));
			} else if (resultCount === 1) {
				content.push(localize('msg.searchOneResult', "One result found across your workspace. Press F4 to jump to this match in the editor."));
			} else {
				content.push(localize('msg.searchResults', "{0} results found across your workspace. These are grouped by file using the tree structure below.", resultCount));
			}
		} else {
			content.push(localize('msg.searchTip', "Type a search term to find matches across all files in your workspace."));
		}

		content.push('');
		content.push(localize('msg.navigationHeader', "Keyboard Navigation:"));
		content.push(localize('msg.navIntro', "In the Search input, as you type, VS Code searches in the background. You can also press Enter to trigger the search manually."));
		content.push('');

		content.push(localize('msg.navEnter', "- Press Enter in the search input to run or refresh the search."));
		content.push(localize('msg.navTab', "- Press Tab to move to the results tree. Your screen reader announces the first result file."));
		content.push(localize('msg.navF4', "- Press F4 to jump to the next result and open the file with the match highlighted in yellow."));
		content.push(localize('msg.navShiftF4', "- Press Shift+F4 to go to the previous result."));
		content.push(localize('msg.navArrows', "- Press Down/Up Arrow to navigate through the results tree. When a result is focused, press Enter to go to that match in the editor."));
		content.push(localize('msg.focusEditor', "- When you press F4 or Enter on a result, focus moves to the editor and the match is highlighted. To quickly return to search, press{0}.", '<keybinding:workbench.action.findInFiles>'));

		content.push('');
		content.push(localize('msg.focusBehavior', "Focus Behavior:"));
		content.push(localize('msg.focusDetail1', "When you press F4 to navigate to a result, VS Code opens the file and your screen reader announces the line containing the match."));
		content.push(localize('msg.focusDetail2', "To quickly return to search, press{0}. This puts focus back in the search input with your search term selected.", '<keybinding:workbench.action.findInFiles>'));
		content.push(localize('msg.focusDetail3', "Browse results without leaving the panel using Arrow keys. Press Enter to navigate to a highlighted result."));

		content.push('');
		content.push(localize('msg.searchOptionsHeader', "Search Options:"));
		content.push(localize('msg.searchOptionCase', "-{0}Match Case - Find only exact case matches. Example: \"export\" vs \"EXPORT\".", '<keybinding:toggleSearchCaseSensitive>'));
		content.push(localize('msg.searchOptionWord', "-{0}Whole Word - Find complete words only. \"test\" won't match \"testing\".", '<keybinding:toggleSearchWholeWord>'));
		content.push(localize('msg.searchOptionRegex', "-{0}Regular Expression - Use regex patterns like \"(import|export)\\\\s*\\\\{.*\\\\}\" to find complex code structures.", '<keybinding:toggleSearchRegex>'));
		content.push(localize('msg.searchDetails', "-{0}Toggle search details panel to see more options and file context.", '<keybinding:workbench.action.search.toggleQueryDetails>'));

		if (isReplaceMode) {
			content.push('');
			content.push(localize('msg.searchReplaceHeader', "Replace Across Files:"));
			content.push(localize('msg.searchReplaceIntro', "Tab to the Replace input and type your replacement text."));
			content.push(localize('msg.searchReplaceOne', "- Replace individual matches: Navigate to a result and press Enter to replace that match only."));
			content.push(localize('msg.searchReplaceAll', "- Replace All: When focused in the Replace input, press{0}to replace all matches at once.", '<keybinding:search.action.replaceAllInFile>'));
			content.push(localize('msg.searchReplaceWarning', "Warning: This affects multiple files. Make sure you\\'ve searched for exactly what you want to replace."));
		}

		content.push('');
		content.push(localize('msg.searchClosing', "Closing Search:"));
		content.push(localize('msg.searchClosingDetail', "Press Escape to close the Search view. Your search history is saved, so you can reopen Search with{0}and access previous searches.", '<keybinding:workbench.action.findInFiles>'));

		return content.join('\n');
	}
}
