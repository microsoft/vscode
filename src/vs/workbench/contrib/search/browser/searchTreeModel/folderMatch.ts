/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { TernarySearchTree } from '../../../../../base/common/ternarySearchTree.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IReplaceService } from './../replace.js';
import { IFileMatch, IPatternInfo, ITextQuery, ITextSearchPreviewOptions, resultIsMatch } from '../../../../services/search/common/search.js';

import { FileMatchImpl } from './fileMatch.js';
import { IChangeEvent, ISearchTreeFileMatch, ISearchTreeFolderMatch, ISearchTreeFolderMatchWithResource, ISearchTreeFolderMatchNoRoot, ISearchTreeFolderMatchWorkspaceRoot, ISearchModel, ISearchResult, isSearchTreeFolderMatchWorkspaceRoot, ITextSearchHeading, isSearchTreeFolderMatchNoRoot, FOLDER_MATCH_PREFIX, getFileMatches } from './searchTreeCommon.js';
import { NotebookEditorWidget } from '../../../notebook/browser/notebookEditorWidget.js';
import { isINotebookFileMatchNoModel } from '../../common/searchNotebookHelpers.js';
import { NotebookCompatibleFileMatch } from '../notebookSearch/notebookSearchModel.js';
import { isINotebookFileMatchWithModel, getIDFromINotebookCellMatch } from '../notebookSearch/searchNotebookHelpers.js';
import { isNotebookFileMatch } from '../notebookSearch/notebookSearchModelBase.js';
import { textSearchResultToMatches } from './match.js';

export class FolderMatchImpl extends Disposable implements ISearchTreeFolderMatch {

	protected _onChange = this._register(new Emitter<IChangeEvent>());
	readonly onChange: Event<IChangeEvent> = this._onChange.event;

	private _onDispose = this._register(new Emitter<void>());
	readonly onDispose: Event<void> = this._onDispose.event;

	protected _fileMatches: ResourceMap<ISearchTreeFileMatch>;
	protected _folderMatches: ResourceMap<FolderMatchWithResourceImpl>;
	protected _folderMatchesMap: TernarySearchTree<URI, FolderMatchWithResourceImpl>;
	protected _unDisposedFileMatches: ResourceMap<ISearchTreeFileMatch>;
	protected _unDisposedFolderMatches: ResourceMap<FolderMatchWithResourceImpl>;
	private _replacingAll: boolean = false;
	private _name: Lazy<string>;
	private readonly _id: string;

	constructor(
		protected _resource: URI | null,
		_id: string,
		protected _index: number,
		protected _query: ITextQuery,
		private _parent: ITextSearchHeading | FolderMatchImpl,
		private _searchResult: ISearchResult,
		private _closestRoot: ISearchTreeFolderMatchWorkspaceRoot | null,
		@IReplaceService private readonly replaceService: IReplaceService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@ILabelService labelService: ILabelService,
		@IUriIdentityService protected readonly uriIdentityService: IUriIdentityService
	) {
		super();
		this._fileMatches = new ResourceMap<ISearchTreeFileMatch>();
		this._folderMatches = new ResourceMap<FolderMatchWithResourceImpl>();
		this._folderMatchesMap = TernarySearchTree.forUris<FolderMatchWithResourceImpl>(key => this.uriIdentityService.extUri.ignorePathCasing(key));
		this._unDisposedFileMatches = new ResourceMap<ISearchTreeFileMatch>();
		this._unDisposedFolderMatches = new ResourceMap<FolderMatchWithResourceImpl>();
		this._name = new Lazy(() => this.resource ? labelService.getUriBasenameLabel(this.resource) : '');
		this._id = FOLDER_MATCH_PREFIX + _id;
	}

	get searchModel(): ISearchModel {
		return this._searchResult.searchModel;
	}

	get showHighlights(): boolean {
		return this._parent.showHighlights;
	}

	get closestRoot(): ISearchTreeFolderMatchWorkspaceRoot | null {
		return this._closestRoot;
	}

	set replacingAll(b: boolean) {
		this._replacingAll = b;
	}

	id(): string {
		return this._id;
	}

	get resource(): URI | null {
		return this._resource;
	}

	index(): number {
		return this._index;
	}

	name(): string {
		return this._name.value;
	}

	parent(): ITextSearchHeading | FolderMatchImpl {
		return this._parent;
	}

	isAIContributed(): boolean {
		return false;
	}

	get hasChildren(): boolean {
		return this._fileMatches.size > 0 || this._folderMatches.size > 0;
	}

	bindModel(model: ITextModel): void {
		const fileMatch = this._fileMatches.get(model.uri);

		if (fileMatch) {
			fileMatch.bindModel(model);
		} else {
			const folderMatch = this.getFolderMatch(model.uri);
			const match = folderMatch?.getDownstreamFileMatch(model.uri);
			match?.bindModel(model);
		}
	}

	public createIntermediateFolderMatch(resource: URI, id: string, index: number, query: ITextQuery, baseWorkspaceFolder: ISearchTreeFolderMatchWorkspaceRoot): FolderMatchWithResourceImpl {
		const folderMatch = this._register(this.instantiationService.createInstance(FolderMatchWithResourceImpl, resource, id, index, query, this, this._searchResult, baseWorkspaceFolder));
		this.configureIntermediateMatch(folderMatch);
		this.doAddFolder(folderMatch);
		return folderMatch;
	}

	public configureIntermediateMatch(folderMatch: FolderMatchWithResourceImpl) {
		const disposable = folderMatch.onChange((event) => this.onFolderChange(folderMatch, event));
		this._register(folderMatch.onDispose(() => disposable.dispose()));
	}

	clear(clearingAll = false): void {
		const changed: ISearchTreeFileMatch[] = this.allDownstreamFileMatches();
		this.disposeMatches();
		this._onChange.fire({ elements: changed, removed: true, added: false, clearingAll });
	}

	remove(matches: ISearchTreeFileMatch | ISearchTreeFolderMatchWithResource | (ISearchTreeFileMatch | ISearchTreeFolderMatchWithResource)[]): void {
		if (!Array.isArray(matches)) {
			matches = [matches];
		}
		const allMatches = getFileMatches(matches);
		this.doRemoveFile(allMatches);
	}

	async replace(match: FileMatchImpl): Promise<any> {
		return this.replaceService.replace([match]).then(() => {
			this.doRemoveFile([match], true, true, true);
		});
	}

	replaceAll(): Promise<any> {
		const matches = this.matches();
		return this.batchReplace(matches);
	}

	matches(): (ISearchTreeFileMatch | ISearchTreeFolderMatchWithResource)[] {
		return [...this.fileMatchesIterator(), ...this.folderMatchesIterator()];
	}

	fileMatchesIterator(): IterableIterator<ISearchTreeFileMatch> {
		return this._fileMatches.values();
	}

	folderMatchesIterator(): IterableIterator<ISearchTreeFolderMatchWithResource> {
		return this._folderMatches.values();
	}

	isEmpty(): boolean {
		return (this.fileCount() + this.folderCount()) === 0;
	}

	getDownstreamFileMatch(uri: URI): ISearchTreeFileMatch | null {
		const directChildFileMatch = this._fileMatches.get(uri);
		if (directChildFileMatch) {
			return directChildFileMatch;
		}

		const folderMatch = this.getFolderMatch(uri);
		const match = folderMatch?.getDownstreamFileMatch(uri);
		if (match) {
			return match;
		}

		return null;
	}

	allDownstreamFileMatches(): ISearchTreeFileMatch[] {
		let recursiveChildren: ISearchTreeFileMatch[] = [];
		const iterator = this.folderMatchesIterator();
		for (const elem of iterator) {
			recursiveChildren = recursiveChildren.concat(elem.allDownstreamFileMatches());
		}

		return [...this.fileMatchesIterator(), ...recursiveChildren];
	}

	private fileCount(): number {
		return this._fileMatches.size;
	}

	private folderCount(): number {
		return this._folderMatches.size;
	}

	count(): number {
		return this.fileCount() + this.folderCount();
	}

	recursiveFileCount(): number {
		return this.allDownstreamFileMatches().length;
	}

	recursiveMatchCount(): number {
		return this.allDownstreamFileMatches().reduce<number>((prev, match) => prev + match.count(), 0);
	}

	get query(): ITextQuery | null {
		return this._query;
	}

	doAddFile(fileMatch: ISearchTreeFileMatch): void {
		this._fileMatches.set(fileMatch.resource, fileMatch);
		if (this._unDisposedFileMatches.has(fileMatch.resource)) {
			this._unDisposedFileMatches.delete(fileMatch.resource);
		}
	}

	hasOnlyReadOnlyMatches(): boolean {
		return Array.from(this._fileMatches.values()).every(fm => fm.hasOnlyReadOnlyMatches());
	}

	protected uriHasParent(parent: URI, child: URI) {
		return this.uriIdentityService.extUri.isEqualOrParent(child, parent) && !this.uriIdentityService.extUri.isEqual(child, parent);
	}

	private isInParentChain(folderMatch: FolderMatchWithResourceImpl) {

		let matchItem: FolderMatchImpl | ITextSearchHeading = this;
		while (matchItem instanceof FolderMatchImpl) {
			if (matchItem.id() === folderMatch.id()) {
				return true;
			}
			matchItem = matchItem.parent();
		}
		return false;
	}

	public getFolderMatch(resource: URI): FolderMatchWithResourceImpl | undefined {
		const folderMatch = this._folderMatchesMap.findSubstr(resource);
		return folderMatch;
	}

	doAddFolder(folderMatch: FolderMatchWithResourceImpl) {
		if (this.resource && !this.uriHasParent(this.resource, folderMatch.resource)) {
			throw Error(`${folderMatch.resource} does not belong as a child of ${this.resource}`);
		} else if (this.isInParentChain(folderMatch)) {
			throw Error(`${folderMatch.resource} is a parent of ${this.resource}`);
		}

		this._folderMatches.set(folderMatch.resource, folderMatch);
		this._folderMatchesMap.set(folderMatch.resource, folderMatch);
		if (this._unDisposedFolderMatches.has(folderMatch.resource)) {
			this._unDisposedFolderMatches.delete(folderMatch.resource);
		}
	}

	private async batchReplace(matches: (ISearchTreeFileMatch | ISearchTreeFolderMatchWithResource)[]): Promise<any> {
		const allMatches = getFileMatches(matches);

		await this.replaceService.replace(allMatches);
		this.doRemoveFile(allMatches, true, true, true);
	}

	public onFileChange(fileMatch: ISearchTreeFileMatch, removed = false): void {
		let added = false;
		if (!this._fileMatches.has(fileMatch.resource)) {
			this.doAddFile(fileMatch);
			added = true;
		}
		if (fileMatch.count() === 0) {
			this.doRemoveFile([fileMatch], false, false);
			added = false;
			removed = true;
		}
		if (!this._replacingAll) {
			this._onChange.fire({ elements: [fileMatch], added: added, removed: removed });
		}
	}

	public onFolderChange(folderMatch: FolderMatchWithResourceImpl, event: IChangeEvent): void {
		if (!this._folderMatches.has(folderMatch.resource)) {
			this.doAddFolder(folderMatch);
		}
		if (folderMatch.isEmpty()) {
			this._folderMatches.delete(folderMatch.resource);
			folderMatch.dispose();
		}

		this._onChange.fire(event);
	}

	doRemoveFile(fileMatches: ISearchTreeFileMatch[], dispose: boolean = true, trigger: boolean = true, keepReadonly = false): void {

		const removed = [];
		for (const match of fileMatches as ISearchTreeFileMatch[]) {
			if (this._fileMatches.get(match.resource)) {
				if (keepReadonly && match.hasReadonlyMatches()) {
					continue;
				}
				this._fileMatches.delete(match.resource);
				if (dispose) {
					match.dispose();
				} else {
					this._unDisposedFileMatches.set(match.resource, match);
				}
				removed.push(match);
			} else {
				const folder = this.getFolderMatch(match.resource);
				if (folder) {
					folder.doRemoveFile([match], dispose, trigger);
				} else {
					throw Error(`FileMatch ${match.resource} is not located within FolderMatch ${this.resource}`);
				}
			}
		}

		if (trigger) {
			this._onChange.fire({ elements: removed, removed: true });
		}
	}

	async bindNotebookEditorWidget(editor: NotebookEditorWidget, resource: URI) {
		const fileMatch = this._fileMatches.get(resource);
		if (isNotebookFileMatch(fileMatch)) {
			if (fileMatch) {
				fileMatch.bindNotebookEditorWidget(editor);
				await fileMatch.updateMatchesForEditorWidget();
			} else {
				const folderMatches = this.folderMatchesIterator();
				for (const elem of folderMatches) {
					await elem.bindNotebookEditorWidget(editor, resource);
				}
			}
		}
	}

	addFileMatch(raw: IFileMatch[], silent: boolean, searchInstanceID: string): void {
		// when adding a fileMatch that has intermediate directories
		const added: ISearchTreeFileMatch[] = [];
		const updated: ISearchTreeFileMatch[] = [];

		raw.forEach(rawFileMatch => {
			const existingFileMatch = this.getDownstreamFileMatch(rawFileMatch.resource);
			if (existingFileMatch) {

				if (rawFileMatch.results) {
					rawFileMatch
						.results
						.filter(resultIsMatch)
						.forEach(m => {
							textSearchResultToMatches(m, existingFileMatch, false)
								.forEach(m => existingFileMatch.add(m));
						});
				}

				// add cell matches
				if (isINotebookFileMatchWithModel(rawFileMatch) || isINotebookFileMatchNoModel(rawFileMatch)) {
					rawFileMatch.cellResults?.forEach(rawCellMatch => {
						if (isNotebookFileMatch(existingFileMatch)) {
							const existingCellMatch = existingFileMatch.getCellMatch(getIDFromINotebookCellMatch(rawCellMatch));
							if (existingCellMatch) {
								existingCellMatch.addContentMatches(rawCellMatch.contentResults);
								existingCellMatch.addWebviewMatches(rawCellMatch.webviewResults);
							} else {
								existingFileMatch.addCellMatch(rawCellMatch);
							}
						}
					});
				}

				updated.push(existingFileMatch);

				if (rawFileMatch.results && rawFileMatch.results.length > 0) {
					existingFileMatch.addContext(rawFileMatch.results);
				}
			} else {
				if (isSearchTreeFolderMatchWorkspaceRoot(this) || isSearchTreeFolderMatchNoRoot(this)) {
					const fileMatch = this.createAndConfigureFileMatch(rawFileMatch, searchInstanceID);
					added.push(fileMatch);
				}
			}
		});

		const elements = [...added, ...updated];
		if (!silent && elements.length) {
			this._onChange.fire({ elements, added: !!added.length });
		}
	}

	unbindNotebookEditorWidget(editor: NotebookEditorWidget, resource: URI) {
		const fileMatch = this._fileMatches.get(resource);

		if (isNotebookFileMatch(fileMatch)) {
			if (fileMatch) {
				fileMatch.unbindNotebookEditorWidget(editor);
			} else {
				const folderMatches = this.folderMatchesIterator();
				for (const elem of folderMatches) {
					elem.unbindNotebookEditorWidget(editor, resource);
				}
			}
		}

	}

	disposeMatches(): void {
		[...this._fileMatches.values()].forEach((fileMatch: ISearchTreeFileMatch) => fileMatch.dispose());
		[...this._folderMatches.values()].forEach((folderMatch: FolderMatchImpl) => folderMatch.disposeMatches());
		[...this._unDisposedFileMatches.values()].forEach((fileMatch: ISearchTreeFileMatch) => fileMatch.dispose());
		[...this._unDisposedFolderMatches.values()].forEach((folderMatch: FolderMatchImpl) => folderMatch.disposeMatches());
		this._fileMatches.clear();
		this._folderMatches.clear();
		this._unDisposedFileMatches.clear();
		this._unDisposedFolderMatches.clear();
	}

	override dispose(): void {
		this.disposeMatches();
		this._onDispose.fire();
		super.dispose();
	}
}

export class FolderMatchWithResourceImpl extends FolderMatchImpl implements ISearchTreeFolderMatchWithResource {

	protected _normalizedResource: Lazy<URI>;

	constructor(_resource: URI,
		_id: string,
		_index: number,
		_query: ITextQuery,
		_parent: ITextSearchHeading | FolderMatchImpl,
		_searchResult: ISearchResult,
		_closestRoot: ISearchTreeFolderMatchWorkspaceRoot | null,
		@IReplaceService replaceService: IReplaceService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILabelService labelService: ILabelService,
		@IUriIdentityService uriIdentityService: IUriIdentityService
	) {
		super(_resource, _id, _index, _query, _parent, _searchResult, _closestRoot, replaceService, instantiationService, labelService, uriIdentityService);
		this._normalizedResource = new Lazy(() => this.uriIdentityService.extUri.removeTrailingPathSeparator(this.uriIdentityService.extUri.normalizePath(
			this.resource)));
	}

	override get resource(): URI {
		return this._resource!;
	}

	get normalizedResource(): URI {
		return this._normalizedResource.value;
	}
}

/**
 * FolderMatchWorkspaceRoot => folder for workspace root
 */
export class FolderMatchWorkspaceRootImpl extends FolderMatchWithResourceImpl implements ISearchTreeFolderMatchWorkspaceRoot {
	constructor(_resource: URI, _id: string, _index: number, _query: ITextQuery, _parent: ITextSearchHeading,
		@IReplaceService replaceService: IReplaceService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILabelService labelService: ILabelService,
		@IUriIdentityService uriIdentityService: IUriIdentityService
	) {
		super(_resource, _id, _index, _query, _parent, _parent.parent(), null, replaceService, instantiationService, labelService, uriIdentityService);
	}

	private normalizedUriParent(uri: URI): URI {
		return this.uriIdentityService.extUri.normalizePath(this.uriIdentityService.extUri.dirname(uri));
	}

	private uriEquals(uri1: URI, ur2: URI): boolean {
		return this.uriIdentityService.extUri.isEqual(uri1, ur2);
	}

	private createFileMatch(query: IPatternInfo, previewOptions: ITextSearchPreviewOptions | undefined, maxResults: number | undefined, parent: FolderMatchImpl, rawFileMatch: IFileMatch, closestRoot: ISearchTreeFolderMatchWorkspaceRoot | null, searchInstanceID: string): FileMatchImpl {
		// TODO: can probably just create FileMatchImpl if we don't expect cell results from the file.
		const fileMatch =
			this.instantiationService.createInstance(
				NotebookCompatibleFileMatch,
				query,
				previewOptions,
				maxResults,
				parent,
				rawFileMatch,
				closestRoot,
				searchInstanceID,
			);
		fileMatch.createMatches();
		parent.doAddFile(fileMatch);
		const disposable = fileMatch.onChange(({ didRemove }) => parent.onFileChange(fileMatch, didRemove));
		this._register(fileMatch.onDispose(() => disposable.dispose()));
		return fileMatch;
	}

	createAndConfigureFileMatch(rawFileMatch: IFileMatch<URI>, searchInstanceID: string): FileMatchImpl {

		if (!this.uriHasParent(this.resource, rawFileMatch.resource)) {
			throw Error(`${rawFileMatch.resource} is not a descendant of ${this.resource}`);
		}

		const fileMatchParentParts: URI[] = [];
		let uri = this.normalizedUriParent(rawFileMatch.resource);

		while (!this.uriEquals(this.normalizedResource, uri)) {
			fileMatchParentParts.unshift(uri);
			const prevUri = uri;
			uri = this.uriIdentityService.extUri.removeTrailingPathSeparator(this.normalizedUriParent(uri));
			if (this.uriEquals(prevUri, uri)) {
				throw Error(`${rawFileMatch.resource} is not correctly configured as a child of ${this.normalizedResource}`);
			}
		}

		const root = this.closestRoot ?? this;
		let parent: FolderMatchWithResourceImpl = this;
		for (let i = 0; i < fileMatchParentParts.length; i++) {
			let folderMatch: FolderMatchWithResourceImpl | undefined = parent.getFolderMatch(fileMatchParentParts[i]);
			if (!folderMatch) {
				folderMatch = parent.createIntermediateFolderMatch(fileMatchParentParts[i], fileMatchParentParts[i].toString(), -1, this._query, root);
			}
			parent = folderMatch;
		}
		const contentPatternToUse = typeof (this._query.contentPattern) === 'string' ? { pattern: this._query.contentPattern } : this._query.contentPattern;
		return this.createFileMatch(contentPatternToUse, this._query.previewOptions, this._query.maxResults, parent, rawFileMatch, root, searchInstanceID);
	}
}

// currently, no support for AI results in out-of-workspace files
export class FolderMatchNoRootImpl extends FolderMatchImpl implements ISearchTreeFolderMatchNoRoot {
	constructor(_id: string, _index: number, _query: ITextQuery, _parent: ITextSearchHeading,
		@IReplaceService replaceService: IReplaceService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILabelService labelService: ILabelService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,

	) {
		super(null, _id, _index, _query, _parent, _parent.parent(), null, replaceService, instantiationService, labelService, uriIdentityService);
	}

	createAndConfigureFileMatch(rawFileMatch: IFileMatch, searchInstanceID: string): ISearchTreeFileMatch {
		const contentPatternToUse = typeof (this._query.contentPattern) === 'string' ? { pattern: this._query.contentPattern } : this._query.contentPattern;
		// TODO: can probably just create FileMatchImpl if we don't expect cell results from the file.
		const fileMatch = this._register(this.instantiationService.createInstance(
			NotebookCompatibleFileMatch,
			contentPatternToUse,
			this._query.previewOptions,
			this._query.maxResults,
			this, rawFileMatch,
			null,
			searchInstanceID,
		));
		fileMatch.createMatches();
		this.doAddFile(fileMatch);
		const disposable = fileMatch.onChange(({ didRemove }) => this.onFileChange(fileMatch, didRemove));
		this._register(fileMatch.onDispose(() => disposable.dispose()));
		return fileMatch;
	}
}
