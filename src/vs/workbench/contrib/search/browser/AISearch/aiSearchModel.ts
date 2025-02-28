/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IPosition } from '../../../../../editor/common/core/position.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IAITextQuery, IFileMatch, ITextSearchPreviewOptions, resultIsMatch } from '../../../../services/search/common/search.js';
import { NotebookEditorWidget } from '../../../notebook/browser/notebookEditorWidget.js';
import { IReplaceService } from '../replace.js';

import { FileMatchImpl } from '../searchTreeModel/fileMatch.js';
import { ISearchResult, TEXT_SEARCH_HEADING_PREFIX, AI_TEXT_SEARCH_RESULT_ID, ISearchTreeFolderMatchWorkspaceRoot, ISearchTreeFolderMatch, ISearchTreeFolderMatchWithResource, ITextSearchHeading, IChangeEvent, ISearchModel, ISearchTreeFileMatch, FOLDER_MATCH_PREFIX, getFileMatches, FILE_MATCH_PREFIX } from '../searchTreeModel/searchTreeCommon.js';
import { TextSearchHeadingImpl } from '../searchTreeModel/textSearchHeading.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { textSearchResultToMatches } from '../searchTreeModel/match.js';
import { ISearchTreeAIFileMatch } from './aiSearchModelBase.js';

export class AITextSearchHeadingImpl extends TextSearchHeadingImpl<IAITextQuery> {
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

	override get query(): IAITextQuery | null {
		return this._query;
	}

	override set query(query: IAITextQuery | null) {
		this.clearQuery();
		if (!query) {
			return;
		}

		this._folderMatches = (query && query.folderQueries || [])
			.map(fq => fq.folder)
			.map((resource, index) => <ISearchTreeFolderMatchWorkspaceRoot>this._createBaseFolderMatch(resource, resource.toString(), index, query));

		this._folderMatches.forEach(fm => this._folderMatchesMap.set(fm.resource, fm));

		this._query = query;
	}

	private _createBaseFolderMatch(resource: URI, id: string, index: number, query: IAITextQuery): ISearchTreeFolderMatch {
		const folderMatch: ISearchTreeFolderMatch = this._register(this.createWorkspaceRootWithResourceImpl(resource, id, index, query));
		const disposable = folderMatch.onChange((event) => this._onChange.fire(event));
		this._register(folderMatch.onDispose(() => disposable.dispose()));
		return folderMatch;
	}

	private createWorkspaceRootWithResourceImpl(resource: URI, id: string, index: number, query: IAITextQuery): ISearchTreeFolderMatchWorkspaceRoot {
		return this.instantiationService.createInstance(AIFolderMatchWorkspaceRootImpl, resource, id, index, query, this);
	}
}

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
		private _query: IAITextQuery,
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

	private latestRank = 0;
	createAndConfigureFileMatch(rawFileMatch: IFileMatch<URI>, searchInstanceID: string): FileMatchImpl {

		const fileMatch =
			this.instantiationService.createInstance(
				AIFileMatch,
				this._query.contentPattern,
				this._query.previewOptions,
				this._query.maxResults,
				this,
				rawFileMatch,
				this,
				rawFileMatch.resource.toString() + '_' + Date.now().toString(),
				this.latestRank++,
			);
		fileMatch.createMatches();
		this.doAddFile(fileMatch);
		const disposable = fileMatch.onChange(({ didRemove }) => this.onFileChange(fileMatch, didRemove));
		this._register(fileMatch.onDispose(() => disposable.dispose()));
		return fileMatch;
	}

	isAIContributed(): boolean {
		return true;
	}

	private onFileChange(fileMatch: ISearchTreeFileMatch, removed = false): void {
		let added = false;
		if (!this._fileMatches.has(fileMatch.id())) {
			this.doAddFile(fileMatch);
			added = true;
		}
		if (fileMatch.count() === 0) {
			this.doRemoveFile([fileMatch], false, false);
			added = false;
			removed = true;
		}
		this._onChange.fire({ elements: [fileMatch], added: added, removed: removed });

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
	addFileMatch(raw: IFileMatch[], silent: boolean, searchInstanceID: string): void {
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

	get showHighlights(): boolean {
		return this._parent.showHighlights;
	}

	get searchModel(): ISearchModel {
		return this._searchResult.searchModel;
	}

	get _searchResult(): ISearchResult {
		return this._parent.parent();
	}

	get query(): IAITextQuery | null {
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

	replace(match: ISearchTreeFileMatch): Promise<any> {
		throw new Error('Cannot replace in AI search');
	}
	replacingAll: boolean = false;

	bindModel(model: ITextModel): void {
		// no op
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

	private disposeMatches(): void {
		[...this._fileMatches.values()].forEach((fileMatch: ISearchTreeFileMatch) => fileMatch.dispose());
		[...this._unDisposedFileMatches.values()].forEach((fileMatch: ISearchTreeFileMatch) => fileMatch.dispose());
		this._fileMatches.clear();
	}

	override dispose(): void {
		this.disposeMatches();
		this._onDispose.fire();
		super.dispose();
	}
}

class AIFileMatch extends FileMatchImpl implements ISearchTreeAIFileMatch {
	constructor(
		_query: string,
		_previewOptions: ITextSearchPreviewOptions | undefined,
		_maxResults: number | undefined,
		_parent: ISearchTreeFolderMatch,
		rawMatch: IFileMatch,
		_closestRoot: ISearchTreeFolderMatchWorkspaceRoot | null,
		private readonly _id: string,
		public readonly rank: number,
		@IModelService modelService: IModelService,
		@IReplaceService replaceService: IReplaceService,
		@ILabelService labelService: ILabelService,
	) {
		super({ pattern: _query }, _previewOptions, _maxResults, _parent, rawMatch, _closestRoot, modelService, replaceService, labelService);
	}

	override id() {
		return FILE_MATCH_PREFIX + this._id;
	}
	getFullRange(): Range | undefined {

		let earliestStart: IPosition | undefined = undefined;
		let latestEnd: IPosition | undefined = undefined;

		for (const match of this.matches()) {
			const matchStart = match.range().getStartPosition();
			const matchEnd = match.range().getEndPosition();
			if (earliestStart === undefined) {
				earliestStart = matchStart;
			} else if (matchStart.isBefore(earliestStart)) {
				earliestStart = matchStart;
			}

			if (latestEnd === undefined) {
				latestEnd = matchEnd;
			} else if (!matchEnd.isBefore(latestEnd)) {
				latestEnd = matchEnd;
			}
		}

		if (earliestStart === undefined || latestEnd === undefined) {
			return undefined;
		}
		return new Range(earliestStart.lineNumber, earliestStart.column, latestEnd.lineNumber, latestEnd.column);

	}

	private rangeAsString(): undefined | string {
		const range = this.getFullRange();
		if (!range) {
			return undefined;
		}
		return range.startLineNumber + ':' + range.startColumn + '-' + range.endLineNumber + ':' + range.endColumn;
	}

	override name(): string {
		const range = this.rangeAsString();
		return super.name() + range ? ' ' + range : '';
	}

	override createMatches(): void {
		if (this.rawMatch.results) {
			this.rawMatch.results
				.filter(resultIsMatch)
				.forEach(rawMatch => {
					textSearchResultToMatches(rawMatch, this, true)
						.forEach(m => this.add(m));
				});
		}
	}
}
