/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INotebookActionContext } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { CellEditState, ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { CellEditType, CellKind, ICellEditOperation, ICellReplaceEdit, SelectionStateType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';

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
		const idx = notebookEditor.viewModel.getCellIndex(cell);

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
			const idx = notebookEditor.viewModel.getCellIndex(cell);

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
