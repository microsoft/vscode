/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { expandCellRangesWithHiddenCells, getNotebookEditorFromEditorPane, ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CopyAction, CutAction, PasteAction } from 'vs/editor/contrib/clipboard/clipboard';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { CellViewModel, NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { cloneNotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { CellEditType, ICellEditOperation, ICellRange, SelectionStateType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';

class NotebookClipboardContribution extends Disposable {

	constructor(@IEditorService private readonly _editorService: IEditorService) {
		super();

		const getContext = () => {
			const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
			const activeCell = editor?.getActiveCell();

			return {
				editor,
				activeCell
			};
		};

		const PRIORITY = 105;

		if (CopyAction) {
			this._register(CopyAction.addImplementation(PRIORITY, accessor => {
				const activeElement = <HTMLElement>document.activeElement;
				if (activeElement && ['input', 'textarea'].indexOf(activeElement.tagName.toLowerCase()) >= 0) {
					return false;
				}

				const { editor } = getContext();
				if (!editor) {
					return false;
				}

				if (!editor.hasModel()) {
					return false;
				}

				if (editor.hasOutputTextSelection()) {
					document.execCommand('copy');
					return true;
				}

				const clipboardService = accessor.get<IClipboardService>(IClipboardService);
				const notebookService = accessor.get<INotebookService>(INotebookService);
				const selectionRanges = expandCellRangesWithHiddenCells(editor, editor.viewModel, editor.viewModel.getSelections());
				const selectedCells = this._cellRangeToViewCells(editor.viewModel, selectionRanges);

				if (!selectedCells.length) {
					return false;
				}

				clipboardService.writeText(selectedCells.map(cell => cell.getText()).join('\n'));
				notebookService.setToCopy(selectedCells.map(cell => cell.model), true);

				return true;
			}));
		}

		if (PasteAction) {
			PasteAction.addImplementation(PRIORITY, accessor => {
				const activeElement = <HTMLElement>document.activeElement;
				if (activeElement && ['input', 'textarea'].indexOf(activeElement.tagName.toLowerCase()) >= 0) {
					return false;
				}

				const notebookService = accessor.get<INotebookService>(INotebookService);
				const pasteCells = notebookService.getToCopy();

				if (!pasteCells) {
					return false;
				}

				const { editor, activeCell } = getContext();
				if (!editor) {
					return false;
				}

				const viewModel = editor.viewModel;

				if (!viewModel || !viewModel.metadata.editable) {
					return false;
				}

				if (activeCell) {
					const currCellIndex = viewModel.getCellIndex(activeCell);

					let topPastedCell: CellViewModel | undefined = undefined;
					pasteCells.items.reverse().map(cell => cloneNotebookCellTextModel(cell)).forEach(pasteCell => {
						const newIdx = typeof currCellIndex === 'number' ? currCellIndex + 1 : 0;
						topPastedCell = viewModel.createCell(newIdx, pasteCell.source, pasteCell.language, pasteCell.cellKind, pasteCell.metadata, pasteCell.outputs, true);
					});

					if (topPastedCell) {
						editor.focusNotebookCell(topPastedCell, 'container');
					}
				} else {
					if (viewModel.length !== 0) {
						return false;
					}

					let topPastedCell: CellViewModel | undefined = undefined;
					pasteCells.items.reverse().map(cell => cloneNotebookCellTextModel(cell)).forEach(pasteCell => {
						topPastedCell = viewModel.createCell(0, pasteCell.source, pasteCell.language, pasteCell.cellKind, pasteCell.metadata, pasteCell.outputs, true);
					});

					if (topPastedCell) {
						editor.focusNotebookCell(topPastedCell, 'container');
					}
				}


				return true;
			});
		}

		if (CutAction) {
			CutAction.addImplementation(PRIORITY, accessor => {
				const activeElement = <HTMLElement>document.activeElement;
				if (activeElement && ['input', 'textarea'].indexOf(activeElement.tagName.toLowerCase()) >= 0) {
					return false;
				}

				const { editor } = getContext();
				if (!editor) {
					return false;
				}

				const viewModel = editor.viewModel;

				if (!viewModel || !viewModel.metadata.editable) {
					return false;
				}

				const clipboardService = accessor.get<IClipboardService>(IClipboardService);
				const notebookService = accessor.get<INotebookService>(INotebookService);
				const selectionRanges = expandCellRangesWithHiddenCells(editor, viewModel, viewModel.getSelections());
				const selectedCells = this._cellRangeToViewCells(viewModel, selectionRanges);

				if (!selectedCells.length) {
					return false;
				}

				clipboardService.writeText(selectedCells.map(cell => cell.getText()).join('\n'));
				const edits: ICellEditOperation[] = selectionRanges.map(range => ({ editType: CellEditType.Replace, index: range.start, count: range.end - range.start, cells: [] }));
				const firstSelectIndex = selectionRanges[0].start;

				/**
				 * If we have cells, 0, 1, 2, 3, 4, 5, 6
				 * and cells 1, 2 are selected, and then we delete cells 1 and 2
				 * the new focused cell should still be at index 1
				 */
				const newFocusedCellIndex = firstSelectIndex < viewModel.notebookDocument.cells.length
					? firstSelectIndex
					: viewModel.notebookDocument.cells.length - 1;

				viewModel.notebookDocument.applyEdits(edits, true, { kind: SelectionStateType.Index, focus: viewModel.getFocus(), selections: selectionRanges }, () => {
					return {
						kind: SelectionStateType.Index,
						focus: { start: newFocusedCellIndex, end: newFocusedCellIndex + 1 },
						selections: [{ start: newFocusedCellIndex, end: newFocusedCellIndex + 1 }]
					};
				}, undefined, true);
				notebookService.setToCopy(selectedCells.map(cell => cell.model), false);

				return true;
			});
		}
	}

	private _cellRangeToViewCells(viewModel: NotebookViewModel, ranges: ICellRange[]) {
		const cells: ICellViewModel[] = [];
		ranges.forEach(range => {
			cells.push(...viewModel.viewCells.slice(range.start, range.end));
		});

		return cells;
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(NotebookClipboardContribution, LifecyclePhase.Ready);
