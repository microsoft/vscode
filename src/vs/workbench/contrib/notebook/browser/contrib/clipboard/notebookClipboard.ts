/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { getNotebookEditorFromEditorPane, ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import * as UUID from 'vs/base/common/uuid';
import { CopyAction, CutAction, PasteAction } from 'vs/editor/contrib/clipboard/clipboard';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { CellEditType, ICellEditOperation, SelectionStateType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
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

				if (editor.hasOutputTextSelection()) {
					document.execCommand('copy');
					return true;
				}

				const clipboardService = accessor.get<IClipboardService>(IClipboardService);
				const notebookService = accessor.get<INotebookService>(INotebookService);
				const selectedCells = editor.getSelectionViewModels();

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

				const cloneMetadata = (cell: NotebookCellTextModel) => {
					return {
						editable: cell.metadata?.editable,
						breakpointMargin: cell.metadata?.breakpointMargin,
						hasExecutionOrder: cell.metadata?.hasExecutionOrder,
						inputCollapsed: cell.metadata?.inputCollapsed,
						outputCollapsed: cell.metadata?.outputCollapsed,
						custom: cell.metadata?.custom
					};
				};

				const cloneCell = (cell: NotebookCellTextModel) => {
					return {
						source: cell.getValue(),
						language: cell.language,
						cellKind: cell.cellKind,
						outputs: cell.outputs.map(output => ({
							outputs: output.outputs,
							/* paste should generate new outputId */ outputId: UUID.generateUuid()
						})),
						metadata: cloneMetadata(cell)
					};
				};

				if (activeCell) {
					const currCellIndex = viewModel.getCellIndex(activeCell);

					let topPastedCell: CellViewModel | undefined = undefined;
					pasteCells.items.reverse().map(cell => cloneCell(cell)).forEach(pasteCell => {
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
					pasteCells.items.reverse().map(cell => cloneCell(cell)).forEach(pasteCell => {
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
				const selectedCells = editor.getSelectionViewModels();

				if (!selectedCells.length) {
					return false;
				}

				clipboardService.writeText(selectedCells.map(cell => cell.getText()).join('\n'));
				const selectionIndexes = selectedCells.map(cell => [cell, viewModel.getCellIndex(cell)] as [ICellViewModel, number]).sort((a, b) => b[1] - a[1]);
				const edits: ICellEditOperation[] = selectionIndexes.map(value => ({ editType: CellEditType.Replace, index: value[1], count: 1, cells: [] }));
				const firstSelectIndex = selectionIndexes.sort((a, b) => a[1] - b[1])[0][1];
				const newFocusedCellIndex = firstSelectIndex < viewModel.notebookDocument.cells.length
					? firstSelectIndex
					: viewModel.notebookDocument.cells.length - 1;

				viewModel.notebookDocument.applyEdits(edits, true, { kind: SelectionStateType.Index, selections: viewModel.getSelections() }, () => {
					return {
						kind: SelectionStateType.Index,
						selections: [{ start: newFocusedCellIndex, end: newFocusedCellIndex + 1 }]
					};
				}, undefined, true);
				notebookService.setToCopy(selectedCells.map(cell => cell.model), false);

				return true;
			});
		}
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(NotebookClipboardContribution, LifecyclePhase.Ready);
