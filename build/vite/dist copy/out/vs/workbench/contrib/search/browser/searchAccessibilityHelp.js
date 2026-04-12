/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { SearchContext } from '../common/constants.js';
import { ISearchViewModelWorkbenchService } from './searchTreeModel/searchViewModelWorkbenchService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { getSearchView } from './searchActionsBase.js';
export class SearchAccessibilityHelp {
    constructor() {
        this.priority = 105;
        this.name = 'search';
        this.type = "help" /* AccessibleViewType.Help */;
        this.when = SearchContext.SearchInputBoxFocusedKey;
    }
    getProvider(accessor) {
        const searchViewModelService = accessor.get(ISearchViewModelWorkbenchService);
        const viewsService = accessor.get(IViewsService);
        const searchModel = searchViewModelService.searchModel;
        if (!searchModel) {
            return undefined;
        }
        return new SearchAccessibilityHelpProvider(searchModel, viewsService);
    }
}
class SearchAccessibilityHelpProvider extends Disposable {
    constructor(_searchModel, _viewsService) {
        super();
        this._searchModel = _searchModel;
        this._viewsService = _viewsService;
        this.id = "searchHelp" /* AccessibleViewProviderId.SearchHelp */;
        this.verbositySettingKey = "accessibility.verbosity.find" /* AccessibilityVerbositySettingId.Find */;
        this.options = { type: "help" /* AccessibleViewType.Help */ };
    }
    onClose() {
        getSearchView(this._viewsService)?.focus();
    }
    provideContent() {
        const content = [];
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
            }
            else {
                content.push(localize('search.resultCount', "{0} results found.", resultCount));
            }
        }
        else {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoQWNjZXNzaWJpbGl0eUhlbHAuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zZWFyY2gvYnJvd3Nlci9zZWFyY2hBY2Nlc3NpYmlsaXR5SGVscC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUs5QyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDdkQsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDeEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUV2RCxNQUFNLE9BQU8sdUJBQXVCO0lBQXBDO1FBQ1UsYUFBUSxHQUFHLEdBQUcsQ0FBQztRQUNmLFNBQUksR0FBRyxRQUFRLENBQUM7UUFDaEIsU0FBSSx3Q0FBMkI7UUFDL0IsU0FBSSxHQUFHLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQztJQWF4RCxDQUFDO0lBWEEsV0FBVyxDQUFDLFFBQTBCO1FBQ3JDLE1BQU0sc0JBQXNCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDO1FBQzlFLE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUM7UUFFakQsTUFBTSxXQUFXLEdBQUcsc0JBQXNCLENBQUMsV0FBVyxDQUFDO1FBQ3ZELElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNsQixPQUFPLFNBQVMsQ0FBQztR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