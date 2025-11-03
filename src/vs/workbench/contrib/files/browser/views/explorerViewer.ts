/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IListAccessibilityProvider } from '../../../../../base/browser/ui/list/listWidget.js';
import * as DOM from '../../../../../base/browser/dom.js';
import * as glob from '../../../../../base/common/glob.js';
import { IListVirtualDelegate, ListDragOverEffectPosition, ListDragOverEffectType } from '../../../../../base/browser/ui/list/list.js';
import { IProgressService, ProgressLocation, } from '../../../../../platform/progress/common/progress.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IFileService, FileKind, FileOperationError, FileOperationResult, FileChangeType } from '../../../../../platform/files/common/files.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { isTemporaryWorkspace, IWorkspaceContextService, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { IDisposable, Disposable, dispose, toDisposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { IFileLabelOptions, IResourceLabel, ResourceLabels } from '../../../../browser/labels.js';
import { ITreeNode, ITreeFilter, TreeVisibility, IAsyncDataSource, ITreeSorter, ITreeDragAndDrop, ITreeDragOverReaction, TreeDragOverBubble } from '../../../../../base/browser/ui/tree/tree.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ExplorerFindProviderActive, IFilesConfiguration, UndoConfirmLevel } from '../../common/files.js';
import { dirname, joinPath, distinctParents, relativePath } from '../../../../../base/common/resources.js';
import { InputBox, MessageType } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { localize } from '../../../../../nls.js';
import { createSingleCallFunction } from '../../../../../base/common/functional.js';
import { IKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { equals, deepClone } from '../../../../../base/common/objects.js';
import * as path from '../../../../../base/common/path.js';
import { ExplorerItem, NewExplorerItem } from '../../common/explorerModel.js';
import { compareFileExtensionsDefault, compareFileNamesDefault, compareFileNamesUpper, compareFileExtensionsUpper, compareFileNamesLower, compareFileExtensionsLower, compareFileNamesUnicode, compareFileExtensionsUnicode } from '../../../../../base/common/comparers.js';
import { CodeDataTransfers, containsDragType } from '../../../../../platform/dnd/browser/dnd.js';
import { fillEditorsDragData } from '../../../../browser/dnd.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IDragAndDropData, DataTransfers } from '../../../../../base/browser/dnd.js';
import { Schemas } from '../../../../../base/common/network.js';
import { NativeDragAndDropData, ExternalElementsDragAndDropData, ElementsDragAndDropData, ListViewTargetSector } from '../../../../../base/browser/ui/list/listView.js';
import { isMacintosh, isWeb } from '../../../../../base/common/platform.js';
import { IDialogService, getFileNamesMessage } from '../../../../../platform/dialogs/common/dialogs.js';
import { IWorkspaceEditingService } from '../../../../services/workspaces/common/workspaceEditing.js';
import { URI } from '../../../../../base/common/uri.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkspaceFolderCreationData } from '../../../../../platform/workspaces/common/workspaces.js';
import { findValidPasteFileTarget } from '../fileActions.js';
import { FuzzyScore, createMatches } from '../../../../../base/common/filters.js';
import { Emitter, Event, EventMultiplexer } from '../../../../../base/common/event.js';
import { IAsyncDataTreeViewState, IAsyncFindProvider, IAsyncFindResult, IAsyncFindToggles, ITreeCompressionDelegate } from '../../../../../base/browser/ui/tree/asyncDataTree.js';
import { ICompressibleTreeRenderer } from '../../../../../base/browser/ui/tree/objectTree.js';
import { ICompressedTreeNode } from '../../../../../base/browser/ui/tree/compressedObjectTreeModel.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { isNumber } from '../../../../../base/common/types.js';
import { IEditableData } from '../../../../common/views.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { ResourceFileEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { IExplorerService } from '../files.js';
import { BrowserFileUpload, ExternalFileImport, getMultipleFilesOverwriteConfirm } from '../fileImportExport.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { WebFileSystemAccess } from '../../../../../platform/files/browser/webFileSystemAccess.js';
import { IgnoreFile } from '../../../../services/search/common/ignoreFile.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { TernarySearchTree } from '../../../../../base/common/ternarySearchTree.js';
import { defaultCountBadgeStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { timeout } from '../../../../../base/common/async.js';
import { IFilesConfigurationService } from '../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { IExplorerFileContribution, explorerFileContribRegistry } from '../explorerFileContrib.js';
import { WorkbenchCompressibleAsyncDataTree } from '../../../../../platform/list/browser/listService.js';
import { ISearchService, QueryType, getExcludes, ISearchConfiguration, ISearchComplete, IFileQuery } from '../../../../services/search/common/search.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { TreeFindMatchType, TreeFindMode } from '../../../../../base/browser/ui/tree/abstractTree.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { CountBadge } from '../../../../../base/browser/ui/countBadge/countBadge.js';
import { listFilterMatchHighlight, listFilterMatchHighlightBorder } from '../../../../../platform/theme/common/colorRegistry.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';

export class ExplorerDelegate implements IListVirtualDelegate<ExplorerItem> {

	static readonly ITEM_HEIGHT = 22;

	getHeight(element: ExplorerItem): number {
		return ExplorerDelegate.ITEM_HEIGHT;
	}

	getTemplateId(element: ExplorerItem): string {
		return FilesRenderer.ID;
	}
}

export const explorerRootErrorEmitter = new Emitter<URI>();
export class ExplorerDataSource implements IAsyncDataSource<ExplorerItem | ExplorerItem[], ExplorerItem> {

	constructor(
		private readonly fileFilter: FilesFilter,
		private readonly findProvider: ExplorerFindProvider,
		@IProgressService private readonly progressService: IProgressService,
		@IConfigurationService private readonly configService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IFileService private readonly fileService: IFileService,
		@IExplorerService private readonly explorerService: IExplorerService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IFilesConfigurationService private readonly filesConfigService: IFilesConfigurationService
	) { }

	getParent(element: ExplorerItem): ExplorerItem {
		if (element.parent) {
			return element.parent;
		}

		throw new Error('getParent only supported for cached parents');
	}

	hasChildren(element: ExplorerItem | ExplorerItem[]): boolean {
		// don't render nest parents as containing children when all the children are filtered out
		return Array.isArray(element) || element.hasChildren((stat) => this.fileFilter.filter(stat, TreeVisibility.Visible));
	}

	getChildren(element: ExplorerItem | ExplorerItem[]): ExplorerItem[] | Promise<ExplorerItem[]> {
		if (Array.isArray(element)) {
			return element;
		}

		if (this.findProvider.isShowingFilterResults()) {
			return Array.from(element.children.values());
		}

		const hasError = element.error;
		const sortOrder = this.explorerService.sortOrderConfiguration.sortOrder;
		const children = element.fetchChildren(sortOrder);
		if (Array.isArray(children)) {
			// fast path when children are known sync (i.e. nested children)
			return children;
		}
		const promise = children.then(
			children => {
				// Clear previous error decoration on root folder
				if (element instanceof ExplorerItem && element.isRoot && !element.error && hasError && this.contextService.getWorkbenchState() !== WorkbenchState.FOLDER) {
					explorerRootErrorEmitter.fire(element.resource);
				}
				return children;
			}
			, e => {

				if (element instanceof ExplorerItem && element.isRoot) {
					if (this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
						// Single folder create a dummy explorer item to show error
						const placeholder = new ExplorerItem(element.resource, this.fileService, this.configService, this.filesConfigService, undefined, undefined, false);
						placeholder.error = e;
						return [placeholder];
					} else {
						explorerRootErrorEmitter.fire(element.resource);
					}
				} else {
					// Do not show error for roots since we already use an explorer decoration to notify user
					this.notificationService.error(e);
				}

				return []; // we could not resolve any children because of an error
			});

		this.progressService.withProgress({
			location: ProgressLocation.Explorer,
			delay: this.layoutService.isRestored() ? 800 : 1500 // reduce progress visibility when still restoring
		}, _progress => promise);

		return promise;
	}
}

export class PhantomExplorerItem extends ExplorerItem {

}

interface FindHighlightLayer {
	childMatches: number;
	isMatch: boolean;
	stats: {
		[statName: string]: FindHighlightLayer;
	};
}

interface IExplorerFindHighlightTree {
	get(item: ExplorerItem): number;
	isMatch(item: ExplorerItem): boolean;
}

class ExplorerFindHighlightTree implements IExplorerFindHighlightTree {

	private readonly _tree = new Map<string, FindHighlightLayer>();
	private readonly _highlightedItems = new Map<string, ExplorerItem>();
	get highlightedItems(): ExplorerItem[] {
		return Array.from(this._highlightedItems.values());
	}

	get(item: ExplorerItem): number {
		const result = this.find(item);
		if (result === undefined) {
			return 0;
		}

		const { treeLayer, relPath } = result;
		this._highlightedItems.set(relPath, item);

		return treeLayer.childMatches;
	}

	private find(item: ExplorerItem): { treeLayer: FindHighlightLayer; relPath: string } | undefined {
		const rootLayer = this._tree.get(item.root.name);
		if (rootLayer === undefined) {
			return undefined;
		}

		const relPath = relativePath(item.root.resource, item.resource);
		if (relPath === undefined || relPath.startsWith('..')) {
			throw new Error('Resource is not a child of the root');
		}

		if (relPath === '') {
			return { treeLayer: rootLayer, relPath };
		}

		let treeLayer = rootLayer;
		for (const segment of relPath.split('/')) {
			if (!treeLayer.stats[segment]) {
				return undefined;
			}

			treeLayer = treeLayer.stats[segment];
		}

		return { treeLayer, relPath };
	}

	add(resource: URI, root: ExplorerItem): void {
		const relPath = relativePath(root.resource, resource);
		if (relPath === undefined || relPath.startsWith('..')) {
			throw new Error('Resource is not a child of the root');
		}

		let rootLayer = this._tree.get(root.name);
		if (!rootLayer) {
			rootLayer = { childMatches: 0, stats: {}, isMatch: false };
			this._tree.set(root.name, rootLayer);
		}
		rootLayer.childMatches++;

		let treeLayer = rootLayer;
		for (const stat of relPath.split('/')) {
			if (!treeLayer.stats[stat]) {
				treeLayer.stats[stat] = { childMatches: 0, stats: {}, isMatch: false };
			}

			treeLayer = treeLayer.stats[stat];
			treeLayer.childMatches++;
		}

		treeLayer.childMatches--; // the last segment is the file itself
		treeLayer.isMatch = true;
	}

	isMatch(item: ExplorerItem): boolean {
		const result = this.find(item);
		if (result === undefined) {
			return false;
		}

		const { treeLayer } = result;
		return treeLayer.isMatch;
	}

	clear(): void {
		this._tree.clear();
	}

}

export class ExplorerFindProvider implements IAsyncFindProvider<ExplorerItem> {

	private sessionId: number = 0;
	private filterSessionStartState: { viewState: IAsyncDataTreeViewState; input: ExplorerItem[] | ExplorerItem; rootsWithProviders: Set<ExplorerItem> } | undefined;
	private highlightSessionStartState: { rootsWithProviders: Set<ExplorerItem> } | undefined;
	private explorerFindActiveContextKey: IContextKey<boolean>;
	private phantomParents = new Set<ExplorerItem>();
	private findHighlightTree = new ExplorerFindHighlightTree();
	get highlightTree(): IExplorerFindHighlightTree {
		return this.findHighlightTree;
	}

	constructor(
		private readonly filesFilter: FilesFilter,
		private readonly treeProvider: () => WorkbenchCompressibleAsyncDataTree<ExplorerItem | ExplorerItem[], ExplorerItem, FuzzyScore>,
		@ISearchService private readonly searchService: ISearchService,
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFilesConfigurationService private readonly filesConfigService: IFilesConfigurationService,
		@IProgressService private readonly progressService: IProgressService,
		@IExplorerService private readonly explorerService: IExplorerService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		this.explorerFindActiveContextKey = ExplorerFindProviderActive.bindTo(contextKeyService);
	}

	isShowingFilterResults(): boolean {
		return !!this.filterSessionStartState;
	}

	isVisible(element: ExplorerItem): boolean {
		if (!this.filterSessionStartState) {
			return true;
		}

		if (this.explorerService.isEditable(element)) {
			return true;
		}

		return this.filterSessionStartState.rootsWithProviders.has(element.root) ? element.isMarkedAsFiltered() : true;
	}

	startSession(): void {
		this.sessionId++;
	}

	async endSession(): Promise<void> {
		// Restore view state
		if (this.filterSessionStartState) {
			await this.endFilterSession();
		}

		if (this.highlightSessionStartState) {
			this.endHighlightSession();
		}
	}

	async find(pattern: string, toggles: IAsyncFindToggles, token: CancellationToken): Promise<IAsyncFindResult<ExplorerItem> | undefined> {
		const promise = this.doFind(pattern, toggles, token);

		return await this.progressService.withProgress({
			location: ProgressLocation.Explorer,
			delay: 750,
		}, _progress => promise);
	}

	async doFind(pattern: string, toggles: IAsyncFindToggles, token: CancellationToken): Promise<IAsyncFindResult<ExplorerItem> | undefined> {
		if (toggles.findMode === TreeFindMode.Highlight) {
			if (this.filterSessionStartState) {
				await this.endFilterSession();
			}

			if (!this.highlightSessionStartState) {
				this.startHighlightSession();
			}

			return await this.doHighlightFind(pattern, toggles.matchType, token);
		}

		if (this.highlightSessionStartState) {
			this.endHighlightSession();
		}

		if (!this.filterSessionStartState) {
			this.startFilterSession();
		}

		return await this.doFilterFind(pattern, toggles.matchType, token);
	}

	// Filter

	private startFilterSession(): void {
		const tree = this.treeProvider();
		const input = tree.getInput();
		if (!input) {
			return;
		}

		const roots = this.explorerService.roots.filter(root => this.searchSupportsScheme(root.resource.scheme));
		this.filterSessionStartState = { viewState: tree.getViewState(), input, rootsWithProviders: new Set(roots) };

		this.explorerFindActiveContextKey.set(true);
	}

	async doFilterFind(pattern: string, matchType: TreeFindMatchType, token: CancellationToken): Promise<IAsyncFindResult<ExplorerItem> | undefined> {
		if (!this.filterSessionStartState) {
			throw new Error('ExplorerFindProvider: no session state');
		}

		const roots = Array.from(this.filterSessionStartState.rootsWithProviders);
		const searchResults = await this.getSearchResults(pattern, roots, matchType, token);

		if (token.isCancellationRequested) {
			return undefined;
		}

		this.clearPhantomElements();
		for (const { explorerRoot, files, directories } of searchResults) {
			this.addWorkspaceFilterResults(explorerRoot, files, directories);
		}

		const tree = this.treeProvider();
		await tree.setInput(this.filterSessionStartState.input);

		const hitMaxResults = searchResults.some(({ hitMaxResults }) => hitMaxResults);
		return {
			isMatch: (item: ExplorerItem) => item.isMarkedAsFiltered(),
			matchCount: searchResults.reduce((acc, { files, directories }) => acc + files.length + directories.length, 0),
			warningMessage: hitMaxResults ? localize('searchMaxResultsWarning', "The result set only contains a subset of all matches. Be more specific in your search to narrow down the results.") : undefined
		};
	}

	private addWorkspaceFilterResults(root: ExplorerItem, files: URI[], directories: URI[]): void {
		const results = [
			...files.map(file => ({ resource: file, isDirectory: false })),
			...directories.map(directory => ({ resource: directory, isDirectory: true }))
		];

		for (const { resource, isDirectory } of results) {
			const element = root.find(resource);
			if (element && element.root === root) {
				// File is already in the model
				element.markItemAndParentsAsFiltered();
				continue;
			}

			// File is not in the model, create phantom items for the file and it's parents
			const phantomElements = this.createPhantomItems(resource, root, isDirectory);
			if (phantomElements.length === 0) {
				throw new Error('Phantom item was not created even though it is not in the model');
			}

			// Store the first ancestor of the file which is already present in the model
			const firstPhantomParent = phantomElements[0].parent!;
			if (!(firstPhantomParent instanceof PhantomExplorerItem)) {
				this.phantomParents.add(firstPhantomParent);
			}

			const phantomFileElement = phantomElements[phantomElements.length - 1];
			phantomFileElement.markItemAndParentsAsFiltered();
		}
	}

	private createPhantomItems(resource: URI, root: ExplorerItem, resourceIsDirectory: boolean): PhantomExplorerItem[] {
		const relativePathToRoot = relativePath(root.resource, resource);
		if (!relativePathToRoot) {
			throw new Error('Resource is not a child of the root');
		}

		const phantomElements: PhantomExplorerItem[] = [];

		let currentItem = root;
		let currentResource = root.resource;
		const pathSegments = relativePathToRoot.split('/');
		for (const stat of pathSegments) {
			currentResource = currentResource.with({ path: `${currentResource.path}/${stat}` });

			let child = currentItem.getChild(stat);
			if (!child) {
				const isDirectory = pathSegments[pathSegments.length - 1] === stat ? resourceIsDirectory : true;
				child = new PhantomExplorerItem(currentResource, this.fileService, this.configurationService, this.filesConfigService, currentItem, isDirectory);
				currentItem.addChild(child);
				phantomElements.push(child as PhantomExplorerItem);
			}

			currentItem = child;
		}

		return phantomElements;
	}

	async endFilterSession(): Promise<void> {
		this.clearPhantomElements();

		this.explorerFindActiveContextKey.set(false);

		// Restore view state
		if (!this.filterSessionStartState) {
			throw new Error('ExplorerFindProvider: no session state to restore');
		}

		const tree = this.treeProvider();
		await tree.setInput(this.filterSessionStartState.input, this.filterSessionStartState.viewState);

		this.filterSessionStartState = undefined;
		this.explorerService.refresh();
	}

	private clearPhantomElements(): void {
		for (const phantomParent of this.phantomParents) {
			// Clear phantom nodes from model
			phantomParent.forgetChildren();
		}
		this.phantomParents.clear();
		this.explorerService.roots.forEach(root => root.unmarkItemAndChildren());
	}

	// Highlight

	private startHighlightSession(): void {
		const roots = this.explorerService.roots.filter(root => this.searchSupportsScheme(root.resource.scheme));
		this.highlightSessionStartState = { rootsWithProviders: new Set(roots) };
	}

	async doHighlightFind(pattern: string, matchType: TreeFindMatchType, token: CancellationToken): Promise<IAsyncFindResult<ExplorerItem> | undefined> {
		if (!this.highlightSessionStartState) {
			throw new Error('ExplorerFindProvider: no highlight session state');
		}

		const roots = Array.from(this.highlightSessionStartState.rootsWithProviders);
		const searchResults = await this.getSearchResults(pattern, roots, matchType, token);

		if (token.isCancellationRequested) {
			return undefined;
		}

		this.clearHighlights();
		for (const { explorerRoot, files, directories } of searchResults) {
			this.addWorkspaceHighlightResults(explorerRoot, files.concat(directories));
		}

		const hitMaxResults = searchResults.some(({ hitMaxResults }) => hitMaxResults);
		return {
			isMatch: (item: ExplorerItem) => this.findHighlightTree.isMatch(item) || (this.findHighlightTree.get(item) > 0 && this.treeProvider().isCollapsed(item)),
			matchCount: searchResults.reduce((acc, { files, directories }) => acc + files.length + directories.length, 0),
			warningMessage: hitMaxResults ? localize('searchMaxResultsWarning', "The result set only contains a subset of all matches. Be more specific in your search to narrow down the results.") : undefined
		};
	}

	private addWorkspaceHighlightResults(root: ExplorerItem, resources: URI[]): void {
		const highlightedDirectories = new Set<ExplorerItem>();
		const storeDirectories = (item: ExplorerItem | undefined) => {
			while (item) {
				highlightedDirectories.add(item);
				item = item.parent;
			}
		};

		for (const resource of resources) {
			const element = root.find(resource);
			if (element && element.root === root) {
				// File is already in the model
				this.findHighlightTree.add(resource, root);
				storeDirectories(element.parent);
				continue;
			}

			const firstParent = findFirstParent(resource, root);
			if (firstParent) {
				this.findHighlightTree.add(resource, root);
				storeDirectories(firstParent.parent);
			}
		}

		const tree = this.treeProvider();
		for (const directory of highlightedDirectories) {
			if (tree.hasNode(directory)) {
				tree.rerender(directory);
			}
		}
	}

	private endHighlightSession(): void {
		this.highlightSessionStartState = undefined;
		this.clearHighlights();
	}

	private clearHighlights(): void {
		const tree = this.treeProvider();
		for (const item of this.findHighlightTree.highlightedItems) {
			if (tree.hasNode(item)) {
				tree.rerender(item);
			}
		}
		this.findHighlightTree.clear();
	}

	// Search

	private searchSupportsScheme(scheme: string): boolean {
		// Limited by the search API
		if (scheme !== Schemas.file && scheme !== Schemas.vscodeRemote) {
			return false;
		}
		return this.searchService.schemeHasFileSearchProvider(scheme);
	}

	private async getSearchResults(pattern: string, roots: ExplorerItem[], matchType: TreeFindMatchType, token: CancellationToken): Promise<{ explorerRoot: ExplorerItem; files: URI[]; directories: URI[]; hitMaxResults: boolean }[]> {
		const patternLowercase = pattern.toLowerCase();
		const isFuzzyMatch = matchType === TreeFindMatchType.Fuzzy;
		return await Promise.all(roots.map((root, index) => this.searchInWorkspace(patternLowercase, root, index, isFuzzyMatch, token)));
	}

	private async searchInWorkspace(patternLowercase: string, root: ExplorerItem, rootIndex: number, isFuzzyMatch: boolean, token: CancellationToken): Promise<{ explorerRoot: ExplorerItem; files: URI[]; directories: URI[]; hitMaxResults: boolean }> {
		const segmentMatchPattern = caseInsensitiveGlobPattern(isFuzzyMatch ? fuzzyMatchingGlobPattern(patternLowercase) : continousMatchingGlobPattern(patternLowercase));

		const searchExcludePattern = getExcludes(this.configurationService.getValue<ISearchConfiguration>({ resource: root.resource })) || {};
		const searchOptions: IFileQuery = {
			folderQueries: [{
				folder: root.resource,
				disregardIgnoreFiles: !this.configurationService.getValue<boolean>('explorer.excludeGitIgnore'),
			}],
			type: QueryType.File,
			shouldGlobMatchFilePattern: true,
			cacheKey: `explorerfindprovider:${root.name}:${rootIndex}:${this.sessionId}`,
			excludePattern: searchExcludePattern,
		};

		let fileResults: ISearchComplete | undefined;
		let folderResults: ISearchComplete | undefined;
		try {
			[fileResults, folderResults] = await Promise.all([
				this.searchService.fileSearch({ ...searchOptions, filePattern: `**/${segmentMatchPattern}`, maxResults: 512 }, token),
				this.searchService.fileSearch({ ...searchOptions, filePattern: `**/${segmentMatchPattern}/**` }, token)
			]);
		} catch (e) {
			if (!isCancellationError(e)) {
				throw e;
			}
		}

		if (!fileResults || !folderResults || token.isCancellationRequested) {
			return { explorerRoot: root, files: [], directories: [], hitMaxResults: false };
		}

		const fileResultResources = fileResults.results.map(result => result.resource);
		const directoryResources = getMatchingDirectoriesFromFiles(folderResults.results.map(result => result.resource), root, segmentMatchPattern);

		const filteredFileResources = fileResultResources.filter(resource => !this.filesFilter.isIgnored(resource, root.resource, false));
		const filteredDirectoryResources = directoryResources.filter(resource => !this.filesFilter.isIgnored(resource, root.resource, true));

		return { explorerRoot: root, files: filteredFileResources, directories: filteredDirectoryResources, hitMaxResults: !!fileResults.limitHit || !!folderResults.limitHit };
	}
}

function getMatchingDirectoriesFromFiles(resources: URI[], root: ExplorerItem, segmentMatchPattern: string): URI[] {
	const uniqueDirectories = new ResourceSet();
	for (const resource of resources) {
		const relativePathToRoot = relativePath(root.resource, resource);
		if (!relativePathToRoot) {
			throw new Error('Resource is not a child of the root');
		}

		let dirResource = root.resource;
		const stats = relativePathToRoot.split('/').slice(0, -1);
		for (const stat of stats) {
			dirResource = dirResource.with({ path: `${dirResource.path}/${stat}` });
			uniqueDirectories.add(dirResource);
		}
	}

	const matchingDirectories: URI[] = [];
	for (const dirResource of uniqueDirectories) {
		const stats = dirResource.path.split('/');
		const dirStat = stats[stats.length - 1];
		if (!dirStat || !glob.match(segmentMatchPattern, dirStat)) {
			continue;
		}

		matchingDirectories.push(dirResource);
	}

	return matchingDirectories;
}

function findFirstParent(resource: URI, root: ExplorerItem): ExplorerItem | undefined {
	const relativePathToRoot = relativePath(root.resource, resource);
	if (!relativePathToRoot) {
		throw new Error('Resource is not a child of the root');
	}

	let currentItem = root;
	let currentResource = root.resource;
	const pathSegments = relativePathToRoot.split('/');
	for (const stat of pathSegments) {
		currentResource = currentResource.with({ path: `${currentResource.path}/${stat}` });
		const child = currentItem.getChild(stat);
		if (!child) {
			return currentItem;
		}

		currentItem = child;
	}

	return undefined;
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

export interface ICompressedNavigationController {
	readonly current: ExplorerItem;
	readonly currentId: string;
	readonly items: ExplorerItem[];
	readonly labels: HTMLElement[];
	readonly index: number;
	readonly count: number;
	readonly onDidChange: Event<void>;
	previous(): void;
	next(): void;
	first(): void;
	last(): void;
	setIndex(index: number): void;
	updateCollapsed(collapsed: boolean): void;
}

export class CompressedNavigationController implements ICompressedNavigationController, IDisposable {

	static ID = 0;

	private _index: number;
	private _labels!: HTMLElement[];
	private _updateLabelDisposable: IDisposable;

	get index(): number { return this._index; }
	get count(): number { return this.items.length; }
	get current(): ExplorerItem { return this.items[this._index]; }
	get currentId(): string { return `${this.id}_${this.index}`; }
	get labels(): HTMLElement[] { return this._labels; }

	private _onDidChange = new Emitter<void>();
	readonly onDidChange = this._onDidChange.event;

	constructor(private id: string, readonly items: ExplorerItem[], templateData: IFileTemplateData, private depth: number, private collapsed: boolean) {
		this._index = items.length - 1;

		this.updateLabels(templateData);
		this._updateLabelDisposable = templateData.label.onDidRender(() => this.updateLabels(templateData));
	}

	private updateLabels(templateData: IFileTemplateData): void {
		this._labels = Array.from(templateData.container.querySelectorAll('.label-name'));
		let parents = '';
		for (let i = 0; i < this.labels.length; i++) {
			const ariaLabel = parents.length ? `${this.items[i].name}, compact, ${parents}` : this.items[i].name;
			this.labels[i].setAttribute('aria-label', ariaLabel);
			this.labels[i].setAttribute('aria-level', `${this.depth + i}`);
			parents = parents.length ? `${this.items[i].name} ${parents}` : this.items[i].name;
		}
		this.updateCollapsed(this.collapsed);

		if (this._index < this.labels.length) {
			this.labels[this._index].classList.add('active');
		}
	}

	previous(): void {
		if (this._index <= 0) {
			return;
		}

		this.setIndex(this._index - 1);
	}

	next(): void {
		if (this._index >= this.items.length - 1) {
			return;
		}

		this.setIndex(this._index + 1);
	}

	first(): void {
		if (this._index === 0) {
			return;
		}

		this.setIndex(0);
	}

	last(): void {
		if (this._index === this.items.length - 1) {
			return;
		}

		this.setIndex(this.items.length - 1);
	}

	setIndex(index: number): void {
		if (index < 0 || index >= this.items.length) {
			return;
		}

		this.labels[this._index].classList.remove('active');
		this._index = index;
		this.labels[this._index].classList.add('active');

		this._onDidChange.fire();
	}

	updateCollapsed(collapsed: boolean): void {
		this.collapsed = collapsed;
		for (let i = 0; i < this.labels.length; i++) {
			this.labels[i].setAttribute('aria-expanded', collapsed ? 'false' : 'true');
		}
	}

	dispose(): void {
		this._onDidChange.dispose();
		this._updateLabelDisposable.dispose();
	}
}

export interface IFileTemplateData {
	readonly templateDisposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
	readonly label: IResourceLabel;
	readonly container: HTMLElement;
	readonly contribs: IExplorerFileContribution[];
	currentContext?: ExplorerItem;
}

export class FilesRenderer implements ICompressibleTreeRenderer<ExplorerItem, FuzzyScore, IFileTemplateData>, IListAccessibilityProvider<ExplorerItem>, IDisposable {
	static readonly ID = 'file';

	private config: IFilesConfiguration;
	private configListener: IDisposable;
	private compressedNavigationControllers = new Map<ExplorerItem, CompressedNavigationController[]>();

	private _onDidChangeActiveDescendant = new EventMultiplexer<void>();
	readonly onDidChangeActiveDescendant = this._onDidChangeActiveDescendant.event;

	constructor(
		container: HTMLElement,
		private labels: ResourceLabels,
		private highlightTree: IExplorerFindHighlightTree,
		private updateWidth: (stat: ExplorerItem) => void,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IThemeService private readonly themeService: IThemeService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExplorerService private readonly explorerService: IExplorerService,
		@ILabelService private readonly labelService: ILabelService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		this.config = this.configurationService.getValue<IFilesConfiguration>();

		const updateOffsetStyles = () => {
			const indent = this.configurationService.getValue<number>('workbench.tree.indent');
			const offset = Math.max(22 - indent, 0); // derived via inspection
			container.style.setProperty(`--vscode-explorer-align-offset-margin-left`, `${offset}px`);
		};

		this.configListener = this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('explorer')) {
				this.config = this.configurationService.getValue();
			}
			if (e.affectsConfiguration('workbench.tree.indent')) {
				updateOffsetStyles();
			}
		});

		updateOffsetStyles();
	}

	getWidgetAriaLabel(): string {
		return localize('treeAriaLabel', "Files Explorer");
	}

	get templateId(): string {
		return FilesRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IFileTemplateData {
		const templateDisposables = new DisposableStore();
		const label = templateDisposables.add(this.labels.create(container, { supportHighlights: true }));
		templateDisposables.add(label.onDidRender(() => {
			try {
				if (templateData.currentContext) {
					this.updateWidth(templateData.currentContext);
				}
			} catch (e) {
				// noop since the element might no longer be in the tree, no update of width necessary
			}
		}));

		const contribs = explorerFileContribRegistry.create(this.instantiationService, container, templateDisposables);
		templateDisposables.add(explorerFileContribRegistry.onDidRegisterDescriptor(d => {
			const contr = d.create(this.instantiationService, container);
			contribs.push(templateDisposables.add(contr));
			contr.setResource(templateData.currentContext?.resource);
		}));

		const templateData: IFileTemplateData = { templateDisposables, elementDisposables: templateDisposables.add(new DisposableStore()), label, container, contribs };
		return templateData;
	}

	renderElement(node: ITreeNode<ExplorerItem, FuzzyScore>, index: number, templateData: IFileTemplateData): void {
		const stat = node.element;
		templateData.currentContext = stat;

		const editableData = this.explorerService.getEditableData(stat);

		templateData.label.element.classList.remove('compressed');

		// File Label
		if (!editableData) {
			templateData.label.element.style.display = 'flex';
			this.renderStat(stat, stat.name, undefined, node.filterData, templateData);
		}

		// Input Box
		else {
			templateData.label.element.style.display = 'none';
			templateData.contribs.forEach(c => c.setResource(undefined));
			templateData.elementDisposables.add(this.renderInputBox(templateData.container, stat, editableData));
		}
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<ExplorerItem>, FuzzyScore>, index: number, templateData: IFileTemplateData): void {
		const stat = node.element.elements[node.element.elements.length - 1];
		templateData.currentContext = stat;

		const editable = node.element.elements.filter(e => this.explorerService.isEditable(e));
		const editableData = editable.length === 0 ? undefined : this.explorerService.getEditableData(editable[0]);

		// File Label
		if (!editableData) {
			templateData.label.element.classList.add('compressed');
			templateData.label.element.style.display = 'flex';

			const id = `compressed-explorer_${CompressedNavigationController.ID++}`;
			const labels = node.element.elements.map(e => e.name);

			// If there is a fuzzy score, we need to adjust the offset of the score
			// to align with the last stat of the compressed label
			let fuzzyScore = node.filterData;
			if (fuzzyScore && fuzzyScore.length > 2) {
				const filterDataOffset = labels.join('/').length - labels[labels.length - 1].length;
				fuzzyScore = [fuzzyScore[0], fuzzyScore[1] + filterDataOffset, ...fuzzyScore.slice(2)];
			}

			this.renderStat(stat, labels, id, fuzzyScore, templateData);

			const compressedNavigationController = new CompressedNavigationController(id, node.element.elements, templateData, node.depth, node.collapsed);
			templateData.elementDisposables.add(compressedNavigationController);

			const nodeControllers = this.compressedNavigationControllers.get(stat) ?? [];
			this.compressedNavigationControllers.set(stat, [...nodeControllers, compressedNavigationController]);

			// accessibility
			templateData.elementDisposables.add(this._onDidChangeActiveDescendant.add(compressedNavigationController.onDidChange));

			templateData.elementDisposables.add(DOM.addDisposableListener(templateData.container, 'mousedown', e => {
				const result = getIconLabelNameFromHTMLElement(e.target);

				if (result) {
					compressedNavigationController.setIndex(result.index);
				}
			}));

			templateData.elementDisposables.add(toDisposable(() => {
				const nodeControllers = this.compressedNavigationControllers.get(stat) ?? [];
				const renderedIndex = nodeControllers.findIndex(controller => controller === compressedNavigationController);

				if (renderedIndex < 0) {
					throw new Error('Disposing unknown navigation controller');
				}

				if (nodeControllers.length === 1) {
					this.compressedNavigationControllers.delete(stat);
				} else {
					nodeControllers.splice(renderedIndex, 1);
				}
			}));
		}

		// Input Box
		else {
			templateData.label.element.classList.remove('compressed');
			templateData.label.element.style.display = 'none';
			templateData.contribs.forEach(c => c.setResource(undefined));
			templateData.elementDisposables.add(this.renderInputBox(templateData.container, editable[0], editableData));
		}
	}

	private renderStat(stat: ExplorerItem, label: string | string[], domId: string | undefined, filterData: FuzzyScore | undefined, templateData: IFileTemplateData): void {
		templateData.label.element.style.display = 'flex';
		const extraClasses = ['explorer-item'];
		if (this.explorerService.isCut(stat)) {
			extraClasses.push('cut');
		}

		// Offset nested children unless folders have both chevrons and icons, otherwise alignment breaks
		const theme = this.themeService.getFileIconTheme();

		// Hack to always render chevrons for file nests, or else may not be able to identify them.
		const twistieContainer = templateData.container.parentElement?.parentElement?.querySelector('.monaco-tl-twistie');
		twistieContainer?.classList.toggle('force-twistie', stat.hasNests && theme.hidesExplorerArrows);

		// when explorer arrows are hidden or there are no folder icons, nests get misaligned as they are forced to have arrows and files typically have icons
		// Apply some CSS magic to get things looking as reasonable as possible.
		const themeIsUnhappyWithNesting = theme.hasFileIcons && (theme.hidesExplorerArrows || !theme.hasFolderIcons);
		const realignNestedChildren = stat.nestedParent && themeIsUnhappyWithNesting;
		templateData.contribs.forEach(c => c.setResource(stat.resource));
		templateData.label.setResource({ resource: stat.resource, name: label }, {
			fileKind: stat.isRoot ? FileKind.ROOT_FOLDER : stat.isDirectory ? FileKind.FOLDER : FileKind.FILE,
			extraClasses: realignNestedChildren ? [...extraClasses, 'align-nest-icon-with-parent-icon'] : extraClasses,
			fileDecorations: this.config.explorer.decorations,
			matches: createMatches(filterData),
			separator: this.labelService.getSeparator(stat.resource.scheme, stat.resource.authority),
			domId
		});

		const highlightResults = stat.isDirectory ? this.highlightTree.get(stat) : 0;
		if (highlightResults > 0) {
			const badge = new CountBadge(templateData.label.element.lastElementChild as HTMLElement, {}, { ...defaultCountBadgeStyles, badgeBackground: asCssVariable(listFilterMatchHighlight), badgeBorder: asCssVariable(listFilterMatchHighlightBorder) });
			badge.setCount(highlightResults);
			badge.setTitleFormat(localize('explorerHighlightFolderBadgeTitle', "Directory contains {0} matches", highlightResults));
			templateData.elementDisposables.add(badge);
		}
		templateData.label.element.classList.toggle('highlight-badge', highlightResults > 0);
	}

	private renderInputBox(container: HTMLElement, stat: ExplorerItem, editableData: IEditableData): IDisposable {

		// Use a file label only for the icon next to the input box
		const label = this.labels.create(container);
		const extraClasses = ['explorer-item', 'explorer-item-edited'];
		const fileKind = stat.isRoot ? FileKind.ROOT_FOLDER : stat.isDirectory ? FileKind.FOLDER : FileKind.FILE;

		const theme = this.themeService.getFileIconTheme();
		const themeIsUnhappyWithNesting = theme.hasFileIcons && (theme.hidesExplorerArrows || !theme.hasFolderIcons);
		const realignNestedChildren = stat.nestedParent && themeIsUnhappyWithNesting;

		const labelOptions: IFileLabelOptions = {
			hidePath: true,
			hideLabel: true,
			fileKind,
			extraClasses: realignNestedChildren ? [...extraClasses, 'align-nest-icon-with-parent-icon'] : extraClasses,
		};


		const parent = stat.name ? dirname(stat.resource) : stat.resource;
		const value = stat.name || '';

		label.setFile(joinPath(parent, value || ' '), labelOptions); // Use icon for ' ' if name is empty.

		// hack: hide label
		(label.element.firstElementChild as HTMLElement).style.display = 'none';

		// Input field for name
		const inputBox = new InputBox(label.element, this.contextViewService, {
			validationOptions: {
				validation: (value) => {
					const message = editableData.validationMessage(value);
					if (!message || message.severity !== Severity.Error) {
						return null;
					}

					return {
						content: message.content,
						formatContent: true,
						type: MessageType.ERROR
					};
				}
			},
			ariaLabel: localize('fileInputAriaLabel', "Type file name. Press Enter to confirm or Escape to cancel."),
			inputBoxStyles: defaultInputBoxStyles,
		});

		const lastDot = value.lastIndexOf('.');
		let currentSelectionState = 'prefix';

		inputBox.value = value;
		inputBox.focus();
		inputBox.select({ start: 0, end: lastDot > 0 && !stat.isDirectory ? lastDot : value.length });

		const done = createSingleCallFunction((success: boolean, finishEditing: boolean) => {
			label.element.style.display = 'none';
			const value = inputBox.value;
			dispose(toDispose);
			label.element.remove();
			if (finishEditing) {
				editableData.onFinish(value, success);
			}
		});

		const showInputBoxNotification = () => {
			if (inputBox.isInputValid()) {
				const message = editableData.validationMessage(inputBox.value);
				if (message) {
					inputBox.showMessage({
						content: message.content,
						formatContent: true,
						type: message.severity === Severity.Info ? MessageType.INFO : message.severity === Severity.Warning ? MessageType.WARNING : MessageType.ERROR
					});
				} else {
					inputBox.hideMessage();
				}
			}
		};
		showInputBoxNotification();

		const toDispose = [
			inputBox,
			inputBox.onDidChange(value => {
				label.setFile(joinPath(parent, value || ' '), labelOptions); // update label icon while typing!
			}),
			DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_DOWN, (e: IKeyboardEvent) => {
				if (e.equals(KeyCode.F2)) {
					const dotIndex = inputBox.value.lastIndexOf('.');
					if (stat.isDirectory || dotIndex === -1) {
						return;
					}
					if (currentSelectionState === 'prefix') {
						currentSelectionState = 'all';
						inputBox.select({ start: 0, end: inputBox.value.length });
					} else if (currentSelectionState === 'all') {
						currentSelectionState = 'suffix';
						inputBox.select({ start: dotIndex + 1, end: inputBox.value.length });
					} else {
						currentSelectionState = 'prefix';
						inputBox.select({ start: 0, end: dotIndex });
					}
				} else if (e.equals(KeyCode.Enter)) {
					if (!inputBox.validate()) {
						done(true, true);
					}
				} else if (e.equals(KeyCode.Escape)) {
					done(false, true);
				}
			}),
			DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_UP, (e: IKeyboardEvent) => {
				showInputBoxNotification();
			}),
			DOM.addDisposableListener(inputBox.inputElement, DOM.EventType.BLUR, async () => {
				while (true) {
					await timeout(0);

					const ownerDocument = inputBox.inputElement.ownerDocument;
					if (!ownerDocument.hasFocus()) {
						break;
					} if (DOM.isActiveElement(inputBox.inputElement)) {
						return;
					} else if (DOM.isHTMLElement(ownerDocument.activeElement) && DOM.hasParentWithClass(ownerDocument.activeElement, 'context-view')) {
						await Event.toPromise(this.contextMenuService.onDidHideContextMenu);
					} else {
						break;
					}
				}

				done(inputBox.isInputValid(), true);
			}),
			label
		];

		return toDisposable(() => {
			done(false, false);
		});
	}

	disposeElement(element: ITreeNode<ExplorerItem, FuzzyScore>, index: number, templateData: IFileTemplateData): void {
		templateData.currentContext = undefined;
		templateData.elementDisposables.clear();
	}

	disposeCompressedElements(node: ITreeNode<ICompressedTreeNode<ExplorerItem>, FuzzyScore>, index: number, templateData: IFileTemplateData): void {
		templateData.currentContext = undefined;
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: IFileTemplateData): void {
		templateData.templateDisposables.dispose();
	}

	getCompressedNavigationController(stat: ExplorerItem): ICompressedNavigationController[] | undefined {
		return this.compressedNavigationControllers.get(stat);
	}

	// IAccessibilityProvider

	getAriaLabel(element: ExplorerItem): string {
		return element.name;
	}

	getAriaLevel(element: ExplorerItem): number {
		// We need to comput aria level on our own since children of compact folders will otherwise have an incorrect level	#107235
		let depth = 0;
		let parent = element.parent;
		while (parent) {
			parent = parent.parent;
			depth++;
		}

		if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
			depth = depth + 1;
		}

		return depth;
	}

	getActiveDescendantId(stat: ExplorerItem): string | undefined {
		return this.compressedNavigationControllers.get(stat)?.[0]?.currentId ?? undefined;
	}

	dispose(): void {
		this.configListener.dispose();
	}
}

interface CachedParsedExpression {
	original: glob.IExpression;
	parsed: glob.ParsedExpression;
}

/**
 * Respects files.exclude setting in filtering out content from the explorer.
 * Makes sure that visible editors are always shown in the explorer even if they are filtered out by settings.
 */
export class FilesFilter implements ITreeFilter<ExplorerItem, FuzzyScore> {
	private hiddenExpressionPerRoot = new Map<string, CachedParsedExpression>();
	private editorsAffectingFilter = new Set<EditorInput>();
	private _onDidChange = new Emitter<void>();
	private toDispose: IDisposable[] = [];
	// List of ignoreFile resources. Used to detect changes to the ignoreFiles.
	private ignoreFileResourcesPerRoot = new Map<string, ResourceSet>();
	// Ignore tree per root. Similar to `hiddenExpressionPerRoot`
	// Note: URI in the ternary search tree is the URI of the folder containing the ignore file
	// It is not the ignore file itself. This is because of the way the IgnoreFile works and nested paths
	private ignoreTreesPerRoot = new Map<string, TernarySearchTree<URI, IgnoreFile>>();

	constructor(
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExplorerService private readonly explorerService: IExplorerService,
		@IEditorService private readonly editorService: IEditorService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IFileService private readonly fileService: IFileService
	) {
		this.toDispose.push(this.contextService.onDidChangeWorkspaceFolders(() => this.updateConfiguration()));
		this.toDispose.push(this.configurationService.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('files.exclude') || e.affectsConfiguration('explorer.excludeGitIgnore')) {
				this.updateConfiguration();
			}
		}));
		this.toDispose.push(this.fileService.onDidFilesChange(e => {
			// Check to see if the update contains any of the ignoreFileResources
			for (const [root, ignoreFileResourceSet] of this.ignoreFileResourcesPerRoot.entries()) {
				ignoreFileResourceSet.forEach(async ignoreResource => {
					if (e.contains(ignoreResource, FileChangeType.UPDATED)) {
						await this.processIgnoreFile(root, ignoreResource, true);
					}
					if (e.contains(ignoreResource, FileChangeType.DELETED)) {
						this.ignoreTreesPerRoot.get(root)?.delete(dirname(ignoreResource));
						ignoreFileResourceSet.delete(ignoreResource);
						this._onDidChange.fire();
					}
				});
			}
		}));
		this.toDispose.push(this.editorService.onDidVisibleEditorsChange(() => {
			const editors = this.editorService.visibleEditors;
			let shouldFire = false;

			for (const e of editors) {
				if (!e.resource) {
					continue;
				}

				const stat = this.explorerService.findClosest(e.resource);
				if (stat?.isExcluded) {
					// A filtered resource suddenly became visible since user opened an editor
					shouldFire = true;
					break;
				}
			}

			for (const e of this.editorsAffectingFilter) {
				if (!editors.includes(e)) {
					// Editor that was affecting filtering is no longer visible
					shouldFire = true;
					break;
				}
			}

			if (shouldFire) {
				this.editorsAffectingFilter.clear();
				this._onDidChange.fire();
			}
		}));
		this.updateConfiguration();
	}

	get onDidChange(): Event<void> {
		return this._onDidChange.event;
	}

	private updateConfiguration(): void {
		let shouldFire = false;
		let updatedGitIgnoreSetting = false;
		this.contextService.getWorkspace().folders.forEach(folder => {
			const configuration = this.configurationService.getValue<IFilesConfiguration>({ resource: folder.uri });
			const excludesConfig: glob.IExpression = configuration?.files?.exclude || Object.create(null);
			const parseIgnoreFile: boolean = configuration.explorer.excludeGitIgnore;

			// If we should be parsing ignoreFiles for this workspace and don't have an ignore tree initialize one
			if (parseIgnoreFile && !this.ignoreTreesPerRoot.has(folder.uri.toString())) {
				updatedGitIgnoreSetting = true;
				this.ignoreFileResourcesPerRoot.set(folder.uri.toString(), new ResourceSet());
				this.ignoreTreesPerRoot.set(folder.uri.toString(), TernarySearchTree.forUris((uri) => this.uriIdentityService.extUri.ignorePathCasing(uri)));
			}

			// If we shouldn't be parsing ignore files but have an ignore tree, clear the ignore tree
			if (!parseIgnoreFile && this.ignoreTreesPerRoot.has(folder.uri.toString())) {
				updatedGitIgnoreSetting = true;
				this.ignoreFileResourcesPerRoot.delete(folder.uri.toString());
				this.ignoreTreesPerRoot.delete(folder.uri.toString());
			}

			if (!shouldFire) {
				const cached = this.hiddenExpressionPerRoot.get(folder.uri.toString());
				shouldFire = !cached || !equals(cached.original, excludesConfig);
			}

			const excludesConfigCopy = deepClone(excludesConfig); // do not keep the config, as it gets mutated under our hoods

			this.hiddenExpressionPerRoot.set(folder.uri.toString(), { original: excludesConfigCopy, parsed: glob.parse(excludesConfigCopy) });
		});

		if (shouldFire || updatedGitIgnoreSetting) {
			this.editorsAffectingFilter.clear();
			this._onDidChange.fire();
		}
	}

	/**
	 * Given a .gitignore file resource, processes the resource and adds it to the ignore tree which hides explorer items
	 * @param root The root folder of the workspace as a string. Used for lookup key for ignore tree and resource list
	 * @param ignoreFileResource The resource of the .gitignore file
	 * @param update Whether or not we're updating an existing ignore file. If true it deletes the old entry
	 */
	private async processIgnoreFile(root: string, ignoreFileResource: URI, update?: boolean) {
		// Get the name of the directory which the ignore file is in
		const dirUri = dirname(ignoreFileResource);
		const ignoreTree = this.ignoreTreesPerRoot.get(root);
		if (!ignoreTree) {
			return;
		}

		// Don't process a directory if we already have it in the tree
		if (!update && ignoreTree.has(dirUri)) {
			return;
		}
		// Maybe we need a cancellation token here in case it's super long?
		const content = await this.fileService.readFile(ignoreFileResource);

		// If it's just an update we update the contents keeping all references the same
		if (update) {
			const ignoreFile = ignoreTree.get(dirUri);
			ignoreFile?.updateContents(content.value.toString());
		} else {
			// Otherwise we create a new ignorefile and add it to the tree
			const ignoreParent = ignoreTree.findSubstr(dirUri);
			const ignoreFile = new IgnoreFile(content.value.toString(), dirUri.path, ignoreParent);
			ignoreTree.set(dirUri, ignoreFile);
			// If we haven't seen this resource before then we need to add it to the list of resources we're tracking
			if (!this.ignoreFileResourcesPerRoot.get(root)?.has(ignoreFileResource)) {
				this.ignoreFileResourcesPerRoot.get(root)?.add(ignoreFileResource);
			}
		}

		// Notify the explorer of the change so we may ignore these files
		this._onDidChange.fire();
	}

	filter(stat: ExplorerItem, parentVisibility: TreeVisibility): boolean {
		// Add newly visited .gitignore files to the ignore tree
		if (stat.name === '.gitignore' && this.ignoreTreesPerRoot.has(stat.root.resource.toString())) {
			this.processIgnoreFile(stat.root.resource.toString(), stat.resource, false);
			return true;
		}

		return this.isVisible(stat, parentVisibility);
	}

	private isVisible(stat: ExplorerItem, parentVisibility: TreeVisibility): boolean {
		stat.isExcluded = false;
		if (parentVisibility === TreeVisibility.Hidden) {
			stat.isExcluded = true;
			return false;
		}
		if (this.explorerService.getEditableData(stat)) {
			return true; // always visible
		}

		// Hide those that match Hidden Patterns
		const cached = this.hiddenExpressionPerRoot.get(stat.root.resource.toString());
		const globMatch = cached?.parsed(path.relative(stat.root.resource.path, stat.resource.path), stat.name, name => !!(stat.parent?.getChild(name)));
		// Small optimization to only run isHiddenResource (traverse gitIgnore) if the globMatch from fileExclude returned nothing
		const isHiddenResource = globMatch ? true : this.isIgnored(stat.resource, stat.root.resource, stat.isDirectory);
		if (isHiddenResource || stat.parent?.isExcluded) {
			stat.isExcluded = true;
			const editors = this.editorService.visibleEditors;
			const editor = editors.find(e => e.resource && this.uriIdentityService.extUri.isEqualOrParent(e.resource, stat.resource));
			if (editor && stat.root === this.explorerService.findClosestRoot(stat.resource)) {
				this.editorsAffectingFilter.add(editor);
				return true; // Show all opened files and their parents
			}

			return false; // hidden through pattern
		}

		return true;
	}

	isIgnored(resource: URI, rootResource: URI, isDirectory: boolean): boolean {
		const ignoreFile = this.ignoreTreesPerRoot.get(rootResource.toString())?.findSubstr(resource);
		const isIncludedInTraversal = ignoreFile?.isPathIncludedInTraversal(resource.path, isDirectory);

		// Doing !undefined returns true and we want it to be false when undefined because that means it's not included in the ignore file
		return isIncludedInTraversal === undefined ? false : !isIncludedInTraversal;
	}

	dispose(): void {
		dispose(this.toDispose);
	}
}

// Explorer Sorter
export class FileSorter implements ITreeSorter<ExplorerItem> {

	constructor(
		@IExplorerService private readonly explorerService: IExplorerService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService
	) { }

	compare(statA: ExplorerItem, statB: ExplorerItem): number {
		// Do not sort roots
		if (statA.isRoot) {
			if (statB.isRoot) {
				const workspaceA = this.contextService.getWorkspaceFolder(statA.resource);
				const workspaceB = this.contextService.getWorkspaceFolder(statB.resource);
				return workspaceA && workspaceB ? (workspaceA.index - workspaceB.index) : -1;
			}

			return -1;
		}

		if (statB.isRoot) {
			return 1;
		}

		const sortOrder = this.explorerService.sortOrderConfiguration.sortOrder;
		const lexicographicOptions = this.explorerService.sortOrderConfiguration.lexicographicOptions;
		const reverse = this.explorerService.sortOrderConfiguration.reverse;
		if (reverse) {
			[statA, statB] = [statB, statA];
		}

		let compareFileNames;
		let compareFileExtensions;
		switch (lexicographicOptions) {
			case 'upper':
				compareFileNames = compareFileNamesUpper;
				compareFileExtensions = compareFileExtensionsUpper;
				break;
			case 'lower':
				compareFileNames = compareFileNamesLower;
				compareFileExtensions = compareFileExtensionsLower;
				break;
			case 'unicode':
				compareFileNames = compareFileNamesUnicode;
				compareFileExtensions = compareFileExtensionsUnicode;
				break;
			default:
				// 'default'
				compareFileNames = compareFileNamesDefault;
				compareFileExtensions = compareFileExtensionsDefault;
		}

		// Sort Directories
		switch (sortOrder) {
			case 'type':
				if (statA.isDirectory && !statB.isDirectory) {
					return -1;
				}

				if (statB.isDirectory && !statA.isDirectory) {
					return 1;
				}

				if (statA.isDirectory && statB.isDirectory) {
					return compareFileNames(statA.name, statB.name);
				}

				break;

			case 'filesFirst':
				if (statA.isDirectory && !statB.isDirectory) {
					return 1;
				}

				if (statB.isDirectory && !statA.isDirectory) {
					return -1;
				}

				break;

			case 'foldersNestsFiles':
				if (statA.isDirectory && !statB.isDirectory) {
					return -1;
				}

				if (statB.isDirectory && !statA.isDirectory) {
					return 1;
				}

				if (statA.hasNests && !statB.hasNests) {
					return -1;
				}

				if (statB.hasNests && !statA.hasNests) {
					return 1;
				}

				break;

			case 'mixed':
				break; // not sorting when "mixed" is on

			default: /* 'default', 'modified' */
				if (statA.isDirectory && !statB.isDirectory) {
					return -1;
				}

				if (statB.isDirectory && !statA.isDirectory) {
					return 1;
				}

				break;
		}

		// Sort Files
		switch (sortOrder) {
			case 'type':
				return compareFileExtensions(statA.name, statB.name);

			case 'modified':
				if (statA.mtime !== statB.mtime) {
					return (statA.mtime && statB.mtime && statA.mtime < statB.mtime) ? 1 : -1;
				}

				return compareFileNames(statA.name, statB.name);

			default: /* 'default', 'mixed', 'filesFirst' */
				return compareFileNames(statA.name, statB.name);
		}
	}
}

export class FileDragAndDrop implements ITreeDragAndDrop<ExplorerItem> {
	private static readonly CONFIRM_DND_SETTING_KEY = 'explorer.confirmDragAndDrop';

	private compressedDragOverElement: HTMLElement | undefined;
	private compressedDropTargetDisposable: IDisposable = Disposable.None;

	private readonly disposables = new DisposableStore();
	private dropEnabled = false;

	constructor(
		private isCollapsed: (item: ExplorerItem) => boolean,
		@IExplorerService private explorerService: IExplorerService,
		@IEditorService private editorService: IEditorService,
		@IDialogService private dialogService: IDialogService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IFileService private fileService: IFileService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService
	) {
		const updateDropEnablement = (e: IConfigurationChangeEvent | undefined) => {
			if (!e || e.affectsConfiguration('explorer.enableDragAndDrop')) {
				this.dropEnabled = this.configurationService.getValue('explorer.enableDragAndDrop');
			}
		};
		updateDropEnablement(undefined);
		this.disposables.add(this.configurationService.onDidChangeConfiguration(e => updateDropEnablement(e)));
	}

	onDragOver(data: IDragAndDropData, target: ExplorerItem | undefined, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): boolean | ITreeDragOverReaction {
		if (!this.dropEnabled) {
			return false;
		}

		// Compressed folders
		if (target) {
			const compressedTarget = FileDragAndDrop.getCompressedStatFromDragEvent(target, originalEvent);

			if (compressedTarget) {
				const iconLabelName = getIconLabelNameFromHTMLElement(originalEvent.target);

				if (iconLabelName && iconLabelName.index < iconLabelName.count - 1) {
					const result = this.handleDragOver(data, compressedTarget, targetIndex, targetSector, originalEvent);

					if (result) {
						if (iconLabelName.element !== this.compressedDragOverElement) {
							this.compressedDragOverElement = iconLabelName.element;
							this.compressedDropTargetDisposable.dispose();
							this.compressedDropTargetDisposable = toDisposable(() => {
								iconLabelName.element.classList.remove('drop-target');
								this.compressedDragOverElement = undefined;
							});

							iconLabelName.element.classList.add('drop-target');
						}

						return typeof result === 'boolean' ? result : { ...result, feedback: [] };
					}

					this.compressedDropTargetDisposable.dispose();
					return false;
				}
			}
		}

		this.compressedDropTargetDisposable.dispose();
		return this.handleDragOver(data, target, targetIndex, targetSector, originalEvent);
	}

	private handleDragOver(data: IDragAndDropData, target: ExplorerItem | undefined, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): boolean | ITreeDragOverReaction {
		const isCopy = originalEvent && ((originalEvent.ctrlKey && !isMacintosh) || (originalEvent.altKey && isMacintosh));
		const isNative = data instanceof NativeDragAndDropData;
		const effectType = (isNative || isCopy) ? ListDragOverEffectType.Copy : ListDragOverEffectType.Move;
		const effect = { type: effectType, position: ListDragOverEffectPosition.Over };

		// Native DND
		if (isNative) {
			if (!containsDragType(originalEvent, DataTransfers.FILES, CodeDataTransfers.FILES, DataTransfers.RESOURCES)) {
				return false;
			}
		}

		// Other-Tree DND
		else if (data instanceof ExternalElementsDragAndDropData) {
			return false;
		}

		// In-Explorer DND
		else {
			const items = FileDragAndDrop.getStatsFromDragAndDropData(data as ElementsDragAndDropData<ExplorerItem, ExplorerItem[]>);
			const isRootsReorder = items.every(item => item.isRoot);

			if (!target) {
				// Dropping onto the empty area. Do not accept if items dragged are already
				// children of the root unless we are copying the file
				if (!isCopy && items.every(i => !!i.parent && i.parent.isRoot)) {
					return false;
				}

				// root is added after last root folder when hovering on empty background
				if (isRootsReorder) {
					return { accept: true, effect: { type: ListDragOverEffectType.Move, position: ListDragOverEffectPosition.After } };
				}

				return { accept: true, bubble: TreeDragOverBubble.Down, effect, autoExpand: false };
			}

			if (!Array.isArray(items)) {
				return false;
			}

			if (!isCopy && items.every((source) => source.isReadonly)) {
				return false; // Cannot move readonly items unless we copy
			}

			if (items.some((source) => {
				if (source.isRoot) {
					return false; // Root folders are handled seperately
				}

				if (this.uriIdentityService.extUri.isEqual(source.resource, target.resource)) {
					return true; // Can not move anything onto itself excpet for root folders
				}

				if (!isCopy && this.uriIdentityService.extUri.isEqual(dirname(source.resource), target.resource)) {
					return true; // Can not move a file to the same parent unless we copy
				}

				if (this.uriIdentityService.extUri.isEqualOrParent(target.resource, source.resource)) {
					return true; // Can not move a parent folder into one of its children
				}

				return false;
			})) {
				return false;
			}

			// reordering roots
			if (isRootsReorder) {
				if (!target.isRoot) {
					return false;
				}

				let dropEffectPosition: ListDragOverEffectPosition | undefined = undefined;
				switch (targetSector) {
					case ListViewTargetSector.TOP:
					case ListViewTargetSector.CENTER_TOP:
						dropEffectPosition = ListDragOverEffectPosition.Before; break;
					case ListViewTargetSector.CENTER_BOTTOM:
					case ListViewTargetSector.BOTTOM:
						dropEffectPosition = ListDragOverEffectPosition.After; break;
				}
				return { accept: true, effect: { type: ListDragOverEffectType.Move, position: dropEffectPosition } };
			}
		}

		// All (target = model)
		if (!target) {
			return { accept: true, bubble: TreeDragOverBubble.Down, effect };
		}

		// All (target = file/folder)
		else {
			if (target.isDirectory) {
				if (target.isReadonly) {
					return false;
				}

				return { accept: true, bubble: TreeDragOverBubble.Down, effect, autoExpand: true };
			}

			if (this.contextService.getWorkspace().folders.every(folder => folder.uri.toString() !== target.resource.toString())) {
				return { accept: true, bubble: TreeDragOverBubble.Up, effect };
			}
		}

		return false;
	}

	getDragURI(element: ExplorerItem): string | null {
		if (this.explorerService.isEditable(element)) {
			return null;
		}

		return element.resource.toString();
	}

	getDragLabel(elements: ExplorerItem[], originalEvent: DragEvent): string | undefined {
		if (elements.length === 1) {
			const stat = FileDragAndDrop.getCompressedStatFromDragEvent(elements[0], originalEvent);
			return stat.name;
		}

		return String(elements.length);
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		const items = FileDragAndDrop.getStatsFromDragAndDropData(data as ElementsDragAndDropData<ExplorerItem, ExplorerItem[]>, originalEvent);
		if (items.length && originalEvent.dataTransfer) {
			// Apply some datatransfer types to allow for dragging the element outside of the application
			this.instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, items, originalEvent));

			// The only custom data transfer we set from the explorer is a file transfer
			// to be able to DND between multiple code file explorers across windows
			const fileResources = items.filter(s => s.resource.scheme === Schemas.file).map(r => r.resource.fsPath);
			if (fileResources.length) {
				originalEvent.dataTransfer.setData(CodeDataTransfers.FILES, JSON.stringify(fileResources));
			}
		}
	}

	async drop(data: IDragAndDropData, target: ExplorerItem | undefined, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): Promise<void> {
		this.compressedDropTargetDisposable.dispose();

		// Find compressed target
		if (target) {
			const compressedTarget = FileDragAndDrop.getCompressedStatFromDragEvent(target, originalEvent);

			if (compressedTarget) {
				target = compressedTarget;
			}
		}

		// Find parent to add to
		if (!target) {
			target = this.explorerService.roots[this.explorerService.roots.length - 1];
			targetSector = ListViewTargetSector.BOTTOM;
		}
		if (!target.isDirectory && target.parent) {
			target = target.parent;
		}
		if (target.isReadonly) {
			return;
		}
		const resolvedTarget = target;
		if (!resolvedTarget) {
			return;
		}

		try {

			// External file DND (Import/Upload file)
			if (data instanceof NativeDragAndDropData) {
				// Use local file import when supported
				if (!isWeb || (isTemporaryWorkspace(this.contextService.getWorkspace()) && WebFileSystemAccess.supported(mainWindow))) {
					const fileImport = this.instantiationService.createInstance(ExternalFileImport);
					await fileImport.import(resolvedTarget, originalEvent, mainWindow);
				}
				// Otherwise fallback to browser based file upload
				else {
					const browserUpload = this.instantiationService.createInstance(BrowserFileUpload);
					await browserUpload.upload(target, originalEvent);
				}
			}

			// In-Explorer DND (Move/Copy file)
			else {
				await this.handleExplorerDrop(data as ElementsDragAndDropData<ExplorerItem, ExplorerItem[]>, resolvedTarget, targetIndex, targetSector, originalEvent);
			}
		} catch (error) {
			this.dialogService.error(toErrorMessage(error));
		}
	}

	private async handleExplorerDrop(data: ElementsDragAndDropData<ExplorerItem, ExplorerItem[]>, target: ExplorerItem, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): Promise<void> {
		const elementsData = FileDragAndDrop.getStatsFromDragAndDropData(data);
		const distinctItems = new Map(elementsData.map(element => [element, this.isCollapsed(element)]));

		for (const [item, collapsed] of distinctItems) {
			if (collapsed) {
				const nestedChildren = item.nestedChildren;
				if (nestedChildren) {
					for (const child of nestedChildren) {
						// if parent is collapsed, then the nested children is considered collapsed to operate as a group
						// and skip collapsed state check since they're not in the tree
						distinctItems.set(child, true);
					}
				}
			}
		}

		const items = distinctParents([...distinctItems.keys()], s => s.resource);
		const isCopy = (originalEvent.ctrlKey && !isMacintosh) || (originalEvent.altKey && isMacintosh);

		// Handle confirm setting
		const confirmDragAndDrop = !isCopy && this.configurationService.getValue<boolean>(FileDragAndDrop.CONFIRM_DND_SETTING_KEY);
		if (confirmDragAndDrop) {
			const message = items.length > 1 && items.every(s => s.isRoot) ? localize('confirmRootsMove', "Are you sure you want to change the order of multiple root folders in your workspace?")
				: items.length > 1 ? localize('confirmMultiMove', "Are you sure you want to move the following {0} files into '{1}'?", items.length, target.name)
					: items[0].isRoot ? localize('confirmRootMove', "Are you sure you want to change the order of root folder '{0}' in your workspace?", items[0].name)
						: localize('confirmMove', "Are you sure you want to move '{0}' into '{1}'?", items[0].name, target.name);
			const detail = items.length > 1 && !items.every(s => s.isRoot) ? getFileNamesMessage(items.map(i => i.resource)) : undefined;

			const confirmation = await this.dialogService.confirm({
				message,
				detail,
				checkbox: {
					label: localize('doNotAskAgain', "Do not ask me again")
				},
				primaryButton: localize({ key: 'moveButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Move")
			});

			if (!confirmation.confirmed) {
				return;
			}

			// Check for confirmation checkbox
			if (confirmation.checkboxChecked === true) {
				await this.configurationService.updateValue(FileDragAndDrop.CONFIRM_DND_SETTING_KEY, false);
			}
		}

		await this.doHandleRootDrop(items.filter(s => s.isRoot), target, targetSector);

		const sources = items.filter(s => !s.isRoot);
		if (isCopy) {
			return this.doHandleExplorerDropOnCopy(sources, target);
		}

		return this.doHandleExplorerDropOnMove(sources, target);
	}

	private async doHandleRootDrop(roots: ExplorerItem[], target: ExplorerItem, targetSector: ListViewTargetSector | undefined): Promise<void> {
		if (roots.length === 0) {
			return;
		}

		const folders = this.contextService.getWorkspace().folders;
		let targetIndex: number | undefined;
		const sourceIndices: number[] = [];
		const workspaceCreationData: IWorkspaceFolderCreationData[] = [];
		const rootsToMove: IWorkspaceFolderCreationData[] = [];

		for (let index = 0; index < folders.length; index++) {
			const data = {
				uri: folders[index].uri,
				name: folders[index].name
			};

			// Is current target
			if (target instanceof ExplorerItem && this.uriIdentityService.extUri.isEqual(folders[index].uri, target.resource)) {
				targetIndex = index;
			}

			// Is current source
			for (const root of roots) {
				if (this.uriIdentityService.extUri.isEqual(folders[index].uri, root.resource)) {
					sourceIndices.push(index);
					break;
				}
			}

			if (roots.every(r => r.resource.toString() !== folders[index].uri.toString())) {
				workspaceCreationData.push(data);
			} else {
				rootsToMove.push(data);
			}
		}
		if (targetIndex === undefined) {
			targetIndex = workspaceCreationData.length;
		} else {
			switch (targetSector) {
				case ListViewTargetSector.BOTTOM:
				case ListViewTargetSector.CENTER_BOTTOM:
					targetIndex++;
					break;
			}
			// Adjust target index if source was located before target.
			// The move will cause the index to change
			for (const sourceIndex of sourceIndices) {
				if (sourceIndex < targetIndex) {
					targetIndex--;
				}
			}
		}

		workspaceCreationData.splice(targetIndex, 0, ...rootsToMove);

		return this.workspaceEditingService.updateFolders(0, workspaceCreationData.length, workspaceCreationData);
	}

	private async doHandleExplorerDropOnCopy(sources: ExplorerItem[], target: ExplorerItem): Promise<void> {

		// Reuse duplicate action when user copies
		const explorerConfig = this.configurationService.getValue<IFilesConfiguration>().explorer;
		const resourceFileEdits: ResourceFileEdit[] = [];
		for (const { resource, isDirectory } of sources) {
			const allowOverwrite = explorerConfig.incrementalNaming === 'disabled';
			const newResource = await findValidPasteFileTarget(this.explorerService,
				this.fileService,
				this.dialogService,
				target,
				{ resource, isDirectory, allowOverwrite },
				explorerConfig.incrementalNaming
			);
			if (!newResource) {
				continue;
			}
			const resourceEdit = new ResourceFileEdit(resource, newResource, { copy: true, overwrite: allowOverwrite });
			resourceFileEdits.push(resourceEdit);
		}
		const labelSuffix = getFileOrFolderLabelSuffix(sources);
		await this.explorerService.applyBulkEdit(resourceFileEdits, {
			confirmBeforeUndo: explorerConfig.confirmUndo === UndoConfirmLevel.Default || explorerConfig.confirmUndo === UndoConfirmLevel.Verbose,
			undoLabel: localize('copy', "Copy {0}", labelSuffix),
			progressLabel: localize('copying', "Copying {0}", labelSuffix),
		});

		const editors = resourceFileEdits.filter(edit => {
			const item = edit.newResource ? this.explorerService.findClosest(edit.newResource) : undefined;
			return item && !item.isDirectory;
		}).map(edit => ({ resource: edit.newResource, options: { pinned: true } }));

		await this.editorService.openEditors(editors);
	}

	private async doHandleExplorerDropOnMove(sources: ExplorerItem[], target: ExplorerItem): Promise<void> {

		// Do not allow moving readonly items
		const resourceFileEdits = sources.filter(source => !source.isReadonly).map(source => new ResourceFileEdit(source.resource, joinPath(target.resource, source.name)));
		const labelSuffix = getFileOrFolderLabelSuffix(sources);
		const options = {
			confirmBeforeUndo: this.configurationService.getValue<IFilesConfiguration>().explorer.confirmUndo === UndoConfirmLevel.Verbose,
			undoLabel: localize('move', "Move {0}", labelSuffix),
			progressLabel: localize('moving', "Moving {0}", labelSuffix)
		};

		try {
			await this.explorerService.applyBulkEdit(resourceFileEdits, options);
		} catch (error) {

			// Conflict
			if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_MOVE_CONFLICT) {

				const overwrites: URI[] = [];
				for (const edit of resourceFileEdits) {
					if (edit.newResource && await this.fileService.exists(edit.newResource)) {
						overwrites.push(edit.newResource);
					}
				}

				// Move with overwrite if the user confirms
				const confirm = getMultipleFilesOverwriteConfirm(overwrites);
				const { confirmed } = await this.dialogService.confirm(confirm);
				if (confirmed) {
					await this.explorerService.applyBulkEdit(resourceFileEdits.map(re => new ResourceFileEdit(re.oldResource, re.newResource, { overwrite: true })), options);
				}
			}

			// Any other error: bubble up
			else {
				throw error;
			}
		}
	}

	private static getStatsFromDragAndDropData(data: ElementsDragAndDropData<ExplorerItem, ExplorerItem[]>, dragStartEvent?: DragEvent): ExplorerItem[] {
		if (data.context) {
			return data.context;
		}

		// Detect compressed folder dragging
		if (dragStartEvent && data.elements.length === 1) {
			data.context = [FileDragAndDrop.getCompressedStatFromDragEvent(data.elements[0], dragStartEvent)];
			return data.context;
		}

		return data.elements;
	}

	private static getCompressedStatFromDragEvent(stat: ExplorerItem, dragEvent: DragEvent): ExplorerItem {
		const target = DOM.getWindow(dragEvent).document.elementFromPoint(dragEvent.clientX, dragEvent.clientY);
		const iconLabelName = getIconLabelNameFromHTMLElement(target);

		if (iconLabelName) {
			const { count, index } = iconLabelName;

			let i = count - 1;
			while (i > index && stat.parent) {
				stat = stat.parent;
				i--;
			}

			return stat;
		}

		return stat;
	}

	onDragEnd(): void {
		this.compressedDropTargetDisposable.dispose();
	}

	dispose(): void {
		this.compressedDropTargetDisposable.dispose();
	}
}

function getIconLabelNameFromHTMLElement(target: HTMLElement | EventTarget | Element | null): { element: HTMLElement; count: number; index: number } | null {
	if (!(DOM.isHTMLElement(target))) {
		return null;
	}

	let element: HTMLElement | null = target;

	while (element && !element.classList.contains('monaco-list-row')) {
		if (element.classList.contains('label-name') && element.hasAttribute('data-icon-label-count')) {
			const count = Number(element.getAttribute('data-icon-label-count'));
			const index = Number(element.getAttribute('data-icon-label-index'));

			if (isNumber(count) && isNumber(index)) {
				return { element: element, count, index };
			}
		}

		element = element.parentElement;
	}

	return null;
}

export function isCompressedFolderName(target: HTMLElement | EventTarget | Element | null): boolean {
	return !!getIconLabelNameFromHTMLElement(target);
}

export class ExplorerCompressionDelegate implements ITreeCompressionDelegate<ExplorerItem> {

	isIncompressible(stat: ExplorerItem): boolean {
		return stat.isRoot || !stat.isDirectory || stat instanceof NewExplorerItem || (!stat.parent || stat.parent.isRoot);
	}
}

function getFileOrFolderLabelSuffix(items: ExplorerItem[]): string {
	if (items.length === 1) {
		return items[0].name;
	}

	if (items.every(i => i.isDirectory)) {
		return localize('numberOfFolders', "{0} folders", items.length);
	}
	if (items.every(i => !i.isDirectory)) {
		return localize('numberOfFiles', "{0} files", items.length);
	}

	return `${items.length} files and folders`;
}
