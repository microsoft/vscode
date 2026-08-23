/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBulkEditService, ResourceEdit, ResourceTextEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { IPosition, Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { EndOfLinePreference, IReadonlyTextBuffer } from '../../../../../editor/common/model.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../../editor/common/languages/modesRegistry.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ResourceNotebookCellEdit } from '../../../bulkEdit/browser/bulkCellEdits.js';
import { INotebookActionContext, INotebookCellActionContext } from './coreActions.js';
import { CellEditState, CellFocusMode, expandCellRangesWithHiddenCells, IActiveNotebookEditor, ICellViewModel } from '../notebookBrowser.js';
import { CellViewModel, NotebookViewModel } from '../viewModel/notebookViewModelImpl.js';
import { cloneNotebookCellTextModel } from '../../common/model/notebookCellTextModel.js';
import { CellEditType, CellKind, ICellEditOperation, ICellReplaceEdit, IOutputDto, ISelectionState, NotebookCellMetadata, SelectionStateType } from '../../common/notebookCommon.js';
import { cellRangeContains, cellRangesToIndexes, ICellRange } from '../../common/notebookRange.js';
import { localize } from '../../../../../nls.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { INotebookKernelHistoryService } from '../../common/notebookKernelService.js';

export async function changeCellToKind(kind: CellKind, context: INotebookActionContext, language?: string, mime?: string): Promise<void> {
	const { notebookEditor } = context;
	if (!notebookEditor.hasModel()) {
		return;
	}

	if (notebookEditor.isReadOnly) {
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
			language = availableLanguages[0] ?? PLAINTEXT_LANGUAGE_ID;
		}

		notebookEditor.textModel.applyEdits([
			{
				editType: CellEditType.Replace,
				index: idx,
				count: 1,
				cells: [{
					cellKind: kind,
					source: text,
					language: language,
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
		const newCell = notebookEditor.cellAt(idx);
		await notebookEditor.focusNotebookCell(newCell, cell.getEditState() === CellEditState.Editing ? 'editor' : 'container');
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
				language = availableLanguages[0] ?? PLAINTEXT_LANGUAGE_ID;
			}

			rawEdits.push(
				{
					editType: CellEditType.Replace,
					index: idx,
					count: 1,
					cells: [{
						cellKind: kind,
						source: text,
						language: language,
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

export function runDeleteAction(editor: IActiveNotebookEditor, cell: ICellViewModel) {
	const textModel = editor.textModel;
	const selections = editor.getSelections();
	const targetCellIndex = editor.getCellIndex(cell);
	const containingSelection = selections.find(selection => selection.start <= targetCellIndex && targetCellIndex < selection.end);

	const computeUndoRedo = !editor.isReadOnly || textModel.viewType === 'interactive';
	if (containingSelection) {
		const edits: ICellReplaceEdit[] = selections.reverse().map(selection => ({
			editType: CellEditType.Replace, index: selection.start, count: selection.end - selection.start, cells: []
		}));

		const nextCellAfterContainingSelection = containingSelection.end >= editor.getLength() ? undefined : editor.cellAt(containingSelection.end);

		textModel.applyEdits(edits, true, { kind: SelectionStateType.Index, focus: editor.getFocus(), selections: editor.getSelections() }, () => {
			if (nextCellAfterContainingSelection) {
				const cellIndex = textModel.cells.findIndex(cell => cell.handle === nextCellAfterContainingSelection.handle);
				return { kind: SelectionStateType.Index, focus: { start: cellIndex, end: cellIndex + 1 }, selections: [{ start: cellIndex, end: cellIndex + 1 }] };
			} else {
				if (textModel.length) {
					const lastCellIndex = textModel.length - 1;
					return { kind: SelectionStateType.Index, focus: { start: lastCellIndex, end: lastCellIndex + 1 }, selections: [{ start: lastCellIndex, end: lastCellIndex + 1 }] };

				} else {
					return { kind: SelectionStateType.Index, focus: { start: 0, end: 0 }, selections: [{ start: 0, end: 0 }] };
				}
			}
		}, undefined, computeUndoRedo);
	} else {
		const focus = editor.getFocus();
		const edits: ICellReplaceEdit[] = [{
			editType: CellEditType.Replace, index: targetCellIndex, count: 1, cells: []
		}];

		const finalSelections: ICellRange[] = [];
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

		if (editor.cellAt(focus.start) === cell) {
			// focus is the target, focus is also not part of any selection
			const newFocus = focus.end === textModel.length ? { start: focus.start - 1, end: focus.end - 1 } : focus;

			textModel.applyEdits(edits, true, { kind: SelectionStateType.Index, focus: editor.getFocus(), selections: editor.getSelections() }, () => ({
				kind: SelectionStateType.Index, focus: newFocus, selections: finalSelections
			}), undefined, computeUndoRedo);
		} else {
			// users decide to delete a cell out of current focus/selection
			const newFocus = focus.start > targetCellIndex ? { start: focus.start - 1, end: focus.end - 1 } : focus;

			textModel.applyEdits(edits, true, { kind: SelectionStateType.Index, focus: editor.getFocus(), selections: editor.getSelections() }, () => ({
				kind: SelectionStateType.Index, focus: newFocus, selections: finalSelections
			}), undefined, computeUndoRedo);
		}
	}
}

export async function moveCellRange(context: INotebookActionContext, direction: 'up' | 'down'): Promise<void> {
	if (!context.notebookEditor.hasModel()) {
		return;
	}
	const editor = context.notebookEditor;
	const textModel = editor.textModel;

	if (editor.isReadOnly) {
		return;
	}

	let range: ICellRange | undefined = undefined;

	if (context.cell) {
		const idx = editor.getCellIndex(context.cell);
		range = { start: idx, end: idx + 1 };
	} else {
		const selections = editor.getSelections();
		const modelRanges = expandCellRangesWithHiddenCells(editor, selections);
		range = modelRanges[0];
	}

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
				focus: editor.getFocus(),
				selections: editor.getSelections()
			},
			() => ({ kind: SelectionStateType.Index, focus: newFocus, selections: [finalSelection] }),
			undefined,
			true
		);
		const focusRange = editor.getSelections()[0] ?? editor.getFocus();
		editor.revealCellRangeInView(focusRange);
	} else {
		if (range.end >= textModel.length) {
			return;
		}

		const indexBelow = range.end;
		const finalSelection = { start: range.start + 1, end: range.end + 1 };
		const focus = editor.getFocus();
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
				focus: editor.getFocus(),
				selections: editor.getSelections()
			},
			() => ({ kind: SelectionStateType.Index, focus: newFocus, selections: [finalSelection] }),
			undefined,
			true
		);

		const focusRange = editor.getSelections()[0] ?? editor.getFocus();
		editor.revealCellRangeInView(focusRange);
	}
}

export async function copyCellRange(context: INotebookCellActionContext, direction: 'up' | 'down'): Promise<void> {
	const editor = context.notebookEditor;
	if (!editor.hasModel()) {
		return;
	}

	const textModel = editor.textModel;

	if (editor.isReadOnly) {
		return;
	}

	let range: ICellRange | undefined = undefined;

	if (context.ui) {
		const targetCell = context.cell;
		const targetCellIndex = editor.getCellIndex(targetCell);
		range = { start: targetCellIndex, end: targetCellIndex + 1 };
	} else {
		const selections = editor.getSelections();
		const modelRanges = expandCellRangesWithHiddenCells(editor, selections);
		range = modelRanges[0];
	}

	if (!range || range.start === range.end) {
		return;
	}

	if (direction === 'up') {
		// insert up, without changing focus and selections
		const focus = editor.getFocus();
		const selections = editor.getSelections();
		textModel.applyEdits([
			{
				editType: CellEditType.Replace,
				index: range.end,
				count: 0,
				cells: cellRangesToIndexes([range]).map(index => cloneNotebookCellTextModel(editor.cellAt(index)!.model))
			}],
			true,
			{
				kind: SelectionStateType.Index,
				focus: focus,
				selections: selections
			},
			() => ({ kind: SelectionStateType.Index, focus: focus, selections: selections }),
			undefined,
			true
		);
	} else {
		// insert down, move selections
		const focus = editor.getFocus();
		const selections = editor.getSelections();
		const newCells = cellRangesToIndexes([range]).map(index => cloneNotebookCellTextModel(editor.cellAt(index)!.model));
		const countDelta = newCells.length;
		const newFocus = context.ui ? focus : { start: focus.start + countDelta, end: focus.end + countDelta };
		const newSelections = context.ui ? selections : [{ start: range.start + countDelta, end: range.end + countDelta }];
		textModel.applyEdits([
			{
				editType: CellEditType.Replace,
				index: range.end,
				count: 0,
				cells: cellRangesToIndexes([range]).map(index => cloneNotebookCellTextModel(editor.cellAt(index)!.model))
			}],
			true,
			{
				kind: SelectionStateType.Index,
				focus: focus,
				selections: selections
			},
			() => ({ kind: SelectionStateType.Index, focus: newFocus, selections: newSelections }),
			undefined,
			true
		);

		const focusRange = editor.getSelections()[0] ?? editor.getFocus();
		editor.revealCellRangeInView(focusRange);
	}
}

export async function joinSelectedCells(bulkEditService: IBulkEditService, notificationService: INotificationService, context: INotebookCellActionContext): Promise<void> {
	const editor = context.notebookEditor;
	if (editor.isReadOnly) {
		return;
	}

	const edits: ResourceEdit[] = [];
	const cells: ICellViewModel[] = [];
	for (const selection of editor.getSelections()) {
		cells.push(...editor.getCellsInRange(selection));
	}

	if (cells.length <= 1) {
		return;
	}

	// check if all cells are of the same kind
	const cellKind = cells[0].cellKind;
	const isSameKind = cells.every(cell => cell.cellKind === cellKind);
	if (!isSameKind) {
		// cannot join cells of different kinds
		// show warning and quit
		const message = localize('notebookActions.joinSelectedCells', "Cannot join cells of different kinds");
		return notificationService.warn(message);
	}

	// merge all cells content into first cell
	const firstCell = cells[0];
	const insertContent = cells.map(cell => cell.getText()).join(firstCell.textBuffer.getEOL());
	const firstSelection = editor.getSelections()[0];
	edits.push(
		new ResourceNotebookCellEdit(editor.textModel.uri,
			{
				editType: CellEditType.Replace,
				index: firstSelection.start,
				count: firstSelection.end - firstSelection.start,
				cells: [{
					cellKind: firstCell.cellKind,
					source: insertContent,
					language: firstCell.language,
					mime: firstCell.mime,
					outputs: firstCell.model.outputs,
					metadata: firstCell.metadata,
				}]
			}
		)
	);

	for (const selection of editor.getSelections().slice(1)) {
		edits.push(new ResourceNotebookCellEdit(editor.textModel.uri,
			{
				editType: CellEditType.Replace,
				index: selection.start,
				count: selection.end - selection.start,
				cells: []
			}));
	}

	if (edits.length) {
		await bulkEditService.apply(
			edits,
			{ quotableLabel: localize('notebookActions.joinSelectedCells.label', "Join Notebook Cells") }
		);
	}
}

export async function joinNotebookCells(editor: IActiveNotebookEditor, range: ICellRange, direction: 'above' | 'below', constraint?: CellKind): Promise<{ edits: ResourceEdit[]; cell: ICellViewModel; endFocus: ICellRange; endSelections: ICellRange[] } | null> {
	if (editor.isReadOnly) {
		return null;
	}

	const textModel = editor.textModel;
	const cells = editor.getCellsInRange(range);

	if (!cells.length) {
		return null;
	}

	if (range.start === 0 && direction === 'above') {
		return null;
	}

	if (range.end === textModel.length && direction === 'below') {
		return null;
	}

	for (let i = 0; i < cells.length; i++) {
		const cell = cells[i];

		if (constraint && cell.cellKind !== constraint) {
			return null;
		}
	}

	if (direction === 'above') {
		const above = editor.cellAt(range.start - 1) as CellViewModel;
		if (constraint && above.cellKind !== constraint) {
			return null;
		}

		const insertContent = cells.map(cell => (cell.textBuffer.getEOL() ?? '') + cell.getText()).join('');
		const aboveCellLineCount = above.textBuffer.getLineCount();
		const aboveCellLastLineEndColumn = above.textBuffer.getLineLength(aboveCellLineCount);

		return {
			edits: [
				new ResourceTextEdit(above.uri, { range: new Range(aboveCellLineCount, aboveCellLastLineEndColumn + 1, aboveCellLineCount, aboveCellLastLineEndColumn + 1), text: insertContent }),
				new ResourceNotebookCellEdit(textModel.uri,
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
		const below = editor.cellAt(range.end) as CellViewModel;
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
				new ResourceNotebookCellEdit(textModel.uri,
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
	const editor = context.notebookEditor;
	const textModel = editor.textModel;
	const viewModel = editor.getViewModel() as NotebookViewModel;
	let ret: {
		edits: ResourceEdit[];
		cell: ICellViewModel;
		endFocus: ICellRange;
		endSelections: ICellRange[];
	} | null = null;

	if (context.ui) {
		const focusMode = context.cell.focusMode;
		const cellIndex = editor.getCellIndex(context.cell);
		ret = await joinNotebookCells(editor, { start: cellIndex, end: cellIndex + 1 }, direction);
		if (!ret) {
			return;
		}

		await bulkEditService.apply(
			ret?.edits,
			{ quotableLabel: 'Join Notebook Cells' }
		);
		viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: ret.endFocus, selections: ret.endSelections });
		ret.cell.updateEditState(CellEditState.Editing, 'joinCellsWithSurrounds');
		editor.revealCellRangeInView(editor.getFocus());
		if (focusMode === CellFocusMode.Editor) {
			ret.cell.focusMode = CellFocusMode.Editor;
		}
	} else {
		const selections = editor.getSelections();
		if (!selections.length) {
			return;
		}

		const focus = editor.getFocus();
		const focusMode = editor.cellAt(focus.start)?.focusMode;

		const edits: ResourceEdit[] = [];
		let cell: ICellViewModel | null = null;
		const cells: ICellViewModel[] = [];

		for (let i = selections.length - 1; i >= 0; i--) {
			const selection = selections[i];
			const containFocus = cellRangeContains(selection, focus);

			if (
				selection.end >= textModel.length && direction === 'below'
				|| selection.start === 0 && direction === 'above'
			) {
				if (containFocus) {
					cell = editor.cellAt(focus.start)!;
				}

				cells.push(...editor.getCellsInRange(selection));
				continue;
			}

			const singleRet = await joinNotebookCells(editor, selection, direction);

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
		editor.revealCellRangeInView(editor.getFocus());
		const newFocusedCell = editor.cellAt(editor.getFocus().start);
		if (focusMode === CellFocusMode.Editor && newFocusedCell) {
			newFocusedCell.focusMode = CellFocusMode.Editor;
		}
	}
}

function _splitPointsToBoundaries(splitPoints: IPosition[], textBuffer: IReadonlyTextBuffer): IPosition[] | null {
	const boundaries: IPosition[] = [];
	const lineCnt = textBuffer.getLineCount();
	const getLineLen = (lineNumber: number) => {
		return textBuffer.getLineLength(lineNumber);
	};

	// split points need to be sorted
	splitPoints = splitPoints.sort((l, r) => {
		const lineDiff = l.lineNumber - r.lineNumber;
		const columnDiff = l.column - r.column;
		return lineDiff !== 0 ? lineDiff : columnDiff;
	});

	for (let sp of splitPoints) {
		if (getLineLen(sp.lineNumber) + 1 === sp.column && sp.column !== 1 /** empty line */ && sp.lineNumber < lineCnt) {
			sp = new Position(sp.lineNumber + 1, 1);
		}
		_pushIfAbsent(boundaries, sp);
	}

	if (boundaries.length === 0) {
		return null;
	}

	// boundaries already sorted and not empty
	const modelStart = new Position(1, 1);
	const modelEnd = new Position(lineCnt, getLineLen(lineCnt) + 1);
	return [modelStart, ...boundaries, modelEnd];
}

function _pushIfAbsent(positions: IPosition[], p: IPosition) {
	const last = positions.length > 0 ? positions[positions.length - 1] : undefined;
	if (!last || last.lineNumber !== p.lineNumber || last.column !== p.column) {
		positions.push(p);
	}
}

export function computeCellLinesContents(cell: ICellViewModel, splitPoints: IPosition[]): string[] | null {
	const rangeBoundaries = _splitPointsToBoundaries(splitPoints, cell.textBuffer);
	if (!rangeBoundaries) {
		return null;
	}
	const newLineModels: string[] = [];
	for (let i = 1; i < rangeBoundaries.length; i++) {
		const start = rangeBoundaries[i - 1];
		const end = rangeBoundaries[i];

		newLineModels.push(cell.textBuffer.getValueInRange(new Range(start.lineNumber, start.column, end.lineNumber, end.column), EndOfLinePreference.TextDefined));
	}

	return newLineModels;
}

export function insertCell(
	languageService: ILanguageService,
	editor: IActiveNotebookEditor,
	index: number,
	type: CellKind,
	direction: 'above' | 'below' = 'above',
	initialText: string = '',
	ui: boolean = false,
	kernelHistoryService?: INotebookKernelHistoryService
) {
	const viewModel = editor.getViewModel() as NotebookViewModel;
	const activeKernel = editor.activeKernel;
	if (viewModel.options.isReadOnly) {
		return null;
	}

	const cell = editor.cellAt(index);
	const nextIndex = ui ? viewModel.getNextVisibleCellIndex(index) : index + 1;
	let language;
	if (type === CellKind.Code) {
		const supportedLanguages = activeKernel?.supportedLanguages ?? languageService.getRegisteredLanguageIds();
		const defaultLanguage = supportedLanguages[0] || PLAINTEXT_LANGUAGE_ID;

		if (cell?.cellKind === CellKind.Code) {
			language = cell.language;
		} else if (cell?.cellKind === CellKind.Markup) {
			const nearestCodeCellIndex = viewModel.nearestCodeCellIndex(index);
			if (nearestCodeCellIndex > -1) {
				language = viewModel.cellAt(nearestCodeCellIndex)!.language;
			} else {
				language = defaultLanguage;
			}
		} else if (!cell && viewModel.length === 0) {
			// No cells in notebook - check kernel history
			const lastKernels = kernelHistoryService?.getKernels(viewModel.notebookDocument);
			if (lastKernels?.all.length) {
				const lastKernel = lastKernels.all[0];
				language = lastKernel.supportedLanguages[0] || defaultLanguage;
			} else {
				language = defaultLanguage;
			}
		} else {
			if (cell === undefined && direction === 'above') {
				// insert cell at the very top
				language = viewModel.viewCells.find(cell => cell.cellKind === CellKind.Code)?.language || defaultLanguage;
			} else {
				language = defaultLanguage;
			}
		}

		if (!supportedLanguages.includes(language)) {
			// the language no longer exists
			language = defaultLanguage;
		}
	} else {
		language = 'markdown';
	}

	const insertIndex = cell ?
		(direction === 'above' ? index : nextIndex) :
		index;
	return insertCellAtIndex(viewModel, insertIndex, initialText, language, type, undefined, [], true, true);
}

export function insertCellAtIndex(viewModel: NotebookViewModel, index: number, source: string, language: string, type: CellKind, metadata: NotebookCellMetadata | undefined, outputs: IOutputDto[], synchronous: boolean, pushUndoStop: boolean): CellViewModel {
	const endSelections: ISelectionState = { kind: SelectionStateType.Index, focus: { start: index, end: index + 1 }, selections: [{ start: index, end: index + 1 }] };
	viewModel.notebookDocument.applyEdits([
		{
			editType: CellEditType.Replace,
			index,
			count: 0,
			cells: [
				{
					cellKind: type,
					language: language,
					mime: undefined,
					outputs: outputs,
					metadata: metadata,
					source: source
				}
			]
		}
	], synchronous, { kind: SelectionStateType.Index, focus: viewModel.getFocus(), selections: viewModel.getSelections() }, () => endSelections, undefined, pushUndoStop && !viewModel.options.isReadOnly);
	return viewModel.cellAt(index)!;
}
