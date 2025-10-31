/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { getExcludes, IFileQuery, ISearchComplete, ISearchConfiguration, ISearchService, QueryType, VIEW_ID } from '../../../services/search/common/search.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IChatContextPickerItem, IChatContextPickerPickItem, IChatContextPickService, IChatContextValueItem, picksWithPromiseFn } from '../../chat/browser/chatContextPickService.js';
import { IChatRequestVariableEntry, ISymbolVariableEntry } from '../../chat/common/chatVariableEntries.js';
import { SearchContext } from '../common/constants.js';
import { SearchView } from './searchView.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { basename, dirname, joinPath, relativePath } from '../../../../base/common/resources.js';
import { compare } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
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
import { IChatWidget } from '../../chat/browser/chat.js';

export class SearchChatContextContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contributions.searchChatContextContribution';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatContextPickService chatContextPickService: IChatContextPickService
	) {
		super();
		this._store.add(chatContextPickService.registerChatContextItem(instantiationService.createInstance(SearchViewResultChatContextPick)));
		this._store.add(chatContextPickService.registerChatContextItem(instantiationService.createInstance(FilesAndFoldersPickerPick)));
		this._store.add(chatContextPickService.registerChatContextItem(this._store.add(instantiationService.createInstance(SymbolsContextPickerPick))));
	}
}

class SearchViewResultChatContextPick implements IChatContextValueItem {

	readonly type = 'valuePick';
	readonly label: string = localize('chatContext.searchResults', 'Search Results');
	readonly icon: ThemeIcon = Codicon.search;
	readonly ordinal = 500;

	constructor(
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IViewsService private readonly _viewsService: IViewsService,
		@ILabelService private readonly _labelService: ILabelService,
	) { }

	isEnabled(widget: IChatWidget): Promise<boolean> | boolean {
		return !!SearchContext.HasSearchResults.getValue(this._contextKeyService) && !!widget.attachmentCapabilities.supportsSearchResultAttachments;
	}

	async asAttachment(): Promise<IChatRequestVariableEntry[]> {
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
}

class SymbolsContextPickerPick implements IChatContextPickerItem {

	readonly type = 'pickerPick';

	readonly label: string = localize('symbols', 'Symbols...');
	readonly icon: ThemeIcon = Codicon.symbolField;
	readonly ordinal = -200;

	private _provider: SymbolsQuickAccessProvider | undefined;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	dispose(): void {
		this._provider?.dispose();
	}

	isEnabled(widget: IChatWidget): boolean {
		return !!widget.attachmentCapabilities.supportsSymbolAttachments;
	}
	asPicker() {

		return {
			placeholder: localize('select.symb', "Select a symbol"),
			picks: picksWithPromiseFn((query: string, token: CancellationToken) => {

				this._provider ??= this._instantiationService.createInstance(SymbolsQuickAccessProvider);

				return this._provider.getSymbolPicks(query, undefined, token).then(symbolItems => {
					const result: IChatContextPickerPickItem[] = [];
					for (const item of symbolItems) {
						if (!item.symbol) {
							continue;
						}

						const attachment: ISymbolVariableEntry = {
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
}

class FilesAndFoldersPickerPick implements IChatContextPickerItem {

	readonly type = 'pickerPick';
	readonly label = localize('chatContext.folder', 'Files & Folders...');
	readonly icon = Codicon.folder;
	readonly ordinal = 600;

	constructor(
		@ISearchService private readonly _searchService: ISearchService,
		@ILabelService private readonly _labelService: ILabelService,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly _workspaceService: IWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
		@IHistoryService private readonly _historyService: IHistoryService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	asPicker() {

		return {
			placeholder: localize('chatContext.attach.files.placeholder', "Search file or folder by name"),
			picks: picksWithPromiseFn(async (value, token) => {

				const workspaces = this._workspaceService.getWorkspace().folders.map(folder => folder.uri);

				const defaultItems: IChatContextPickerPickItem[] = [];
				(await getTopLevelFolders(workspaces, this._fileService)).forEach(uri => defaultItems.push(this._createPickItem(uri, FileKind.FOLDER)));
				this._historyService.getHistory()
					.filter(a => a.resource && this._instantiationService.invokeFunction(accessor => isSupportedChatFileScheme(accessor, a.resource!.scheme)))
					.slice(0, 30)
					.forEach(uri => defaultItems.push(this._createPickItem(uri.resource!, FileKind.FILE)));

				if (value === '') {
					return defaultItems;
				}

				const result: IChatContextPickerPickItem[] = [];

				await Promise.all(workspaces.map(async workspace => {
					const { folders, files } = await searchFilesAndFolders(
						workspace,
						value,
						true,
						token,
						undefined,
						this._configurationService,
						this._searchService
					);

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

	private _createPickItem(resource: URI, kind: FileKind): IChatContextPickerPickItem {
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

}
export async function searchFilesAndFolders(
	workspace: URI,
	pattern: string,
	fuzzyMatch: boolean,
	token: CancellationToken | undefined,
	cacheKey: string | undefined,
	configurationService: IConfigurationService,
	searchService: ISearchService
): Promise<{ folders: URI[]; files: URI[] }> {
	const segmentMatchPattern = caseInsensitiveGlobPattern(fuzzyMatch ? fuzzyMatchingGlobPattern(pattern) : continousMatchingGlobPattern(pattern));

	const searchExcludePattern = getExcludes(configurationService.getValue<ISearchConfiguration>({ resource: workspace })) || {};
	const searchOptions: IFileQuery = {
		folderQueries: [{
			folder: workspace,
			disregardIgnoreFiles: configurationService.getValue<boolean>('explorer.excludeGitIgnore'),
		}],
		type: QueryType.File,
		shouldGlobMatchFilePattern: true,
		cacheKey,
		excludePattern: searchExcludePattern,
		sortByScore: true,
	};

	let searchResult: ISearchComplete | undefined;
	try {
		searchResult = await searchService.fileSearch({ ...searchOptions, filePattern: `{**/${segmentMatchPattern}/**,${pattern}}` }, token);
	} catch (e) {
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

function fuzzyMatchingGlobPattern(pattern: string): string {
	if (!pattern) {
		return '*';
	}
	return '*' + pattern.split('').join('*') + '*';
}

function continousMatchingGlobPattern(pattern: string): string {
	if (!pattern) {
		return '*';
	}
	return '*' + pattern + '*';
}

function caseInsensitiveGlobPattern(pattern: string): string {
	let caseInsensitiveFilePattern = '';
	for (let i = 0; i < pattern.length; i++) {
		const char = pattern[i];
		if (/[a-zA-Z]/.test(char)) {
			caseInsensitiveFilePattern += `[${char.toLowerCase()}${char.toUpperCase()}]`;
		} else {
			caseInsensitiveFilePattern += char;
		}
	}
	return caseInsensitiveFilePattern;
}

// TODO: remove this and have support from the search service
function getMatchingFoldersFromFiles(resources: URI[], workspace: URI, segmentMatchPattern: string): URI[] {
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

	const matchingFolders: URI[] = [];
	for (const folderResource of uniqueFolders) {
		const stats = folderResource.path.split('/');
		const dirStat = stats[stats.length - 1];
		if (!dirStat || !glob.match(segmentMatchPattern, dirStat)) {
			continue;
		}

		matchingFolders.push(folderResource);
	}

	return matchingFolders;
}

export async function getTopLevelFolders(workspaces: URI[], fileService: IFileService): Promise<URI[]> {
	const folders: URI[] = [];
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
