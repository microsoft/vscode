/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import * as strings from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { IModelDecorationOptions, IModelDeltaDecoration, TrackedRangeStickiness } from 'vs/editor/common/model';
import { IntervalNode, IntervalTree } from 'vs/editor/common/model/intervalTree';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { WorkspaceTextEdit } from 'vs/editor/common/modes';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { CellEditState, CellFindMatch, ICellRange, ICellViewModel, NotebookLayoutInfo } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookEditorModel } from 'vs/workbench/contrib/notebook/browser/notebookEditorInput';
import { DeleteCellEdit, InsertCellEdit, MoveCellEdit } from 'vs/workbench/contrib/notebook/browser/viewModel/cellEdit';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { NotebookEventDispatcher, NotebookMetadataChangedEvent } from 'vs/workbench/contrib/notebook/browser/viewModel/eventDispatcher';
import { CellFoldingState, FoldingModel, FoldingRegionDelegate } from 'vs/workbench/contrib/notebook/browser/viewModel/foldingModel';
import { MarkdownCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/markdownCellViewModel';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { CellKind, ICell } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export interface INotebookEditorViewState {
	editingCells: { [key: number]: boolean };
	editorViewStates: { [key: number]: editorCommon.ICodeEditorViewState | null };
	cellTotalHeights?: { [key: number]: number };
	scrollPosition?: { left: number; top: number; };
}

export interface ICellModelDecorations {
	ownerId: number;
	decorations: string[];
}

export interface ICellModelDeltaDecorations {
	ownerId: number;
	decorations: IModelDeltaDecoration[];
}

export interface IModelDecorationsChangeAccessor {
	deltaDecorations(oldDecorations: ICellModelDecorations[], newDecorations: ICellModelDeltaDecorations[]): ICellModelDecorations[];
}

const invalidFunc = () => { throw new Error(`Invalid change accessor`); };


export type NotebookViewCellsSplice = [
	number /* start */,
	number /* delete count */,
	CellViewModel[]
];

export interface INotebookViewCellsUpdateEvent {
	synchronous: boolean;
	splices: NotebookViewCellsSplice[];
}


class DecorationsTree {
	private readonly _decorationsTree: IntervalTree;

	constructor() {
		this._decorationsTree = new IntervalTree();
	}

	public intervalSearch(start: number, end: number, filterOwnerId: number, filterOutValidation: boolean, cachedVersionId: number): IntervalNode[] {
		const r1 = this._decorationsTree.intervalSearch(start, end, filterOwnerId, filterOutValidation, cachedVersionId);
		return r1;
	}

	public search(filterOwnerId: number, filterOutValidation: boolean, overviewRulerOnly: boolean, cachedVersionId: number): IntervalNode[] {
		return this._decorationsTree.search(filterOwnerId, filterOutValidation, cachedVersionId);

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
	ModelDecorationOptions.register({ stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges }),
	ModelDecorationOptions.register({ stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges }),
	ModelDecorationOptions.register({ stickiness: TrackedRangeStickiness.GrowsOnlyWhenTypingBefore }),
	ModelDecorationOptions.register({ stickiness: TrackedRangeStickiness.GrowsOnlyWhenTypingAfter }),
];

function _normalizeOptions(options: IModelDecorationOptions): ModelDecorationOptions {
	if (options instanceof ModelDecorationOptions) {
		return options;
	}
	return ModelDecorationOptions.createDynamic(options);
}

let MODEL_ID = 0;


export class NotebookViewModel extends Disposable implements FoldingRegionDelegate {
	private _localStore: DisposableStore = this._register(new DisposableStore());
	private _viewCells: CellViewModel[] = [];

	private _currentTokenSource: CancellationTokenSource | undefined;

	get currentTokenSource(): CancellationTokenSource | undefined {
		return this._currentTokenSource;
	}

	set currentTokenSource(v: CancellationTokenSource | undefined) {
		this._currentTokenSource = v;
	}

	get viewCells(): ICellViewModel[] {
		return this._viewCells;
	}

	get notebookDocument() {
		return this._model.notebook;
	}

	get renderers() {
		return this._model.notebook!.renderers;
	}

	get handle() {
		return this._model.notebook.handle;
	}

	get languages() {
		return this._model.notebook.languages;
	}

	get uri() {
		return this._model.notebook.uri;
	}

	get metadata() {
		return this._model.notebook.metadata;
	}

	private readonly _onDidChangeViewCells = new Emitter<INotebookViewCellsUpdateEvent>();
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

	private _decorationsTree = new DecorationsTree();
	private _decorations: { [decorationId: string]: IntervalNode; } = Object.create(null);
	private _lastDecorationId: number = 0;
	private readonly _instanceId: string;
	public readonly id: string;

	private _foldingModel: FoldingModel;
	private _onDidFoldingRegionChanges = new Emitter<void>();
	onDidFoldingRegionChanged: Event<void> = this._onDidFoldingRegionChanges.event;
	private _hiddenRanges: ICellRange[] = [];

	constructor(
		public viewType: string,
		private _model: NotebookEditorModel,
		readonly eventDispatcher: NotebookEventDispatcher,
		private _layoutInfo: NotebookLayoutInfo | null,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IBulkEditService private readonly bulkEditService: IBulkEditService,
		@IUndoRedoService private readonly undoService: IUndoRedoService
	) {
		super();

		MODEL_ID++;
		this.id = '$notebookViewModel' + MODEL_ID;
		this._instanceId = strings.singleLetterHash(MODEL_ID);

		// this._register(this._model.onDidChangeCells(e => {
		// 	this._onDidChangeViewCells.fire({
		// 		synchronous: true,
		// 		splices: e.map(splice => {
		// 			return [splice[0], splice[1], splice[2].map(cell => {
		// 				return createCellViewModel(this.instantiationService, this, cell as NotebookCellTextModel);
		// 			})];
		// 		})
		// 	});
		// }));

		this._register(this._model.notebook.onDidChangeMetadata(e => {
			this.eventDispatcher.emit([new NotebookMetadataChangedEvent(e)]);
		}));

		this._register(this.eventDispatcher.onDidChangeLayout((e) => {
			this._layoutInfo = e.value;

			this._viewCells.forEach(cell => {
				if (cell.cellKind === CellKind.Markdown) {
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

		this._viewCells = this._model!.notebook!.cells.map(cell => {
			return createCellViewModel(this.instantiationService, this, cell);
		});

		this._foldingModel = new FoldingModel();
		this._foldingModel.attachViewModel(this);

		this._register(this._foldingModel.onDidFoldingRegionChanged(() => {
			this._updateFoldingRanges();
		}));
	}
	getFoldingStartIndex(cell: CellViewModel): number {
		const modelIndex = this.viewCells.indexOf(cell);
		if (modelIndex < 0) {
			return -1;
		}

		const range = this._foldingModel.regions.findRange(modelIndex + 1);
		const startIndex = this._foldingModel.regions.getStartLineNumber(range) - 1;
		return startIndex;
	}

	getFoldingState(cell: CellViewModel): CellFoldingState {
		const modelIndex = this.viewCells.indexOf(cell);
		if (modelIndex < 0) {
			return -1;
		}

		const range = this._foldingModel.regions.findRange(modelIndex + 1);
		const startIndex = this._foldingModel.regions.getStartLineNumber(range) - 1;

		if (startIndex !== modelIndex) {
			return CellFoldingState.None;
		}

		return this._foldingModel.regions.isCollapsed(range) ? CellFoldingState.Collapsed : CellFoldingState.Expanded;
	}

	setFoldingState(cell: CellViewModel, state: CellFoldingState): void {
		const modelIndex = this.viewCells.indexOf(cell);
		if (modelIndex < 0) {
			return;
		}

		const range = this._foldingModel.regions.findRange(modelIndex + 1);
		const startIndex = this._foldingModel.regions.getStartLineNumber(range) - 1;

		if (startIndex !== modelIndex) {
			return;
		}

		this._foldingModel.setCollapsed(range, state === CellFoldingState.Collapsed);
		this._updateFoldingRanges();
	}

	private _updateFoldingRanges() {
		let updateHiddenAreas = false;
		let newHiddenAreas: ICellRange[] = [];

		let ranges = this._foldingModel.regions;
		let i = 0; // index into hidden
		let k = 0;

		let lastCollapsedStart = Number.MAX_VALUE;
		let lastCollapsedEnd = -1;

		for (; i < ranges.length; i++) {
			if (!ranges.isCollapsed(i)) {
				continue;
			}

			let startLineNumber = ranges.getStartLineNumber(i) + 1; // the first line is not hidden
			let endLineNumber = ranges.getEndLineNumber(i);
			if (lastCollapsedStart <= startLineNumber && endLineNumber <= lastCollapsedEnd) {
				// ignore ranges contained in collapsed regions
				continue;
			}

			if (!updateHiddenAreas && k < this._hiddenRanges.length && this._hiddenRanges[k].start + 1 === startLineNumber && (this._hiddenRanges[k].start + this._hiddenRanges[k].length) === endLineNumber) {
				// reuse the old ranges
				newHiddenAreas.push(this._hiddenRanges[k]);
				k++;
			} else {
				updateHiddenAreas = true;
				newHiddenAreas.push({ start: startLineNumber - 1, length: endLineNumber - startLineNumber + 1 });
			}
			lastCollapsedStart = startLineNumber;
			lastCollapsedEnd = endLineNumber;
		}

		if (updateHiddenAreas || k < this._hiddenRanges.length) {
			this._hiddenRanges = newHiddenAreas;
			this._onDidFoldingRegionChanges.fire();
			this._viewCells.forEach(cell => {
				if (cell.cellKind === CellKind.Markdown) {
					cell.triggerfoldingStateChange();
				}
			});
		}
	}

	getHiddenRanges() {
		return this._hiddenRanges;
	}

	isDirty() {
		return this._model.isDirty();
	}

	hide() {
		this._viewCells.forEach(cell => {
			if (cell.getText() !== '') {
				cell.editState = CellEditState.Preview;
			}
		});
	}

	getCellIndex(cell: ICellViewModel) {
		return this._viewCells.indexOf(cell as CellViewModel);
	}

	getVersionId() {
		return this._model.notebook.versionId;
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
			return { start: node.cachedAbsoluteStart - 1, length: node.cachedAbsoluteEnd - node.cachedAbsoluteStart + 1 };
		}

		return { start: node.range.startLineNumber - 1, length: node.range.endLineNumber - node.range.startLineNumber + 1 };
	}

	setTrackedRange(id: string | null, newRange: ICellRange | null, newStickiness: TrackedRangeStickiness): string | null {
		const node = (id ? this._decorations[id] : null);

		if (!node) {
			if (!newRange) {
				return null;
			}

			return this._deltaCellDecorationsImpl(0, [], [{ range: new Range(newRange.start + 1, 1, newRange.start + newRange.length, 1), options: TRACKED_RANGE_OPTIONS[newStickiness] }])[0];
		}

		if (!newRange) {
			// node exists, the request is to delete => delete node
			this._decorationsTree.delete(node);
			delete this._decorations[node.id];
			return null;
		}

		this._decorationsTree.delete(node);
		node.reset(this.getVersionId(), newRange.start, newRange.start + newRange.length, new Range(newRange.start + 1, 1, newRange.start + newRange.length, 1));
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

		let result = new Array<string>(newDecorationsLen);
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
					// this._onDidChangeDecorations.checkAffectedAndFire(node.options);
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
				// const range = this._validateRangeRelaxedNoAllocations(newDecoration.range);
				const range = newDecoration.range;
				const options = _normalizeOptions(newDecoration.options);
				// const startOffset = this._buffer.getOffsetAt(range.startLineNumber, range.startColumn);
				// const endOffset = this._buffer.getOffsetAt(range.endLineNumber, range.endColumn);

				node.ownerId = ownerId;
				node.reset(versionId, range.startLineNumber, range.endLineNumber, Range.lift(range));
				node.setOptions(options);
				// this._onDidChangeDecorations.checkAffectedAndFire(options);

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

	private _insertCellDelegate(insertIndex: number, insertCell: CellViewModel) {
		this._viewCells!.splice(insertIndex, 0, insertCell);
		this._model.insertCell(insertCell.model, insertIndex);
		this._localStore.add(insertCell);
		this._onDidChangeViewCells.fire({ synchronous: true, splices: [[insertIndex, 0, [insertCell]]] });
	}

	private _deleteCellDelegate(deleteIndex: number, cell: ICell) {
		this._viewCells.splice(deleteIndex, 1);
		this._model.deleteCell(deleteIndex);
		this._onDidChangeViewCells.fire({ synchronous: true, splices: [[deleteIndex, 1, []]] });
	}

	createCell(index: number, source: string[], language: string, type: CellKind, synchronous: boolean) {
		const cell = this._model.notebook.createCellTextModel(source, language, type, [], undefined);
		let newCell: CellViewModel = createCellViewModel(this.instantiationService, this, cell);
		this._viewCells!.splice(index, 0, newCell);
		this._model.insertCell(cell, index);
		this._localStore.add(newCell);
		this.undoService.pushElement(new InsertCellEdit(this.uri, index, newCell, {
			insertCell: this._insertCellDelegate.bind(this),
			deleteCell: this._deleteCellDelegate.bind(this)
		}));

		this._decorationsTree.acceptReplace(index, 0, 1, true);
		this._onDidChangeViewCells.fire({ synchronous: synchronous, splices: [[index, 0, [newCell]]] });
		return newCell;
	}

	insertCell(index: number, cell: NotebookCellTextModel, synchronous: boolean): CellViewModel {
		let newCell: CellViewModel = createCellViewModel(this.instantiationService, this, cell);
		this._viewCells!.splice(index, 0, newCell);
		this._model.insertCell(newCell.model, index);
		this._localStore.add(newCell);
		this.undoService.pushElement(new InsertCellEdit(this.uri, index, newCell, {
			insertCell: this._insertCellDelegate.bind(this),
			deleteCell: this._deleteCellDelegate.bind(this)
		}));

		this._decorationsTree.acceptReplace(index, 0, 1, true);
		this._onDidChangeViewCells.fire({ synchronous: synchronous, splices: [[index, 0, [newCell]]] });
		return newCell;
	}

	deleteCell(index: number, synchronous: boolean) {
		let viewCell = this._viewCells[index];
		this._viewCells.splice(index, 1);
		this._model.deleteCell(index);

		this.undoService.pushElement(new DeleteCellEdit(this.uri, index, viewCell, {
			insertCell: this._insertCellDelegate.bind(this),
			deleteCell: this._deleteCellDelegate.bind(this),
			createCellViewModel: (cell: NotebookCellTextModel) => {
				return createCellViewModel(this.instantiationService, this, cell);
			}
		}));


		this._decorationsTree.acceptReplace(index, 1, 0, true);

		this._onDidChangeViewCells.fire({ synchronous: synchronous, splices: [[index, 1, []]] });
		viewCell.dispose();
	}

	moveCellToIdx(index: number, newIdx: number, synchronous: boolean, pushedToUndoStack: boolean = true): boolean {
		const viewCell = this.viewCells[index] as CellViewModel;
		if (!viewCell) {
			return false;
		}

		this.viewCells.splice(index, 1);
		this._model.deleteCell(index);

		this.viewCells!.splice(newIdx, 0, viewCell);
		this._model.insertCell(viewCell.model, newIdx);

		if (pushedToUndoStack) {
			this.undoService.pushElement(new MoveCellEdit(this.uri, index, newIdx, {
				moveCell: (fromIndex: number, toIndex: number) => {
					this.moveCellToIdx(fromIndex, toIndex, true, false);
				}
			}));
		}

		this._onDidChangeViewCells.fire({ synchronous: synchronous, splices: [[index, 1, []]] });
		this._onDidChangeViewCells.fire({ synchronous: synchronous, splices: [[newIdx, 0, [viewCell]]] });

		return true;
	}

	saveEditorViewState(): INotebookEditorViewState {
		const state: { [key: number]: boolean } = {};
		this._viewCells.filter(cell => cell.editState === CellEditState.Editing).forEach(cell => state[cell.model.handle] = true);
		const editorViewStates: { [key: number]: editorCommon.ICodeEditorViewState } = {};
		this._viewCells.map(cell => ({ handle: cell.model.handle, state: cell.saveEditorViewState() })).forEach(viewState => {
			if (viewState.state) {
				editorViewStates[viewState.handle] = viewState.state;
			}
		});

		return {
			editingCells: state,
			editorViewStates: editorViewStates
		};
	}

	restoreEditorViewState(viewState: INotebookEditorViewState | undefined): void {
		if (!viewState) {
			return;
		}

		this._viewCells.forEach((cell, index) => {
			const isEditing = viewState.editingCells && viewState.editingCells[cell.handle];
			const editorViewState = viewState.editorViewStates && viewState.editorViewStates[cell.handle];

			cell.editState = isEditing ? CellEditState.Editing : CellEditState.Preview;
			const cellHeight = viewState.cellTotalHeights ? viewState.cellTotalHeights[index] : undefined;
			cell.restoreEditorViewState(editorViewState, cellHeight);
		});
	}

	/**
	 * Editor decorations across cells. For example, find decorations for multiple code cells
	 * The reason that we can't completely delegate this to CodeEditorWidget is most of the time, the editors for cells are not created yet but we already have decorations for them.
	 */
	changeDecorations<T>(callback: (changeAccessor: IModelDecorationsChangeAccessor) => T): T | null {
		const changeAccessor: IModelDecorationsChangeAccessor = {
			deltaDecorations: (oldDecorations: ICellModelDecorations[], newDecorations: ICellModelDeltaDecorations[]): ICellModelDecorations[] => {
				return this.deltaDecorationsImpl(oldDecorations, newDecorations);
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

	deltaDecorationsImpl(oldDecorations: ICellModelDecorations[], newDecorations: ICellModelDeltaDecorations[]): ICellModelDecorations[] {

		const mapping = new Map<number, { cell: CellViewModel; oldDecorations: string[]; newDecorations: IModelDeltaDecoration[] }>();
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
			const cellRet = value.cell.deltaDecorations(value.oldDecorations, value.newDecorations);
			ret.push({
				ownerId: ownerId,
				decorations: cellRet
			});
		});

		return ret;
	}


	/**
	 * Search in notebook text model
	 * @param value
	 */
	find(value: string): CellFindMatch[] {
		const matches: CellFindMatch[] = [];
		this._viewCells.forEach(cell => {
			const cellMatches = cell.startFind(value);
			if (cellMatches) {
				matches.push(cellMatches);
			}
		});

		return matches;
	}

	replaceOne(cell: ICellViewModel, range: Range, text: string): Promise<void> {
		const viewCell = cell as CellViewModel;
		this._lastNotebookEditResource.push(viewCell.uri);
		return viewCell.resolveTextModel().then(() => {
			this.bulkEditService.apply({ edits: [{ edit: { range: range, text: text }, resource: cell.uri }] }, { quotableLabel: 'Notebook Replace' });
		});
	}

	async replaceAll(matches: CellFindMatch[], text: string): Promise<void> {
		if (!matches.length) {
			return;
		}

		let textEdits: WorkspaceTextEdit[] = [];
		this._lastNotebookEditResource.push(matches[0].cell.uri);

		matches.forEach(match => {
			match.matches.forEach(singleMatch => {
				textEdits.push({
					edit: { range: singleMatch.range, text: text },
					resource: match.cell.uri
				});
			});
		});

		return Promise.all(matches.map(match => {
			return match.cell.resolveTextModel();
		})).then(async () => {
			this.bulkEditService.apply({ edits: textEdits }, { quotableLabel: 'Notebook Replace All' });
			return;
		});
	}

	canUndo(): boolean {
		return this.undoService.canUndo(this.uri);
	}

	undo() {
		this.undoService.undo(this.uri);
	}

	redo() {
		this.undoService.redo(this.uri);
	}

	equal(model: NotebookEditorModel) {
		return this._model === model;
	}

	dispose() {
		this._localStore.clear();
		this._viewCells.forEach(cell => {
			cell.save();
			cell.dispose();
		});

		super.dispose();
	}
}

export type CellViewModel = CodeCellViewModel | MarkdownCellViewModel;

export function createCellViewModel(instantiationService: IInstantiationService, notebookViewModel: NotebookViewModel, cell: NotebookCellTextModel) {
	if (cell.cellKind === CellKind.Code) {
		return instantiationService.createInstance(CodeCellViewModel, notebookViewModel.viewType, notebookViewModel.handle, cell, notebookViewModel.layoutInfo);
	} else {
		return instantiationService.createInstance(MarkdownCellViewModel, notebookViewModel.viewType, notebookViewModel.handle, cell, notebookViewModel.layoutInfo, notebookViewModel);
	}
}
