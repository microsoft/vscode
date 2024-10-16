/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { themeColorFromId } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { TrackedRangeStickiness, MinimapPosition, ITextModel, FindMatch, IModelDeltaDecoration } from '../../../../../editor/common/model.js';
import { ModelDecorationOptions } from '../../../../../editor/common/model/textModel.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IFileStatWithPartialMetadata, IFileService } from '../../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { overviewRulerFindMatchForeground, minimapFindMatch } from '../../../../../platform/theme/common/colorRegistry.js';
import { IFileMatch, IPatternInfo, ITextSearchPreviewOptions, resultIsMatch, DEFAULT_MAX_SEARCH_RESULTS, ITextSearchResult, ITextSearchContext } from '../../../../services/search/common/search.js';
import { editorMatchesToTextSearchResults, getTextSearchMatchWithModelContext } from '../../../../services/search/common/searchHelpers.js';
import { FindMatchDecorationModel } from '../../../notebook/browser/contrib/find/findMatchDecorationModel.js';
import { IReplaceService } from '../replace.js';
import { FILE_MATCH_PREFIX, ISearchTreeFileMatch, ISearchTreeFolderMatch, ISearchTreeFolderMatchWorkspaceRoot, ISearchTreeMatch } from './searchTreeCommon.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { textSearchResultToMatches } from './match.js';
import { OverviewRulerLane } from '../../../../../editor/common/standalone/standaloneEnums.js';

export class FileMatchImpl extends Disposable implements ISearchTreeFileMatch {

	private static readonly _CURRENT_FIND_MATCH = ModelDecorationOptions.register({
		description: 'search-current-find-match',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		zIndex: 13,
		className: 'currentFindMatch',
		overviewRuler: {
			color: themeColorFromId(overviewRulerFindMatchForeground),
			position: OverviewRulerLane.Center
		},
		minimap: {
			color: themeColorFromId(minimapFindMatch),
			position: MinimapPosition.Inline
		}
	});

	private static readonly _FIND_MATCH = ModelDecorationOptions.register({
		description: 'search-find-match',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'findMatch',
		overviewRuler: {
			color: themeColorFromId(overviewRulerFindMatchForeground),
			position: OverviewRulerLane.Center
		},
		minimap: {
			color: themeColorFromId(minimapFindMatch),
			position: MinimapPosition.Inline
		}
	});

	private static getDecorationOption(selected: boolean): ModelDecorationOptions {
		return (selected ? FileMatchImpl._CURRENT_FIND_MATCH : FileMatchImpl._FIND_MATCH);
	}

	protected _findMatchDecorationModel: FindMatchDecorationModel | undefined;

	protected _onChange = this._register(new Emitter<{ didRemove?: boolean; forceUpdateModel?: boolean }>());
	readonly onChange: Event<{ didRemove?: boolean; forceUpdateModel?: boolean }> = this._onChange.event;

	private _onDispose = this._register(new Emitter<void>());
	readonly onDispose: Event<void> = this._onDispose.event;

	protected _resource: URI;
	private _fileStat?: IFileStatWithPartialMetadata;
	private _model: ITextModel | null = null;
	private _modelListener: IDisposable | null = null;
	protected _textMatches: Map<string, ISearchTreeMatch>;

	private _removedTextMatches: Set<string>;
	protected _selectedMatch: ISearchTreeMatch | null = null;
	private _name: Lazy<string>;

	private _updateScheduler: RunOnceScheduler;
	private _modelDecorations: string[] = [];

	private _context: Map<number, string> = new Map();

	public get context(): Map<number, string> {
		return new Map(this._context);
	}
	constructor(
		protected _query: IPatternInfo,
		private _previewOptions: ITextSearchPreviewOptions | undefined,
		private _maxResults: number | undefined,
		private _parent: ISearchTreeFolderMatch,
		protected rawMatch: IFileMatch,
		private _closestRoot: ISearchTreeFolderMatchWorkspaceRoot | null,
		@IModelService protected readonly modelService: IModelService,
		@IReplaceService private readonly replaceService: IReplaceService,
		@ILabelService labelService: ILabelService,
	) {
		super();
		this._resource = this.rawMatch.resource;
		this._textMatches = new Map<string, ISearchTreeMatch>();
		this._removedTextMatches = new Set<string>();
		this._updateScheduler = new RunOnceScheduler(this.updateMatchesForModel.bind(this), 250);
		this._name = new Lazy(() => labelService.getUriBasenameLabel(this.resource));
	}


	get closestRoot(): ISearchTreeFolderMatchWorkspaceRoot | null {
		return this._closestRoot;
	}

	hasReadonlyMatches(): boolean {
		return this.matches().some(m => m.isReadonly);
	}

	createMatches(): void {
		const model = this.modelService.getModel(this._resource);
		if (model) {
			// todo: handle better when ai contributed results has model, currently, createMatches does not work for this
			this.bindModel(model);
			this.updateMatchesForModel();
		} else {

			if (this.rawMatch.results) {
				this.rawMatch.results
					.filter(resultIsMatch)
					.forEach(rawMatch => {
						textSearchResultToMatches(rawMatch, this, false)
							.forEach(m => this.add(m));
					});
			}
		}
	}
	bindModel(model: ITextModel): void {
		this._model = model;
		this._modelListener = this._model.onDidChangeContent(() => {
			this._updateScheduler.schedule();
		});
		this._model.onWillDispose(() => this.onModelWillDispose());
		this.updateHighlights();
	}

	private onModelWillDispose(): void {
		// Update matches because model might have some dirty changes
		this.updateMatchesForModel();
		this.unbindModel();
	}

	private unbindModel(): void {
		if (this._model) {
			this._updateScheduler.cancel();
			this._model.changeDecorations((accessor) => {
				this._modelDecorations = accessor.deltaDecorations(this._modelDecorations, []);
			});
			this._model = null;
			this._modelListener!.dispose();
		}
	}

	protected updateMatchesForModel(): void {
		// this is called from a timeout and might fire
		// after the model has been disposed
		if (!this._model) {
			return;
		}
		this._textMatches = new Map<string, ISearchTreeMatch>();

		const wordSeparators = this._query.isWordMatch && this._query.wordSeparators ? this._query.wordSeparators : null;
		const matches = this._model
			.findMatches(this._query.pattern, this._model.getFullModelRange(), !!this._query.isRegExp, !!this._query.isCaseSensitive, wordSeparators, false, this._maxResults ?? DEFAULT_MAX_SEARCH_RESULTS);

		this.updateMatches(matches, true, this._model, false);
	}



	protected async updatesMatchesForLineAfterReplace(lineNumber: number, modelChange: boolean): Promise<void> {
		if (!this._model) {
			return;
		}
		const range = {
			startLineNumber: lineNumber,
			startColumn: this._model.getLineMinColumn(lineNumber),
			endLineNumber: lineNumber,
			endColumn: this._model.getLineMaxColumn(lineNumber)
		};
		const oldMatches = Array.from(this._textMatches.values()).filter(match => match.range().startLineNumber === lineNumber);
		oldMatches.forEach(match => this._textMatches.delete(match.id()));

		const wordSeparators = this._query.isWordMatch && this._query.wordSeparators ? this._query.wordSeparators : null;
		const matches = this._model.findMatches(this._query.pattern, range, !!this._query.isRegExp, !!this._query.isCaseSensitive, wordSeparators, false, this._maxResults ?? DEFAULT_MAX_SEARCH_RESULTS);
		this.updateMatches(matches, modelChange, this._model, false);
	}



	private updateMatches(matches: FindMatch[], modelChange: boolean, model: ITextModel, isAiContributed: boolean): void {
		const textSearchResults = editorMatchesToTextSearchResults(matches, model, this._previewOptions);
		textSearchResults.forEach(textSearchResult => {
			textSearchResultToMatches(textSearchResult, this, isAiContributed).forEach(match => {
				if (!this._removedTextMatches.has(match.id())) {
					this.add(match);
					if (this.isMatchSelected(match)) {
						this._selectedMatch = match;
					}
				}
			});
		});

		this.addContext(getTextSearchMatchWithModelContext(textSearchResults, model, this.parent().parent().query!));

		this._onChange.fire({ forceUpdateModel: modelChange });
		this.updateHighlights();
	}

	updateHighlights(): void {
		if (!this._model) {
			return;
		}

		this._model.changeDecorations((accessor) => {
			const newDecorations = (
				this.parent().showHighlights
					? this.matches().map((match): IModelDeltaDecoration => ({
						range: match.range(),
						options: FileMatchImpl.getDecorationOption(this.isMatchSelected(match))
					}))
					: []
			);
			this._modelDecorations = accessor.deltaDecorations(this._modelDecorations, newDecorations);
		});
	}

	id(): string {
		return FILE_MATCH_PREFIX + this.resource.toString();
	}

	parent(): ISearchTreeFolderMatch {
		return this._parent;
	}

	get hasChildren(): boolean {
		return this._textMatches.size > 0;
	}

	matches(): ISearchTreeMatch[] {
		return [...this._textMatches.values()];
	}

	textMatches(): ISearchTreeMatch[] {
		return Array.from(this._textMatches.values());
	}

	remove(matches: ISearchTreeMatch | ISearchTreeMatch[]): void {
		if (!Array.isArray(matches)) {
			matches = [matches];
		}

		for (const match of matches) {
			this.removeMatch(match);
			this._removedTextMatches.add(match.id());
		}

		this._onChange.fire({ didRemove: true });
	}

	private replaceQ = Promise.resolve();
	async replace(toReplace: ISearchTreeMatch): Promise<void> {
		return this.replaceQ = this.replaceQ.finally(async () => {
			await this.replaceService.replace(toReplace);
			await this.updatesMatchesForLineAfterReplace(toReplace.range().startLineNumber, false);
		});
	}

	setSelectedMatch(match: ISearchTreeMatch | null): void {
		if (match) {

			if (!this._textMatches.has(match.id())) {
				return;
			}
			if (this.isMatchSelected(match)) {
				return;
			}
		}

		this._selectedMatch = match;
		this.updateHighlights();
	}

	getSelectedMatch(): ISearchTreeMatch | null {
		return this._selectedMatch;
	}

	isMatchSelected(match: ISearchTreeMatch): boolean {
		return !!this._selectedMatch && this._selectedMatch.id() === match.id();
	}

	count(): number {
		return this.matches().length;
	}

	get resource(): URI {
		return this._resource;
	}

	name(): string {
		return this._name.value;
	}

	addContext(results: ITextSearchResult[] | undefined) {
		if (!results) { return; }

		const contexts = results
			.filter((result =>
				!resultIsMatch(result)) as ((a: any) => a is ITextSearchContext));

		return contexts.forEach(context => this._context.set(context.lineNumber, context.text));
	}

	add(match: ISearchTreeMatch, trigger?: boolean) {
		this._textMatches.set(match.id(), match);
		if (trigger) {
			this._onChange.fire({ forceUpdateModel: true });
		}
	}

	protected removeMatch(match: ISearchTreeMatch) {
		this._textMatches.delete(match.id());
		if (this.isMatchSelected(match)) {
			this.setSelectedMatch(null);
			this._findMatchDecorationModel?.clearCurrentFindMatchDecoration();
		} else {
			this.updateHighlights();
		}
	}

	async resolveFileStat(fileService: IFileService): Promise<void> {
		this._fileStat = await fileService.stat(this.resource).catch(() => undefined);
	}

	public get fileStat(): IFileStatWithPartialMetadata | undefined {
		return this._fileStat;
	}

	public set fileStat(stat: IFileStatWithPartialMetadata | undefined) {
		this._fileStat = stat;
	}

	override dispose(): void {
		this.setSelectedMatch(null);
		this.unbindModel();
		this._onDispose.fire();
		super.dispose();
	}

	hasOnlyReadOnlyMatches(): boolean {
		return this.matches().every(match => match.isReadonly);
	}

	// #region strictly notebook methods

	//#endregion
}

