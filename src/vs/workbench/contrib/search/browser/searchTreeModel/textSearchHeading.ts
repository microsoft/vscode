/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { TernarySearchTree } from '../../../../../base/common/ternarySearchTree.js';
import { URI } from '../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IProgress, IProgressStep } from '../../../../../platform/progress/common/progress.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IReplaceService } from '../replace.js';
import { IFileMatch, ISearchComplete, ITextQuery, ITextSearchQuery } from '../../../../services/search/common/search.js';
import { RangeHighlightDecorations } from './rangeDecorations.js';
import { FolderMatchNoRootImpl, FolderMatchWorkspaceRootImpl } from './folderMatch.js';
import { IChangeEvent, ISearchTreeFileMatch, ISearchTreeFolderMatch, ISearchTreeFolderMatchWithResource, ISearchTreeFolderMatchWorkspaceRoot, IPlainTextSearchHeading, ISearchResult, isSearchTreeFileMatch, isSearchTreeFolderMatch, ITextSearchHeading, ISearchTreeMatch, TEXT_SEARCH_HEADING_PREFIX, PLAIN_TEXT_SEARCH__RESULT_ID, ISearchTreeFolderMatchNoRoot } from './searchTreeCommon.js';
import { isNotebookFileMatch } from '../notebookSearch/notebookSearchModelBase.js';


export abstract class TextSearchHeadingImpl<QueryType extends ITextSearchQuery> extends Disposable implements ITextSearchHeading {
	protected _onChange = this._register(new Emitter<IChangeEvent>());
	readonly onChange: Event<IChangeEvent> = this._onChange.event;
	private _isDirty = false;
	private _showHighlights: boolean = false;

	protected _query: QueryType | null = null;
	private _rangeHighlightDecorations: RangeHighlightDecorations;
	private disposePastResults: () => Promise<void> = () => Promise.resolve();

	protected _folderMatches: ISearchTreeFolderMatchWorkspaceRoot[] = [];
	protected _otherFilesMatch: ISearchTreeFolderMatch | null = null;
	protected _folderMatchesMap: TernarySearchTree<URI, ISearchTreeFolderMatchWithResource> = TernarySearchTree.forUris<ISearchTreeFolderMatchWorkspaceRoot>(key => this.uriIdentityService.extUri.ignorePathCasing(key));
	public resource = null;
	public hidden = false;

	public cachedSearchComplete: ISearchComplete | undefined;
	constructor(
		private _allowOtherResults: boolean,
		private _parent: ISearchResult,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService
	) {
		super();
		this._rangeHighlightDecorations = this.instantiationService.createInstance(RangeHighlightDecorations);

		this._register(this.onChange(e => {
			if (e.removed) {
				this._isDirty = !this.isEmpty();
			}
		}));
	}

	hide() {
		this.hidden = true;
		this.clear();
	}

	parent() {
		return this._parent;
	}

	get hasChildren(): boolean {
		return this._folderMatches.length > 0;
	}

	abstract get isAIContributed(): boolean;
	abstract id(): string;
	abstract name(): string;

	get isDirty(): boolean {
		return this._isDirty;
	}

	public getFolderMatch(resource: URI): ISearchTreeFolderMatch | undefined {
		const folderMatch = this._folderMatchesMap.findSubstr(resource);

		if (!folderMatch && this._allowOtherResults && this._otherFilesMatch) {
			return this._otherFilesMatch;
		}
		return folderMatch;
	}

	add(allRaw: IFileMatch[], searchInstanceID: string, silent: boolean = false): void {
		// Split up raw into a list per folder so we can do a batch add per folder.

		const { byFolder, other } = this.groupFilesByFolder(allRaw);
		byFolder.forEach(raw => {
			if (!raw.length) {
				return;
			}

			// ai results go into the respective folder
			const folderMatch = this.getFolderMatch(raw[0].resource);
			folderMatch?.addFileMatch(raw, silent, searchInstanceID);
		});

		if (!this.isAIContributed) {
			this._otherFilesMatch?.addFileMatch(other, silent, searchInstanceID);
		}
		this.disposePastResults();
	}

	remove(matches: ISearchTreeFileMatch | ISearchTreeFolderMatch | (ISearchTreeFileMatch | ISearchTreeFolderMatch)[], ai = false): void {
		if (!Array.isArray(matches)) {
			matches = [matches];
		}

		matches.forEach(m => {
			if (isSearchTreeFolderMatch(m)) {
				m.clear();
			}
		});

		const fileMatches: ISearchTreeFileMatch[] = matches.filter(m => isSearchTreeFileMatch(m)) as ISearchTreeFileMatch[];

		const { byFolder, other } = this.groupFilesByFolder(fileMatches);
		byFolder.forEach(matches => {
			if (!matches.length) {
				return;
			}

			this.getFolderMatch(matches[0].resource)?.remove(matches);
		});

		if (other.length) {
			this.getFolderMatch(other[0].resource)?.remove(<ISearchTreeFileMatch[]>other);
		}
	}

	groupFilesByFolder<FileMatch extends IFileMatch>(fileMatches: FileMatch[]): { byFolder: ResourceMap<FileMatch[]>; other: FileMatch[] } {
		const rawPerFolder = new ResourceMap<FileMatch[]>();
		const otherFileMatches: FileMatch[] = [];
		this._folderMatches.forEach(fm => rawPerFolder.set(fm.resource, []));

		fileMatches.forEach(rawFileMatch => {
			const folderMatch = this.getFolderMatch(rawFileMatch.resource);
			if (!folderMatch) {
				// foldermatch was previously removed by user or disposed for some reason
				return;
			}

			const resource = folderMatch.resource;
			if (resource) {
				rawPerFolder.get(resource)!.push(rawFileMatch);
			} else {
				otherFileMatches.push(rawFileMatch);
			}
		});

		return {
			byFolder: rawPerFolder,
			other: otherFileMatches
		};
	}
	isEmpty(): boolean {
		return this.folderMatches().every((folderMatch) => folderMatch.isEmpty());
	}

	findFolderSubstr(resource: URI) {
		return this._folderMatchesMap.findSubstr(resource);
	}

	abstract query: QueryType | null;

	protected clearQuery(): void {
		// When updating the query we could change the roots, so keep a reference to them to clean up when we trigger `disposePastResults`
		const oldFolderMatches = this.folderMatches();
		this.disposePastResults = async () => {
			oldFolderMatches.forEach(match => match.clear());
			oldFolderMatches.forEach(match => match.dispose());
			this._isDirty = false;
		};

		this.cachedSearchComplete = undefined;

		this._rangeHighlightDecorations.removeHighlightRange();
		this._folderMatchesMap = TernarySearchTree.forUris<ISearchTreeFolderMatchWithResource>(key => this.uriIdentityService.extUri.ignorePathCasing(key));
	}

	folderMatches(): ISearchTreeFolderMatch[] {
		return this._otherFilesMatch && this._allowOtherResults ?
			[
				...this._folderMatches,
				this._otherFilesMatch,
			] :
			this._folderMatches;
	}

	private disposeMatches(): void {
		this.folderMatches().forEach(folderMatch => folderMatch.dispose());

		this._folderMatches = [];

		this._folderMatchesMap = TernarySearchTree.forUris<ISearchTreeFolderMatchWithResource>(key => this.uriIdentityService.extUri.ignorePathCasing(key));

		this._rangeHighlightDecorations.removeHighlightRange();
	}

	matches(): ISearchTreeFileMatch[] {
		const matches: ISearchTreeFileMatch[][] = [];
		this.folderMatches().forEach(folderMatch => {
			matches.push(folderMatch.allDownstreamFileMatches());
		});

		return (<ISearchTreeFileMatch[]>[]).concat(...matches);
	}

	get showHighlights(): boolean {
		return this._showHighlights;
	}

	toggleHighlights(value: boolean): void {
		if (this._showHighlights === value) {
			return;
		}
		this._showHighlights = value;
		let selectedMatch: ISearchTreeMatch | null = null;
		this.matches().forEach((fileMatch: ISearchTreeFileMatch) => {
			fileMatch.updateHighlights();
			if (isNotebookFileMatch(fileMatch)) {
				fileMatch.updateNotebookHighlights();
			}
			if (!selectedMatch) {
				selectedMatch = fileMatch.getSelectedMatch();
			}
		});
		if (this._showHighlights && selectedMatch) {
			// TS?
			this._rangeHighlightDecorations.highlightRange(
				(<ISearchTreeMatch>selectedMatch).parent().resource,
				(<ISearchTreeMatch>selectedMatch).range()
			);
		} else {
			this._rangeHighlightDecorations.removeHighlightRange();
		}
	}

	get rangeHighlightDecorations(): RangeHighlightDecorations {
		return this._rangeHighlightDecorations;
	}

	fileCount(): number {
		return this.folderMatches().reduce<number>((prev, match) => prev + match.recursiveFileCount(), 0);
	}

	count(): number {
		return this.matches().reduce<number>((prev, match) => prev + match.count(), 0);
	}

	clear(clearAll: boolean = true): void {
		this.cachedSearchComplete = undefined;
		this.folderMatches().forEach((folderMatch) => folderMatch.clear(clearAll));
		this.disposeMatches();
		this._folderMatches = [];
		this._otherFilesMatch = null;
	}

	override async dispose(): Promise<void> {
		this._rangeHighlightDecorations.dispose();
		this.disposeMatches();
		super.dispose();
		await this.disposePastResults();
	}
}

export class PlainTextSearchHeadingImpl extends TextSearchHeadingImpl<ITextQuery> implements IPlainTextSearchHeading {
	constructor(
		parent: ISearchResult,
		@IInstantiationService instantiationService: IInstantiationService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IReplaceService private readonly replaceService: IReplaceService,
	) {
		super(true, parent, instantiationService, uriIdentityService);
	}

	id(): string {
		return TEXT_SEARCH_HEADING_PREFIX + PLAIN_TEXT_SEARCH__RESULT_ID;
	}

	get isAIContributed(): boolean {
		return false;
	}

	replace(match: ISearchTreeFileMatch): Promise<any> {
		return this.getFolderMatch(match.resource)?.replace(match) ?? Promise.resolve();
	}

	override name(): string {
		return 'Text';
	}

	replaceAll(progress: IProgress<IProgressStep>): Promise<any> {
		this.replacingAll = true;

		const promise = this.replaceService.replace(this.matches(), progress);

		return promise.then(() => {
			this.replacingAll = false;
			this.clear();
		}, () => {
			this.replacingAll = false;
		});
	}

	private set replacingAll(running: boolean) {
		this.folderMatches().forEach((folderMatch) => {
			folderMatch.replacingAll = running;
		});
	}

	override get query(): ITextQuery | null {
		return this._query;
	}

	override set query(query: ITextQuery | null) {
		this.clearQuery();

		if (!query) {
			return;
		}

		this._folderMatches = (query && query.folderQueries || [])
			.map(fq => fq.folder)
			.map((resource, index) => <ISearchTreeFolderMatchWorkspaceRoot>this._createBaseFolderMatch(resource, resource.toString(), index, query));

		this._folderMatches.forEach(fm => this._folderMatchesMap.set(fm.resource, fm));

		this._otherFilesMatch = this._createBaseFolderMatch(null, 'otherFiles', this._folderMatches.length + 1, query);

		this._query = query;
	}

	private _createBaseFolderMatch(resource: URI | null, id: string, index: number, query: ITextQuery): ISearchTreeFolderMatch {
		let folderMatch: ISearchTreeFolderMatch;
		if (resource) {
			folderMatch = this._register(this.createWorkspaceRootWithResourceImpl(resource, id, index, query));
		} else {
			folderMatch = this._register(this.createNoRootWorkspaceImpl(id, index, query));
		}
		const disposable = folderMatch.onChange((event) => this._onChange.fire(event));
		this._register(folderMatch.onDispose(() => disposable.dispose()));
		return folderMatch;
	}

	private createWorkspaceRootWithResourceImpl(resource: URI, id: string, index: number, query: ITextQuery,): ISearchTreeFolderMatchWorkspaceRoot {
		return this.instantiationService.createInstance(FolderMatchWorkspaceRootImpl, resource, id, index, query, this);
	}

	private createNoRootWorkspaceImpl(id: string, index: number, query: ITextQuery): ISearchTreeFolderMatchNoRoot {
		return this._register(this.instantiationService.createInstance(FolderMatchNoRootImpl, id, index, query, this));
	}
}
