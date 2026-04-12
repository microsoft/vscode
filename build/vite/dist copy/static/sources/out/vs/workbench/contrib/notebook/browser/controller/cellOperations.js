/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ResourceTextEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../../editor/common/languages/modesRegistry.js';
import { ResourceNotebookCellEdit } from '../../../bulkEdit/browser/bulkCellEdits.js';
import { CellEditState, CellFocusMode, expandCellRangesWithHiddenCells } from '../notebookBrowser.js';
import { cloneNotebookCellTextModel } from '../../common/model/notebookCellTextModel.js';
import { CellKind, SelectionStateType } from '../../common/notebookCommon.js';
import { cellRangeContains, cellRangesToIndexes } from '../../common/notebookRange.js';
import { localize } from '../../../../../nls.js';
export async function changeCellToKind(kind, context, language, mime) {
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
                editType: 1 /* CellEditType.Replace */,
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
    }
    else if (context.selectedCells) {
        const selectedCells = context.selectedCells;
        const rawEdits = [];
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
            rawEdits.push({
                editType: 1 /* CellEditType.Replace */,
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
            });
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
export function runDeleteAction(editor, cell) {
    const textModel = editor.textModel;
    const selections = editor.getSelections();
    const targetCellIndex = editor.getCellIndex(cell);
    const containingSelection = selections.find(selection => selection.start <= targetCellIndex && targetCellIndex < selection.end);
    const computeUndoRedo = !editor.isReadOnly || textModel.viewType === 'interactive';
    if (containingSelection) {
        const edits = selections.reverse().map(selection => ({
            editType: 1 /* CellEditType.Replace */, index: selection.start, count: selection.end - selection.start, cells: []
        }));
        const nextCellAfterContainingSelection = containingSelection.end >= editor.getLength() ? undefined : editor.cellAt(containingSelection.end);
        textModel.applyEdits(edits, true, { kind: SelectionStateType.Index, focus: editor.getFocus(), selections: editor.getSelections() }, () => {
            if (nextCellAfterContainingSelection) {
                const cellIndex = textModel.cells.findIndex(cell => cell.handle === nextCellAfterContainingSelection.handle);
                return { kind: SelectionStateType.Index, focus: { start: cellIndex, end: cellIndex + 1 }, selections: [{ start: cellIndex, end: cellIndex + 1 }] };
            }
            else {
                if (textModel.length) {
                    const lastCellIndex = textModel.length - 1;
                    return { kind: SelectionStateType.Index, focus: { start: lastCellIndex, end: lastCellIndex + 1 }, selections: [{ start: lastCellIndex, end: lastCellIndex + 1 }] };
                }
                else {
                    return { kind: SelectionStateType.Index, focus: { start: 0, end: 0 }, selections: [{ start: 0, end: 0 }] };
                }
            }
        }, undefined, computeUndoRedo);
    }
    else {
        const focus = editor.getFocus();
        const edits = [{
                editType: 1 /* CellEditType.Replace */, index: targetCellIndex, count: 1, cells: []
            }];
        const finalSelections = [];
        for (let i = 0; i < selections.length; i++) {
            const selection = selections[i];
            if (selection.end <= targetCellIndex) {
                finalSelections.push(selection);
            }
            else if (selection.start > targetCellIndex) {
                finalSelections.push({ start: selection.start - 1, end: selection.end - 1 });
            }
            else {
                finalSelections.push({ start: targetCellIndex, end: targetCellIndex + 1 });
            }
        }
        if (editor.cellAt(focus.start) === cell) {
            // focus is the target, focus is also not part of any selection
            const newFocus = focus.end === textModel.length ? { start: focus.start - 1, end: focus.end - 1 } : focus;
            textModel.applyEdits(edits, true, { kind: SelectionStateType.Index, focus: editor.getFocus(), selections: editor.getSelections() }, () => ({
                kind: SelectionStateType.Index, focus: newFocus, selections: finalSelections
            }), undefined, computeUndoRedo);
        }
        else {
            // users decide to delete a cell out of current focus/selection
            const newFocus = focus.start > targetCellIndex ? { start: focus.start - 1, end: focus.end - 1 } : focus;
            textModel.applyEdits(edits, true, { kind: SelectionStateType.Index, focus: editor.getFocus(), selections: editor.getSelections() }, () => ({
                kind: SelectionStateType.Index, focus: newFocus, selections: finalSelections
            }), undefined, computeUndoRedo);
        }
    }
}
export async function moveCellRange(context, direction) {
    if (!context.notebookEditor.hasModel()) {
        return;
    }
    const editor = context.notebookEditor;
    const textModel = editor.textModel;
    if (editor.isReadOnly) {
        return;
    }
    let range = undefined;
    if (context.cell) {
        const idx = editor.getCellIndex(context.cell);
        range = { start: idx, end: idx + 1 };
    }
    else {
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
                editType: 6 /* CellEditType.Move */,
                index: indexAbove,
                length: 1,
                newIdx: range.end - 1
            }
        ], true, {
            kind: SelectionStateType.Index,
            focus: editor.getFocus(),
            selections: editor.getSelections()
        }, () => ({ kind: SelectionStateType.Index, focus: newFocus, selections: [finalSelection] }), undefined, true);
        const focusRange = editor.getSelections()[0] ?? editor.getFocus();
        editor.revealCellRangeInView(focusRange);
    }
    else {
        if (range.end >= textModel.length) {
            return;
        }
        const indexBelow = range.end;
        const finalSelection = { start: range.start + 1, end: range.end + 1 };
        const focus = editor.getFocus();
        const newFocus = cellRangeContains(range, focus) ? { start: focus.start + 1, end: focus.end + 1 } : { start: range.start + 1, end: range.start + 2 };
        textModel.applyEdits([
            {
                editType: 6 /* CellEditType.Move */,
                index: indexBelow,
                length: 1,
                newIdx: range.start
            }
        ], true, {
            kind: SelectionStateType.Index,
            focus: editor.getFocus(),
            selections: editor.getSelections()
        }, () => ({ kind: SelectionStateType.Index, focus: newFocus, selections: [finalSelection] }), undefined, true);
        const focusRange = editor.getSelections()[0] ?? editor.getFocus();
        editor.revealCellRangeInView(focusRange);
    }
}
export async function copyCellRange(context, direction) {
    const editor = context.notebookEditor;
    if (!editor.hasModel()) {
        return;
    }
    const textModel = editor.textModel;
    if (editor.isReadOnly) {
        return;
    }
    let range = undefined;
    if (context.ui) {
        const targetCell = context.cell;
        const targetCellIndex = editor.getCellIndex(targetCell);
        range = { start: targetCellIndex, end: targetCellIndex + 1 };
    }
    else {
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
                editType: 1 /* CellEditType.Replace */,
                index: range.end,
                count: 0,
                cells: cellRangesToIndexes([range]).map(index => cloneNotebookCellTextModel(editor.cellAt(index).model))
            }
        ], true, {
            kind: SelectionStateType.Index,
            focus: focus,
            selections: selections
        }, () => ({ kind: SelectionStateType.Index, focus: focus, selections: selections }), undefined, true);
    }
    else {
        // insert down, move selections
        const focus = editor.getFocus();
        const selections = editor.getSelections();
        const newCells = cellRangesToIndexes([range]).map(index => cloneNotebookCellTextModel(editor.cellAt(index).model));
        const countDelta = newCells.length;
        const newFocus = context.ui ? focus : { start: focus.start + countDelta, end: focus.end + countDelta };
        const newSelections = context.ui ? selections : [{ start: range.start + countDelta, end: range.end + countDelta }];
        textModel.applyEdits([
            {
                editType: 1 /* CellEditType.Replace */,
                index: range.end,
                count: 0,
                cells: cellRangesToIndexes([range]).map(index => cloneNotebookCellTextModel(editor.cellAt(index).model))
            }
        ], true, {
            kind: SelectionStateType.Index,
            focus: focus,
            selections: selections
        }, () => ({ kind: SelectionStateType.Index, focus: newFocus, selections: newSelections }), undefined, true);
        const focusRange = editor.getSelections()[0] ?? editor.getFocus();
        editor.revealCellRangeInView(focusRange);
    }
}
export async function joinSelectedCells(bulkEditService, notificationService, context) {
    const editor = context.notebookEditor;
    if (editor.isReadOnly) {
        return;
    }
    const edits = [];
    const cells = [];
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
    edits.push(new ResourceNotebookCellEdit(editor.textModel.uri, {
        editType: 1 /* CellEditType.Replace */,
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
    }));
    for (const selection of editor.getSelections().slice(1)) {
        edits.push(new ResourceNotebookCellEdit(editor.textModel.uri, {
            editType: 1 /* CellEditType.Replace */,
            index: selection.start,
            count: selection.end - selection.start,
            cells: []
        }));
    }
    if (edits.length) {
        await bulkEditService.apply(edits, { quotableLabel: localize('notebookActions.joinSelectedCells.label', "Join Notebook Cells") });
    }
}
export async function joinNotebookCells(editor, range, direction, constraint) {
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
        const above = editor.cellAt(range.start - 1);
        if (constraint && above.cellKind !== constraint) {
            return null;
        }
        const insertContent = cells.map(cell => (cell.textBuffer.getEOL() ?? '') + cell.getText()).join('');
        const aboveCellLineCount = above.textBuffer.getLineCount();
        const aboveCellLastLineEndColumn = above.textBuffer.getLineLength(aboveCellLineCount);
        return {
            edits: [
                new ResourceTextEdit(above.uri, { range: new Range(aboveCellLineCount, aboveCellLastLineEndColumn + 1, aboveCellLineCount, aboveCellLastLineEndColumn + 1), text: insertContent }),
                new ResourceNotebookCellEdit(textModel.uri, {
                    editType: 1 /* CellEditType.Replace */,
                    index: range.start,
                    count: range.end - range.start,
                    cells: []
                })
            ],
            cell: above,
            endFocus: { start: range.start - 1, end: range.start },
            endSelections: [{ start: range.start - 1, end: range.start }]
        };
    }
    else {
        const below = editor.cellAt(range.end);
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
                new ResourceNotebookCellEdit(textModel.uri, {
                    editType: 1 /* CellEditType.Replace */,
                    index: range.start + 1,
                    count: range.end - range.start,
                    cells: []
                })
            ],
            cell,
            endFocus: { start: range.start, end: range.start + 1 },
            endSelections: [{ start: range.start, end: range.start + 1 }]
        };
    }
}
export async function joinCellsWithSurrounds(bulkEditService, context, direction) {
    const editor = context.notebookEditor;
    const textModel = editor.textModel;
    const viewModel = editor.getViewModel();
    let ret = null;
    if (context.ui) {
        const focusMode = context.cell.focusMode;
        const cellIndex = editor.getCellIndex(context.cell);
        ret = await joinNotebookCells(editor, { start: cellIndex, end: cellIndex + 1 }, direction);
        if (!ret) {
            return;
        }
        await bulkEditService.apply(ret?.edits, { quotableLabel: 'Join Notebook Cells' });
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: ret.endFocus, selections: ret.endSelections });
        ret.cell.updateEditState(CellEditState.Editing, 'joinCellsWithSurrounds');
        editor.revealCellRangeInView(editor.getFocus());
        if (focusMode === CellFocusMode.Editor) {
            ret.cell.focusMode = CellFocusMode.Editor;
        }
    }
    else {
        const selections = editor.getSelections();
        if (!selections.length) {
            return;
        }
        const focus = editor.getFocus();
        const focusMode = editor.cellAt(focus.start)?.focusMode;
        const edits = [];
        let cell = null;
        const cells = [];
        for (let i = selections.length - 1; i >= 0; i--) {
            const selection = selections[i];
            const containFocus = cellRangeContains(selection, focus);
            if (selection.end >= textModel.length && direction === 'below'
                || selection.start === 0 && direction === 'above') {
                if (containFocus) {
                    cell = editor.cellAt(focus.start);
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
        await bulkEditService.apply(edits, { quotableLabel: 'Join Notebook Cells' });
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
function _splitPointsToBoundaries(splitPoints, textBuffer) {
    const boundaries = [];
    const lineCnt = textBuffer.getLineCount();
    const getLineLen = (lineNumber) => {
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
function _pushIfAbsent(positions, p) {
    const last = positions.length > 0 ? positions[positions.length - 1] : undefined;
    if (!last || last.lineNumber !== p.lineNumber || last.column !== p.column) {
        positions.push(p);
    }
}
export function computeCellLinesContents(cell, splitPoints) {
    const rangeBoundaries = _splitPointsToBoundaries(splitPoints, cell.textBuffer);
    if (!rangeBoundaries) {
        return null;
    }
    const newLineModels = [];
    for (let i = 1; i < rangeBoundaries.length; i++) {
        const start = rangeBoundaries[i - 1];
        const end = rangeBoundaries[i];
        newLineModels.push(cell.textBuffer.getValueInRange(new Range(start.lineNumber, start.column, end.lineNumber, end.column), 0 /* EndOfLinePreference.TextDefined */));
    }
    return newLineModels;
}
export function insertCell(languageService, editor, index, type, direction = 'above', initialText = '', ui = false, kernelHistoryService) {
    const viewModel = editor.getViewModel();
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
        }
        else if (cell?.cellKind === CellKind.Markup) {
            const nearestCodeCellIndex = viewModel.nearestCodeCellIndex(index);
            if (nearestCodeCellIndex > -1) {
                language = viewModel.cellAt(nearestCodeCellIndex).language;
            }
            else {
                language = defaultLanguage;
            }
        }
        else if (!cell && viewModel.length === 0) {
            // No cells in notebook - check kernel history
            const lastKernels = kernelHistoryService?.getKernels(viewModel.notebookDocument);
            if (lastKernels?.all.length) {
                const lastKernel = lastKernels.all[0];
                language = lastKernel.supportedLanguages[0] || defaultLanguage;
            }
            else {
                language = defaultLanguage;
            }
        }
        else {
            if (cell === undefined && direction === 'above') {
                // insert cell at the very top
                language = viewModel.viewCells.find(cell => cell.cellKind === CellKind.Code)?.language || defaultLanguage;
            }
            else {
                language = defaultLanguage;
            }
        }
        if (!supportedLanguages.includes(language)) {
            // the language no longer exists
            language = defaultLanguage;
        }
    }
    else {
        language = 'markdown';
    }
    const insertIndex = cell ?
        (direction === 'above' ? index : nextIndex) :
        index;
    return insertCellAtIndex(viewModel, insertIndex, initialText, language, type, undefined, [], true, true);
}
export function insertCellAtIndex(viewModel, index, source, language, type, metadata, outputs, synchronous, pushUndoStop) {
    const endSelections = { kind: SelectionStateType.Index, focus: { start: index, end: index + 1 }, selections: [{ start: index, end: index + 1 }] };
    viewModel.notebookDocument.applyEdits([
        {
            editType: 1 /* CellEditType.Replace */,
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
    return viewModel.cellAt(index);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2VsbE9wZXJhdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL2NvbnRyb2xsZXIvY2VsbE9wZXJhdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFrQyxnQkFBZ0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQzdILE9BQU8sRUFBYSxRQUFRLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNwRixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFbkUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFFaEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFdEYsT0FBTyxFQUFFLGFBQWEsRUFBRSxhQUFhLEVBQUUsK0JBQStCLEVBQXlDLE1BQU0sdUJBQXVCLENBQUM7QUFFN0ksT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDekYsT0FBTyxFQUFnQixRQUFRLEVBQTJGLGtCQUFrQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckwsT0FBTyxFQUFFLGlCQUFpQixFQUFFLG1CQUFtQixFQUFjLE1BQU0sK0JBQStCLENBQUM7QUFDbkcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBSWpELE1BQU0sQ0FBQyxLQUFLLFVBQVUsZ0JBQWdCLENBQUMsSUFBYyxFQUFFLE9BQStCLEVBQUUsUUFBaUIsRUFBRSxJQUFhO0lBQ3ZILE1BQU0sRUFBRSxjQUFjLEVBQUUsR0FBRyxPQUFPLENBQUM7SUFDbkMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDO1FBQ2hDLE9BQU87SUFDUixDQUFDO0lBRUQsSUFBSSxjQUFj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