/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { expandCellRangesWithHiddenCells, getNotebookEditorFromEditorPane, ICellViewModel, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CopyAction, CutAction, PasteAction } from 'vs/editor/contrib/clipboard/clipboard';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { CellViewModel, NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { cloneNotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { CellEditType, ICellEditOperation, ICellRange, ISelectionState, SelectionStateType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import * as platform from 'vs/base/common/platform';
import { MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { CellOverflowToolbarGroups, INotebookActionContext, INotebookCellActionContext, NotebookAction, NotebookCellAction, NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT } from 'vs/workbench/contrib/notebook/browser/contrib/coreActions';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContextKey } from 'vs/platform/contextkey/common/contextkeys';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

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
			this._register(CopyAction.addImplementation(PRIORITY, 'notebook-clipboard', accessor => {
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
			PasteAction.addImplementation(PRIORITY, 'notebook-clipboard', accessor => {
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

				const originalState: ISelectionState = {
					kind: SelectionStateType.Index,
					focus: viewModel.getFocus(),
					selections: viewModel.getSelections()
				};

				if (activeCell) {
					const currCellIndex = viewModel.getCellIndex(activeCell);
					const newFocusIndex = typeof currCellIndex === 'number' ? currCellIndex + 1 : 0;
					viewModel.notebookDocument.applyEdits([
						{
							editType: CellEditType.Replace,
							index: newFocusIndex,
							count: 0,
							cells: pasteCells.items.map(cell => cloneNotebookCellTextModel(cell))
						}
					], true, originalState, () => ({
						kind: SelectionStateType.Index,
						focus: { start: newFocusIndex, end: newFocusIndex + 1 },
						selections: [{ start: newFocusIndex, end: newFocusIndex + pasteCells.items.length }]
					}), undefined);
				} else {
					if (viewModel.length !== 0) {
						return false;
					}

					viewModel.notebookDocument.applyEdits([
						{
							editType: CellEditType.Replace,
							index: 0,
							count: 0,
							cells: pasteCells.items.map(cell => cloneNotebookCellTextModel(cell))
						}
					], true, originalState, () => ({
						kind: SelectionStateType.Index,
						focus: { start: 0, end: 1 },
						selections: [{ start: 1, end: pasteCells.items.length + 1 }]
					}), undefined);
				}

				return true;
			});
		}

		if (CutAction) {
			CutAction.addImplementation(PRIORITY, 'notebook-clipboard', accessor => {
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
				const newFocusedCellIndex = firstSelectIndex < viewModel.notebookDocument.cells.length - 1
					? firstSelectIndex
					: Math.max(viewModel.notebookDocument.cells.length - 2, 0);

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

const COPY_CELL_COMMAND_ID = 'notebook.cell.copy';
const CUT_CELL_COMMAND_ID = 'notebook.cell.cut';
const PASTE_CELL_COMMAND_ID = 'notebook.cell.paste';
const PASTE_CELL_ABOVE_COMMAND_ID = 'notebook.cell.pasteAbove';

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: COPY_CELL_COMMAND_ID,
				title: localize('notebookActions.copy', "Copy Cell"),
				menu: {
					id: MenuId.NotebookCellTitle,
					when: NOTEBOOK_EDITOR_FOCUSED,
					group: CellOverflowToolbarGroups.Copy,
				},
				keybinding: platform.isNative ? undefined : {
					primary: KeyMod.CtrlCmd | KeyCode.KEY_C,
					win: { primary: KeyMod.CtrlCmd | KeyCode.KEY_C, secondary: [KeyMod.CtrlCmd | KeyCode.Insert] },
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
					weight: KeybindingWeight.WorkbenchContrib
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const clipboardService = accessor.get<IClipboardService>(IClipboardService);
		const notebookService = accessor.get<INotebookService>(INotebookService);
		if (context.notebookEditor.hasOutputTextSelection()) {
			document.execCommand('copy');
			return;
		}

		const viewModel = context.notebookEditor.viewModel;
		const selections = viewModel.getSelections();
		const targetCellIndex = viewModel.getCellIndex(context.cell);
		const containingSelection = selections.find(selection => selection.start <= targetCellIndex && targetCellIndex < selection.end);

		if (containingSelection) {
			const cells = viewModel.viewCells.slice(containingSelection.start, containingSelection.end);

			clipboardService.writeText(cells.map(cell => cell.getText()).join('\n'));
			notebookService.setToCopy(cells.map(cell => cell.model), true);
		} else {
			clipboardService.writeText(context.cell.getText());
			notebookService.setToCopy([context.cell.model], true);
		}
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: CUT_CELL_COMMAND_ID,
				title: localize('notebookActions.cut', "Cut Cell"),
				menu: {
					id: MenuId.NotebookCellTitle,
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE),
					group: CellOverflowToolbarGroups.Copy,
				},
				keybinding: platform.isNative ? undefined : {
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
					primary: KeyMod.CtrlCmd | KeyCode.KEY_X,
					win: { primary: KeyMod.CtrlCmd | KeyCode.KEY_X, secondary: [KeyMod.Shift | KeyCode.Delete] },
					weight: KeybindingWeight.WorkbenchContrib
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const clipboardService = accessor.get<IClipboardService>(IClipboardService);
		const notebookService = accessor.get<INotebookService>(INotebookService);
		clipboardService.writeText(context.cell.getText());
		const viewModel = context.notebookEditor.viewModel;

		if (!viewModel || !viewModel.metadata.editable) {
			return;
		}

		const selections = viewModel.getSelections();
		const targetCellIndex = viewModel.getCellIndex(context.cell);
		const containingSelection = selections.find(selection => selection.start <= targetCellIndex && targetCellIndex < selection.end);

		if (containingSelection) {
			const cellTextModels = viewModel.viewCells.slice(containingSelection.start, containingSelection.end).map(cell => cell.model);
			let finalSelections: ICellRange[] = [];
			const delta = containingSelection.end - containingSelection.start;
			for (let i = 0; i < selections.length; i++) {
				const selection = selections[i];

				if (selection.end <= targetCellIndex) {
					finalSelections.push(selection);
				} else if (selection.start > targetCellIndex) {
					finalSelections.push({ start: selection.start - delta, end: selection.end - delta });
				} else {
					finalSelections.push({ start: containingSelection.start, end: containingSelection.start + 1 });
				}
			}

			viewModel.notebookDocument.applyEdits([{
				editType: CellEditType.Replace, index: containingSelection.start, count: containingSelection.end - containingSelection.start, cells: []
			}], true, { kind: SelectionStateType.Index, focus: viewModel.getFocus(), selections: viewModel.getSelections() }, () => {
				const newFocusCellIdx = containingSelection.start < context.notebookEditor.viewModel.notebookDocument.length ? containingSelection.start : context.notebookEditor.viewModel.notebookDocument.length - 1;

				return {
					kind: SelectionStateType.Index, focus: { start: newFocusCellIdx, end: newFocusCellIdx + 1 }, selections: finalSelections
				};
			}, undefined);
			notebookService.setToCopy(cellTextModels, true);
		} else {
			viewModel.deleteCell(viewModel.getCellIndex(context.cell), true);
			notebookService.setToCopy([context.cell.model], false);
		}
	}
});

registerAction2(class extends NotebookAction {
	constructor() {
		super(
			{
				id: PASTE_CELL_COMMAND_ID,
				title: localize('notebookActions.paste', "Paste Cell"),
				menu: {
					id: MenuId.NotebookCellTitle,
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE),
					group: CellOverflowToolbarGroups.Copy,
				},
				keybinding: platform.isNative ? undefined : {
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
					primary: KeyMod.CtrlCmd | KeyCode.KEY_V,
					win: { primary: KeyMod.CtrlCmd | KeyCode.KEY_V, secondary: [KeyMod.Shift | KeyCode.Insert] },
					linux: { primary: KeyMod.CtrlCmd | KeyCode.KEY_V, secondary: [KeyMod.Shift | KeyCode.Insert] },
					weight: KeybindingWeight.EditorContrib
				}
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext) {
		const notebookService = accessor.get<INotebookService>(INotebookService);
		const pasteCells = notebookService.getToCopy();

		const viewModel = context.notebookEditor.viewModel;

		if (!viewModel || !viewModel.metadata.editable) {
			return;
		}

		if (!pasteCells) {
			return;
		}

		const currCellIndex = context.cell && viewModel.getCellIndex(context.cell);

		let topPastedCell: CellViewModel | undefined = undefined;
		pasteCells.items.reverse().map(cell => {
			return {
				source: cell.getValue(),
				language: cell.language,
				cellKind: cell.cellKind,
				outputs: cell.outputs,
				metadata: {
					editable: cell.metadata?.editable,
					breakpointMargin: cell.metadata?.breakpointMargin,
					hasExecutionOrder: cell.metadata?.hasExecutionOrder,
					inputCollapsed: cell.metadata?.inputCollapsed,
					outputCollapsed: cell.metadata?.outputCollapsed,
					custom: cell.metadata?.custom
				}
			};
		}).forEach(pasteCell => {
			const newIdx = typeof currCellIndex === 'number' ? currCellIndex + 1 : 0;
			topPastedCell = viewModel.createCell(newIdx, pasteCell.source, pasteCell.language, pasteCell.cellKind, pasteCell.metadata, pasteCell.outputs, true);
		});

		if (topPastedCell) {
			context.notebookEditor.focusNotebookCell(topPastedCell, 'container');
		}
	}
});

registerAction2(class extends NotebookCellAction {
	constructor() {
		super(
			{
				id: PASTE_CELL_ABOVE_COMMAND_ID,
				title: localize('notebookActions.pasteAbove', "Paste Cell Above"),
				keybinding: {
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_V,
					weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
				},
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const notebookService = accessor.get<INotebookService>(INotebookService);
		const pasteCells = notebookService.getToCopy();

		const viewModel = context.notebookEditor.viewModel;

		if (!viewModel || !viewModel.metadata.editable) {
			return;
		}

		if (!pasteCells) {
			return;
		}

		const currCellIndex = viewModel.getCellIndex(context.cell);

		let topPastedCell: CellViewModel | undefined = undefined;
		pasteCells.items.reverse().map(cell => {
			return {
				source: cell.getValue(),
				language: cell.language,
				cellKind: cell.cellKind,
				outputs: cell.outputs,
				metadata: {
					editable: cell.metadata?.editable,
					breakpointMargin: cell.metadata?.breakpointMargin,
					hasExecutionOrder: cell.metadata?.hasExecutionOrder,
					inputCollapsed: cell.metadata?.inputCollapsed,
					outputCollapsed: cell.metadata?.outputCollapsed,
					custom: cell.metadata?.custom
				}
			};
		}).forEach(pasteCell => {
			topPastedCell = viewModel.createCell(currCellIndex, pasteCell.source, pasteCell.language, pasteCell.cellKind, pasteCell.metadata, pasteCell.outputs, true);
			return;
		});

		if (topPastedCell) {
			context.notebookEditor.focusNotebookCell(topPastedCell, 'container');
		}
	}
});
