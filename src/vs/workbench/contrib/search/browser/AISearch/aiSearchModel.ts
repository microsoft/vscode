/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IFileMatch, IPatternInfo, ITextQuery, ITextSearchPreviewOptions } from '../../../../services/search/common/search.js';
import { NotebookEditorWidget } from '../../../notebook/browser/notebookEditorWidget.js';

import { FileMatchImpl } from '../searchTreeModel/fileMatch.js';
import { getFileMatches } from '../searchTreeModel/folderMatch.js';
import { ISearchResult, TEXT_SEARCH_HEADING_PREFIX, AI_TEXT_SEARCH_RESULT_ID, ISearchTreeFolderMatchWorkspaceRoot, ISearchTreeFolderMatch, ISearchTreeFolderMatchWithResource, ITextSearchHeading, IChangeEvent, ISearchModel, ISearchTreeFileMatch, FOLDER_MATCH_PREFIX } from '../searchTreeModel/searchTreeCommon.js';
import { TextSearchHeadingImpl } from '../searchTreeModel/textSearchHeading.js';
import { IAIPlainTextSearchHeading } from './aiSearchModelBase.js';

export class AITextSearchHeadingImpl extends TextSearchHeadingImpl implements IAIPlainTextSearchHeading {
	constructor(
		parent: ISearchResult,
		@IInstantiationService instantiationService: IInstantiationService,
		@IUriIdentityService uriIdentityService: IUriIdentityService
	) {
		super(false, parent, instantiationService, uriIdentityService);
	}

	override name(): string {
		return 'AI';
	}

	id(): string {
		return TEXT_SEARCH_HEADING_PREFIX + AI_TEXT_SEARCH_RESULT_ID;
	}

	get isAIContributed(): boolean {
		return true;
	}

	protected override createWorkspaceRootWithResourceImpl(resource: URI, id: string, index: number, query: ITextQuery): ISearchTreeFolderMatchWorkspaceRoot {
		return this.instantiationService.createInstance(AIFolderMatchWorkspaceRootImpl, resource, id, index, query, this);
	}
}

/**
 * FolderMatchWorkspaceRoot => folder for workspace root
 */
export class AIFolderMatchWorkspaceRootImpl extends Disposable implements ISearchTreeFolderMatchWorkspaceRoot {
	protected _onChange = this._register(new Emitter<IChangeEvent>());
	readonly onChange: Event<IChangeEvent> = this._onChange.event;

	private _onDispose = this._register(new Emitter<void>());
	readonly onDispose: Event<void> = this._onDispose.event;
	private readonly _id: string;
	private _name: Lazy<string>;
	protected _unDisposedFileMatches: Map<string, ISearchTreeFileMatch>; // id to fileMatch

	protected _fileMatches: Map<string, ISearchTreeFileMatch>; // id to fileMatch

	constructor(private _resource: URI,
		_id: string,
		private _index: number,
		private _query: ITextQuery,
		private _parent: ITextSearchHeading,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ILabelService labelService: ILabelService,
	) {
		super();
		this._fileMatches = new Map<string, ISearchTreeFileMatch>();

		this._id = FOLDER_MATCH_PREFIX + _id;
		this._name = new Lazy(() => this.resource ? labelService.getUriBasenameLabel(this.resource) : '');
		this._unDisposedFileMatches = new Map<string, ISearchTreeFileMatch>();
	}
	readonly closestRoot: ISearchTreeFolderMatchWorkspaceRoot | null = null;

	get resource(): URI {
		return this._resource;
	}
	id(): string {
		return this._id;
	}

	index(): number {
		return this._index;
	}
	name(): string {
		return this._name.value;
	}
	count(): number {
		return this._fileMatches.size;
	}

	doAddFile(fileMatch: ISearchTreeFileMatch): void {
		this._fileMatches.set(fileMatch.id(), fileMatch);
	}
	createAndConfigureFileMatch(rawFileMatch: IFileMatch<URI>, searchInstanceID: string): FileMatchImpl {
		return this.createFileMatch(this._query.contentPattern, this._query.previewOptions, this._query.maxResults, this, rawFileMatch, this);
	}

	private createFileMatch(query: IPatternInfo, previewOptions: ITextSearchPreviewOptions | undefined, maxResults: number | undefined, parent: ISearchTreeFolderMatch, rawFileMatch: IFileMatch, closestRoot: ISearchTreeFolderMatchWorkspaceRoot | null): FileMatchImpl {
		const fileMatch =
			this.instantiationService.createInstance(
				FileMatchImpl,
				query,
				previewOptions,
				maxResults,
				parent,
				rawFileMatch,
				closestRoot,
				rawFileMatch.resource.toString() + '_' + Date.now().toString(),
			);
		fileMatch.createMatches(true);
		parent.doAddFile(fileMatch);
		const disposable = fileMatch.onChange(({ didRemove }) => parent.onFileChange(fileMatch, didRemove));
		this._register(fileMatch.onDispose(() => disposable.dispose()));
		return fileMatch;
	}


	get hasChildren(): boolean {
		return this._fileMatches.size > 0;
	}

	parent(): ISearchTreeFolderMatch | ITextSearchHeading {
		return this._parent;
	}
	matches(): (ISearchTreeFileMatch | ISearchTreeFolderMatchWithResource)[] {
		return [...this._fileMatches.values()];
	}
	allDownstreamFileMatches(): ISearchTreeFileMatch[] {
		return [...this._fileMatches.values()];
	}


	remove(matches: ISearchTreeFileMatch | ISearchTreeFolderMatchWithResource | (ISearchTreeFileMatch | ISearchTreeFolderMatchWithResource)[]): void {
		if (!Array.isArray(matches)) {
			matches = [matches];
		}
		const allMatches = getFileMatches(matches);
		this.doRemoveFile(allMatches);
	}
	addFileMatch(raw: IFileMatch[], silent: boolean, searchInstanceID: string, isAiContributed: boolean): void {
		// when adding a fileMatch that has intermediate directories
		const added: ISearchTreeFileMatch[] = [];
		const updated: ISearchTreeFileMatch[] = [];

		raw.forEach(rawFileMatch => {
			const fileMatch = this.createAndConfigureFileMatch(rawFileMatch, searchInstanceID);
			added.push(fileMatch);
		});

		const elements = [...added, ...updated];
		if (!silent && elements.length) {
			this._onChange.fire({ elements, added: !!added.length });
		}
	}
	isEmpty(): boolean {
		return this.recursiveFileCount() === 0;
	}
	clear(clearingAll?: boolean): void {
		const changed: ISearchTreeFileMatch[] = this.allDownstreamFileMatches();
		this.disposeMatches();
		this._onChange.fire({ elements: changed, removed: true, added: false, clearingAll });
	}
	showHighlights: boolean = true;
	get searchModel(): ISearchModel {
		return this._searchResult.searchModel;
	}

	get _searchResult(): ISearchResult {
		return this._parent.parent();
	}

	get query(): ITextQuery | null {
		return this._query;
	}
	getDownstreamFileMatch(uri: URI): ISearchTreeFileMatch | null {
		for (const fileMatch of this._fileMatches.values()) {
			if (fileMatch.resource.toString() === uri.toString()) {
				return fileMatch;
			}
		}
		return null;
	}
	replaceAll(): Promise<any> {
		throw new Error('Cannot replace in AI search');
	}
	recursiveFileCount(): number {
		return this._fileMatches.size;
	}

	doRemoveFile(fileMatches: ISearchTreeFileMatch[], dispose: boolean = true, trigger: boolean = true, keepReadonly = false): void {

		const removed = [];
		for (const match of fileMatches as ISearchTreeFileMatch[]) {
			if (this._fileMatches.get(match.id())) {
				if (keepReadonly && match.hasReadonlyMatches()) {
					continue;
				}
				this._fileMatches.delete(match.id());
				if (dispose) {
					match.dispose();
				} else {
					this._unDisposedFileMatches.set(match.id(), match);
				}
				removed.push(match);
			}
		}

		if (trigger) {
			this._onChange.fire({ elements: removed, removed: true });
		}
	}


	public onFileChange(fileMatch: ISearchTreeFileMatch,): void {
		if (!this._fileMatches.has(fileMatch.id())) {
			this.doAddFile(fileMatch);
		}
		if (fileMatch.count() === 0) {
			this.doRemoveFile([fileMatch], false, false);
		}
	}

	replace(match: ISearchTreeFileMatch): Promise<any> {
		throw new Error('Cannot replace in AI search');
	}
	replacingAll: boolean = false;
	bindModel(model: ITextModel): void {
		// no op
	}

	createIntermediateFolderMatch(resource: URI, id: string, index: number, query: ITextQuery, baseWorkspaceFolder: ISearchTreeFolderMatchWorkspaceRoot): ISearchTreeFolderMatchWithResource {
		return this;
	}
	getFolderMatch(resource: URI): ISearchTreeFolderMatchWithResource | undefined {
		return undefined;
	}

	unbindNotebookEditorWidget(editor: NotebookEditorWidget, resource: URI): void {
		//no op
	}
	bindNotebookEditorWidget(editor: NotebookEditorWidget, resource: URI): Promise<void> {
		//no op
		return Promise.resolve();
	}

	hasOnlyReadOnlyMatches(): boolean {
		return Array.from(this._fileMatches.values()).every(fm => fm.hasOnlyReadOnlyMatches());
	}
	fileMatchesIterator(): IterableIterator<ISearchTreeFileMatch> {
		return this._fileMatches.values();
	}
	folderMatchesIterator(): IterableIterator<ISearchTreeFolderMatchWithResource> {
		return [].values();
	}
	recursiveMatchCount(): number {
		return this._fileMatches.size;
	}

	disposeMatches(): void {
		[...this._fileMatches.values()].forEach((fileMatch: ISearchTreeFileMatch) => fileMatch.dispose());
		[...this._unDisposedFileMatches.values()].forEach((fileMatch: ISearchTreeFileMatch) => fileMatch.dispose());
	}

	override dispose(): void {
		this.disposeMatches();
		this._onDispose.fire();
		super.dispose();
	}
}
