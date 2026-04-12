/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
export var SearchCommandIds;
(function (SearchCommandIds) {
    SearchCommandIds["FindInFilesActionId"] = "workbench.action.findInFiles";
    SearchCommandIds["FocusActiveEditorCommandId"] = "search.action.focusActiveEditor";
    SearchCommandIds["FocusSearchFromResults"] = "search.action.focusSearchFromResults";
    SearchCommandIds["OpenMatch"] = "search.action.openResult";
    SearchCommandIds["OpenMatchToSide"] = "search.action.openResultToSide";
    SearchCommandIds["RemoveActionId"] = "search.action.remove";
    SearchCommandIds["CopyPathCommandId"] = "search.action.copyPath";
    SearchCommandIds["CopyMatchCommandId"] = "search.action.copyMatch";
    SearchCommandIds["CopyAllCommandId"] = "search.action.copyAll";
    SearchCommandIds["OpenInEditorCommandId"] = "search.action.openInEditor";
    SearchCommandIds["ClearSearchHistoryCommandId"] = "search.action.clearHistory";
    SearchCommandIds["FocusSearchListCommandID"] = "search.action.focusSearchList";
    SearchCommandIds["ReplaceActionId"] = "search.action.replace";
    SearchCommandIds["ReplaceAllInFileActionId"] = "search.action.replaceAllInFile";
    SearchCommandIds["ReplaceAllInFolderActionId"] = "search.action.replaceAllInFolder";
    SearchCommandIds["CloseReplaceWidgetActionId"] = "closeReplaceInFilesWidget";
    SearchCommandIds["ToggleCaseSensitiveCommandId"] = "toggleSearchCaseSensitive";
    SearchCommandIds["ToggleWholeWordCommandId"] = "toggleSearchWholeWord";
    SearchCommandIds["ToggleRegexCommandId"] = "toggleSearchRegex";
    SearchCommandIds["TogglePreserveCaseId"] = "toggleSearchPreserveCase";
    SearchCommandIds["AddCursorsAtSearchResults"] = "addCursorsAtSearchResults";
    SearchCommandIds["RevealInSideBarForSearchResults"] = "search.action.revealInSideBar";
    SearchCommandIds["ReplaceInFilesActionId"] = "workbench.action.replaceInFiles";
    SearchCommandIds["ShowAllSymbolsActionId"] = "workbench.action.showAllSymbols";
    SearchCommandIds["QuickTextSearchActionId"] = "workbench.action.quickTextSearch";
    SearchCommandIds["CancelSearchActionId"] = "search.action.cancel";
    SearchCommandIds["RefreshSearchResultsActionId"] = "search.action.refreshSearchResults";
    SearchCommandIds["FocusNextSearchResultActionId"] = "search.action.focusNextSearchResult";
    SearchCommandIds["FocusPreviousSearchResultActionId"] = "search.action.focusPreviousSearchResult";
    SearchCommandIds["ToggleSearchOnTypeActionId"] = "workbench.action.toggleSearchOnType";
    SearchCommandIds["CollapseSearchResultsActionId"] = "search.action.collapseSearchResults";
    SearchCommandIds["ExpandSearchResultsActionId"] = "search.action.expandSearchResults";
    SearchCommandIds["ExpandRecursivelyCommandId"] = "search.action.expandRecursively";
    SearchCommandIds["ClearSearchResultsActionId"] = "search.action.clearSearchResults";
    SearchCommandIds["GetSearchResultsActionId"] = "search.action.getSearchResults";
    SearchCommandIds["ViewAsTreeActionId"] = "search.action.viewAsTree";
    SearchCommandIds["ViewAsListActionId"] = "search.action.viewAsList";
    SearchCommandIds["ShowAIResultsActionId"] = "search.action.showAIResults";
    SearchCommandIds["HideAIResultsActionId"] = "search.action.hideAIResults";
    SearchCommandIds["SearchWithAIActionId"] = "search.action.searchWithAI";
    SearchCommandIds["ToggleQueryDetailsActionId"] = "workbench.action.search.toggleQueryDetails";
    SearchCommandIds["ExcludeFolderFromSearchId"] = "search.action.excludeFromSearch";
    SearchCommandIds["ExcludeFileTypeFromSearchId"] = "search.action.excludeFileTypeFromSearch";
    SearchCommandIds["IncludeFileTypeInSearchId"] = "search.action.includeFileTypeInSearch";
    SearchCommandIds["FocusNextInputActionId"] = "search.focus.nextInputBox";
    SearchCommandIds["FocusPreviousInputActionId"] = "search.focus.previousInputBox";
    SearchCommandIds["RestrictSearchToFolderId"] = "search.action.restrictSearchToFolder";
    SearchCommandIds["FindInFolderId"] = "filesExplorer.findInFolder";
    SearchCommandIds["FindInWorkspaceId"] = "filesExplorer.findInWorkspace";
})(SearchCommandIds || (SearchCommandIds = {}));
export const SearchContext = {
    SearchViewVisibleKey: new RawContextKey('searchViewletVisible', true),
    SearchViewFocusedKey: new RawContextKey('searchViewletFocus', false),
    SearchResultListFocusedKey: new RawContextKey('searchResultListFocused', true),
    InputBoxFocusedKey: new RawContextKey('inputBoxFocus', false),
    SearchInputBoxFocusedKey: new RawContextKey('searchInputBoxFocus', false),
    ReplaceInputBoxFocusedKey: new RawContextKey('replaceInputBoxFocus', false),
    PatternIncludesFocusedKey: new RawContextKey('patternIncludesInputBoxFocus', false),
    PatternExcludesFocusedKey: new RawContextKey('patternExcludesInputBoxFocus', false),
    ReplaceActiveKey: new RawContextKey('replaceActive', false),
    HasSearchResults: new RawContextKey('hasSearchResult', false),
    FirstMatchFocusKey: new RawContextKey('firstMatchFocus', false),
    FileMatchOrMatchFocusKey: new RawContextKey('fileMatchOrMatchFocus', false), // This is actually, Match or File or Folder
    FileMatchOrFolderMatchFocusKey: new RawContextKey('fileMatchOrFolderMatchFocus', false),
    FileMatchOrFolderMatchWithResourceFocusKey: new RawContextKey('fileMatchOrFolderMatchWithResourceFocus', false), // Excludes "Other files"
    FileFocusKey: new RawContextKey('fileMatchFocus', false),
    FolderFocusKey: new RawContextKey('folderMatchFocus', false),
    ResourceFolderFocusKey: new RawContextKey('folderMatchWithResourceFocus', false),
    IsEditableItemKey: new RawContextKey('isEditableItem', true),
    MatchFocusKey: new RawContextKey('matchFocus', false),
    SearchResultHeaderFocused: new RawContextKey('searchResultHeaderFocused', false),
    ViewHasSearchPatternKey: new RawContextKey('viewHasSearchPattern', false),
    ViewHasReplacePatternKey: new RawContextKey('viewHasReplacePattern', false),
    ViewHasFilePatternKey: new RawContextKey('viewHasFilePattern', false),
    ViewHasSomeCollapsibleKey: new RawContextKey('viewHasSomeCollapsibleResult', false),
    InTreeViewKey: new RawContextKey('inTreeView', false),
    hasAIResultProvider: new RawContextKey('hasAIResultProviderKey', false),
    AIResultsTitle: new RawContextKey('aiResultsTitle', false),
    AIResultsRequested: new RawContextKey('aiResultsRequested', false),
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uc3RhbnRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc2VhcmNoL2NvbW1vbi9jb25zdGFudHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRXJGLE1BQU0sQ0FBTixJQUFrQixnQkFrRGpCO0FBbERELFdBQWtCLGdCQUFnQjtJQUNqQyx3RUFBb0QsQ0FBQTtJQUNwRCxrRkFBOEQsQ0FBQTtJQUM5RCxtRkFBK0QsQ0FBQTtJQUMvRCwwREFBc0MsQ0FBQTtJQUN0QyxzRUFBa0QsQ0FBQTtJQUNsRCwyREFBdUMsQ0FBQTtJQUN2QyxnRUFBNEMsQ0FBQTtJQUM1QyxrRUFBOEMsQ0FBQTtJQUM5Qyw4REFBMEMsQ0FBQTtJQUMxQyx3RUFBb0QsQ0FBQTtJQUNwRCw4RUFBMEQsQ0FBQTtJQUMxRCw4RUFBMEQsQ0FBQTtJQUMxRCw2REFBeUMsQ0FBQTtJQUN6QywrRUFBMkQsQ0FBQTtJQUMzRCxtRkFBK0QsQ0FBQTtJQUMvRCw0RUFBd0QsQ0FBQTtJQUN4RCw4RUFBMEQsQ0FBQTtJQUMxRCxzRUFBa0QsQ0FBQTtJQUNsRCw4REFBMEMsQ0FBQTtJQUMxQyxxRUFBaUQsQ0FBQTtJQUNqRCwyRUFBdUQsQ0FBQTtJQUN2RCxxRkFBaUUsQ0FBQTtJQUNqRSw4RUFBMEQsQ0FBQTtJQUMxRCw4RUFBMEQsQ0FBQTtJQUMxRCxnRkFBNEQsQ0FBQTtJQUM1RCxpRUFBNkMsQ0FBQTtJQUM3Qyx1RkFBbUUsQ0FBQTtJQUNuRSx5RkFBcUUsQ0FBQTtJQUNyRSxpR0FBNkUsQ0FBQTtJQUM3RSxzRkFBa0UsQ0FBQTtJQUNsRSx5RkFBcUUsQ0FBQTtJQUNyRSxxRkFBaUUsQ0FBQTtJQUNqRSxrRkFBOEQsQ0FBQTtJQUM5RCxtRkFBK0QsQ0FBQTtJQUMvRCwr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