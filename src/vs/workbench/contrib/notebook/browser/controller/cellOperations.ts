/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBulkEditService, ResourceEdit, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { Range } from 'vs/editor/common/core/range';
import { ResourceNotebookCellEdit } from 'vs/workbench/contrib/bulkEdit/browser/bulkCellEdits';
import { INotebookActionContext, INotebookCellActionContext } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { CellEditState, CellFocusMode, expandCellRangesWithHiddenCells, ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellViewModel, NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { cloneNotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { CellEditType, CellKind, ICellEditOperation, ICellReplaceEdit, SelectionStateType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { cellRangeContains, cellRangesToIndexes, ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';

export async function changeCellToKind(kind: CellKind, context: INotebookActionContext, language?: string, mime?: string): Promise<void> {
	const { notebookEditor } = context;
	if (!notebookEditor.viewModel) {
		return;
	}

	if (notebookEditor.viewModel.options.isReadOnly) {
		return;
	}

	if (context.ui && context.cell) {
		// action from UI
		const { cell } = context;

		if (cell.cellKind === kind) {
			return;
		}

		const text = cell.getText();
		const idx = notebookEditor.getCellIndex(cell);

		if (language === undefined) {
			const availableLanguages = notebookEditor.activeKernel?.supportedLanguages ?? [];
			language = availableLanguages[0] ?? 'plaintext';
		}

		notebookEditor.textModel.applyEdits([
			{
				editType: CellEditType.Replace,
				index: idx,
				count: 1,
				cells: [{
					cellKind: kind,
					source: text,
					language: language!,
					mime: mime ?? cell.mime,
					outputs: cell.model.outputs,
					metadata: cell.metadata,
				}]
			}
		], true, {
			kind: SelectionStateType.Index,
			focus: notebookEditor.getFocus(),
			selections: notebookEditor.getSelections()
		}, () => {
			return {
				kind: SelectionStateType.Index,
				focus: notebookEditor.getFocus(),
				selections: notebookEditor.getSelections()
			};
		}, undefined, true);
		const newCell = notebookEditor.viewModel.cellAt(idx);

		if (!newCell) {
			return;
		}

		notebookEditor.focusNotebookCell(newCell, cell.getEditState() === CellEditState.Editing ? 'editor' : 'container');
	} else if (context.selectedCells) {
		const selectedCells = context.selectedCells;
		const rawEdits: ICellEditOperation[] = [];

		selectedCells.forEach(cell => {
			if (cell.cellKind === kind) {
				return;
			}
			const text = cell.getText();
			const idx = notebookEditor.getCellIndex(cell);

			if (language === undefined) {
				const availableLanguages = notebookEditor.activeKernel?.supportedLanguages ?? [];
				language = availableLanguages[0] ?? 'plaintext';
			}

			rawEdits.push(
				{
					editType: CellEditType.Replace,
					index: idx,
					count: 1,
					cells: [{
						cellKind: kind,
						source: text,
						language: language!,
						mime: mime ?? cell.mime,
						outputs: cell.model.outputs,
						metadata: cell.metadata,
					}]
				}
			);
		});

		notebookEditor.textModel.applyEdits(rawEdits, true, {
			kind: SelectionStateType.Index,
			focus: notebookEditor.getFocus(),
			selections: notebookEditor.getSelections()
		}, () => {
			return {
				kind: SelectionStateType.Index,
				focus: notebookEditor.getFocus(),
				selections: notebookEditor.getSelections()
			};
		}, undefined, true);
	}
}

export function runDeleteAction(viewModel: NotebookViewModel, cell: ICellViewModel) {
	const selections = viewModel.getSelections();
	const targetCellIndex = viewModel.getCellIndex(cell);
	const containingSelection = selections.find(selection => selection.start <= targetCellIndex && targetCellIndex < selection.end);

	if (containingSelection) {
		const edits: ICellReplaceEdit[] = selections.reverse().map(selection => ({
			editType: CellEditType.Replace, index: selection.start, count: selection.end - selection.start, cells: []
		}));

		const nextCellAfterContainingSelection = viewModel.cellAt(containingSelection.end);

		viewModel.notebookDocument.applyEdits(edits, true, { kind: SelectionStateType.Index, focus: viewModel.getFocus(), selections: viewModel.getSelections() }, () => {
			if (nextCellAfterContainingSelection) {
				const cellIndex = viewModel.notebookDocument.cells.findIndex(cell => cell.handle === nextCellAfterContainingSelection.handle);
				return { kind: SelectionStateType.Index, focus: { start: cellIndex, end: cellIndex + 1 }, selections: [{ start: cellIndex, end: cellIndex + 1 }] };
			} else {
				if (viewModel.notebookDocument.length) {
					const lastCellIndex = viewModel.notebookDocument.length - 1;
					return { kind: SelectionStateType.Index, focus: { start: lastCellIndex, end: lastCellIndex + 1 }, selections: [{ start: lastCellIndex, end: lastCellIndex + 1 }] };

				} else {
					return { kind: SelectionStateType.Index, focus: { start: 0, end: 0 }, selections: [{ start: 0, end: 0 }] };
				}
			}
		}, undefined);
	} else {
		const focus = viewModel.getFocus();
		const edits: ICellReplaceEdit[] = [{
			editType: CellEditType.Replace, index: targetCellIndex, count: 1, cells: []
		}];

		let finalSelections: ICellRange[] = [];
		for (let i = 0; i < selections.length; i++) {
			const selection = selections[i];

			if (selection.end <= targetCellIndex) {
				finalSelections.push(selection);
			} else if (selection.start > targetCellIndex) {
				finalSelections.push({ start: selection.start - 1, end: selection.end - 1 });
			} else {
				finalSelections.push({ start: targetCellIndex, end: targetCellIndex + 1 });
			}
		}

		if (viewModel.cellAt(focus.start) === cell) {
			// focus is the target, focus is also not part of any selection
			const newFocus = focus.end === viewModel.length ? { start: focus.start - 1, end: focus.end - 1 } : focus;

			viewModel.notebookDocument.applyEdits(edits, true, { kind: SelectionStateType.Index, focus: viewModel.getFocus(), selections: viewModel.getSelections() }, () => ({
				kind: SelectionStateType.Index, focus: newFocus, selections: finalSelections
			}), undefined);
		} else {
			// users decide to delete a cell out of current focus/selection
			const newFocus = focus.start > targetCellIndex ? { start: focus.start - 1, end: focus.end - 1 } : focus;

			viewModel.notebookDocument.applyEdits(edits, true, { kind: SelectionStateType.Index, focus: viewModel.getFocus(), selections: viewModel.getSelections() }, () => ({
				kind: SelectionStateType.Index, focus: newFocus, selections: finalSelections
			}), undefined);
		}
	}
}

export async function moveCellRange(context: INotebookCellActionContext, direction: 'up' | 'down'): Promise<void> {
	if (!context.notebookEditor.hasModel()) {
		return;
	}
	const viewModel = context.notebookEditor.viewModel;
	const textModel = context.notebookEditor.textModel;

	if (viewModel.options.isReadOnly) {
		return;
	}

	const selections = context.notebookEditor.getSelections();
	const modelRanges = expandCellRangesWithHiddenCells(context.notebookEditor, context.notebookEditor.viewModel!, selections);
	const range = modelRanges[0];
	if (!range || range.start === range.end) {
		return;
	}

	if (direction === 'up') {
		if (range.start === 0) {
			return;
		}

		const indexAbove = range.start - 1;
		const finalSelection = { start: range.start - 1, end: range.end - 1 };
		const focus = context.notebookEditor.getFocus();
		const newFocus = cellRangeContains(range, focus) ? { start: focus.start - 1, end: focus.end - 1 } : { start: range.start - 1, end: range.start };
		textModel.applyEdits([
			{
				editType: CellEditType.Move,
				index: indexAbove,
				length: 1,
				newIdx: range.end - 1
			}],
			true,
			{
				kind: SelectionStateType.Index,
				focus: viewModel.getFocus(),
				selections: viewModel.getSelections()
			},
			() => ({ kind: SelectionStateType.Index, focus: newFocus, selections: [finalSelection] }),
			undefined
		);
		const focusRange = viewModel.getSelections()[0] ?? viewModel.getFocus();
		context.notebookEditor.revealCellRangeInView(focusRange);
	} else {
		if (range.end >= viewModel.length) {
			return;
		}

		const indexBelow = range.end;
		const finalSelection = { start: range.start + 1, end: range.end + 1 };
		const focus = context.notebookEditor.getFocus();
		const newFocus = cellRangeContains(range, focus) ? { start: focus.start + 1, end: focus.end + 1 } : { start: range.start + 1, end: range.start + 2 };

		textModel.applyEdits([
			{
				editType: CellEditType.Move,
				index: indexBelow,
				length: 1,
				newIdx: range.start
			}],
			true,
			{
				kind: SelectionStateType.Index,
				focus: viewModel.getFocus(),
				selections: viewModel.getSelections()
			},
			() => ({ kind: SelectionStateType.Index, focus: newFocus, selections: [finalSelection] }),
			undefined
		);

		const focusRange = viewModel.getSelections()[0] ?? viewModel.getFocus();
		context.notebookEditor.revealCellRangeInView(focusRange);
	}
}

export async function copyCellRange(context: INotebookCellActionContext, direction: 'up' | 'down'): Promise<void> {
	if (!context.notebookEditor.hasModel()) {
		return;
	}
	const viewModel = context.notebookEditor.viewModel;
	const textModel = context.notebookEditor.textModel;

	if (viewModel.options.isReadOnly) {
		return;
	}

	let range: ICellRange | undefined = undefined;

	if (context.ui) {
		let targetCell = context.cell;
		const targetCellIndex = context.notebookEditor.getCellIndex(targetCell);
		range = { start: targetCellIndex, end: targetCellIndex + 1 };
	} else {
		const selections = context.notebookEditor.getSelections();
		const modelRanges = expandCellRangesWithHiddenCells(context.notebookEditor, context.notebookEditor.viewModel!, selections);
		range = modelRanges[0];
	}

	if (!range || range.start === range.end) {
		return;
	}

	if (direction === 'up') {
		// insert up, without changing focus and selections
		const focus = viewModel.getFocus();
		const selections = viewModel.getSelections();
		textModel.applyEdits([
			{
				editType: CellEditType.Replace,
				index: range.end,
				count: 0,
				cells: cellRangesToIndexes([range]).map(index => cloneNotebookCellTextModel(viewModel.cellAt(index)!.model))
			}],
			true,
			{
				kind: SelectionStateType.Index,
				focus: focus,
				selections: selections
			},
			() => ({ kind: SelectionStateType.Index, focus: focus, selections: selections }),
			undefined
		);
	} else {
		// insert down, move selections
		const focus = viewModel.getFocus();
		const selections = viewModel.getSelections();
		const newCells = cellRangesToIndexes([range]).map(index => cloneNotebookCellTextModel(viewModel.cellAt(index)!.model));
		const countDelta = newCells.length;
		const newFocus = context.ui ? focus : { start: focus.start + countDelta, end: focus.end + countDelta };
		const newSelections = context.ui ? selections : [{ start: range.start + countDelta, end: range.end + countDelta }];
		textModel.applyEdits([
			{
				editType: CellEditType.Replace,
				index: range.end,
				count: 0,
				cells: cellRangesToIndexes([range]).map(index => cloneNotebookCellTextModel(viewModel.cellAt(index)!.model))
			}],
			true,
			{
				kind: SelectionStateType.Index,
				focus: focus,
				selections: selections
			},
			() => ({ kind: SelectionStateType.Index, focus: newFocus, selections: newSelections }),
			undefined
		);

		const focusRange = viewModel.getSelections()[0] ?? viewModel.getFocus();
		context.notebookEditor.revealCellRangeInView(focusRange);
	}
}

export async function joinNotebookCells(viewModel: NotebookViewModel, range: ICellRange, direction: 'above' | 'below', constraint?: CellKind): Promise<{ edits: ResourceEdit[], cell: ICellViewModel, endFocus: ICellRange, endSelections: ICellRange[]; } | null> {
	if (!viewModel || viewModel.options.isReadOnly) {
		return null;
	}

	const cells = viewModel.getCells(range);

	if (!cells.length) {
		return null;
	}

	if (range.start === 0 && direction === 'above') {
		return null;
	}

	if (range.end === viewModel.length && direction === 'below') {
		return null;
	}

	for (let i = 0; i < cells.length; i++) {
		const cell = cells[i];

		if (constraint && cell.cellKind !== constraint) {
			return null;
		}
	}

	if (direction === 'above') {
		const above = viewModel.cellAt(range.start - 1) as CellViewModel;
		if (constraint && above.cellKind !== constraint) {
			return null;
		}

		const insertContent = cells.map(cell => (cell.textBuffer.getEOL() ?? '') + cell.getText()).join('');
		const aboveCellLineCount = above.textBuffer.getLineCount();
		const aboveCellLastLineEndColumn = above.textBuffer.getLineLength(aboveCellLineCount);

		return {
			edits: [
				new ResourceTextEdit(above.uri, { range: new Range(aboveCellLineCount, aboveCellLastLineEndColumn + 1, aboveCellLineCount, aboveCellLastLineEndColumn + 1), text: insertContent }),
				new ResourceNotebookCellEdit(viewModel.notebookDocument.uri,
					{
						editType: CellEditType.Replace,
						index: range.start,
						count: range.end - range.start,
						cells: []
					}
				)
			],
			cell: above,
			endFocus: { start: range.start - 1, end: range.start },
			endSelections: [{ start: range.start - 1, end: range.start }]
		};
	} else {
		const below = viewModel.cellAt(range.end) as CellViewModel;
		if (constraint && below.cellKind !== constraint) {
			return null;
		}

		const cell = cells[0];
		const restCells = [...cells.slice(1), below];
		const insertContent = restCells.map(cl => (cl.textBuffer.getEOL() ?? '') + cl.getText()).join('');

		const cellLineCount = cell.textBuffer.getLineCount();
		const cellLastLineEndColumn = cell.textBuffer.getLineLength(cellLineCount);

		return {
			edits: [
				new ResourceTextEdit(cell.uri, { range: new Range(cellLineCount, cellLastLineEndColumn + 1, cellLineCount, cellLastLineEndColumn + 1), text: insertContent }),
				new ResourceNotebookCellEdit(viewModel.notebookDocument.uri,
					{
						editType: CellEditType.Replace,
						index: range.start + 1,
						count: range.end - range.start,
						cells: []
					}
				)
			],
			cell,
			endFocus: { start: range.start, end: range.start + 1 },
			endSelections: [{ start: range.start, end: range.start + 1 }]
		};
	}
}

export async function joinCellsWithSurrounds(bulkEditService: IBulkEditService, context: INotebookCellActionContext, direction: 'above' | 'below'): Promise<void> {
	const viewModel = context.notebookEditor.viewModel;
	let ret: {
		edits: ResourceEdit[];
		cell: ICellViewModel;
		endFocus: ICellRange;
		endSelections: ICellRange[];
	} | null = null;

	if (context.ui) {
		const focusMode = context.cell.focusMode;
		const cellIndex = context.notebookEditor.getCellIndex(context.cell);
		ret = await joinNotebookCells(viewModel, { start: cellIndex, end: cellIndex + 1 }, direction);
		if (!ret) {
			return;
		}

		await bulkEditService.apply(
			ret?.edits,
			{ quotableLabel: 'Join Notebook Cells' }
		);
		viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: ret.endFocus, selections: ret.endSelections });
		ret.cell.updateEditState(CellEditState.Editing, 'joinCellsWithSurrounds');
		context.notebookEditor.revealCellRangeInView(viewModel.getFocus());
		if (focusMode === CellFocusMode.Editor) {
			ret.cell.focusMode = CellFocusMode.Editor;
		}
	} else {
		const selections = viewModel.getSelections();
		if (!selections.length) {
			return;
		}

		const focus = viewModel.getFocus();
		const focusMode = viewModel.cellAt(focus.start)?.focusMode;

		let edits: ResourceEdit[] = [];
		let cell: ICellViewModel | null = null;
		let cells: ICellViewModel[] = [];

		for (let i = selections.length - 1; i >= 0; i--) {
			const selection = selections[i];
			const containFocus = cellRangeContains(selection, focus);

			if (
				selection.end >= viewModel.length && direction === 'below'
				|| selection.start === 0 && direction === 'above'
			) {
				if (containFocus) {
					cell = viewModel.cellAt(focus.start)!;
				}

				cells.push(...viewModel.getCells(selection));
				continue;
			}

			const singleRet = await joinNotebookCells(viewModel, selection, direction);

			if (!singleRet) {
				return;
			}

			edits.push(...singleRet.edits);
			cells.push(singleRet.cell);

			if (containFocus) {
				cell = singleRet.cell;
			}
		}

		if (!edits.length) {
			return;
		}

		if (!cell || !cells.length) {
			return;
		}

		await bulkEditService.apply(
			edits,
			{ quotableLabel: 'Join Notebook Cells' }
		);

		cells.forEach(cell => {
			cell.updateEditState(CellEditState.Editing, 'joinCellsWithSurrounds');
		});

		viewModel.updateSelectionsState({ kind: SelectionStateType.Handle, primary: cell.handle, selections: cells.map(cell => cell.handle) });
		context.notebookEditor.revealCellRangeInView(viewModel.getFocus());
		const newFocusedCell = viewModel.cellAt(viewModel.getFocus().start);
		if (focusMode === CellFocusMode.Editor && newFocusedCell) {
			newFocusedCell.focusMode = CellFocusMode.Editor;
		}
	}
}
