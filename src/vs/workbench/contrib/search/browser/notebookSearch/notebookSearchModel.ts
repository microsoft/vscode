/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../../base/common/arrays.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { FindMatch } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ISearchRange, ITextSearchMatch, resultIsMatch, ITextSearchContext, IPatternInfo, ITextSearchPreviewOptions, IFileMatch } from '../../../../services/search/common/search.js';
import { getTextSearchMatchWithModelContext } from '../../../../services/search/common/searchHelpers.js';
import { FindMatchDecorationModel } from '../../../notebook/browser/contrib/find/findMatchDecorationModel.js';
import { CellFindMatchModel } from '../../../notebook/browser/contrib/find/findModel.js';
import { CellFindMatchWithIndex, CellWebviewFindMatch, ICellViewModel } from '../../../notebook/browser/notebookBrowser.js';
import { NotebookEditorWidget } from '../../../notebook/browser/notebookEditorWidget.js';
import { INotebookEditorService } from '../../../notebook/browser/services/notebookEditorService.js';
import { NotebookCellsChangeType } from '../../../notebook/common/notebookCommon.js';
import { CellSearchModel } from '../../common/cellSearchModel.js';
import { INotebookCellMatchNoModel, isINotebookFileMatchNoModel, rawCellPrefix } from '../../common/searchNotebookHelpers.js';
import { contentMatchesToTextSearchMatches, INotebookCellMatchWithModel, isINotebookCellMatchWithModel, isINotebookFileMatchWithModel, webviewMatchesToTextSearchMatches } from './searchNotebookHelpers.js';
import { ISearchTreeMatch, ISearchTreeFolderMatch, ISearchTreeFolderMatchWorkspaceRoot, MATCH_PREFIX } from '../searchTreeModel/searchTreeCommon.js';
import { IReplaceService } from '../replace.js';
import { FileMatchImpl } from '../searchTreeModel/fileMatch.js';
import { ICellMatch, IMatchInNotebook, INotebookFileInstanceMatch, isIMatchInNotebook } from './notebookSearchModelBase.js';
import { MatchImpl, textSearchResultToMatches } from '../searchTreeModel/match.js';

export class MatchInNotebook extends MatchImpl implements IMatchInNotebook {
	private _webviewIndex: number | undefined;

	constructor(private readonly _cellParent: ICellMatch, _fullPreviewLines: string[], _fullPreviewRange: ISearchRange, _documentRange: ISearchRange, webviewIndex?: number) {
		super(_cellParent.parent, _fullPreviewLines, _fullPreviewRange, _documentRange, false);
		this._id = MATCH_PREFIX + this._parent.resource.toString() + '>' + this._cellParent.cellIndex + (webviewIndex ? '_' + webviewIndex : '') + '_' + this.notebookMatchTypeString() + this._range + this.getMatchString();
		this._webviewIndex = webviewIndex;
	}

	override parent(): INotebookFileInstanceMatch { // visible parent in search tree
		return this._cellParent.parent;
	}

	get cellParent(): ICellMatch {
		return this._cellParent;
	}

	private notebookMatchTypeString(): string {
		return this.isWebviewMatch() ? 'webview' : 'content';
	}

	public isWebviewMatch() {
		return this._webviewIndex !== undefined;
	}

	override get isReadonly(): boolean {
		return super.isReadonly || (!this._cellParent.hasCellViewModel()) || this.isWebviewMatch();
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

export class CellMatch implements ICellMatch {
	private _contentMatches: Map<string, MatchInNotebook>;
	private _webviewMatches: Map<string, MatchInNotebook>;
	private _context: Map<number, string>;

	constructor(
		private readonly _parent: INotebookFileInstanceMatch,
		private _cell: ICellViewModel | undefined,
		private readonly _cellIndex: number,
	) {

		this._contentMatches = new Map<string, MatchInNotebook>();
		this._webviewMatches = new Map<string, MatchInNotebook>();
		this._context = new Map<number, string>();
	}

	public hasCellViewModel() {
		return !(this._cell instanceof CellSearchModel);
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

	clearAllMatches() {
		this._contentMatches.clear();
		this._webviewMatches.clear();
	}

	addContentMatches(textSearchMatches: ITextSearchMatch[]) {
		const contentMatches = textSearchMatchesToNotebookMatches(textSearchMatches, this);
		contentMatches.forEach((match) => {
			this._contentMatches.set(match.id(), match);
		});
		this.addContext(textSearchMatches);
	}

	public addContext(textSearchMatches: ITextSearchMatch[]) {
		if (!this.cell) {
			// todo: get closed notebook results in search editor
			return;
		}
		this.cell.resolveTextModel().then((textModel) => {
			const textResultsWithContext = getTextSearchMatchWithModelContext(textSearchMatches, textModel, this.parent.parent().query!);
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


	setCellModel(cell: ICellViewModel) {
		this._cell = cell;
	}

	get parent(): INotebookFileInstanceMatch {
		return this._parent;
	}

	get id(): string {
		return this._cell?.id ?? `${rawCellPrefix}${this.cellIndex}`;
	}

	get cellIndex(): number {
		return this._cellIndex;
	}

	get cell(): ICellViewModel | undefined {
		return this._cell;
	}

}

export class NotebookCompatibleFileMatch extends FileMatchImpl implements INotebookFileInstanceMatch {


	private _notebookEditorWidget: NotebookEditorWidget | null = null;
	private _editorWidgetListener: IDisposable | null = null;
	private _notebookUpdateScheduler: RunOnceScheduler;
	private _lastEditorWidgetIdForUpdate: string | undefined;

	constructor(
		_query: IPatternInfo,
		_previewOptions: ITextSearchPreviewOptions | undefined,
		_maxResults: number | undefined,
		_parent: ISearchTreeFolderMatch,
		rawMatch: IFileMatch,
		_closestRoot: ISearchTreeFolderMatchWorkspaceRoot | null,
		private readonly searchInstanceID: string,
		@IModelService modelService: IModelService,
		@IReplaceService replaceService: IReplaceService,
		@ILabelService labelService: ILabelService,
		@INotebookEditorService private readonly notebookEditorService: INotebookEditorService,
	) {
		super(_query, _previewOptions, _maxResults, _parent, rawMatch, _closestRoot, modelService, replaceService, labelService);
		this._cellMatches = new Map<string, ICellMatch>();
		this._notebookUpdateScheduler = new RunOnceScheduler(this.updateMatchesForEditorWidget.bind(this), 250);
	}
	private _cellMatches: Map<string, ICellMatch>;
	public get cellContext(): Map<string, Map<number, string>> {
		const cellContext = new Map<string, Map<number, string>>();
		this._cellMatches.forEach(cellMatch => {
			cellContext.set(cellMatch.id, cellMatch.context);
		});
		return cellContext;
	}

	getCellMatch(cellID: string): ICellMatch | undefined {
		return this._cellMatches.get(cellID);
	}

	addCellMatch(rawCell: INotebookCellMatchNoModel | INotebookCellMatchWithModel) {
		const cellMatch = new CellMatch(this, isINotebookCellMatchWithModel(rawCell) ? rawCell.cell : undefined, rawCell.index);
		this._cellMatches.set(cellMatch.id, cellMatch);
		this.addWebviewMatchesToCell(cellMatch.id, rawCell.webviewResults);
		this.addContentMatchesToCell(cellMatch.id, rawCell.contentResults);
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

	private revealCellRange(match: MatchInNotebook, outputOffset: number | null) {
		if (!this._notebookEditorWidget || !match.cell) {
			// match cell should never be a CellSearchModel if the notebook is open
			return;
		}
		if (match.webviewIndex !== undefined) {
			const index = this._notebookEditorWidget.getCellIndex(match.cell);
			if (index !== undefined) {
				this._notebookEditorWidget.revealCellOffsetInCenter(match.cell, outputOffset ?? 0);
			}
		} else {
			match.cell.updateEditState(match.cell.getEditState(), 'focusNotebookCell');
			this._notebookEditorWidget.setCellEditorSelection(match.cell, match.range());
			this._notebookEditorWidget.revealRangeInCenterIfOutsideViewportAsync(match.cell, match.range());
		}
	}


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
		this._addNotebookHighlights();
	}

	unbindNotebookEditorWidget(widget?: NotebookEditorWidget) {
		if (widget && this._notebookEditorWidget !== widget) {
			return;
		}

		if (this._notebookEditorWidget) {
			this._notebookUpdateScheduler.cancel();
			this._editorWidgetListener?.dispose();
		}
		this._removeNotebookHighlights();
		this._notebookEditorWidget = null;
	}

	updateNotebookHighlights(): void {
		if (this.parent().showHighlights) {
			this._addNotebookHighlights();
			this.setNotebookFindMatchDecorationsUsingCellMatches(Array.from(this._cellMatches.values()));
		} else {
			this._removeNotebookHighlights();
		}
	}

	private _addNotebookHighlights(): void {
		if (!this._notebookEditorWidget) {
			return;
		}
		this._findMatchDecorationModel?.stopWebviewFind();
		this._findMatchDecorationModel?.dispose();
		this._findMatchDecorationModel = new FindMatchDecorationModel(this._notebookEditorWidget, this.searchInstanceID);
		if (this._selectedMatch instanceof MatchInNotebook) {
			this.highlightCurrentFindMatchDecoration(this._selectedMatch);
		}
	}

	private _removeNotebookHighlights(): void {
		if (this._findMatchDecorationModel) {
			this._findMatchDecorationModel?.stopWebviewFind();
			this._findMatchDecorationModel?.dispose();
			this._findMatchDecorationModel = undefined;
		}
	}

	private updateNotebookMatches(matches: CellFindMatchWithIndex[], modelChange: boolean): void {
		if (!this._notebookEditorWidget) {
			return;
		}

		const oldCellMatches = new Map<string, ICellMatch>(this._cellMatches);
		if (this._notebookEditorWidget.getId() !== this._lastEditorWidgetIdForUpdate) {
			this._cellMatches.clear();
			this._lastEditorWidgetIdForUpdate = this._notebookEditorWidget.getId();
		}
		matches.forEach(match => {
			let existingCell = this._cellMatches.get(match.cell.id);
			if (this._notebookEditorWidget && !existingCell) {
				const index = this._notebookEditorWidget.getCellIndex(match.cell);
				const existingRawCell = oldCellMatches.get(`${rawCellPrefix}${index}`);
				if (existingRawCell) {
					existingRawCell.setCellModel(match.cell);
					existingRawCell.clearAllMatches();
					existingCell = existingRawCell;
				}
			}
			existingCell?.clearAllMatches();
			const cell = existingCell ?? new CellMatch(this, match.cell, match.index);
			cell.addContentMatches(contentMatchesToTextSearchMatches(match.contentMatches, match.cell));
			cell.addWebviewMatches(webviewMatchesToTextSearchMatches(match.webviewMatches));
			this._cellMatches.set(cell.id, cell);

		});

		this._findMatchDecorationModel?.setAllFindMatchesDecorations(matches);
		if (this._selectedMatch instanceof MatchInNotebook) {
			this.highlightCurrentFindMatchDecoration(this._selectedMatch);
		}
		this._onChange.fire({ forceUpdateModel: modelChange });
	}

	private setNotebookFindMatchDecorationsUsingCellMatches(cells: ICellMatch[]): void {
		if (!this._findMatchDecorationModel) {
			return;
		}
		const cellFindMatch = coalesce(cells.map((cell): CellFindMatchModel | undefined => {
			const webviewMatches: CellWebviewFindMatch[] = coalesce(cell.webviewMatches.map((match): CellWebviewFindMatch | undefined => {
				if (!match.webviewIndex) {
					return undefined;
				}
				return {
					index: match.webviewIndex,
				};
			}));
			if (!cell.cell) {
				return undefined;
			}
			const findMatches: FindMatch[] = cell.contentMatches.map(match => {
				return new FindMatch(match.range(), [match.text()]);
			});
			return new CellFindMatchModel(cell.cell, cell.cellIndex, findMatches, webviewMatches);
		}));
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

		this._textMatches = new Map<string, ISearchTreeMatch>();

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
			}, CancellationToken.None, false, true, this.searchInstanceID);

		this.updateNotebookMatches(allMatches, true);
	}

	public async showMatch(match: MatchInNotebook) {
		const offset = await this.highlightCurrentFindMatchDecoration(match);
		this.setSelectedMatch(match);
		this.revealCellRange(match, offset);
	}

	private async highlightCurrentFindMatchDecoration(match: MatchInNotebook): Promise<number | null> {
		if (!this._findMatchDecorationModel || !match.cell) {
			// match cell should never be a CellSearchModel if the notebook is open
			return null;
		}
		if (match.webviewIndex === undefined) {
			return this._findMatchDecorationModel.highlightCurrentFindMatchDecorationInCell(match.cell, match.range());
		} else {
			return this._findMatchDecorationModel.highlightCurrentFindMatchDecorationInWebview(match.cell, match.webviewIndex);
		}
	}


	override matches(): ISearchTreeMatch[] {
		const matches = Array.from(this._cellMatches.values()).flatMap((e) => e.matches());
		return [...super.matches(), ...matches];
	}

	protected override removeMatch(match: ISearchTreeMatch) {

		if (match instanceof MatchInNotebook) {
			match.cellParent.remove(match);
			if (match.cellParent.matches().length === 0) {
				this._cellMatches.delete(match.cellParent.id);
			}

			if (this.isMatchSelected(match)) {
				this.setSelectedMatch(null);
				this._findMatchDecorationModel?.clearCurrentFindMatchDecoration();
			} else {
				this.updateHighlights();
			}

			this.setNotebookFindMatchDecorationsUsingCellMatches(this.cellMatches());
		} else {
			super.removeMatch(match);
		}
	}

	cellMatches(): ICellMatch[] {
		return Array.from(this._cellMatches.values());
	}


	override createMatches(): void {
		const model = this.modelService.getModel(this._resource);
		if (model) {
			// todo: handle better when ai contributed results has model, currently, createMatches does not work for this
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
						textSearchResultToMatches(rawMatch, this, false)
							.forEach(m => this.add(m));
					});
			}

			if (isINotebookFileMatchWithModel(this.rawMatch) || isINotebookFileMatchNoModel(this.rawMatch)) {
				this.rawMatch.cellResults?.forEach(cell => this.addCellMatch(cell));
				this.setNotebookFindMatchDecorationsUsingCellMatches(this.cellMatches());
				this._onChange.fire({ forceUpdateModel: true });
			}
			this.addContext(this.rawMatch.results);
		}
	}

	override get hasChildren(): boolean {
		return super.hasChildren || this._cellMatches.size > 0;
	}

	override setSelectedMatch(match: ISearchTreeMatch | null): void {
		if (match) {
			if (!this.isMatchSelected(match) && isIMatchInNotebook(match)) {
				this._selectedMatch = match;
				return;
			}

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

	override dispose(): void {
		this.unbindNotebookEditorWidget();
		super.dispose();
	}

}
// text search to notebook matches

export function textSearchMatchesToNotebookMatches(textSearchMatches: ITextSearchMatch[], cell: CellMatch): MatchInNotebook[] {
	const notebookMatches: MatchInNotebook[] = [];
	textSearchMatches.forEach((textSearchMatch) => {
		const previewLines = textSearchMatch.previewText.split('\n');
		textSearchMatch.rangeLocations.map((rangeLocation) => {
			const previewRange: ISearchRange = rangeLocation.preview;
			const match = new MatchInNotebook(cell, previewLines, previewRange, rangeLocation.source, textSearchMatch.webviewIndex);
			notebookMatches.push(match);
		});
	});
	return notebookMatches;
}
