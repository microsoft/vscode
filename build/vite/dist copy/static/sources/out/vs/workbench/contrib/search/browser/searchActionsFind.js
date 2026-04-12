/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { dirname } from '../../../../base/common/resources.js';
import * as nls from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IListService } from '../../../../platform/list/browser/listService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import * as Constants from '../common/constants.js';
import * as SearchEditorConstants from '../../searchEditor/browser/constants.js';
import { IsSessionsWindowContext } from '../../../common/contextkeys.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { resolveResourcesForSearchIncludes } from '../../../services/search/common/queryBuilder.js';
import { getMultiSelectedResources, IExplorerService } from '../../files/browser/files.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ExplorerFolderContext, ExplorerRootContext, FilesExplorerFocusCondition, VIEWLET_ID as VIEWLET_ID_FILES } from '../../files/common/files.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { category, getElementsToOperateOn, getSearchView, openSearchView } from './searchActionsBase.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { IHistoryService } from '../../../services/history/common/history.js';
import { Schemas } from '../../../../base/common/network.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { forcedExpandRecursively } from './searchActionsTopBar.js';
import { isSearchTreeFileMatch, isSearchTreeMatch } from './searchTreeModel/searchTreeCommon.js';
//#endregion
registerAction2(class RestrictSearchToFolderAction extends Action2 {
    constructor() {
        super({
            id: "search.action.restrictSearchToFolder" /* Constants.SearchCommandIds.RestrictSearchToFolderId */,
            title: nls.localize2('restrictResultsToFolder', "Restrict Search to Folder"),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.ResourceFolderFocusKey),
                primary: 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 36 /* KeyCode.KeyF */,
            },
            menu: [
                {
                    id: MenuId.SearchContext,
                    group: 'search',
                    order: 3,
                    when: ContextKeyExpr.and(Constants.SearchContext.ResourceFolderFocusKey)
                }
            ]
        });
    }
    async run(accessor, folderMatch) {
        await searchWithFolderCommand(accessor, false, true, undefined, folderMatch);
    }
});
registerAction2(class ExpandSelectedTreeCommandAction extends Action2 {
    constructor() {
        super({
            id: "search.action.expandRecursively" /* Constants.SearchCommandIds.ExpandRecursivelyCommandId */,
            title: nls.localize('search.expandRecursively', "Expand Recursively"),
            category,
            menu: [{
                    id: MenuId.SearchContext,
                    when: ContextKeyExpr.and(Constants.SearchContext.FolderFocusKey, Constants.SearchContext.HasSearchResults),
                    group: 'search',
                    order: 4
                }]
        });
    }
    async run(accessor) {
        return expandSelectSubtree(accessor);
    }
});
registerAction2(class ExcludeFolderFromSearchAction extends Action2 {
    constructor() {
        super({
            id: "search.action.excludeFromSearch" /* Constants.SearchCommandIds.ExcludeFolderFromSearchId */,
            title: nls.localize2('excludeFolderFromSearch', "Exclude Folder from Search"),
            category,
            menu: [
                {
                    id: MenuId.SearchContext,
                    group: 'search',
                    order: 4,
                    when: Constants.SearchContext.ResourceFolderFocusKey
                }
            ]
        });
    }
    async run(accessor, folderMatch) {
        await searchWithFolderCommand(accessor, false, false, undefined, folderMatch);
    }
});
registerAction2(class ExcludeFileTypeFromSearchAction extends Action2 {
    constructor() {
        super({
            id: "search.action.excludeFileTypeFromSearch" /* Constants.SearchCommandIds.ExcludeFileTypeFromSearchId */,
            title: nls.localize2('excludeFileTypeFromSearch', "Exclude File Type from Search"),
            category,
            menu: [
                {
                    id: MenuId.SearchContext,
                    group: 'search',
                    order: 5,
                    when: Constants.SearchContext.FileFocusKey
                }
            ]
        });
    }
    async run(accessor, fileMatch) {
        await modifySearchFileTypePattern(accessor, fileMatch, true);
    }
});
registerAction2(class IncludeFileTypeInSearchAction extends Action2 {
    constructor() {
        super({
            id: "search.action.includeFileTypeInSearch" /* Constants.SearchCommandIds.IncludeFileTypeInSearchId */,
            title: nls.localize2('includeFileTypeInSearch', "Include File Type from Search"),
            category,
            menu: [
                {
                    id: MenuId.SearchContext,
                    group: 'search',
                    order: 6,
                    when: Constants.SearchContext.FileFocusKey
                }
            ]
        });
    }
    async run(accessor, fileMatch) {
        await modifySearchFileTypePattern(accessor, fileMatch, false);
    }
});
registerAction2(class RevealInSideBarForSearchResultsAction extends Action2 {
    constructor() {
        super({
            id: "search.action.revealInSideBar" /* Constants.SearchCommandIds.RevealInSideBarForSearchResults */,
            title: nls.localize2('revealInSideBar', "Reveal in Explorer View"),
            category,
            menu: [{
                    id: MenuId.SearchContext,
                    when: ContextKeyExpr.and(Constants.SearchContext.FileFocusKey, Constants.SearchContext.HasSearchResults),
                    group: 'search_3',
                    order: 1
                }]
        });
    }
    async run(accessor, args) {
        const paneCompositeService = accessor.get(IPaneCompositePartService);
        const explorerService = accessor.get(IExplorerService);
        const contextService = accessor.get(IWorkspaceContextService);
        const searchView = getSearchView(accessor.get(IViewsService));
        if (!searchView) {
            return;
        }
        let fileMatch;
        if (isSearchTreeFileMatch(args)) {
            fileMatch = args;
        }
        else {
            args = searchView.getControl().getFocus()[0];
            return;
        }
        paneCompositeService.openPaneComposite(VIEWLET_ID_FILES, 0 /* ViewContainerLocation.Sidebar */, false).then((viewlet) => {
            if (!viewlet) {
                return;
            }
            const explorerViewContainer = viewlet.getViewPaneContainer();
            const uri = fileMatch.resource;
            if (uri && contextService.isInsideWorkspace(uri)) {
                const explorerView = explorerViewContainer.getExplorerView();
                explorerView.setExpanded(true);
                explorerService.select(uri, true).then(() => explorerView.focus(), onUnexpectedError);
            }
        });
    }
});
// Find in Files by default is the same as View: Show Search, but can be configured to open a search editor instead with the `search.mode` binding
registerAction2(class FindInFilesAction extends Action2 {
    constructor() {
        super({
            id: "workbench.action.findInFiles" /* Constants.SearchCommandIds.FindInFilesActionId */,
            title: {
                ...nls.localize2('findInFiles', "Find in Files"),
                mnemonicTitle: nls.localize({ key: 'miFindInFiles', comment: ['&& denotes a mnemonic'] }, "Find &&in Files"),
            },
            metadata: {
                description: nls.localize('findInFiles.description', "Open a workspace search"),
                args: [
                    {
                        name: nls.localize('findInFiles.args', "A set of options for the search"),
                        schema: {
                            type: 'object',
                            properties: {
                                query: { 'type': 'string' },
                                replace: { 'type': 'string' },
                                preserveCase: { 'type': 'boolean' },
                                triggerSearch: { 'type': 'boolean' },
                                filesToInclude: { 'type': 'string' },
                                filesToExclude: { 'type': 'string' },
                                isRegex: { 'type': 'boolean' },
                                isCaseSensitive: { 'type': 'boolean' },
                                matchWholeWord: { 'type': 'boolean' },
                                useExcludeSettingsAndIgnoreFiles: { 'type': 'boolean' },
                                onlyOpenEditors: { 'type': 'boolean' },
                                showIncludesExcludes: { 'type': 'boolean' }
                            }
                        }
                    },
                ]
            },
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 36 /* KeyCode.KeyF */,
            },
            menu: [{
                    id: MenuId.MenubarEditMenu,
                    group: '4_find_global',
                    order: 1,
                    when: IsSessionsWindowContext.negate(),
                }],
            f1: true,
            precondition: IsSessionsWindowContext.negate()
        });
    }
    async run(accessor, args = {}) {
        findInFilesCommand(accessor, args);
    }
});
registerAction2(class FindInFolderAction extends Action2 {
    // from explorer
    constructor() {
        super({
            id: "filesExplorer.findInFolder" /* Constants.SearchCommandIds.FindInFolderId */,
            title: nls.localize2('findInFolder', "Find in Folder..."),
            category,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerFolderContext),
                primary: 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 36 /* KeyCode.KeyF */,
            },
            menu: [
                {
                    id: MenuId.ExplorerContext,
                    group: '4_search',
                    order: 10,
                    when: ExplorerFolderContext
                }
            ]
        });
    }
    async run(accessor, resource) {
        await searchWithFolderCommand(accessor, true, true, resource);
    }
});
registerAction2(class FindInWorkspaceAction extends Action2 {
    // from explorer
    constructor() {
        super({
            id: "filesExplorer.findInWorkspace" /* Constants.SearchCommandIds.FindInWorkspaceId */,
            title: nls.localize2('findInWorkspace', "Find in Workspace..."),
            category,
            menu: [
                {
                    id: MenuId.ExplorerContext,
                    group: '4_search',
                    order: 10,
                    when: ContextKeyExpr.and(ExplorerRootContext, ExplorerFolderContext.toNegated())
                }
            ]
        });
    }
    async run(accessor) {
        const searchConfig = accessor.get(IConfigurationService).getValue().search;
        const mode = searchConfig.mode;
        if (mode === 'view') {
            const searchView = await openSearchView(accessor.get(IViewsService), true);
            searchView?.searchInFolders();
        }
        else {
            await accessor.get(ICommandService).executeCommand(SearchEditorConstants.OpenEditorCommandId, {
                location: mode === 'newEditor' ? 'new' : 'reuse',
                filesToInclude: '',
            });
        }
    }
});
//#region Helpers
async function expandSelectSubtree(accessor) {
    const viewsService = accessor.get(IViewsService);
    const searchView = getSearchView(viewsService);
    if (searchView) {
        const viewer = searchView.getControl();
        const selected = viewer.getFocus()[0];
        await forcedExpandRecursively(viewer, selected);
    }
}
function extractSearchFilePattern(fileName) {
    const parts = fileName.split('.');
    if (parts.length <= 1) {
        return fileName;
    }
    const extensionParts = parts.slice(1);
    return `*.${extensionParts.join('.')}`;
}
function mergeSearchPatternIfNotExists(currentPatterns, newPattern) {
    if (!currentPatterns.trim()) {
        return newPattern;
    }
    const existingPatterns = currentPatterns.split(',').map(pattern => pattern.trim()).filter(pattern => pattern.length > 0);
    if (existingPatterns.includes(newPattern)) {
        return currentPatterns;
    }
    return `${currentPatterns}, ${newPattern}`;
}
async function searchWithFolderCommand(accessor, isFromExplorer, isIncludes, resource, folderMatch) {
    const fileService = accessor.get(IFileService);
    const viewsService = accessor.get(IViewsService);
    const contextService = accessor.get(IWorkspaceContextService);
    const commandService = accessor.get(ICommandService);
    const searchConfig = accessor.get(IConfigurationService).getValue().search;
    const mode = searchConfig.mode;
    let resources;
    if (isFromExplorer) {
        resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService));
    }
    else {
        const searchView = getSearchView(viewsService);
        if (!searchView) {
            return;
        }
        resources = getMultiSelectedSearchResources(searchView.getControl(), folderMatch, searchConfig);
    }
    const resolvedResources = fileService.resolveAll(resources.map(resource => ({ resource }))).then(results => {
        const folders = [];
        results.forEach(result => {
            if (result.success && result.stat) {
                folders.push(result.stat.isDirectory ? result.stat.resource : dirname(result.stat.resource));
            }
        });
        return resolveResourcesForSearchIncludes(folders, contextService);
    });
    if (mode === 'view') {
        const searchView = await openSearchView(viewsService, true);
        if (resources && resources.length && searchView) {
            if (isIncludes) {
                searchView.searchInFolders(await resolvedResources);
            }
            else {
                searchView.searchOutsideOfFolders(await resolvedResources);
            }
        }
        return undefined;
    }
    else {
        if (isIncludes) {
            return commandService.executeCommand(SearchEditorConstants.OpenEditorCommandId, {
                filesToInclude: (await resolvedResources).join(', '),
                showIncludesExcludes: true,
                location: mode === 'newEditor' ? 'new' : 'reuse',
            });
        }
        else {
            return commandService.executeCommand(SearchEditorConstants.OpenEditorCommandId, {
                filesToExclude: (await resolvedResources).join(', '),
                showIncludesExcludes: true,
                location: mode === 'newEditor' ? 'new' : 'reuse',
            });
        }
    }
}
function getMultiSelectedSearchResources(viewer, currElement, sortConfig) {
    return getElementsToOperateOn(viewer, currElement, sortConfig)
        .map((renderableMatch) => ((isSearchTreeMatch(renderableMatch)) ? null : renderableMatch.resource))
        .filter((renderableMatch) => (renderableMatch !== null));
}
export async function findInFilesCommand(accessor, _args = {}) {
    const searchConfig = accessor.get(IConfigurationService).getValue().search;
    const viewsService = accessor.get(IViewsService);
    const commandService = accessor.get(ICommandService);
    const args = {};
    if (Object.keys(_args).length !== 0) {
        // resolve variables in the same way as in
        // https://github.com/microsoft/vscode/blob/8b76efe9d317d50cb5b57a7658e09ce6ebffaf36/src/vs/workbench/contrib/searchEditor/browser/searchEditorActions.ts#L152-L158
        const configurationResolverService = accessor.get(IConfigurationResolverService);
        const historyService = accessor.get(IHistoryService);
        const workspaceContextService = accessor.get(IWorkspaceContextService);
        const activeWorkspaceRootUri = historyService.getLastActiveWorkspaceRoot();
        const filteredActiveWorkspaceRootUri = activeWorkspaceRootUri?.scheme === Schemas.file || activeWorkspaceRootUri?.scheme === Schemas.vscodeRemote ? activeWorkspaceRootUri : undefined;
        const lastActiveWorkspaceRoot = filteredActiveWorkspaceRootUri ? workspaceContextService.getWorkspaceFolder(filteredActiveWorkspaceRootUri) ?? undefined : undefined;
        for (const entry of Object.entries(_args)) {
            const name = entry[0];
            const value = entry[1];
            if (value !== undefined) {
                // eslint-disable-next-line local/code-no-any-casts
                args[name] = (typeof value === 'string') ? await configurationResolverService.resolveAsync(lastActiveWorkspaceRoot, value) : value;
            }
        }
    }
    const mode = searchConfig.mode;
    if (mode === 'view') {
        openSearchView(viewsService, false).then(openedView => {
            if (openedView) {
                const searchAndReplaceWidget = openedView.searchAndReplaceWidget;
                searchAndReplaceWidget.toggleReplace(typeof args.replace === 'string');
                let updatedText = false;
                if (typeof args.query !== 'string') {
                    updatedText = openedView.updateTextFromFindWidgetOrSelection({ allowUnselectedWord: typeof args.replace !== 'string' });
                }
                openedView.setSearchParameters(args);
                if (typeof args.showIncludesExcludes === 'boolean') {
                    openedView.toggleQueryDetails(false, args.showIncludesExcludes);
                }
                openedView.searchAndReplaceWidget.focus(undefined, updatedText, updatedText);
            }
        });
    }
    else {
        const convertArgs = (args) => ({
            location: mode === 'newEditor' ? 'new' : 'reuse',
            query: args.query,
            filesToInclude: args.filesToInclude,
            filesToExclude: args.filesToExclude,
            matchWholeWord: args.matchWholeWord,
            isCaseSensitive: args.isCaseSensitive,
            isRegexp: args.isRegex,
            useExcludeSettingsAndIgnoreFiles: args.useExcludeSettingsAndIgnoreFiles,
            onlyOpenEditors: args.onlyOpenEditors,
            showIncludesExcludes: !!(args.filesToExclude || args.filesToExclude || !args.useExcludeSettingsAndIgnoreFiles),
        });
        commandService.executeCommand(SearchEditorConstants.OpenEditorCommandId, convertArgs(args));
    }
}
async function modifySearchFileTypePattern(accessor, fileMatch, isExclude) {
    const viewsService = accessor.get(IViewsService);
    const searchView = getSearchView(viewsService);
    if (!searchView || !fileMatch) {
        return;
    }
    const resource = fileMatch.resource;
    const fileName = resource.path.split('/').pop() || '';
    const newPattern = extractSearchFilePattern(fileName);
    const patternWidget = isExclude ? searchView.searchExcludePattern : searchView.searchIncludePattern;
    const currentPatterns = patternWidget.getValue();
    const updatedPatterns = mergeSearchPatternIfNotExists(currentPatterns, newPattern);
    if (updatedPatterns !== currentPatterns) {
        patternWidget.setValue(updatedPatterns);
        searchView.toggleQueryDetails(false, true);
        searchView.triggerQueryChange({ preserveFocus: false });
    }
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoQWN0aW9uc0ZpbmQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zZWFyY2gvYnJvd3Nlci9zZWFyY2hBY3Rpb25zRmluZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDL0QsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbkYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFbkcsT0FBTyxFQUFFLFlBQVksRUFBc0MsTUFBTSxrREFBa0QsQ0FBQztBQUVwSCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDL0UsT0FBTyxLQUFLLFNBQVMsTUFBTSx3QkFBd0IsQ0FBQztBQUNwRCxPQUFPLEtBQUsscUJBQXFCLE1BQU0seUNBQXlDLENBQUM7QUFJakYsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDekUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBR2xHLE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzNGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUM5RixPQUFPLEVBQUUscUJB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