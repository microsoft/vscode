/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from 'vs/base/common/arrays';
import { RunOnceScheduler } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { compareFileExtensions, compareFileNames, comparePaths } from 'vs/base/common/comparers';
import { memoize } from 'vs/base/common/decorators';
import * as errors from 'vs/base/common/errors';
import { Emitter, Event, PauseableEmitter } from 'vs/base/common/event';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ResourceMap, ResourceSet } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import { lcut } from 'vs/base/common/strings';
import { TernarySearchTree } from 'vs/base/common/ternarySearchTree';
import { isNumber } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { FindMatch, IModelDeltaDecoration, ITextModel, MinimapPosition, OverviewRulerLane, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IModelService } from 'vs/editor/common/services/model';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFileService, IFileStatWithPartialMetadata } from 'vs/platform/files/common/files';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { IProgress, IProgressStep } from 'vs/platform/progress/common/progress';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { minimapFindMatch, overviewRulerFindMatchForeground } from 'vs/platform/theme/common/colorRegistry';
import { themeColorFromId } from 'vs/platform/theme/common/themeService';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { FindMatchDecorationModel } from 'vs/workbench/contrib/notebook/browser/contrib/find/findMatchDecorationModel';
import { CellEditState, CellFindMatchWithIndex, CellWebviewFindMatch, ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookEditorWidget } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { NotebookCellsChangeType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IReplaceService } from 'vs/workbench/contrib/search/browser/replace';
import { ICellMatch, IFileMatchWithCells, contentMatchesToTextSearchMatches, isIFileMatchWithCells, webviewMatchesToTextSearchMatches } from 'vs/workbench/contrib/search/browser/searchNotebookHelpers';
import { ReplacePattern } from 'vs/workbench/services/search/common/replace';
import { IFileMatch, IPatternInfo, ISearchComplete, ISearchConfigurationProperties, ISearchProgressItem, ISearchRange, ISearchService, ITextQuery, ITextSearchContext, ITextSearchMatch, ITextSearchPreviewOptions, ITextSearchResult, ITextSearchStats, OneLineRange, QueryType, resultIsMatch, SearchCompletionExitCode, SearchSortOrder } from 'vs/workbench/services/search/common/search';
import { addContextToEditorMatches, editorMatchesToTextSearchResults } from 'vs/workbench/services/search/common/searchHelpers';

export class Match {

	private static readonly MAX_PREVIEW_CHARS = 250;
	protected _id: string;
	protected _range: Range;
	private _oneLinePreviewText: string;
	private _rangeInPreviewText: ISearchRange;
	// For replace
	private _fullPreviewRange: ISearchRange;

	constructor(protected _parent: FileMatch, private _fullPreviewLines: string[], _fullPreviewRange: ISearchRange, _documentRange: ISearchRange) {
		this._oneLinePreviewText = _fullPreviewLines[_fullPreviewRange.startLineNumber];
		const adjustedEndCol = _fullPreviewRange.startLineNumber === _fullPreviewRange.endLineNumber ?
			_fullPreviewRange.endColumn :
			this._oneLinePreviewText.length;
		this._rangeInPreviewText = new OneLineRange(1, _fullPreviewRange.startColumn + 1, adjustedEndCol + 1);

		this._range = new Range(
			_documentRange.startLineNumber + 1,
			_documentRange.startColumn + 1,
			_documentRange.endLineNumber + 1,
			_documentRange.endColumn + 1);

		this._fullPreviewRange = _fullPreviewRange;

		this._id = this._parent.id() + '>' + this._range + this.getMatchString();
	}

	id(): string {
		return this._id;
	}

	parent(): FileMatch {
		return this._parent;
	}

	text(): string {
		return this._oneLinePreviewText;
	}

	range(): Range {
		return this._range;
	}

	@memoize
	preview(): { before: string; inside: string; after: string } {
		let before = this._oneLinePreviewText.substring(0, this._rangeInPreviewText.startColumn - 1),
			inside = this.getMatchString(),
			after = this._oneLinePreviewText.substring(this._rangeInPreviewText.endColumn - 1);

		before = lcut(before, 26);
		before = before.trimLeft();

		let charsRemaining = Match.MAX_PREVIEW_CHARS - before.length;
		inside = inside.substr(0, charsRemaining);
		charsRemaining -= inside.length;
		after = after.substr(0, charsRemaining);

		return {
			before,
			inside,
			after,
		};
	}

	get replaceString(): string {
		const searchModel = this.parent().parent().searchModel;
		if (!searchModel.replacePattern) {
			throw new Error('searchModel.replacePattern must be set before accessing replaceString');
		}

		const fullMatchText = this.fullMatchText();
		let replaceString = searchModel.replacePattern.getReplaceString(fullMatchText, searchModel.preserveCase);
		if (replaceString !== null) {
			return replaceString;
		}

		// Search/find normalize line endings - check whether \r prevents regex from matching
		const fullMatchTextWithoutCR = fullMatchText.replace(/\r\n/g, '\n');
		if (fullMatchTextWithoutCR !== fullMatchText) {
			replaceString = searchModel.replacePattern.getReplaceString(fullMatchTextWithoutCR, searchModel.preserveCase);
			if (replaceString !== null) {
				return replaceString;
			}
		}

		// If match string is not matching then regex pattern has a lookahead expression
		const contextMatchTextWithSurroundingContent = this.fullMatchText(true);
		replaceString = searchModel.replacePattern.getReplaceString(contextMatchTextWithSurroundingContent, searchModel.preserveCase);
		if (replaceString !== null) {
			return replaceString;
		}

		// Search/find normalize line endings, this time in full context
		const contextMatchTextWithoutCR = contextMatchTextWithSurroundingContent.replace(/\r\n/g, '\n');
		if (contextMatchTextWithoutCR !== contextMatchTextWithSurroundingContent) {
			replaceString = searchModel.replacePattern.getReplaceString(contextMatchTextWithoutCR, searchModel.preserveCase);
			if (replaceString !== null) {
				return replaceString;
			}
		}

		// Match string is still not matching. Could be unsupported matches (multi-line).
		return searchModel.replacePattern.pattern;
	}

	fullMatchText(includeSurrounding = false): string {
		let thisMatchPreviewLines: string[];
		if (includeSurrounding) {
			thisMatchPreviewLines = this._fullPreviewLines;
		} else {
			thisMatchPreviewLines = this._fullPreviewLines.slice(this._fullPreviewRange.startLineNumber, this._fullPreviewRange.endLineNumber + 1);
			thisMatchPreviewLines[thisMatchPreviewLines.length - 1] = thisMatchPreviewLines[thisMatchPreviewLines.length - 1].slice(0, this._fullPreviewRange.endColumn);
			thisMatchPreviewLines[0] = thisMatchPreviewLines[0].slice(this._fullPreviewRange.startColumn);
		}

		return thisMatchPreviewLines.join('\n');
	}

	rangeInPreview() {
		// convert to editor's base 1 positions.
		return {
			...this._fullPreviewRange,
			startColumn: this._fullPreviewRange.startColumn + 1,
			endColumn: this._fullPreviewRange.endColumn + 1
		};
	}

	fullPreviewLines(): string[] {
		return this._fullPreviewLines.slice(this._fullPreviewRange.startLineNumber, this._fullPreviewRange.endLineNumber + 1);
	}

	getMatchString(): string {
		return this._oneLinePreviewText.substring(this._rangeInPreviewText.startColumn - 1, this._rangeInPreviewText.endColumn - 1);
	}
}

export class CellMatch {
	private _contentMatches: Map<string, MatchInNotebook>;
	private _webviewMatches: Map<string, MatchInNotebook>;
	private _context: Map<number, string>;

	constructor(
		private readonly _parent: FileMatch,
		private readonly _cell: ICellViewModel,
		private readonly _cellIndex: number,
	) {

		this._contentMatches = new Map<string, MatchInNotebook>();
		this._webviewMatches = new Map<string, MatchInNotebook>();
		this._context = new Map<number, string>();
	}

	get context(): Map<number, string> {
		return new Map(this._context);
	}

	matches() {
		return [...this._contentMatches.values(), ... this._webviewMatches.values()];
	}

	get contentMatches(): MatchInNotebook[] {
		return Array.from(this._contentMatches.values());
	}

	get webviewMatches(): MatchInNotebook[] {
		return Array.from(this._webviewMatches.values());
	}

	remove(matches: MatchInNotebook | MatchInNotebook[]): void {
		if (!Array.isArray(matches)) {
			matches = [matches];
		}
		for (const match of matches) {
			this._contentMatches.delete(match.id());
			this._webviewMatches.delete(match.id());
		}
	}

	addContentMatches(textSearchMatches: ITextSearchMatch[]) {
		const contentMatches = textSearchMatchesToNotebookMatches(textSearchMatches, this);
		contentMatches.forEach((match) => {
			this._contentMatches.set(match.id(), match);
		});
		this.addContext(textSearchMatches);
	}

	public addContext(textSearchMatches: ITextSearchMatch[]) {
		this.cell.resolveTextModel().then((textModel) => {
			const textResultsWithContext = addContextToEditorMatches(textSearchMatches, textModel, this.parent.parent().query!);
			const contexts = textResultsWithContext.filter((result => !resultIsMatch(result)) as ((a: any) => a is ITextSearchContext));
			contexts.map(context => ({ ...context, lineNumber: context.lineNumber + 1 }))
				.forEach((context) => { this._context.set(context.lineNumber, context.text); });
		});
	}

	addWebviewMatches(textSearchMatches: ITextSearchMatch[]) {
		const webviewMatches = textSearchMatchesToNotebookMatches(textSearchMatches, this);
		webviewMatches.forEach((match) => {
			this._webviewMatches.set(match.id(), match);
		});
		// TODO: add webview results to context
	}


	get parent(): FileMatch {
		return this._parent;
	}

	get id(): string {
		return this._cell.id;
	}

	get cellIndex(): number {
		return this._cellIndex;
	}

	get cell(): ICellViewModel {
		return this._cell;
	}

}

export class MatchInNotebook extends Match {
	private _webviewIndex: number | undefined;

	constructor(private readonly _cellParent: CellMatch, _fullPreviewLines: string[], _fullPreviewRange: ISearchRange, _documentRange: ISearchRange, webviewIndex?: number) {
		super(_cellParent.parent, _fullPreviewLines, _fullPreviewRange, _documentRange);
		this._id = this._parent.id() + '>' + this._cellParent.cellIndex + (webviewIndex ? '_' + webviewIndex : '') + '_' + this.notebookMatchTypeString() + this._range + this.getMatchString();
		this._webviewIndex = webviewIndex;
	}

	override parent(): FileMatch { // visible parent in search tree
		return this._cellParent.parent;
	}

	get cellParent(): CellMatch {
		return this._cellParent;
	}

	private notebookMatchTypeString(): string {
		return this.isWebviewMatch() ? 'webview' : 'content';
	}

	public isWebviewMatch() {
		return this._webviewIndex !== undefined;
	}

	get cellIndex() {
		return this._cellParent.cellIndex;
	}

	get webviewIndex() {
		return this._webviewIndex;
	}

	get cell() {
		return this._cellParent.cell;
	}
}


export class FileMatch extends Disposable implements IFileMatch {

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
		return (selected ? FileMatch._CURRENT_FIND_MATCH : FileMatch._FIND_MATCH);
	}

	protected _onChange = this._register(new Emitter<{ didRemove?: boolean; forceUpdateModel?: boolean }>());
	readonly onChange: Event<{ didRemove?: boolean; forceUpdateModel?: boolean }> = this._onChange.event;

	private _onDispose = this._register(new Emitter<void>());
	readonly onDispose: Event<void> = this._onDispose.event;

	private _resource: URI;
	private _fileStat?: IFileStatWithPartialMetadata;
	private _model: ITextModel | null = null;
	private _modelListener: IDisposable | null = null;
	private _textMatches: Map<string, Match>;
	private _cellMatches: Map<string, CellMatch>;

	private _removedTextMatches: Set<string>;
	private _selectedMatch: Match | null = null;
	private _name: Lazy<string>;

	private _updateScheduler: RunOnceScheduler;
	private _modelDecorations: string[] = [];

	private _context: Map<number, string> = new Map();

	public get context(): Map<number, string> {
		return new Map(this._context);
	}

	public get cellContext(): Map<string, Map<number, string>> {
		const cellContext = new Map<string, Map<number, string>>();
		this._cellMatches.forEach(cellMatch => {
			cellContext.set(cellMatch.id, cellMatch.context);
		});
		return cellContext;
	}

	// #region notebook fields
	private _notebookEditorWidget: NotebookEditorWidget | null = null;
	private _editorWidgetListener: IDisposable | null = null;
	private _notebookUpdateScheduler: RunOnceScheduler;
	private _findMatchDecorationModel: FindMatchDecorationModel | undefined;
	private _lastEditorWidgetIdForUpdate: string | undefined;
	// #endregion

	constructor(
		private _query: IPatternInfo,
		private _previewOptions: ITextSearchPreviewOptions | undefined,
		private _maxResults: number | undefined,
		private _parent: FolderMatch,
		private rawMatch: IFileMatch,
		private _closestRoot: FolderMatchWorkspaceRoot | null,
		@IModelService private readonly modelService: IModelService,
		@IReplaceService private readonly replaceService: IReplaceService,
		@ILabelService readonly labelService: ILabelService,
		@INotebookEditorService private readonly notebookEditorService: INotebookEditorService,
	) {
		super();
		this._resource = this.rawMatch.resource;
		this._textMatches = new Map<string, Match>();
		this._removedTextMatches = new Set<string>();
		this._updateScheduler = new RunOnceScheduler(this.updateMatchesForModel.bind(this), 250);
		this._name = new Lazy(() => labelService.getUriBasenameLabel(this.resource));
		this._cellMatches = new Map<string, CellMatch>();
		this._notebookUpdateScheduler = new RunOnceScheduler(this.updateMatchesForEditorWidget.bind(this), 250);
		this.createMatches();
	}

	addWebviewMatchesToCell(cellID: string, webviewMatches: ITextSearchMatch[]) {
		const cellMatch = this.getCellMatch(cellID);
		if (cellMatch !== undefined) {
			cellMatch.addWebviewMatches(webviewMatches);
		}
	}

	addContentMatchesToCell(cellID: string, contentMatches: ITextSearchMatch[]) {
		const cellMatch = this.getCellMatch(cellID);
		if (cellMatch !== undefined) {
			cellMatch.addContentMatches(contentMatches);
		}
	}

	getCellMatch(cellID: string): CellMatch | undefined {
		return this._cellMatches.get(cellID);
	}

	addCellMatch(rawCell: ICellMatch) {
		const cellMatch = new CellMatch(this, rawCell.cell, rawCell.index);
		this._cellMatches.set(cellMatch.id, cellMatch);
		this.addWebviewMatchesToCell(rawCell.cell.id, rawCell.webviewResults);
		this.addContentMatchesToCell(rawCell.cell.id, rawCell.contentResults);
	}

	get closestRoot(): FolderMatchWorkspaceRoot | null {
		return this._closestRoot;
	}

	hasWebviewMatches(): boolean {
		return this.matches().some(m => m instanceof MatchInNotebook && m.isWebviewMatch());
	}

	createMatches(): void {
		const model = this.modelService.getModel(this._resource);
		if (model) {
			this.bindModel(model);
			this.updateMatchesForModel();
		} else {
			const notebookEditorWidgetBorrow = this.notebookEditorService.retrieveExistingWidgetFromURI(this.resource);

			if (notebookEditorWidgetBorrow?.value) {
				this.bindNotebookEditorWidget(notebookEditorWidgetBorrow.value);
			}
			if (this.rawMatch.results) {
				this.rawMatch.results
					.filter(resultIsMatch)
					.forEach(rawMatch => {
						textSearchResultToMatches(rawMatch, this)
							.forEach(m => this.add(m));
					});
			}

			if (isIFileMatchWithCells(this.rawMatch)) {
				this.rawMatch.cellResults?.forEach(cell => this.addCellMatch(cell));
				this.setNotebookFindMatchDecorationsUsingCellMatches(this.cellMatches());
				this._onChange.fire({ forceUpdateModel: true });
			}
			this.addContext(this.rawMatch.results);
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

	private updateMatchesForModel(): void {
		// this is called from a timeout and might fire
		// after the model has been disposed
		if (!this._model) {
			return;
		}
		this._textMatches = new Map<string, Match>();

		const wordSeparators = this._query.isWordMatch && this._query.wordSeparators ? this._query.wordSeparators : null;
		const matches = this._model
			.findMatches(this._query.pattern, this._model.getFullModelRange(), !!this._query.isRegExp, !!this._query.isCaseSensitive, wordSeparators, false, this._maxResults ?? Number.MAX_SAFE_INTEGER);

		this.updateMatches(matches, true, this._model);
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
		const matches = this._model.findMatches(this._query.pattern, range, !!this._query.isRegExp, !!this._query.isCaseSensitive, wordSeparators, false, this._maxResults ?? Number.MAX_SAFE_INTEGER);
		this.updateMatches(matches, modelChange, this._model);

		// await this.updateMatchesForEditorWidget();
	}



	private updateMatches(matches: FindMatch[], modelChange: boolean, model: ITextModel): void {
		const textSearchResults = editorMatchesToTextSearchResults(matches, model, this._previewOptions);
		textSearchResults.forEach(textSearchResult => {
			textSearchResultToMatches(textSearchResult, this).forEach(match => {
				if (!this._removedTextMatches.has(match.id())) {
					this.add(match);
					if (this.isMatchSelected(match)) {
						this._selectedMatch = match;
					}
				}
			});
		});

		this.addContext(
			addContextToEditorMatches(textSearchResults, model, this.parent().parent().query!)
				.filter((result => !resultIsMatch(result)) as ((a: any) => a is ITextSearchContext))
				.map(context => ({ ...context, lineNumber: context.lineNumber + 1 })));

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
					? this.matches().map(match => <IModelDeltaDecoration>{
						range: match.range(),
						options: FileMatch.getDecorationOption(this.isMatchSelected(match))
					})
					: []
			);
			this._modelDecorations = accessor.deltaDecorations(this._modelDecorations, newDecorations);
		});
	}

	id(): string {
		return this.resource.toString();
	}

	parent(): FolderMatch {
		return this._parent;
	}

	matches(): Match[] {
		const cellMatches: MatchInNotebook[] = Array.from(this._cellMatches.values()).flatMap((e) => e.matches());
		return [...this._textMatches.values(), ...cellMatches];
	}

	textMatches(): Match[] {
		return Array.from(this._textMatches.values());
	}

	cellMatches(): CellMatch[] {
		return Array.from(this._cellMatches.values());
	}

	remove(matches: Match | Match[]): void {
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
	async replace(toReplace: Match): Promise<void> {
		return this.replaceQ = this.replaceQ.finally(async () => {
			await this.replaceService.replace(toReplace);
			await this.updatesMatchesForLineAfterReplace(toReplace.range().startLineNumber, false);
		});
	}

	setSelectedMatch(match: Match | null): void {
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

	getSelectedMatch(): Match | null {
		return this._selectedMatch;
	}

	isMatchSelected(match: Match): boolean {
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

	add(match: Match, trigger?: boolean) {
		this._textMatches.set(match.id(), match);
		if (trigger) {
			this._onChange.fire({ forceUpdateModel: true });
		}
	}

	private removeMatch(match: Match) {

		if (match instanceof MatchInNotebook) {
			match.cellParent.remove(match);
			if (match.cellParent.matches().length === 0) {
				this._cellMatches.delete(match.cellParent.id);
			}
		} else {
			this._textMatches.delete(match.id());
		}
		if (this.isMatchSelected(match)) {
			this.setSelectedMatch(null);
			this._findMatchDecorationModel?.clearCurrentFindMatchDecoration();
		} else {
			this.updateHighlights();
		}
		if (match instanceof MatchInNotebook) {
			this.setNotebookFindMatchDecorationsUsingCellMatches(this.cellMatches());
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
		this.unbindNotebookEditorWidget();
		this._onDispose.fire();
		super.dispose();
	}

	hasOnlyReadOnlyMatches(): boolean {
		return this.matches().every(match => (match instanceof MatchInNotebook && match.isWebviewMatch()));
	}

	// #region strictly notebook methods
	bindNotebookEditorWidget(widget: NotebookEditorWidget) {
		if (this._notebookEditorWidget === widget) {
			return;
		}

		this._notebookEditorWidget = widget;

		this._editorWidgetListener = this._notebookEditorWidget.textModel?.onDidChangeContent((e) => {
			if (!e.rawEvents.some(event => event.kind === NotebookCellsChangeType.ChangeCellContent || event.kind === NotebookCellsChangeType.ModelChange)) {
				return;
			}
			this._notebookUpdateScheduler.schedule();
		}) ?? null;

		this._findMatchDecorationModel?.stopWebviewFind();
		this._findMatchDecorationModel?.dispose();
		this._findMatchDecorationModel = new FindMatchDecorationModel(this._notebookEditorWidget);
	}

	unbindNotebookEditorWidget(widget?: NotebookEditorWidget) {
		if (widget && this._notebookEditorWidget !== widget) {
			return;
		}

		if (this._notebookEditorWidget) {
			this._notebookUpdateScheduler.cancel();
			this._editorWidgetListener?.dispose();
		}

		if (this._findMatchDecorationModel) {
			this._findMatchDecorationModel?.stopWebviewFind();
			this._findMatchDecorationModel?.dispose();
			this._findMatchDecorationModel = undefined;
		}
		this._notebookEditorWidget = null;
	}
	private updateNotebookMatches(matches: CellFindMatchWithIndex[], modelChange: boolean): void {

		if (!this._notebookEditorWidget) {
			return;
		}

		if (this._notebookEditorWidget.getId() !== this._lastEditorWidgetIdForUpdate) {
			this._cellMatches.clear();
			this._lastEditorWidgetIdForUpdate = this._notebookEditorWidget.getId();
		}

		matches.forEach(match => {
			let cell = this._cellMatches.get(match.cell.id);
			if (!cell) {
				cell = new CellMatch(this, match.cell, match.index);
			}
			cell.addContentMatches(contentMatchesToTextSearchMatches(match.contentMatches, match.cell));
			cell.addWebviewMatches(webviewMatchesToTextSearchMatches(match.webviewMatches));
			this._cellMatches.set(cell.id, cell);

		});

		this._findMatchDecorationModel?.setAllFindMatchesDecorations(matches);
		this._onChange.fire({ forceUpdateModel: modelChange });
	}

	private setNotebookFindMatchDecorationsUsingCellMatches(cells: CellMatch[]): void {
		if (!this._findMatchDecorationModel) {
			return;
		}
		const cellFindMatch: CellFindMatchWithIndex[] = cells.map((cell) => {
			const webviewMatches: CellWebviewFindMatch[] = cell.webviewMatches.map(match => {
				return <CellWebviewFindMatch>{
					index: match.webviewIndex,
				};
			});
			const findMatches: FindMatch[] = cell.contentMatches.map(match => {
				return new FindMatch(match.range(), [match.text()]);
			});
			return <CellFindMatchWithIndex>{
				cell: cell.cell,
				index: cell.cellIndex,
				contentMatches: findMatches,
				webviewMatches: webviewMatches
			};
		});
		try {
			this._findMatchDecorationModel.setAllFindMatchesDecorations(cellFindMatch);
		} catch (e) {
			// no op, might happen due to bugs related to cell output regex search
		}
	}
	async updateMatchesForEditorWidget(): Promise<void> {
		if (!this._notebookEditorWidget) {
			return;
		}

		this._textMatches = new Map<string, Match>();

		const wordSeparators = this._query.isWordMatch && this._query.wordSeparators ? this._query.wordSeparators : null;
		const allMatches = await this._notebookEditorWidget
			.find(this._query.pattern, {
				regex: this._query.isRegExp,
				wholeWord: this._query.isWordMatch,
				caseSensitive: this._query.isCaseSensitive,
				wordSeparators: wordSeparators ?? undefined,
				includeMarkupInput: this._query.notebookInfo?.isInNotebookMarkdownInput,
				includeMarkupPreview: this._query.notebookInfo?.isInNotebookMarkdownPreview,
				includeCodeInput: this._query.notebookInfo?.isInNotebookCellInput,
				includeOutput: this._query.notebookInfo?.isInNotebookCellOutput,
			}, CancellationToken.None, false, true);

		this.updateNotebookMatches(allMatches, true);
	}

	public async showMatch(match: MatchInNotebook) {
		const offset = await this.highlightCurrentFindMatchDecoration(match);
		this.setSelectedMatch(match);
		this.revealCellRange(match, offset);
	}

	private async highlightCurrentFindMatchDecoration(match: MatchInNotebook): Promise<number | null> {
		if (!this._findMatchDecorationModel) {
			return null;
		}
		if (match.webviewIndex === undefined) {
			return this._findMatchDecorationModel.highlightCurrentFindMatchDecorationInCell(match.cell, match.range());
		} else {
			return this._findMatchDecorationModel.highlightCurrentFindMatchDecorationInWebview(match.cell, match.webviewIndex);
		}
	}

	private revealCellRange(match: MatchInNotebook, outputOffset: number | null) {
		if (!this._notebookEditorWidget) {
			return;
		}
		if (match.webviewIndex !== undefined) {
			const index = this._notebookEditorWidget.getCellIndex(match.cell);
			if (index !== undefined) {
				this._notebookEditorWidget.revealCellOffsetInCenterAsync(match.cell, outputOffset ?? 0);
			}
		} else {
			match.cell.updateEditState(CellEditState.Editing, 'focusNotebookCell');
			this._notebookEditorWidget.setCellEditorSelection(match.cell, match.range());
			this._notebookEditorWidget.revealRangeInCenterIfOutsideViewportAsync(match.cell, match.range());
		}
	}

	//#endregion
}

export interface IChangeEvent {
	elements: FileMatch[];
	added?: boolean;
	removed?: boolean;
	clearingAll?: boolean;
}

export class FolderMatch extends Disposable {

	protected _onChange = this._register(new Emitter<IChangeEvent>());
	readonly onChange: Event<IChangeEvent> = this._onChange.event;

	private _onDispose = this._register(new Emitter<void>());
	readonly onDispose: Event<void> = this._onDispose.event;

	protected _fileMatches: ResourceMap<FileMatch>;
	protected _folderMatches: ResourceMap<FolderMatchWithResource>;
	protected _folderMatchesMap: TernarySearchTree<URI, FolderMatchWithResource>;
	protected _unDisposedFileMatches: ResourceMap<FileMatch>;
	protected _unDisposedFolderMatches: ResourceMap<FolderMatchWithResource>;
	private _replacingAll: boolean = false;
	private _name: Lazy<string>;

	constructor(
		protected _resource: URI | null,
		private _id: string,
		protected _index: number,
		protected _query: ITextQuery,
		private _parent: SearchResult | FolderMatch,
		private _searchModel: SearchModel,
		private _closestRoot: FolderMatchWorkspaceRoot | null,
		@IReplaceService private readonly replaceService: IReplaceService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@ILabelService labelService: ILabelService,
		@IUriIdentityService protected readonly uriIdentityService: IUriIdentityService
	) {
		super();
		this._fileMatches = new ResourceMap<FileMatch>();
		this._folderMatches = new ResourceMap<FolderMatchWithResource>();
		this._folderMatchesMap = TernarySearchTree.forUris<FolderMatchWithResource>(key => this.uriIdentityService.extUri.ignorePathCasing(key));
		this._unDisposedFileMatches = new ResourceMap<FileMatch>();
		this._unDisposedFolderMatches = new ResourceMap<FolderMatchWithResource>();
		this._name = new Lazy(() => this.resource ? labelService.getUriBasenameLabel(this.resource) : '');
	}

	get searchModel(): SearchModel {
		return this._searchModel;
	}

	get showHighlights(): boolean {
		return this._parent.showHighlights;
	}

	get closestRoot(): FolderMatchWorkspaceRoot | null {
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

	parent(): SearchResult | FolderMatch {
		return this._parent;
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

	async bindNotebookEditorWidget(editor: NotebookEditorWidget, resource: URI) {
		const fileMatch = this._fileMatches.get(resource);

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

	unbindNotebookEditorWidget(editor: NotebookEditorWidget, resource: URI) {
		const fileMatch = this._fileMatches.get(resource);

		if (fileMatch) {
			fileMatch.unbindNotebookEditorWidget(editor);
		} else {
			const folderMatches = this.folderMatchesIterator();
			for (const elem of folderMatches) {
				elem.unbindNotebookEditorWidget(editor, resource);
			}
		}

	}

	public createIntermediateFolderMatch(resource: URI, id: string, index: number, query: ITextQuery, baseWorkspaceFolder: FolderMatchWorkspaceRoot): FolderMatchWithResource {
		const folderMatch = this.instantiationService.createInstance(FolderMatchWithResource, resource, id, index, query, this, this._searchModel, baseWorkspaceFolder);
		this.configureIntermediateMatch(folderMatch);
		this.doAddFolder(folderMatch);
		return folderMatch;
	}

	public configureIntermediateMatch(folderMatch: FolderMatchWithResource) {
		const disposable = folderMatch.onChange((event) => this.onFolderChange(folderMatch, event));
		folderMatch.onDispose(() => disposable.dispose());
	}

	clear(clearingAll = false): void {
		const changed: FileMatch[] = this.allDownstreamFileMatches();
		this.disposeMatches();
		this._onChange.fire({ elements: changed, removed: true, added: false, clearingAll });
	}

	remove(matches: FileMatch | FolderMatchWithResource | (FileMatch | FolderMatchWithResource)[]): void {
		if (!Array.isArray(matches)) {
			matches = [matches];
		}
		const allMatches = getFileMatches(matches);
		this.doRemoveFile(allMatches);
	}

	async replace(match: FileMatch): Promise<any> {
		return this.replaceService.replace([match]).then(() => {
			this.doRemoveFile([match], true, true, true);
		});
	}

	replaceAll(): Promise<any> {
		const matches = this.matches();
		return this.batchReplace(matches);
	}

	matches(): (FileMatch | FolderMatchWithResource)[] {
		return [...this.fileMatchesIterator(), ...this.folderMatchesIterator()];
	}

	fileMatchesIterator(): IterableIterator<FileMatch> {
		return this._fileMatches.values();
	}

	folderMatchesIterator(): IterableIterator<FolderMatchWithResource> {
		return this._folderMatches.values();
	}

	isEmpty(): boolean {
		return (this.fileCount() + this.folderCount()) === 0;
	}

	getDownstreamFileMatch(uri: URI): FileMatch | null {
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

	allDownstreamFileMatches(): FileMatch[] {
		let recursiveChildren: FileMatch[] = [];
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

	addFileMatch(raw: IFileMatch[], silent: boolean): void {
		// when adding a fileMatch that has intermediate directories
		const added: FileMatch[] = [];
		const updated: FileMatch[] = [];

		raw.forEach(rawFileMatch => {
			const existingFileMatch = this.getDownstreamFileMatch(rawFileMatch.resource);
			if (existingFileMatch) {
				rawFileMatch
					.results!
					.filter(resultIsMatch)
					.forEach(m => {
						textSearchResultToMatches(m, existingFileMatch)
							.forEach(m => existingFileMatch.add(m));
					});

				// add cell matches
				if (isIFileMatchWithCells(rawFileMatch)) {
					rawFileMatch.cellResults?.forEach(rawCellMatch => {
						const existingCellMatch = existingFileMatch.getCellMatch(rawCellMatch.cell.id);
						if (existingCellMatch) {
							existingCellMatch.addContentMatches(rawCellMatch.contentResults);
							existingCellMatch.addContentMatches(rawCellMatch.webviewResults);
						} else {
							existingFileMatch.addCellMatch(rawCellMatch);
						}
					});
				}

				updated.push(existingFileMatch);

				existingFileMatch.addContext(rawFileMatch.results);
			} else {
				if (this instanceof FolderMatchWorkspaceRoot || this instanceof FolderMatchNoRoot) {
					const fileMatch = this.createAndConfigureFileMatch(rawFileMatch);
					added.push(fileMatch);
				}
			}
		});

		const elements = [...added, ...updated];
		if (!silent && elements.length) {
			this._onChange.fire({ elements, added: !!added.length });
		}
	}

	doAddFile(fileMatch: FileMatch): void {
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

	private isInParentChain(folderMatch: FolderMatchWithResource) {

		let matchItem: FolderMatch | SearchResult = this;
		while (matchItem instanceof FolderMatch) {
			if (matchItem.id() === folderMatch.id()) {
				return true;
			}
			matchItem = matchItem.parent();
		}
		return false;
	}

	public getFolderMatch(resource: URI): FolderMatchWithResource | undefined {
		const folderMatch = this._folderMatchesMap.findSubstr(resource);
		return folderMatch;
	}

	doAddFolder(folderMatch: FolderMatchWithResource) {
		if (this instanceof FolderMatchWithResource && !this.uriHasParent(this.resource, folderMatch.resource)) {
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

	private async batchReplace(matches: (FileMatch | FolderMatchWithResource)[]): Promise<any> {
		const allMatches = getFileMatches(matches);

		await this.replaceService.replace(allMatches);
		this.doRemoveFile(allMatches, true, true, true);
	}

	public onFileChange(fileMatch: FileMatch, removed = false): void {
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

	public onFolderChange(folderMatch: FolderMatchWithResource, event: IChangeEvent): void {
		if (!this._folderMatches.has(folderMatch.resource)) {
			this.doAddFolder(folderMatch);
		}
		if (folderMatch.isEmpty()) {
			this._folderMatches.delete(folderMatch.resource);
			folderMatch.dispose();
		}

		this._onChange.fire(event);
	}

	private doRemoveFile(fileMatches: FileMatch[], dispose: boolean = true, trigger: boolean = true, keepReadonly = false): void {

		const removed = [];
		for (const match of fileMatches as FileMatch[]) {
			if (this._fileMatches.get(match.resource)) {
				if (keepReadonly && match.hasWebviewMatches()) {
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

	private disposeMatches(): void {
		[...this._fileMatches.values()].forEach((fileMatch: FileMatch) => fileMatch.dispose());
		[...this._folderMatches.values()].forEach((folderMatch: FolderMatch) => folderMatch.disposeMatches());
		[...this._unDisposedFileMatches.values()].forEach((fileMatch: FileMatch) => fileMatch.dispose());
		[...this._unDisposedFolderMatches.values()].forEach((folderMatch: FolderMatch) => folderMatch.disposeMatches());
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

export class FolderMatchWithResource extends FolderMatch {

	constructor(_resource: URI, _id: string, _index: number, _query: ITextQuery, _parent: SearchResult | FolderMatch, _searchModel: SearchModel, _closestRoot: FolderMatchWorkspaceRoot | null,
		@IReplaceService replaceService: IReplaceService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILabelService labelService: ILabelService,
		@IUriIdentityService uriIdentityService: IUriIdentityService
	) {
		super(_resource, _id, _index, _query, _parent, _searchModel, _closestRoot, replaceService, instantiationService, labelService, uriIdentityService);
	}

	override get resource(): URI {
		return this._resource!;
	}
}

/**
 * FolderMatchWorkspaceRoot => folder for workspace root
 */
export class FolderMatchWorkspaceRoot extends FolderMatchWithResource {
	constructor(_resource: URI, _id: string, _index: number, _query: ITextQuery, _parent: SearchResult, _searchModel: SearchModel,
		@IReplaceService replaceService: IReplaceService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILabelService labelService: ILabelService,
		@IUriIdentityService uriIdentityService: IUriIdentityService
	) {
		super(_resource, _id, _index, _query, _parent, _searchModel, null, replaceService, instantiationService, labelService, uriIdentityService);
	}

	private normalizedUriParent(uri: URI): URI {
		return this.uriIdentityService.extUri.normalizePath(this.uriIdentityService.extUri.dirname(uri));
	}

	private uriEquals(uri1: URI, ur2: URI): boolean {
		return this.uriIdentityService.extUri.isEqual(uri1, ur2);
	}

	private createFileMatch(query: IPatternInfo, previewOptions: ITextSearchPreviewOptions | undefined, maxResults: number | undefined, parent: FolderMatch, rawFileMatch: IFileMatch, closestRoot: FolderMatchWorkspaceRoot | null,): FileMatch {
		const fileMatch =
			this.instantiationService.createInstance(
				FileMatch,
				query,
				previewOptions,
				maxResults,
				parent,
				rawFileMatch,
				closestRoot
			);
		parent.doAddFile(fileMatch);
		const disposable = fileMatch.onChange(({ didRemove }) => parent.onFileChange(fileMatch, didRemove));
		fileMatch.onDispose(() => disposable.dispose());
		return fileMatch;
	}

	createAndConfigureFileMatch(rawFileMatch: IFileMatch<URI>): FileMatch {

		if (!this.uriHasParent(this.resource, rawFileMatch.resource)) {
			throw Error(`${rawFileMatch.resource} is not a descendant of ${this.resource}`);
		}

		const fileMatchParentParts: URI[] = [];
		const normalizedResource = this.uriIdentityService.extUri.normalizePath(this.resource);
		let uri = this.normalizedUriParent(rawFileMatch.resource);

		while (!this.uriEquals(normalizedResource, uri)) {
			fileMatchParentParts.unshift(uri);
			const prevUri = uri;
			uri = this.normalizedUriParent(uri);
			if (this.uriEquals(prevUri, uri)) {
				throw Error(`${rawFileMatch.resource} is not correctly configured as a child of ${normalizedResource}`);
			}
		}

		const root = this.closestRoot ?? this;
		let parent: FolderMatch = this;
		for (let i = 0; i < fileMatchParentParts.length; i++) {
			let folderMatch: FolderMatchWithResource | undefined = parent.getFolderMatch(fileMatchParentParts[i]);
			if (!folderMatch) {
				folderMatch = parent.createIntermediateFolderMatch(fileMatchParentParts[i], fileMatchParentParts[i].toString(), -1, this._query, root);
			}
			parent = folderMatch;
		}

		return this.createFileMatch(this._query.contentPattern, this._query.previewOptions, this._query.maxResults, parent, rawFileMatch, root);
	}
}

/**
 * BaseFolderMatch => optional resource ("other files" node)
 * FolderMatch => required resource (normal folder node)
 */
export class FolderMatchNoRoot extends FolderMatch {
	constructor(_id: string, _index: number, _query: ITextQuery, _parent: SearchResult | FolderMatch, _searchModel: SearchModel,
		@IReplaceService replaceService: IReplaceService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILabelService labelService: ILabelService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,

	) {
		super(null, _id, _index, _query, _parent, _searchModel, null, replaceService, instantiationService, labelService, uriIdentityService);
	}

	createAndConfigureFileMatch(rawFileMatch: IFileMatch): FileMatch {
		const fileMatch = this.instantiationService.createInstance(
			FileMatch,
			this._query.contentPattern,
			this._query.previewOptions,
			this._query.maxResults,
			this, rawFileMatch,
			null);
		this.doAddFile(fileMatch);
		const disposable = fileMatch.onChange(({ didRemove }) => this.onFileChange(fileMatch, didRemove));
		fileMatch.onDispose(() => disposable.dispose());
		return fileMatch;
	}
}

let elemAIndex: number = -1;
let elemBIndex: number = -1;
/**
 * Compares instances of the same match type. Different match types should not be siblings
 * and their sort order is undefined.
 */
export function searchMatchComparer(elementA: RenderableMatch, elementB: RenderableMatch, sortOrder: SearchSortOrder = SearchSortOrder.Default): number {

	if (elementA instanceof FileMatch && elementB instanceof FolderMatch) {
		return 1;
	}

	if (elementB instanceof FileMatch && elementA instanceof FolderMatch) {
		return -1;
	}

	if (elementA instanceof FolderMatch && elementB instanceof FolderMatch) {
		elemAIndex = elementA.index();
		elemBIndex = elementB.index();
		if (elemAIndex !== -1 && elemBIndex !== -1) {
			return elemAIndex - elemBIndex;
		}

		switch (sortOrder) {
			case SearchSortOrder.CountDescending:
				return elementB.count() - elementA.count();
			case SearchSortOrder.CountAscending:
				return elementA.count() - elementB.count();
			case SearchSortOrder.Type:
				return compareFileExtensions(elementA.name(), elementB.name());
			case SearchSortOrder.FileNames:
				return compareFileNames(elementA.name(), elementB.name());
			// Fall through otherwise
			default:
				if (!elementA.resource || !elementB.resource) {
					return 0;
				}
				return comparePaths(elementA.resource.fsPath, elementB.resource.fsPath) || compareFileNames(elementA.name(), elementB.name());
		}
	}

	if (elementA instanceof FileMatch && elementB instanceof FileMatch) {
		switch (sortOrder) {
			case SearchSortOrder.CountDescending:
				return elementB.count() - elementA.count();
			case SearchSortOrder.CountAscending:
				return elementA.count() - elementB.count();
			case SearchSortOrder.Type:
				return compareFileExtensions(elementA.name(), elementB.name());
			case SearchSortOrder.FileNames:
				return compareFileNames(elementA.name(), elementB.name());
			case SearchSortOrder.Modified: {
				const fileStatA = elementA.fileStat;
				const fileStatB = elementB.fileStat;
				if (fileStatA && fileStatB) {
					return fileStatB.mtime - fileStatA.mtime;

				}
			}
			// Fall through otherwise
			default:
				return comparePaths(elementA.resource.fsPath, elementB.resource.fsPath) || compareFileNames(elementA.name(), elementB.name());
		}
	}

	if (elementA instanceof MatchInNotebook && elementB instanceof MatchInNotebook) {
		return compareNotebookPos(elementA, elementB);
	}

	if (elementA instanceof Match && elementB instanceof Match) {
		return Range.compareRangesUsingStarts(elementA.range(), elementB.range());
	}

	return 0;
}

export function compareNotebookPos(match1: MatchInNotebook, match2: MatchInNotebook): number {
	if (match1.cellIndex === match2.cellIndex) {

		if (match1.webviewIndex !== undefined && match2.webviewIndex !== undefined) {
			return match1.webviewIndex - match2.webviewIndex;
		} else if (match1.webviewIndex === undefined && match2.webviewIndex === undefined) {
			return Range.compareRangesUsingStarts(match1.range(), match2.range());
		} else {
			// webview matches should always be after content matches
			if (match1.webviewIndex !== undefined) {
				return 1;
			} else {
				return -1;
			}
		}
	} else if (match1.cellIndex < match2.cellIndex) {
		return -1;
	} else {
		return 1;
	}
}
export function searchComparer(elementA: RenderableMatch, elementB: RenderableMatch, sortOrder: SearchSortOrder = SearchSortOrder.Default): number {
	const elemAParents = createParentList(elementA);
	const elemBParents = createParentList(elementB);

	let i = elemAParents.length - 1;
	let j = elemBParents.length - 1;
	while (i >= 0 && j >= 0) {
		if (elemAParents[i].id() !== elemBParents[j].id()) {
			return searchMatchComparer(elemAParents[i], elemBParents[j], sortOrder);
		}
		i--;
		j--;
	}
	const elemAAtEnd = i === 0;
	const elemBAtEnd = j === 0;

	if (elemAAtEnd && !elemBAtEnd) {
		return 1;
	} else if (!elemAAtEnd && elemBAtEnd) {
		return -1;
	}
	return 0;
}

function createParentList(element: RenderableMatch): RenderableMatch[] {
	const parentArray: RenderableMatch[] = [];
	let currElement: RenderableMatch | SearchResult = element;

	while (!(currElement instanceof SearchResult)) {
		parentArray.push(currElement);
		currElement = currElement.parent();
	}

	return parentArray;
}
export class SearchResult extends Disposable {

	private _onChange = this._register(new PauseableEmitter<IChangeEvent>({
		merge: this.mergeEvents
	}));
	readonly onChange: Event<IChangeEvent> = this._onChange.event;
	private _folderMatches: FolderMatchWorkspaceRoot[] = [];
	private _otherFilesMatch: FolderMatch | null = null;
	private _folderMatchesMap: TernarySearchTree<URI, FolderMatchWithResource> = TernarySearchTree.forUris<FolderMatchWorkspaceRoot>(key => this.uriIdentityService.extUri.ignorePathCasing(key));
	private _showHighlights: boolean = false;
	private _query: ITextQuery | null = null;
	private _rangeHighlightDecorations: RangeHighlightDecorations;
	private disposePastResults: () => void = () => { };
	private _isDirty = false;
	private _onWillChangeModelListener: IDisposable | undefined;
	private _onDidChangeModelListener: IDisposable | undefined;

	constructor(
		private _searchModel: SearchModel,
		@IReplaceService private readonly replaceService: IReplaceService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@INotebookEditorService private readonly notebookEditorService: INotebookEditorService,
	) {
		super();
		this._rangeHighlightDecorations = this.instantiationService.createInstance(RangeHighlightDecorations);

		this._register(this.modelService.onModelAdded(model => this.onModelAdded(model)));

		this._register(this.notebookEditorService.onDidAddNotebookEditor(widget => {
			if (widget instanceof NotebookEditorWidget) {
				this.onDidAddNotebookEditorWidget(<NotebookEditorWidget>widget);
			}
		}));

		this._register(this.onChange(e => {
			if (e.removed) {
				this._isDirty = !this.isEmpty();
			}
		}));
	}

	async batchReplace(elementsToReplace: RenderableMatch[]) {
		try {
			this._onChange.pause();
			await Promise.all(elementsToReplace.map(async (elem) => {
				const parent = elem.parent();

				if ((parent instanceof FolderMatch || parent instanceof FileMatch) && arrayContainsElementOrParent(parent, elementsToReplace)) {
					// skip any children who have parents in the array
					return;
				}

				if (elem instanceof FileMatch) {
					await elem.parent().replace(elem);
				} else if (elem instanceof Match) {
					await elem.parent().replace(elem);
				} else if (elem instanceof FolderMatch) {
					await elem.replaceAll();
				}
			}));
		} finally {
			this._onChange.resume();
		}
	}

	batchRemove(elementsToRemove: RenderableMatch[]) {
		// need to check that we aren't trying to remove elements twice
		const removedElems: RenderableMatch[] = [];

		try {
			this._onChange.pause();
			elementsToRemove.forEach((currentElement) => {
				if (!arrayContainsElementOrParent(currentElement, removedElems)) {
					currentElement.parent().remove(<(FolderMatch | FileMatch)[] & Match & FileMatch[]>currentElement);
					removedElems.push(currentElement);
				}
			}
			);
		} finally {
			this._onChange.resume();
		}
	}

	get isDirty(): boolean {
		return this._isDirty;
	}

	get query(): ITextQuery | null {
		return this._query;
	}

	set query(query: ITextQuery | null) {
		// When updating the query we could change the roots, so keep a reference to them to clean up when we trigger `disposePastResults`
		const oldFolderMatches = this.folderMatches();
		new Promise<void>(resolve => this.disposePastResults = resolve)
			.then(() => oldFolderMatches.forEach(match => match.clear()))
			.then(() => oldFolderMatches.forEach(match => match.dispose()))
			.then(() => this._isDirty = false);

		this._rangeHighlightDecorations.removeHighlightRange();
		this._folderMatchesMap = TernarySearchTree.forUris<FolderMatchWithResource>(key => this.uriIdentityService.extUri.ignorePathCasing(key));

		if (!query) {
			return;
		}

		this._folderMatches = (query && query.folderQueries || [])
			.map(fq => fq.folder)
			.map((resource, index) => <FolderMatchWorkspaceRoot>this._createBaseFolderMatch(resource, resource.toString(), index, query));

		this._folderMatches.forEach(fm => this._folderMatchesMap.set(fm.resource, fm));
		this._otherFilesMatch = <FolderMatchNoRoot>this._createBaseFolderMatch(null, 'otherFiles', this._folderMatches.length + 1, query);

		this._query = query;
	}

	private mergeEvents(events: IChangeEvent[]): IChangeEvent {
		const retEvent: IChangeEvent = {
			elements: [],
			added: false,
			removed: false,
		};
		events.forEach((e) => {
			if (e.added) {
				retEvent.added = true;
			}

			if (e.removed) {
				retEvent.removed = true;
			}

			retEvent.elements = retEvent.elements.concat(e.elements);
		});

		return retEvent;
	}

	private onDidAddNotebookEditorWidget(widget: NotebookEditorWidget): void {

		this._onWillChangeModelListener?.dispose();
		this._onWillChangeModelListener = widget.onWillChangeModel(
			(model) => {
				if (model) {
					this.onNotebookEditorWidgetRemoved(widget, model?.uri);
				}
			}
		);

		this._onDidChangeModelListener?.dispose();
		// listen to view model change as we are searching on both inputs and outputs
		this._onDidChangeModelListener = widget.onDidAttachViewModel(
			() => {
				if (widget.hasModel()) {
					this.onNotebookEditorWidgetAdded(widget, widget.textModel.uri);
				}
			}
		);
	}

	private onModelAdded(model: ITextModel): void {
		const folderMatch = this._folderMatchesMap.findSubstr(model.uri);
		folderMatch?.bindModel(model);
	}

	private async onNotebookEditorWidgetAdded(editor: NotebookEditorWidget, resource: URI): Promise<void> {
		const folderMatch = this._folderMatchesMap.findSubstr(resource);
		await folderMatch?.bindNotebookEditorWidget(editor, resource);
	}

	private onNotebookEditorWidgetRemoved(editor: NotebookEditorWidget, resource: URI): void {
		const folderMatch = this._folderMatchesMap.findSubstr(resource);
		folderMatch?.unbindNotebookEditorWidget(editor, resource);
	}

	private _createBaseFolderMatch(resource: URI | null, id: string, index: number, query: ITextQuery): FolderMatch {
		let folderMatch;
		if (resource) {
			folderMatch = this.instantiationService.createInstance(FolderMatchWorkspaceRoot, resource, id, index, query, this, this._searchModel);
		} else {
			folderMatch = this.instantiationService.createInstance(FolderMatchNoRoot, id, index, query, this, this._searchModel);
		}
		const disposable = folderMatch.onChange((event) => this._onChange.fire(event));
		folderMatch.onDispose(() => disposable.dispose());
		return folderMatch;
	}

	get searchModel(): SearchModel {
		return this._searchModel;
	}

	add(allRaw: IFileMatch[], silent: boolean = false): void {
		// Split up raw into a list per folder so we can do a batch add per folder.

		const { byFolder, other } = this.groupFilesByFolder(allRaw);
		byFolder.forEach(raw => {
			if (!raw.length) {
				return;
			}

			const folderMatch = this.getFolderMatch(raw[0].resource);
			folderMatch?.addFileMatch(raw, silent);
		});

		this._otherFilesMatch?.addFileMatch(other, silent);
		this.disposePastResults();
	}

	clear(): void {
		this.folderMatches().forEach((folderMatch) => folderMatch.clear(true));
		this.disposeMatches();
		this._folderMatches = [];
		this._otherFilesMatch = null;
	}

	remove(matches: FileMatch | FolderMatch | (FileMatch | FolderMatch)[]): void {
		if (!Array.isArray(matches)) {
			matches = [matches];
		}

		matches.forEach(m => {
			if (m instanceof FolderMatch) {
				m.clear();
			}
		});

		const fileMatches: FileMatch[] = matches.filter(m => m instanceof FileMatch) as FileMatch[];

		const { byFolder, other } = this.groupFilesByFolder(fileMatches);
		byFolder.forEach(matches => {
			if (!matches.length) {
				return;
			}

			this.getFolderMatch(matches[0].resource).remove(<FileMatch[]>matches);
		});

		if (other.length) {
			this.getFolderMatch(other[0].resource).remove(<FileMatch[]>other);
		}
	}

	replace(match: FileMatch): Promise<any> {
		return this.getFolderMatch(match.resource).replace(match);
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

	folderMatches(): FolderMatch[] {
		return this._otherFilesMatch ?
			[
				...this._folderMatches,
				this._otherFilesMatch
			] :
			[
				...this._folderMatches
			];
	}

	matches(): FileMatch[] {
		const matches: FileMatch[][] = [];
		this.folderMatches().forEach(folderMatch => {
			matches.push(folderMatch.allDownstreamFileMatches());
		});

		return (<FileMatch[]>[]).concat(...matches);
	}

	isEmpty(): boolean {
		return this.folderMatches().every((folderMatch) => folderMatch.isEmpty());
	}

	fileCount(): number {
		return this.folderMatches().reduce<number>((prev, match) => prev + match.recursiveFileCount(), 0);
	}

	count(): number {
		return this.matches().reduce<number>((prev, match) => prev + match.count(), 0);
	}

	get showHighlights(): boolean {
		return this._showHighlights;
	}

	toggleHighlights(value: boolean): void {
		if (this._showHighlights === value) {
			return;
		}
		this._showHighlights = value;
		let selectedMatch: Match | null = null;
		this.matches().forEach((fileMatch: FileMatch) => {
			fileMatch.updateHighlights();
			if (!selectedMatch) {
				selectedMatch = fileMatch.getSelectedMatch();
			}
		});
		if (this._showHighlights && selectedMatch) {
			// TS?
			this._rangeHighlightDecorations.highlightRange(
				(<Match>selectedMatch).parent().resource,
				(<Match>selectedMatch).range()
			);
		} else {
			this._rangeHighlightDecorations.removeHighlightRange();
		}
	}

	get rangeHighlightDecorations(): RangeHighlightDecorations {
		return this._rangeHighlightDecorations;
	}

	private getFolderMatch(resource: URI): FolderMatchWorkspaceRoot | FolderMatch {
		const folderMatch = this._folderMatchesMap.findSubstr(resource);
		return folderMatch ? folderMatch : this._otherFilesMatch!;
	}

	private set replacingAll(running: boolean) {
		this.folderMatches().forEach((folderMatch) => {
			folderMatch.replacingAll = running;
		});
	}

	private groupFilesByFolder(fileMatches: IFileMatch[]): { byFolder: ResourceMap<IFileMatch[]>; other: IFileMatch[] } {
		const rawPerFolder = new ResourceMap<IFileMatch[]>();
		const otherFileMatches: IFileMatch[] = [];
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

	private disposeMatches(): void {
		this.folderMatches().forEach(folderMatch => folderMatch.dispose());
		this._folderMatches = [];
		this._folderMatchesMap = TernarySearchTree.forUris<FolderMatchWithResource>(key => this.uriIdentityService.extUri.ignorePathCasing(key));
		this._rangeHighlightDecorations.removeHighlightRange();
	}

	override dispose(): void {
		this._onWillChangeModelListener?.dispose();
		this._onDidChangeModelListener?.dispose();
		this.disposePastResults();
		this.disposeMatches();
		this._rangeHighlightDecorations.dispose();
		super.dispose();
	}
}

export class SearchModel extends Disposable {

	private _searchResult: SearchResult;
	private _searchQuery: ITextQuery | null = null;
	private _replaceActive: boolean = false;
	private _replaceString: string | null = null;
	private _replacePattern: ReplacePattern | null = null;
	private _preserveCase: boolean = false;
	private _startStreamDelay: Promise<void> = Promise.resolve();
	private readonly _resultQueue: IFileMatch[] = [];

	private readonly _onReplaceTermChanged: Emitter<void> = this._register(new Emitter<void>());
	readonly onReplaceTermChanged: Event<void> = this._onReplaceTermChanged.event;

	private currentCancelTokenSource: CancellationTokenSource | null = null;
	private searchCancelledForNewSearch: boolean = false;

	constructor(
		@ISearchService private readonly searchService: ISearchService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@INotebookEditorService private readonly notebookEditorService: INotebookEditorService,
	) {
		super();
		this._searchResult = this.instantiationService.createInstance(SearchResult, this);
	}

	isReplaceActive(): boolean {
		return this._replaceActive;
	}

	set replaceActive(replaceActive: boolean) {
		this._replaceActive = replaceActive;
	}

	get replacePattern(): ReplacePattern | null {
		return this._replacePattern;
	}

	get replaceString(): string {
		return this._replaceString || '';
	}

	set preserveCase(value: boolean) {
		this._preserveCase = value;
	}

	get preserveCase(): boolean {
		return this._preserveCase;
	}

	set replaceString(replaceString: string) {
		this._replaceString = replaceString;
		if (this._searchQuery) {
			this._replacePattern = new ReplacePattern(replaceString, this._searchQuery.contentPattern);
		}
		this._onReplaceTermChanged.fire();
	}

	get searchResult(): SearchResult {
		return this._searchResult;
	}

	private async getLocalNotebookResults(query: ITextQuery, token: CancellationToken): Promise<{ results: ResourceMap<IFileMatchWithCells | null>; limitHit: boolean }> {
		const localResults = new ResourceMap<IFileMatchWithCells | null>(uri => this.uriIdentityService.extUri.getComparisonKey(uri));
		let limitHit = false;

		if (query.type === QueryType.Text) {
			const notebookWidgets = this.notebookEditorService.retrieveAllExistingWidgets();
			for (const borrowWidget of notebookWidgets) {
				const widget = borrowWidget.value;
				if (!widget || !widget.viewModel) {
					continue;
				}

				const askMax = isNumber(query.maxResults) ? query.maxResults + 1 : Number.MAX_SAFE_INTEGER;
				let matches = await widget
					.find(query.contentPattern.pattern, {
						regex: query.contentPattern.isRegExp,
						wholeWord: query.contentPattern.isWordMatch,
						caseSensitive: query.contentPattern.isCaseSensitive,
						includeMarkupInput: query.contentPattern.notebookInfo?.isInNotebookMarkdownInput,
						includeMarkupPreview: query.contentPattern.notebookInfo?.isInNotebookMarkdownPreview,
						includeCodeInput: query.contentPattern.notebookInfo?.isInNotebookCellInput,
						includeOutput: query.contentPattern.notebookInfo?.isInNotebookCellOutput,
					}, token, false, true);


				if (matches.length) {
					if (askMax && matches.length >= askMax) {
						limitHit = true;
						matches = matches.slice(0, askMax - 1);
					}
					const cellResults: ICellMatch[] = matches.map(match => {
						const contentResults = contentMatchesToTextSearchMatches(match.contentMatches, match.cell);
						const webviewResults = webviewMatchesToTextSearchMatches(match.webviewMatches);
						return {
							cell: match.cell,
							index: match.index,
							contentResults: contentResults,
							webviewResults: webviewResults,
						};
					});

					const fileMatch: IFileMatchWithCells = {
						resource: widget.viewModel.uri, cellResults: cellResults
					};
					localResults.set(widget.viewModel.uri, fileMatch);
				} else {
					localResults.set(widget.viewModel.uri, null);
				}
			}
		}

		return {
			results: localResults,
			limitHit
		};
	}

	async notebookSearch(query: ITextQuery, token: CancellationToken, onProgress?: (result: ISearchProgressItem) => void): Promise<{ completeData: ISearchComplete; scannedFiles: ResourceSet }> {
		const localResults = await this.getLocalNotebookResults(query, token);
		if (onProgress) {
			arrays.coalesce([...localResults.results.values()]).forEach(onProgress);
		}
		return {
			completeData: {
				messages: [],
				limitHit: localResults.limitHit,
				results: arrays.coalesce([...localResults.results.values()]),
			},
			scannedFiles: new ResourceSet([...localResults.results.keys()], uri => this.uriIdentityService.extUri.getComparisonKey(uri))
		};
	}

	private async doSearch(query: ITextQuery, progressEmitter: Emitter<void>, searchQuery: ITextQuery, onProgress?: (result: ISearchProgressItem) => void): Promise<ISearchComplete> {
		const tokenSource = this.currentCancelTokenSource = new CancellationTokenSource();
		const onProgressCall = (p: ISearchProgressItem) => {
			progressEmitter.fire();
			this.onSearchProgress(p);

			onProgress?.(p);
		};
		const notebookResult = await this.notebookSearch(query, this.currentCancelTokenSource.token, onProgressCall);
		const currentResult = await this.searchService.textSearch(
			searchQuery,
			this.currentCancelTokenSource.token, onProgressCall,
			notebookResult?.scannedFiles
		);
		tokenSource.dispose();
		return notebookResult ? { ...currentResult, ...notebookResult.completeData } : currentResult;
	}

	async search(query: ITextQuery, onProgress?: (result: ISearchProgressItem) => void): Promise<ISearchComplete> {
		this.cancelSearch(true);

		this._searchQuery = query;
		if (!this.searchConfig.searchOnType) {
			this.searchResult.clear();
		}

		this._searchResult.query = this._searchQuery;

		const progressEmitter = new Emitter<void>();
		this._replacePattern = new ReplacePattern(this.replaceString, this._searchQuery.contentPattern);

		// In search on type case, delay the streaming of results just a bit, so that we don't flash the only "local results" fast path
		this._startStreamDelay = new Promise(resolve => setTimeout(resolve, this.searchConfig.searchOnType ? 150 : 0));

		const currentRequest = this.doSearch(query, progressEmitter, this._searchQuery, onProgress);

		const start = Date.now();

		Promise.race([currentRequest, Event.toPromise(progressEmitter.event)]).finally(() => {
			/* __GDPR__
				"searchResultsFirstRender" : {
					"owner": "roblourens",
					"duration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true }
				}
			*/
			this.telemetryService.publicLog('searchResultsFirstRender', { duration: Date.now() - start });
		});

		currentRequest.then(
			value => this.onSearchCompleted(value, Date.now() - start),
			e => this.onSearchError(e, Date.now() - start));

		try {
			return await currentRequest;
		} finally {
			/* __GDPR__
				"searchResultsFinished" : {
					"owner": "roblourens",
					"duration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true }
				}
			*/
			this.telemetryService.publicLog('searchResultsFinished', { duration: Date.now() - start });
		}
	}

	private onSearchCompleted(completed: ISearchComplete | null, duration: number): ISearchComplete | null {
		if (!this._searchQuery) {
			throw new Error('onSearchCompleted must be called after a search is started');
		}

		this._searchResult.add(this._resultQueue);
		this._resultQueue.length = 0;

		const options: IPatternInfo = Object.assign({}, this._searchQuery.contentPattern);
		delete (options as any).pattern;

		const stats = completed && completed.stats as ITextSearchStats;

		const fileSchemeOnly = this._searchQuery.folderQueries.every(fq => fq.folder.scheme === Schemas.file);
		const otherSchemeOnly = this._searchQuery.folderQueries.every(fq => fq.folder.scheme !== Schemas.file);
		const scheme = fileSchemeOnly ? Schemas.file :
			otherSchemeOnly ? 'other' :
				'mixed';

		/* __GDPR__
			"searchResultsShown" : {
				"owner": "roblourens",
				"count" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"fileCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"options": { "${inline}": [ "${IPatternInfo}" ] },
				"duration": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
				"type" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
				"scheme" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
				"searchOnTypeEnabled" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		this.telemetryService.publicLog('searchResultsShown', {
			count: this._searchResult.count(),
			fileCount: this._searchResult.fileCount(),
			options,
			duration,
			type: stats && stats.type,
			scheme,
			searchOnTypeEnabled: this.searchConfig.searchOnType
		});
		return completed;
	}

	private onSearchError(e: any, duration: number): void {
		if (errors.isCancellationError(e)) {
			this.onSearchCompleted(
				this.searchCancelledForNewSearch
					? { exit: SearchCompletionExitCode.NewSearchStarted, results: [], messages: [] }
					: null,
				duration);
			this.searchCancelledForNewSearch = false;
		}
	}

	private async onSearchProgress(p: ISearchProgressItem) {
		if ((<IFileMatch>p).resource) {
			this._resultQueue.push(<IFileMatch>p);
			await this._startStreamDelay;
			if (this._resultQueue.length) {
				this._searchResult.add(this._resultQueue, true);
				this._resultQueue.length = 0;
			}
		}
	}

	private get searchConfig() {
		return this.configurationService.getValue<ISearchConfigurationProperties>('search');
	}

	cancelSearch(cancelledForNewSearch = false): boolean {
		if (this.currentCancelTokenSource) {
			this.searchCancelledForNewSearch = cancelledForNewSearch;
			this.currentCancelTokenSource.cancel();
			return true;
		}
		return false;
	}

	override dispose(): void {
		this.cancelSearch();
		this.searchResult.dispose();
		super.dispose();
	}
}

export type FileMatchOrMatch = FileMatch | Match;

export type RenderableMatch = FolderMatch | FolderMatchWithResource | FileMatch | Match;

export class SearchWorkbenchService implements ISearchWorkbenchService {

	declare readonly _serviceBrand: undefined;
	private _searchModel: SearchModel | null = null;

	constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) {
	}

	get searchModel(): SearchModel {
		if (!this._searchModel) {
			this._searchModel = this.instantiationService.createInstance(SearchModel);
		}
		return this._searchModel;
	}
}

export const ISearchWorkbenchService = createDecorator<ISearchWorkbenchService>('searchWorkbenchService');

export interface ISearchWorkbenchService {
	readonly _serviceBrand: undefined;

	readonly searchModel: SearchModel;
}

/**
 * Can add a range highlight decoration to a model.
 * It will automatically remove it when the model has its decorations changed.
 */
export class RangeHighlightDecorations implements IDisposable {

	private _decorationId: string | null = null;
	private _model: ITextModel | null = null;
	private readonly _modelDisposables = new DisposableStore();

	constructor(
		@IModelService private readonly _modelService: IModelService
	) {
	}

	removeHighlightRange() {
		if (this._model && this._decorationId) {
			const decorationId = this._decorationId;
			this._model.changeDecorations((accessor) => {
				accessor.removeDecoration(decorationId);
			});
		}
		this._decorationId = null;
	}

	highlightRange(resource: URI | ITextModel, range: Range, ownerId: number = 0): void {
		let model: ITextModel | null;
		if (URI.isUri(resource)) {
			model = this._modelService.getModel(resource);
		} else {
			model = resource;
		}

		if (model) {
			this.doHighlightRange(model, range);
		}
	}

	private doHighlightRange(model: ITextModel, range: Range) {
		this.removeHighlightRange();
		model.changeDecorations((accessor) => {
			this._decorationId = accessor.addDecoration(range, RangeHighlightDecorations._RANGE_HIGHLIGHT_DECORATION);
		});
		this.setModel(model);
	}

	private setModel(model: ITextModel) {
		if (this._model !== model) {
			this.clearModelListeners();
			this._model = model;
			this._modelDisposables.add(this._model.onDidChangeDecorations((e) => {
				this.clearModelListeners();
				this.removeHighlightRange();
				this._model = null;
			}));
			this._modelDisposables.add(this._model.onWillDispose(() => {
				this.clearModelListeners();
				this.removeHighlightRange();
				this._model = null;
			}));
		}
	}

	private clearModelListeners() {
		this._modelDisposables.clear();
	}

	dispose() {
		if (this._model) {
			this.removeHighlightRange();
			this._modelDisposables.dispose();
			this._model = null;
		}
	}

	private static readonly _RANGE_HIGHLIGHT_DECORATION = ModelDecorationOptions.register({
		description: 'search-range-highlight',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'rangeHighlight',
		isWholeLine: true
	});
}

function textSearchResultToMatches(rawMatch: ITextSearchMatch, fileMatch: FileMatch): Match[] {
	const previewLines = rawMatch.preview.text.split('\n');
	if (Array.isArray(rawMatch.ranges)) {
		return rawMatch.ranges.map((r, i) => {
			const previewRange: ISearchRange = (<ISearchRange[]>rawMatch.preview.matches)[i];
			return new Match(fileMatch, previewLines, previewRange, r);
		});
	} else {
		const previewRange = <ISearchRange>rawMatch.preview.matches;
		const match = new Match(fileMatch, previewLines, previewRange, rawMatch.ranges);
		return [match];
	}
}

// text search to notebook matches

export function textSearchMatchesToNotebookMatches(textSearchMatches: ITextSearchMatch[], cell: CellMatch): MatchInNotebook[] {
	const notebookMatches: MatchInNotebook[] = [];
	textSearchMatches.map((textSearchMatch) => {
		const previewLines = textSearchMatch.preview.text.split('\n');
		if (Array.isArray(textSearchMatch.ranges)) {
			textSearchMatch.ranges.forEach((r, i) => {
				const previewRange: ISearchRange = (<ISearchRange[]>textSearchMatch.preview.matches)[i];
				const match = new MatchInNotebook(cell, previewLines, previewRange, r, textSearchMatch.webviewIndex);
				notebookMatches.push(match);
			});
		} else {
			const previewRange = <ISearchRange>textSearchMatch.preview.matches;
			const match = new MatchInNotebook(cell, previewLines, previewRange, textSearchMatch.ranges, textSearchMatch.webviewIndex);
			notebookMatches.push(match);
		}
	});
	return notebookMatches;
}

export function arrayContainsElementOrParent(element: RenderableMatch, testArray: RenderableMatch[]): boolean {
	do {
		if (testArray.includes(element)) {
			return true;
		}
	} while (!(element.parent() instanceof SearchResult) && (element = <RenderableMatch>element.parent()));

	return false;
}

function getFileMatches(matches: (FileMatch | FolderMatchWithResource)[]): FileMatch[] {

	const folderMatches: FolderMatchWithResource[] = [];
	const fileMatches: FileMatch[] = [];
	matches.forEach((e) => {
		if (e instanceof FileMatch) {
			fileMatches.push(e);
		} else {
			folderMatches.push(e);
		}
	});

	return fileMatches.concat(folderMatches.map(e => e.allDownstreamFileMatches()).flat());
}
