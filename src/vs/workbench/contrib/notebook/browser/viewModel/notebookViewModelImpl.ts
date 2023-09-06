/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { groupBy } from 'vs/base/common/collections';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { clamp } from 'vs/base/common/numbers';
import * as strings from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { IBulkEditService, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { FindMatch, IModelDecorationOptions, IModelDeltaDecoration, TrackedRangeStickiness } from 'vs/editor/common/model';
import { MultiModelEditStackElement, SingleModelEditStackElement } from 'vs/editor/common/model/editStack';
import { IntervalNode, IntervalTree } from 'vs/editor/common/model/intervalTree';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IWorkspaceTextEdit } from 'vs/editor/common/languages';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { FoldingRegions } from 'vs/editor/contrib/folding/browser/foldingRanges';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { CellEditState, CellFindMatchWithIndex, CellFoldingState, EditorFoldingStateDelegate, ICellViewModel, INotebookDeltaCellStatusBarItems, INotebookDeltaDecoration, ICellModelDecorations, ICellModelDeltaDecorations, IModelDecorationsChangeAccessor, INotebookEditorViewState, INotebookViewCellsUpdateEvent, INotebookViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookCellSelectionCollection } from 'vs/workbench/contrib/notebook/browser/viewModel/cellSelectionCollection';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { MarkupCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/markupCellViewModel';
import { ViewContext } from 'vs/workbench/contrib/notebook/browser/viewModel/viewContext';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellKind, ICell, INotebookSearchOptions, ISelectionState, NotebookCellsChangeType, NotebookCellTextModelSplice, SelectionStateType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { cellIndexesToRanges, cellRangesToIndexes, ICellRange, reduceCellRanges } from 'vs/workbench/contrib/notebook/common/notebookRange';
import { NotebookLayoutInfo, NotebookMetadataChangedEvent } from 'vs/workbench/contrib/notebook/browser/notebookViewEvents';
import { CellFindMatchModel } from 'vs/workbench/contrib/notebook/browser/contrib/find/findModel';
import { INotebookExecutionStateService, NotebookExecutionType } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';

const invalidFunc = () => { throw new Error(`Invalid change accessor`); };

class DecorationsTree {
	private readonly _decorationsTree: IntervalTree;

	constructor() {
		this._decorationsTree = new IntervalTree();
	}

	public intervalSearch(start: number, end: number, filterOwnerId: number, filterOutValidation: boolean, cachedVersionId: number, onlyMarginDecorations: boolean = false): IntervalNode[] {
		const r1 = this._decorationsTree.intervalSearch(start, end, filterOwnerId, filterOutValidation, cachedVersionId, onlyMarginDecorations);
		return r1;
	}

	public search(filterOwnerId: number, filterOutValidation: boolean, overviewRulerOnly: boolean, cachedVersionId: number, onlyMarginDecorations: boolean): IntervalNode[] {
		return this._decorationsTree.search(filterOwnerId, filterOutValidation, cachedVersionId, onlyMarginDecorations);

	}

	public collectNodesFromOwner(ownerId: number): IntervalNode[] {
		const r1 = this._decorationsTree.collectNodesFromOwner(ownerId);
		return r1;
	}

	public collectNodesPostOrder(): IntervalNode[] {
		const r1 = this._decorationsTree.collectNodesPostOrder();
		return r1;
	}

	public insert(node: IntervalNode): void {
		this._decorationsTree.insert(node);
	}

	public delete(node: IntervalNode): void {
		this._decorationsTree.delete(node);
	}

	public resolveNode(node: IntervalNode, cachedVersionId: number): void {
		this._decorationsTree.resolveNode(node, cachedVersionId);
	}

	public acceptReplace(offset: number, length: number, textLength: number, forceMoveMarkers: boolean): void {
		this._decorationsTree.acceptReplace(offset, length, textLength, forceMoveMarkers);
	}
}

const TRACKED_RANGE_OPTIONS = [
	ModelDecorationOptions.register({ description: 'notebook-view-model-tracked-range-always-grows-when-typing-at-edges', stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges }),
	ModelDecorationOptions.register({ description: 'notebook-view-model-tracked-range-never-grows-when-typing-at-edges', stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges }),
	ModelDecorationOptions.register({ description: 'notebook-view-model-tracked-range-grows-only-when-typing-before', stickiness: TrackedRangeStickiness.GrowsOnlyWhenTypingBefore }),
	ModelDecorationOptions.register({ description: 'notebook-view-model-tracked-range-grows-only-when-typing-after', stickiness: TrackedRangeStickiness.GrowsOnlyWhenTypingAfter }),
];

function _normalizeOptions(options: IModelDecorationOptions): ModelDecorationOptions {
	if (options instanceof ModelDecorationOptions) {
		return options;
	}
	return ModelDecorationOptions.createDynamic(options);
}

let MODEL_ID = 0;

export interface NotebookViewModelOptions {
	isReadOnly: boolean;
}

export class NotebookViewModel extends Disposable implements EditorFoldingStateDelegate, INotebookViewModel {
	private _localStore: DisposableStore = this._register(new DisposableStore());
	private _handleToViewCellMapping = new Map<number, CellViewModel>();
	get options(): NotebookViewModelOptions { return this._options; }
	private readonly _onDidChangeOptions = this._register(new Emitter<void>());
	get onDidChangeOptions(): Event<void> { return this._onDidChangeOptions.event; }
	private _viewCells: CellViewModel[] = [];

	get viewCells(): ICellViewModel[] {
		return this._viewCells;
	}

	set viewCells(_: ICellViewModel[]) {
		throw new Error('NotebookViewModel.viewCells is readonly');
	}

	get length(): number {
		return this._viewCells.length;
	}

	get notebookDocument() {
		return this._notebook;
	}

	get uri() {
		return this._notebook.uri;
	}

	get metadata() {
		return this._notebook.metadata;
	}

	private readonly _onDidChangeViewCells = this._register(new Emitter<INotebookViewCellsUpdateEvent>());
	get onDidChangeViewCells(): Event<INotebookViewCellsUpdateEvent> { return this._onDidChangeViewCells.event; }

	private _lastNotebookEditResource: URI[] = [];

	get lastNotebookEditResource(): URI | null {
		if (this._lastNotebookEditResource.length) {
			return this._lastNotebookEditResource[this._lastNotebookEditResource.length - 1];
		}
		return null;
	}

	get layoutInfo(): NotebookLayoutInfo | null {
		return this._layoutInfo;
	}

	private readonly _onDidChangeSelection = this._register(new Emitter<string>());
	get onDidChangeSelection(): Event<string> { return this._onDidChangeSelection.event; }

	private _selectionCollection = new NotebookCellSelectionCollection();

	private get selectionHandles() {
		const handlesSet = new Set<number>();
		const handles: number[] = [];
		cellRangesToIndexes(this._selectionCollection.selections).map(index => index < this.length ? this.cellAt(index) : undefined).forEach(cell => {
			if (cell && !handlesSet.has(cell.handle)) {
				handles.push(cell.handle);
			}
		});

		return handles;
	}

	private set selectionHandles(selectionHandles: number[]) {
		const indexes = selectionHandles.map(handle => this._viewCells.findIndex(cell => cell.handle === handle));
		this._selectionCollection.setSelections(cellIndexesToRanges(indexes), true, 'model');
	}

	private _decorationsTree = new DecorationsTree();
	private _decorations: { [decorationId: string]: IntervalNode } = Object.create(null);
	private _lastDecorationId: number = 0;
	private readonly _instanceId: string;
	public readonly id: string;
	private _foldingRanges: FoldingRegions | null = null;
	private _hiddenRanges: ICellRange[] = [];
	private _focused: boolean = true;

	get focused() {
		return this._focused;
	}

	private _decorationIdToCellMap = new Map<string, number>();
	private _statusBarItemIdToCellMap = new Map<string, number>();

	constructor(
		public viewType: string,
		private _notebook: NotebookTextModel,
		private _viewContext: ViewContext,
		private _layoutInfo: NotebookLayoutInfo | null,
		private _options: NotebookViewModelOptions,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@IUndoRedoService private readonly _undoService: IUndoRedoService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@INotebookExecutionStateService notebookExecutionStateService: INotebookExecutionStateService,
	) {
		super();

		MODEL_ID++;
		this.id = '$notebookViewModel' + MODEL_ID;
		this._instanceId = strings.singleLetterHash(MODEL_ID);

		const compute = (changes: NotebookCellTextModelSplice<ICell>[], synchronous: boolean) => {
			const diffs = changes.map(splice => {
				return [splice[0], splice[1], splice[2].map(cell => {
					return createCellViewModel(this._instantiationService, this, cell as NotebookCellTextModel, this._viewContext);
				})] as [number, number, CellViewModel[]];
			});

			diffs.reverse().forEach(diff => {
				const deletedCells = this._viewCells.splice(diff[0], diff[1], ...diff[2]);

				this._decorationsTree.acceptReplace(diff[0], diff[1], diff[2].length, true);
				deletedCells.forEach(cell => {
					this._handleToViewCellMapping.delete(cell.handle);
					// dispose the cell to release ref to the cell text document
					cell.dispose();
				});

				diff[2].forEach(cell => {
					this._handleToViewCellMapping.set(cell.handle, cell);
					this._localStore.add(cell);
				});
			});

			const selectionHandles = this.selectionHandles;

			this._onDidChangeViewCells.fire({
				synchronous: synchronous,
				splices: diffs
			});

			let endSelectionHandles: number[] = [];
			if (selectionHandles.length) {
				const primaryHandle = selectionHandles[0];
				const primarySelectionIndex = this._viewCells.indexOf(this.getCellByHandle(primaryHandle)!);
				endSelectionHandles = [primaryHandle];
				let delta = 0;

				for (let i = 0; i < diffs.length; i++) {
					const diff = diffs[0];
					if (diff[0] + diff[1] <= primarySelectionIndex) {
						delta += diff[2].length - diff[1];
						continue;
					}

					if (diff[0] > primarySelectionIndex) {
						endSelectionHandles = [primaryHandle];
						break;
					}

					if (diff[0] + diff[1] > primarySelectionIndex) {
						endSelectionHandles = [this._viewCells[diff[0] + delta].handle];
						break;
					}
				}
			}

			// TODO@rebornix
			const selectionIndexes = endSelectionHandles.map(handle => this._viewCells.findIndex(cell => cell.handle === handle));
			this._selectionCollection.setState(cellIndexesToRanges([selectionIndexes[0]])[0], cellIndexesToRanges(selectionIndexes), true, 'model');
		};

		this._register(this._notebook.onDidChangeContent(e => {
			for (let i = 0; i < e.rawEvents.length; i++) {
				const change = e.rawEvents[i];
				let changes: NotebookCellTextModelSplice<ICell>[] = [];
				const synchronous = e.synchronous ?? true;

				if (change.kind === NotebookCellsChangeType.ModelChange || change.kind === NotebookCellsChangeType.Initialize) {
					changes = change.changes;
					compute(changes, synchronous);
					continue;
				} else if (change.kind === NotebookCellsChangeType.Move) {
					compute([[change.index, change.length, []]], synchronous);
					compute([[change.newIdx, 0, change.cells]], synchronous);
				} else {
					continue;
				}
			}
		}));

		this._register(this._notebook.onDidChangeContent(contentChanges => {
			contentChanges.rawEvents.forEach(e => {
				if (e.kind === NotebookCellsChangeType.ChangeDocumentMetadata) {
					this._viewContext.eventDispatcher.emit([new NotebookMetadataChangedEvent(this._notebook.metadata)]);
				}
			});

			if (contentChanges.endSelectionState) {
				this.updateSelectionsState(contentChanges.endSelectionState);
			}
		}));

		this._register(this._viewContext.eventDispatcher.onDidChangeLayout((e) => {
			this._layoutInfo = e.value;

			this._viewCells.forEach(cell => {
				if (cell.cellKind === CellKind.Markup) {
					if (e.source.width || e.source.fontInfo) {
						cell.layoutChange({ outerWidth: e.value.width, font: e.value.fontInfo });
					}
				} else {
					if (e.source.width !== undefined) {
						cell.layoutChange({ outerWidth: e.value.width, font: e.value.fontInfo });
					}
				}
			});
		}));

		this._register(this._viewContext.notebookOptions.onDidChangeOptions(e => {
			for (let i = 0; i < this.length; i++) {
				const cell = this._viewCells[i];
				cell.updateOptions(e);
			}
		}));

		this._register(notebookExecutionStateService.onDidChangeExecution(e => {
			if (e.type !== NotebookExecutionType.cell) {
				return;
			}
			const cell = this.getCellByHandle(e.cellHandle);

			if (cell instanceof CodeCellViewModel) {
				cell.updateExecutionState(e);
			}
		}));

		this._register(this._selectionCollection.onDidChangeSelection(e => {
			this._onDidChangeSelection.fire(e);
		}));

		this._viewCells = this._notebook.cells.map(cell => {
			return createCellViewModel(this._instantiationService, this, cell, this._viewContext);
		});

		this._viewCells.forEach(cell => {
			this._handleToViewCellMapping.set(cell.handle, cell);
		});
	}

	updateOptions(newOptions: Partial<NotebookViewModelOptions>) {
		this._options = { ...this._options, ...newOptions };
		this._onDidChangeOptions.fire();
	}

	getFocus() {
		return this._selectionCollection.focus;
	}

	getSelections() {
		return this._selectionCollection.selections;
	}

	setEditorFocus(focused: boolean) {
		this._focused = focused;
	}

	/**
	 * Empty selection will be turned to `null`
	 */
	validateRange(cellRange: ICellRange | null | undefined): ICellRange | null {
		if (!cellRange) {
			return null;
		}

		const start = clamp(cellRange.start, 0, this.length);
		const end = clamp(cellRange.end, 0, this.length);

		if (start === end) {
			return null;
		}

		if (start < end) {
			return { start, end };
		} else {
			return { start: end, end: start };
		}
	}

	// selection change from list view's `setFocus` and `setSelection` should always use `source: view` to prevent events breaking the list view focus/selection change transaction
	updateSelectionsState(state: ISelectionState, source: 'view' | 'model' = 'model') {
		if (this._focused || source === 'model') {
			if (state.kind === SelectionStateType.Handle) {
				const primaryIndex = state.primary !== null ? this.getCellIndexByHandle(state.primary) : null;
				const primarySelection = primaryIndex !== null ? this.validateRange({ start: primaryIndex, end: primaryIndex + 1 }) : null;
				const selections = cellIndexesToRanges(state.selections.map(sel => this.getCellIndexByHandle(sel)))
					.map(range => this.validateRange(range))
					.filter(range => range !== null) as ICellRange[];
				this._selectionCollection.setState(primarySelection, reduceCellRanges(selections), true, source);
			} else {
				const primarySelection = this.validateRange(state.focus);
				const selections = state.selections
					.map(range => this.validateRange(range))
					.filter(range => range !== null) as ICellRange[];
				this._selectionCollection.setState(primarySelection, reduceCellRanges(selections), true, source);
			}
		}
	}

	getFoldingStartIndex(index: number): number {
		if (!this._foldingRanges) {
			return -1;
		}

		const range = this._foldingRanges.findRange(index + 1);
		const startIndex = this._foldingRanges.getStartLineNumber(range) - 1;
		return startIndex;
	}

	getFoldingState(index: number): CellFoldingState {
		if (!this._foldingRanges) {
			return CellFoldingState.None;
		}

		const range = this._foldingRanges.findRange(index + 1);
		const startIndex = this._foldingRanges.getStartLineNumber(range) - 1;

		if (startIndex !== index) {
			return CellFoldingState.None;
		}

		return this._foldingRanges.isCollapsed(range) ? CellFoldingState.Collapsed : CellFoldingState.Expanded;
	}

	getFoldedLength(index: number): number {
		if (!this._foldingRanges) {
			return 0;
		}

		const range = this._foldingRanges.findRange(index + 1);
		const startIndex = this._foldingRanges.getStartLineNumber(range) - 1;
		const endIndex = this._foldingRanges.getEndLineNumber(range) - 1;

		return endIndex - startIndex;
	}

	updateFoldingRanges(ranges: FoldingRegions) {
		this._foldingRanges = ranges;
		let updateHiddenAreas = false;
		const newHiddenAreas: ICellRange[] = [];

		let i = 0; // index into hidden
		let k = 0;

		let lastCollapsedStart = Number.MAX_VALUE;
		let lastCollapsedEnd = -1;

		for (; i < ranges.length; i++) {
			if (!ranges.isCollapsed(i)) {
				continue;
			}

			const startLineNumber = ranges.getStartLineNumber(i) + 1; // the first line is not hidden
			const endLineNumber = ranges.getEndLineNumber(i);
			if (lastCollapsedStart <= startLineNumber && endLineNumber <= lastCollapsedEnd) {
				// ignore ranges contained in collapsed regions
				continue;
			}

			if (!updateHiddenAreas && k < this._hiddenRanges.length && this._hiddenRanges[k].start + 1 === startLineNumber && (this._hiddenRanges[k].end + 1) === endLineNumber) {
				// reuse the old ranges
				newHiddenAreas.push(this._hiddenRanges[k]);
				k++;
			} else {
				updateHiddenAreas = true;
				newHiddenAreas.push({ start: startLineNumber - 1, end: endLineNumber - 1 });
			}
			lastCollapsedStart = startLineNumber;
			lastCollapsedEnd = endLineNumber;
		}

		if (updateHiddenAreas || k < this._hiddenRanges.length) {
			this._hiddenRanges = newHiddenAreas;
		}

		this._viewCells.forEach(cell => {
			if (cell.cellKind === CellKind.Markup) {
				cell.triggerFoldingStateChange();
			}
		});
	}

	getHiddenRanges() {
		return this._hiddenRanges;
	}

	getCellByHandle(handle: number) {
		return this._handleToViewCellMapping.get(handle);
	}

	getCellIndexByHandle(handle: number): number {
		return this._viewCells.findIndex(cell => cell.handle === handle);
	}

	getCellIndex(cell: ICellViewModel) {
		return this._viewCells.indexOf(cell as CellViewModel);
	}

	cellAt(index: number): CellViewModel | undefined {
		// if (index < 0 || index >= this.length) {
		// 	throw new Error(`Invalid index ${index}`);
		// }

		return this._viewCells[index];
	}

	getCellsInRange(range?: ICellRange): ReadonlyArray<ICellViewModel> {
		if (!range) {
			return this._viewCells.slice(0);
		}

		const validatedRange = this.validateRange(range);

		if (validatedRange) {
			const result: ICellViewModel[] = [];

			for (let i = validatedRange.start; i < validatedRange.end; i++) {
				result.push(this._viewCells[i]);
			}

			return result;
		}

		return [];
	}

	/**
	 * If this._viewCells[index] is visible then return index
	 */
	getNearestVisibleCellIndexUpwards(index: number) {
		for (let i = this._hiddenRanges.length - 1; i >= 0; i--) {
			const cellRange = this._hiddenRanges[i];
			const foldStart = cellRange.start - 1;
			const foldEnd = cellRange.end;

			if (foldStart > index) {
				continue;
			}

			if (foldStart <= index && foldEnd >= index) {
				return index;
			}

			// foldStart <= index, foldEnd < index
			break;
		}

		return index;
	}

	getNextVisibleCellIndex(index: number) {
		for (let i = 0; i < this._hiddenRanges.length; i++) {
			const cellRange = this._hiddenRanges[i];
			const foldStart = cellRange.start - 1;
			const foldEnd = cellRange.end;

			if (foldEnd < index) {
				continue;
			}

			// foldEnd >= index
			if (foldStart <= index) {
				return foldEnd + 1;
			}

			break;
		}

		return index + 1;
	}

	getPreviousVisibleCellIndex(index: number) {
		for (let i = this._hiddenRanges.length - 1; i >= 0; i--) {
			const cellRange = this._hiddenRanges[i];
			const foldStart = cellRange.start - 1;
			const foldEnd = cellRange.end;

			if (foldEnd < index) {
				return index;
			}

			if (foldStart <= index) {
				return foldStart;
			}
		}

		return index;
	}

	hasCell(cell: ICellViewModel) {
		return this._handleToViewCellMapping.has(cell.handle);
	}

	getVersionId() {
		return this._notebook.versionId;
	}

	getAlternativeId() {
		return this._notebook.alternativeVersionId;
	}

	getTrackedRange(id: string): ICellRange | null {
		return this._getDecorationRange(id);
	}

	private _getDecorationRange(decorationId: string): ICellRange | null {
		const node = this._decorations[decorationId];
		if (!node) {
			return null;
		}
		const versionId = this.getVersionId();
		if (node.cachedVersionId !== versionId) {
			this._decorationsTree.resolveNode(node, versionId);
		}
		if (node.range === null) {
			return { start: node.cachedAbsoluteStart - 1, end: node.cachedAbsoluteEnd - 1 };
		}

		return { start: node.range.startLineNumber - 1, end: node.range.endLineNumber - 1 };
	}

	setTrackedRange(id: string | null, newRange: ICellRange | null, newStickiness: TrackedRangeStickiness): string | null {
		const node = (id ? this._decorations[id] : null);

		if (!node) {
			if (!newRange) {
				return null;
			}

			return this._deltaCellDecorationsImpl(0, [], [{ range: new Range(newRange.start + 1, 1, newRange.end + 1, 1), options: TRACKED_RANGE_OPTIONS[newStickiness] }])[0];
		}

		if (!newRange) {
			// node exists, the request is to delete => delete node
			this._decorationsTree.delete(node);
			delete this._decorations[node.id];
			return null;
		}

		this._decorationsTree.delete(node);
		node.reset(this.getVersionId(), newRange.start, newRange.end + 1, new Range(newRange.start + 1, 1, newRange.end + 1, 1));
		node.setOptions(TRACKED_RANGE_OPTIONS[newStickiness]);
		this._decorationsTree.insert(node);
		return node.id;
	}

	private _deltaCellDecorationsImpl(ownerId: number, oldDecorationsIds: string[], newDecorations: IModelDeltaDecoration[]): string[] {
		const versionId = this.getVersionId();

		const oldDecorationsLen = oldDecorationsIds.length;
		let oldDecorationIndex = 0;

		const newDecorationsLen = newDecorations.length;
		let newDecorationIndex = 0;

		const result = new Array<string>(newDecorationsLen);
		while (oldDecorationIndex < oldDecorationsLen || newDecorationIndex < newDecorationsLen) {

			let node: IntervalNode | null = null;

			if (oldDecorationIndex < oldDecorationsLen) {
				// (1) get ourselves an old node
				do {
					node = this._decorations[oldDecorationsIds[oldDecorationIndex++]];
				} while (!node && oldDecorationIndex < oldDecorationsLen);

				// (2) remove the node from the tree (if it exists)
				if (node) {
					this._decorationsTree.delete(node);
				}
			}

			if (newDecorationIndex < newDecorationsLen) {
				// (3) create a new node if necessary
				if (!node) {
					const internalDecorationId = (++this._lastDecorationId);
					const decorationId = `${this._instanceId};${internalDecorationId}`;
					node = new IntervalNode(decorationId, 0, 0);
					this._decorations[decorationId] = node;
				}

				// (4) initialize node
				const newDecoration = newDecorations[newDecorationIndex];
				const range = newDecoration.range;
				const options = _normalizeOptions(newDecoration.options);

				node.ownerId = ownerId;
				node.reset(versionId, range.startLineNumber, range.endLineNumber, Range.lift(range));
				node.setOptions(options);

				this._decorationsTree.insert(node);

				result[newDecorationIndex] = node.id;

				newDecorationIndex++;
			} else {
				if (node) {
					delete this._decorations[node.id];
				}
			}
		}

		return result;
	}

	deltaCellDecorations(oldDecorations: string[], newDecorations: INotebookDeltaDecoration[]): string[] {
		oldDecorations.forEach(id => {
			const handle = this._decorationIdToCellMap.get(id);

			if (handle !== undefined) {
				const cell = this.getCellByHandle(handle);
				cell?.deltaCellDecorations([id], []);
			}
		});

		const result: string[] = [];

		newDecorations.forEach(decoration => {
			const cell = this.getCellByHandle(decoration.handle);
			const ret = cell?.deltaCellDecorations([], [decoration.options]) || [];
			ret.forEach(id => {
				this._decorationIdToCellMap.set(id, decoration.handle);
			});

			result.push(...ret);
		});

		return result;
	}

	deltaCellStatusBarItems(oldItems: string[], newItems: INotebookDeltaCellStatusBarItems[]): string[] {
		const deletesByHandle = groupBy(oldItems, id => this._statusBarItemIdToCellMap.get(id) ?? -1);

		const result: string[] = [];
		newItems.forEach(itemDelta => {
			const cell = this.getCellByHandle(itemDelta.handle);
			const deleted = deletesByHandle[itemDelta.handle] ?? [];
			delete deletesByHandle[itemDelta.handle];
			deleted.forEach(id => this._statusBarItemIdToCellMap.delete(id));

			const ret = cell?.deltaCellStatusBarItems(deleted, itemDelta.items) || [];
			ret.forEach(id => {
				this._statusBarItemIdToCellMap.set(id, itemDelta.handle);
			});

			result.push(...ret);
		});

		for (const _handle in deletesByHandle) {
			const handle = parseInt(_handle);
			const ids = deletesByHandle[handle];
			const cell = this.getCellByHandle(handle);
			cell?.deltaCellStatusBarItems(ids, []);
			ids.forEach(id => this._statusBarItemIdToCellMap.delete(id));
		}

		return result;
	}

	nearestCodeCellIndex(index: number /* exclusive */) {
		const nearest = this.viewCells.slice(0, index).reverse().findIndex(cell => cell.cellKind === CellKind.Code);
		if (nearest > -1) {
			return index - nearest - 1;
		} else {
			const nearestCellTheOtherDirection = this.viewCells.slice(index + 1).findIndex(cell => cell.cellKind === CellKind.Code);
			if (nearestCellTheOtherDirection > -1) {
				return index + 1 + nearestCellTheOtherDirection;
			}
			return -1;
		}
	}

	getEditorViewState(): INotebookEditorViewState {
		const editingCells: { [key: number]: boolean } = {};
		const collapsedInputCells: { [key: number]: boolean } = {};
		const collapsedOutputCells: { [key: number]: boolean } = {};
		const cellLineNumberStates: { [key: number]: 'on' | 'off' } = {};

		this._viewCells.forEach((cell, i) => {
			if (cell.getEditState() === CellEditState.Editing) {
				editingCells[i] = true;
			}

			if (cell.isInputCollapsed) {
				collapsedInputCells[i] = true;
			}

			if (cell instanceof CodeCellViewModel && cell.isOutputCollapsed) {
				collapsedOutputCells[i] = true;
			}

			if (cell.lineNumbers !== 'inherit') {
				cellLineNumberStates[i] = cell.lineNumbers;
			}
		});
		const editorViewStates: { [key: number]: editorCommon.ICodeEditorViewState } = {};
		this._viewCells.map(cell => ({ handle: cell.model.handle, state: cell.saveEditorViewState() })).forEach((viewState, i) => {
			if (viewState.state) {
				editorViewStates[i] = viewState.state;
			}
		});

		return {
			editingCells,
			editorViewStates,
			cellLineNumberStates,
			collapsedInputCells,
			collapsedOutputCells
		};
	}

	restoreEditorViewState(viewState: INotebookEditorViewState | undefined): void {
		if (!viewState) {
			return;
		}

		this._viewCells.forEach((cell, index) => {
			const isEditing = viewState.editingCells && viewState.editingCells[index];
			const editorViewState = viewState.editorViewStates && viewState.editorViewStates[index];

			cell.updateEditState(isEditing ? CellEditState.Editing : CellEditState.Preview, 'viewState');
			const cellHeight = viewState.cellTotalHeights ? viewState.cellTotalHeights[index] : undefined;
			cell.restoreEditorViewState(editorViewState, cellHeight);
			if (viewState.collapsedInputCells && viewState.collapsedInputCells[index]) {
				cell.isInputCollapsed = true;
			}
			if (viewState.collapsedOutputCells && viewState.collapsedOutputCells[index] && cell instanceof CodeCellViewModel) {
				cell.isOutputCollapsed = true;
			}
			if (viewState.cellLineNumberStates && viewState.cellLineNumberStates[index]) {
				cell.lineNumbers = viewState.cellLineNumberStates[index];
			}
		});
	}

	/**
	 * Editor decorations across cells. For example, find decorations for multiple code cells
	 * The reason that we can't completely delegate this to CodeEditorWidget is most of the time, the editors for cells are not created yet but we already have decorations for them.
	 */
	changeModelDecorations<T>(callback: (changeAccessor: IModelDecorationsChangeAccessor) => T): T | null {
		const changeAccessor: IModelDecorationsChangeAccessor = {
			deltaDecorations: (oldDecorations: ICellModelDecorations[], newDecorations: ICellModelDeltaDecorations[]): ICellModelDecorations[] => {
				return this._deltaModelDecorationsImpl(oldDecorations, newDecorations);
			}
		};

		let result: T | null = null;
		try {
			result = callback(changeAccessor);
		} catch (e) {
			onUnexpectedError(e);
		}

		changeAccessor.deltaDecorations = invalidFunc;

		return result;
	}

	private _deltaModelDecorationsImpl(oldDecorations: ICellModelDecorations[], newDecorations: ICellModelDeltaDecorations[]): ICellModelDecorations[] {

		const mapping = new Map<number, { cell: CellViewModel; oldDecorations: readonly string[]; newDecorations: readonly IModelDeltaDecoration[] }>();
		oldDecorations.forEach(oldDecoration => {
			const ownerId = oldDecoration.ownerId;

			if (!mapping.has(ownerId)) {
				const cell = this._viewCells.find(cell => cell.handle === ownerId);
				if (cell) {
					mapping.set(ownerId, { cell: cell, oldDecorations: [], newDecorations: [] });
				}
			}

			const data = mapping.get(ownerId)!;
			if (data) {
				data.oldDecorations = oldDecoration.decorations;
			}
		});

		newDecorations.forEach(newDecoration => {
			const ownerId = newDecoration.ownerId;

			if (!mapping.has(ownerId)) {
				const cell = this._viewCells.find(cell => cell.handle === ownerId);

				if (cell) {
					mapping.set(ownerId, { cell: cell, oldDecorations: [], newDecorations: [] });
				}
			}

			const data = mapping.get(ownerId)!;
			if (data) {
				data.newDecorations = newDecoration.decorations;
			}
		});

		const ret: ICellModelDecorations[] = [];
		mapping.forEach((value, ownerId) => {
			const cellRet = value.cell.deltaModelDecorations(value.oldDecorations, value.newDecorations);
			ret.push({
				ownerId: ownerId,
				decorations: cellRet
			});
		});

		return ret;
	}

	//#region Find
	find(value: string, options: INotebookSearchOptions): CellFindMatchWithIndex[] {
		const matches: CellFindMatchWithIndex[] = [];
		this._viewCells.forEach((cell, index) => {
			const cellMatches = cell.startFind(value, options);
			if (cellMatches) {
				matches.push(new CellFindMatchModel(
					cellMatches.cell,
					index,
					cellMatches.contentMatches,
					[]
				));
			}
		});

		// filter based on options and editing state

		return matches.filter(match => {
			if (match.cell.cellKind === CellKind.Code) {
				// code cell, we only include its match if include input is enabled
				return options.includeCodeInput;
			}

			// markup cell, it depends on the editing state
			if (match.cell.getEditState() === CellEditState.Editing) {
				// editing, even if we includeMarkupPreview
				return options.includeMarkupInput;
			} else {
				// cell in preview mode, we should only include it if includeMarkupPreview is false but includeMarkupInput is true
				// if includeMarkupPreview is true, then we should include the webview match result other than this
				return !options.includeMarkupPreview && options.includeMarkupInput;
			}
		}
		);
	}

	replaceOne(cell: ICellViewModel, range: Range, text: string): Promise<void> {
		const viewCell = cell as CellViewModel;
		this._lastNotebookEditResource.push(viewCell.uri);
		return viewCell.resolveTextModel().then(() => {
			this._bulkEditService.apply(
				[new ResourceTextEdit(cell.uri, { range, text })],
				{ quotableLabel: 'Notebook Replace' }
			);
		});
	}

	async replaceAll(matches: CellFindMatchWithIndex[], texts: string[]): Promise<void> {
		if (!matches.length) {
			return;
		}

		const textEdits: IWorkspaceTextEdit[] = [];
		this._lastNotebookEditResource.push(matches[0].cell.uri);

		matches.forEach(match => {
			match.contentMatches.forEach((singleMatch, index) => {
				textEdits.push({
					versionId: undefined,
					textEdit: { range: (singleMatch as FindMatch).range, text: texts[index] },
					resource: match.cell.uri
				});
			});
		});

		return Promise.all(matches.map(match => {
			return match.cell.resolveTextModel();
		})).then(async () => {
			this._bulkEditService.apply({ edits: textEdits }, { quotableLabel: 'Notebook Replace All' });
			return;
		});
	}

	//#endregion

	//#region Undo/Redo

	private async _withElement(element: SingleModelEditStackElement | MultiModelEditStackElement, callback: () => Promise<void>) {
		const viewCells = this._viewCells.filter(cell => element.matchesResource(cell.uri));
		const refs = await Promise.all(viewCells.map(cell => this._textModelService.createModelReference(cell.uri)));
		await callback();
		refs.forEach(ref => ref.dispose());
	}

	async undo() {

		const editStack = this._undoService.getElements(this.uri);
		const element = editStack.past.length ? editStack.past[editStack.past.length - 1] : undefined;

		if (element && element instanceof SingleModelEditStackElement || element instanceof MultiModelEditStackElement) {
			await this._withElement(element, async () => {
				await this._undoService.undo(this.uri);
			});

			return (element instanceof SingleModelEditStackElement) ? [element.resource] : element.resources;
		}

		await this._undoService.undo(this.uri);
		return [];
	}

	async redo() {

		const editStack = this._undoService.getElements(this.uri);
		const element = editStack.future[0];

		if (element && element instanceof SingleModelEditStackElement || element instanceof MultiModelEditStackElement) {
			await this._withElement(element, async () => {
				await this._undoService.redo(this.uri);
			});

			return (element instanceof SingleModelEditStackElement) ? [element.resource] : element.resources;
		}

		await this._undoService.redo(this.uri);

		return [];
	}

	//#endregion

	equal(notebook: NotebookTextModel) {
		return this._notebook === notebook;
	}

	override dispose() {
		this._localStore.clear();
		this._viewCells.forEach(cell => {
			cell.dispose();
		});

		super.dispose();
	}
}

export type CellViewModel = CodeCellViewModel | MarkupCellViewModel;

export function createCellViewModel(instantiationService: IInstantiationService, notebookViewModel: NotebookViewModel, cell: NotebookCellTextModel, viewContext: ViewContext) {
	if (cell.cellKind === CellKind.Code) {
		return instantiationService.createInstance(CodeCellViewModel, notebookViewModel.viewType, cell, notebookViewModel.layoutInfo, viewContext);
	} else {
		return instantiationService.createInstance(MarkupCellViewModel, notebookViewModel.viewType, cell, notebookViewModel.layoutInfo, notebookViewModel, viewContext);
	}
}
