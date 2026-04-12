/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { getExcludes, ISearchService, VIEW_ID } from '../../../services/search/common/search.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IChatContextPickService, picksWithPromiseFn } from '../../chat/browser/attachments/chatContextPickService.js';
import { SearchContext } from '../common/constants.js';
import { SearchView } from './searchView.js';
import { basename, dirname, joinPath, relativePath } from '../../../../base/common/resources.js';
import { compare } from '../../../../base/common/strings.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { FileKind, FileType, IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IHistoryService } from '../../../services/history/common/history.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import * as glob from '../../../../base/common/glob.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { SymbolsQuickAccessProvider } from './symbolsQuickAccess.js';
import { SymbolKinds } from '../../../../editor/common/languages.js';
import { isSupportedChatFileScheme } from '../../chat/common/constants.js';
let SearchChatContextContribution = class SearchChatContextContribution extends Disposable {
    static { this.ID = 'workbench.contributions.searchChatContextContribution'; }
    constructor(instantiationService, chatContextPickService) {
        super();
        this._store.add(chatContextPickService.registerChatContextItem(instantiationService.createInstance(SearchViewResultChatContextPick)));
        this._store.add(chatContextPickService.registerChatContextItem(instantiationService.createInstance(FilesAndFoldersPickerPick)));
        this._store.add(chatContextPickService.registerChatContextItem(this._store.add(instantiationService.createInstance(SymbolsContextPickerPick))));
    }
};
SearchChatContextContribution = __decorate([
    __param(0, IInstantiationService),
    __param(1, IChatContextPickService)
], SearchChatContextContribution);
export { SearchChatContextContribution };
let SearchViewResultChatContextPick = class SearchViewResultChatContextPick {
    constructor(_contextKeyService, _viewsService, _labelService) {
        this._contextKeyService = _contextKeyService;
        this._viewsService = _viewsService;
        this._labelService = _labelService;
        this.type = 'valuePick';
        this.label = localize('chatContext.searchResults', 'Search Results');
        this.icon = Codicon.search;
        this.ordinal = 500;
    }
    isEnabled(widget) {
        return !!SearchContext.HasSearchResults.getValue(this._contextKeyService) && !!widget.attachmentCapabilities.supportsSearchResultAttachments;
    }
    async asAttachment() {
        const searchView = this._viewsService.getViewWithId(VIEW_ID);
        if (!(searchView instanceof SearchView)) {
            return [];
        }
        return searchView.model.searchResult.matches().map(result => ({
            kind: 'file',
            id: result.resource.toString(),
            value: result.resource,
            name: this._labelService.getUriBasenameLabel(result.resource),
        }));
    }
};
SearchViewResultChatContextPick = __decorate([
    __param(0, IContextKeyService),
    __param(1, IViewsService),
    __param(2, ILabelService)
], SearchViewResultChatContextPick);
let SymbolsContextPickerPick = class SymbolsContextPickerPick {
    constructor(_instantiationService) {
        this._instantiationService = _instantiationService;
        this.type = 'pickerPick';
        this.label = localize('symbols', 'Symbols...');
        this.icon = Codicon.symbolField;
        this.ordinal = -200;
    }
    dispose() {
        this._provider?.dispose();
    }
    isEnabled(widget) {
        return !!widget.attachmentCapabilities.supportsSymbolAttachments;
    }
    asPicker() {
        return {
            placeholder: localize('select.symb', "Select a symbol"),
            picks: picksWithPromiseFn((query, token) => {
                this._provider ??= this._instantiationService.createInstance(SymbolsQuickAccessProvider);
                return this._provider.getSymbolPicks(query, undefined, token).then(symbolItems => {
                    const result = [];
                    for (const item of symbolItems) {
                        if (!item.symbol) {
                            continue;
                        }
                        const attachment = {
                            kind: 'symbol',
                            id: JSON.stringify(item.symbol.location),
                            value: item.symbol.location,
                            symbolKind: item.symbol.kind,
                            icon: SymbolKinds.toIcon(item.symbol.kind),
                            fullName: item.label,
                            name: item.symbol.name,
                        };
                        result.push({
                            label: item.symbol.name,
                            iconClass: ThemeIcon.asClassName(SymbolKinds.toIcon(item.symbol.kind)),
                            asAttachment() {
                                return attachment;
                            }
                        });
                    }
                    return result;
                });
            }),
        };
    }
};
SymbolsContextPickerPick = __decorate([
    __param(0, IInstantiationService)
], SymbolsContextPickerPick);
let FilesAndFoldersPickerPick = class FilesAndFoldersPickerPick {
    constructor(_searchService, _labelService, _modelService, _languageService, _configurationService, _workspaceService, _fileService, _historyService, _instantiationService) {
        this._searchService = _searchService;
        this._labelService = _labelService;
        this._modelService = _modelService;
        this._languageService = _languageService;
        this._configurationService = _configurationService;
        this._workspaceService = _workspaceService;
        this._fileService = _fileService;
        this._historyService = _historyService;
        this._instantiationService = _instantiationService;
        this.type = 'pickerPick';
        this.label = localize('chatContext.folder', 'Files & Folders...');
        this.icon = Codicon.folder;
        this.ordinal = 600;
    }
    asPicker() {
        return {
            placeholder: localize('chatContext.attach.files.placeholder', "Search file or folder by name"),
            picks: picksWithPromiseFn(async (value, token) => {
                const workspaces = this._workspaceService.getWorkspace().folders.map(folder => folder.uri);
                const defaultItems = [];
                (await getTopLevelFolders(workspaces, this._fileService)).forEach(uri => defaultItems.push(this._createPickItem(uri, FileKind.FOLDER)));
                this._historyService.getHistory()
                    .filter(a => a.resource && this._instantiationService.invokeFunction(accessor => isSupportedChatFileScheme(accessor, a.resource.scheme)))
                    .slice(0, 30)
                    .forEach(uri => defaultItems.push(this._createPickItem(uri.resource, FileKind.FILE)));
                if (value === '') {
                    return defaultItems;
                }
                const result = [];
                await Promise.all(workspaces.map(async (workspace) => {
                    const { folders, files } = await searchFilesAndFolders(workspace, value, true, token, undefined, this._configurationService, this._searchService);
                    for (const folder of folders) {
                        result.push(this._createPickItem(folder, FileKind.FOLDER));
                    }
                    for (const file of files) {
                        result.push(this._createPickItem(file, FileKind.FILE));
                    }
                }));
                result.sort((a, b) => compare(a.label, b.label));
                return result;
            }),
        };
    }
    _createPickItem(resource, kind) {
        return {
            label: basename(resource),
            description: this._labelService.getUriLabel(dirname(resource), { relative: true }),
            iconClasses: getIconClasses(this._modelService, this._languageService, resource, kind),
            asAttachment: () => {
                return {
                    kind: kind === FileKind.FILE ? 'file' : 'directory',
                    id: resource.toString(),
                    value: resource,
                    name: basename(resource),
                };
            }
        };
    }
};
FilesAndFoldersPickerPick = __decorate([
    __param(0, ISearchService),
    __param(1, ILabelService),
    __param(2, IModelService),
    __param(3, ILanguageService),
    __param(4, IConfigurationService),
    __param(5, IWorkspaceContextService),
    __param(6, IFileService),
    __param(7, IHistoryService),
    __param(8, IInstantiationService)
], FilesAndFoldersPickerPick);
export async function searchFilesAndFolders(workspace, pattern, fuzzyMatch, token, cacheKey, configurationService, searchService) {
    const segmentMatchPattern = fuzzyMatch ? fuzzyMatchingGlobPattern(pattern) : continousMatchingGlobPattern(pattern);
    const searchExcludePattern = getExcludes(configurationService.getValue({ resource: workspace })) || {};
    const searchOptions = {
        folderQueries: [{
                folder: workspace,
                disregardIgnoreFiles: configurationService.getValue('explorer.excludeGitIgnore'),
            }],
        type: 1 /* QueryType.File */,
        shouldGlobMatchFilePattern: true,
        cacheKey,
        excludePattern: searchExcludePattern,
        sortByScore: true,
        ignoreGlobCase: true,
    };
    let searchResult;
    try {
        searchResult = await searchService.fileSearch({ ...searchOptions, filePattern: `{**/${segmentMatchPattern}/**,**/${segmentMatchPattern}}` }, token);
    }
    catch (e) {
        if (!isCancellationError(e)) {
            throw e;
        }
    }
    if (!searchResult || token?.isCancellationRequested) {
        return { files: [], folders: [] };
    }
    const fileResources = searchResult.results.map(result => result.resource);
    const folderResources = getMatchingFoldersFromFiles(fileResources, workspace, segmentMatchPattern);
    return { folders: folderResources, files: fileResources };
}
function fuzzyMatchingGlobPattern(pattern) {
    if (!pattern) {
        return '*';
    }
    return '*' + pattern.split('').join('*') + '*';
}
function continousMatchingGlobPattern(pattern) {
    if (!pattern) {
        return '*';
    }
    return '*' + pattern + '*';
}
// TODO: remove this and have support from the search service
function getMatchingFoldersFromFiles(resources, workspace, segmentMatchPattern) {
    const uniqueFolders = new ResourceSet();
    for (const resource of resources) {
        const relativePathToRoot = relativePath(workspace, resource);
        if (!relativePathToRoot) {
            throw new Error('Resource is not a child of the workspace');
        }
        let dirResource = workspace;
        const stats = relativePathToRoot.split('/').slice(0, -1);
        for (const stat of stats) {
            dirResource = dirResource.with({ path: `${dirResource.path}/${stat}` });
            uniqueFolders.add(dirResource);
        }
    }
    const matchingFolders = [];
    for (const folderResource of uniqueFolders) {
        const stats = folderResource.path.split('/');
        const dirStat = stats[stats.length - 1];
        if (!dirStat || !glob.match(segmentMatchPattern, dirStat, { ignoreCase: true })) {
            continue;
        }
        matchingFolders.push(folderResource);
    }
    return matchingFolders;
}
export async function getTopLevelFolders(workspaces, fileService) {
    const folders = [];
    for (const workspace of workspaces) {
        const fileSystemProvider = fileService.getProvider(workspace.scheme);
        if (!fileSystemProvider) {
            continue;
        }
        const entries = await fileSystemProvider.readdir(workspace);
        for (const [name, type] of entries) {
            const entryResource = joinPath(workspace, name);
            if (type === FileType.Directory) {
                folders.push(entryResource);
            }
        }
    }
    return folders;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoQ2hhdENvbnRleHQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zZWFyY2gvYnJvd3Nlci9zZWFyY2hDaGF0Q29udGV4dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRTNFLE9BQU8sRUFBRSxXQUFXLEVBQXFELGNBQWMsRUFBYSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMvSixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDL0UsT0FBTyxFQUFzRCx1QkFBdUIsRUFBeUIsa0JBQWtCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUVsTSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDdkQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBRTdDLE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFN0QsT0FBTyxF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