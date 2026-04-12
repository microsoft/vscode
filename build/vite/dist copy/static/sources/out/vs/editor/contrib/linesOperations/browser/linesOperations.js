/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { KeyChord } from '../../../../base/common/keyCodes.js';
import * as nls from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { CoreEditingCommands } from '../../../browser/coreCommands.js';
import { EditorAction, registerEditorAction } from '../../../browser/editorExtensions.js';
import { ReplaceCommand, ReplaceCommandThatPreservesSelection, ReplaceCommandThatSelectsText } from '../../../common/commands/replaceCommand.js';
import { TrimTrailingWhitespaceCommand } from '../../../common/commands/trimTrailingWhitespaceCommand.js';
import { EditOperation } from '../../../common/core/editOperation.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { EnterOperation } from '../../../common/cursor/cursorTypeEditOperations.js';
import { TypeOperations } from '../../../common/cursor/cursorTypeOperations.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';
import { CopyLinesCommand } from './copyLinesCommand.js';
import { MoveLinesCommand } from './moveLinesCommand.js';
import { SortLinesCommand } from './sortLinesCommand.js';
// copy lines
class AbstractCopyLinesAction extends EditorAction {
    constructor(down, opts) {
        super(opts);
        this.down = down;
    }
    run(_accessor, editor) {
        if (!editor.hasModel()) {
            return;
        }
        const selections = editor.getSelections().map((selection, index) => ({ selection, index, ignore: false }));
        selections.sort((a, b) => Range.compareRangesUsingStarts(a.selection, b.selection));
        // Remove selections that would result in copying the same line
        let prev = selections[0];
        for (let i = 1; i < selections.length; i++) {
            const curr = selections[i];
            if (prev.selection.endLineNumber === curr.selection.startLineNumber) {
                // these two selections would copy the same line
                if (prev.index < curr.index) {
                    // prev wins
                    curr.ignore = true;
                }
                else {
                    // curr wins
                    prev.ignore = true;
                    prev = curr;
                }
            }
        }
        const commands = [];
        for (const selection of selections) {
            commands.push(new CopyLinesCommand(selection.selection, this.down, selection.ignore));
        }
        editor.pushUndoStop();
        editor.executeCommands(this.id, commands);
        editor.pushUndoStop();
    }
}
class CopyLinesUpAction extends AbstractCopyLinesAction {
    constructor() {
        super(false, {
            id: 'editor.action.copyLinesUpAction',
            label: nls.localize2('lines.copyUp', "Copy Line Up"),
            precondition: EditorContextKeys.writable,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: 512 /* KeyMod.Alt */ | 1024 /* KeyMod.Shift */ | 16 /* KeyCode.UpArrow */,
                linux: { primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 1024 /* KeyMod.Shift */ | 16 /* KeyCode.UpArrow */ },
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            menuOpts: {
                menuId: MenuId.MenubarSelectionMenu,
                group: '2_line',
                title: nls.localize({ key: 'miCopyLinesUp', comment: ['&& denotes a mnemonic'] }, "&&Copy Line Up"),
                order: 1
            },
            canTriggerInlineEdits: true,
        });
    }
}
class CopyLinesDownAction extends AbstractCopyLinesAction {
    constructor() {
        super(true, {
            id: 'editor.action.copyLinesDownAction',
            label: nls.localize2('lines.copyDown', "Copy Line Down"),
            precondition: EditorContextKeys.writable,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: 512 /* KeyMod.Alt */ | 1024 /* KeyMod.Shift */ | 18 /* KeyCode.DownArrow */,
                linux: { primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 1024 /* KeyMod.Shift */ | 18 /* KeyCode.DownArrow */ },
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            menuOpts: {
                menuId: MenuId.MenubarSelectionMenu,
                group: '2_line',
                title: nls.localize({ key: 'miCopyLinesDown', comment: ['&& denotes a mnemonic'] }, "Co&&py Line Down"),
                order: 2
            },
            canTriggerInlineEdits: true,
        });
    }
}
export class DuplicateSelectionAction extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.duplicateSelection',
            label: nls.localize2('duplicateSelection', "Duplicate Selection"),
            precondition: EditorContextKeys.writable,
            menuOpts: {
                menuId: MenuId.MenubarSelectionMenu,
                group: '2_line',
                title: nls.localize({ key: 'miDuplicateSelection', comment: ['&& denotes a mnemonic'] }, "&&Duplicate Selection"),
                order: 5
            },
            canTriggerInlineEdits: true,
        });
    }
    run(accessor, editor, args) {
        if (!editor.hasModel()) {
            return;
        }
        const commands = [];
        const selections = editor.getSelections();
        const model = editor.getModel();
        for (const selection of selections) {
            if (selection.isEmpty()) {
                commands.push(new CopyLinesCommand(selection, true));
            }
            else {
                const insertSelection = new Selection(selection.endLineNumber, selection.endColumn, selection.endLineNumber, selection.endColumn);
                commands.push(new ReplaceCommandThatSelectsText(insertSelection, model.getValueInRange(selection)));
            }
        }
        editor.pushUndoStop();
        editor.executeCommands(this.id, commands);
        editor.pushUndoStop();
    }
}
// move lines
class AbstractMoveLinesAction extends EditorAction {
    constructor(down, opts) {
        super(opts);
        this.down = down;
    }
    run(accessor, editor) {
        const languageConfigurationService = accessor.get(ILanguageConfigurationService);
        const commands = [];
        const selections = editor.getSelections() || [];
        const autoIndent = editor.getOption(16 /* EditorOption.autoIndent */);
        for (const selection of selections) {
            commands.push(new MoveLinesCommand(selection, this.down, autoIndent, languageConfigurationService));
        }
        editor.pushUndoStop();
        editor.executeCommands(this.id, commands);
        editor.pushUndoStop();
    }
}
class MoveLinesUpAction extends AbstractMoveLinesAction {
    constructor() {
        super(false, {
            id: 'editor.action.moveLinesUpAction',
            label: nls.localize2('lines.moveUp', "Move Line Up"),
            precondition: EditorContextKeys.writable,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: 512 /* KeyMod.Alt */ | 16 /* KeyCode.UpArrow */,
                linux: { primary: 512 /* KeyMod.Alt */ | 16 /* KeyCode.UpArrow */ },
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            menuOpts: {
                menuId: MenuId.MenubarSelectionMenu,
                group: '2_line',
                title: nls.localize({ key: 'miMoveLinesUp', comment: ['&& denotes a mnemonic'] }, "Mo&&ve Line Up"),
                order: 3
            },
            canTriggerInlineEdits: true,
        });
    }
}
class MoveLinesDownAction extends AbstractMoveLinesAction {
    constructor() {
        super(true, {
            id: 'editor.action.moveLinesDownAction',
            label: nls.localize2('lines.moveDown', "Move Line Down"),
            precondition: EditorContextKeys.writable,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: 512 /* KeyMod.Alt */ | 18 /* KeyCode.DownArrow */,
                linux: { primary: 512 /* KeyMod.Alt */ | 18 /* KeyCode.DownArrow */ },
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            menuOpts: {
                menuId: MenuId.MenubarSelectionMenu,
                group: '2_line',
                title: nls.localize({ key: 'miMoveLinesDown', comment: ['&& denotes a mnemonic'] }, "Move &&Line Down"),
                order: 4
            },
            canTriggerInlineEdits: true,
        });
    }
}
export class AbstractSortLinesAction extends EditorAction {
    constructor(descending, opts) {
        super(opts);
        this.descending = descending;
    }
    run(_accessor, editor) {
        if (!editor.hasModel()) {
            return;
        }
        const model = editor.getModel();
        let selections = editor.getSelections();
        if (selections.length === 1 && selections[0].isSingleLine()) {
            // Apply to whole document.
            selections = [new Selection(1, 1, model.getLineCount(), model.getLineMaxColumn(model.getLineCount()))];
        }
        for (const selection of selections) {
            if (!SortLinesCommand.canRun(editor.getModel(), selection, this.descending)) {
                return;
            }
        }
        const commands = [];
        for (let i = 0, len = selections.length; i < len; i++) {
            commands[i] = new SortLinesCommand(selections[i], this.descending);
        }
        editor.pushUndoStop();
        editor.executeCommands(this.id, commands);
        editor.pushUndoStop();
    }
}
export class SortLinesAscendingAction extends AbstractSortLinesAction {
    constructor() {
        super(false, {
            id: 'editor.action.sortLinesAscending',
            label: nls.localize2('lines.sortAscending', "Sort Lines Ascending"),
            precondition: EditorContextKeys.writable,
            canTriggerInlineEdits: true,
        });
    }
}
export class SortLinesDescendingAction extends AbstractSortLinesAction {
    constructor() {
        super(true, {
            id: 'editor.action.sortLinesDescending',
            label: nls.localize2('lines.sortDescending', "Sort Lines Descending"),
            precondition: EditorContextKeys.writable,
            canTriggerInlineEdits: true,
        });
    }
}
export class DeleteDuplicateLinesAction extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.removeDuplicateLines',
            label: nls.localize2('lines.deleteDuplicates', "Delete Duplicate Lines"),
            precondition: EditorContextKeys.writable,
            canTriggerInlineEdits: true,
        });
    }
    run(_accessor, editor) {
        if (!editor.hasModel()) {
            return;
        }
        const model = editor.getModel();
        if (model.getLineCount() === 1 && model.getLineMaxColumn(1) === 1) {
            return;
        }
        const edits = [];
        const endCursorState = [];
        let linesDeleted = 0;
        let updateSelection = true;
        let selections = editor.getSelections();
        if (selections.length === 1 && selections[0].isSingleLine()) {
            // Apply to whole document.
            selections = [new Selection(1, 1, model.getLineCount(), model.getLineMaxColumn(model.getLineCount()))];
            updateSelection = false;
        }
        for (const selection of selections) {
            const uniqueLines = new Set();
            const lines = [];
            for (let i = selection.startLineNumber; i <= selection.endLineNumber; i++) {
                const line = model.getLineContent(i);
                if (uniqueLines.has(line)) {
                    continue;
                }
                lines.push(line);
                uniqueLines.add(line);
            }
            const selectionToReplace = new Selection(selection.startLineNumber, 1, selection.endLineNumber, model.getLineMaxColumn(selection.endLineNumber));
            const adjustedSelectionStart = selection.startLineNumber - linesDeleted;
            const finalSelection = new Selection(adjustedSelectionStart, 1, adjustedSelectionStart + lines.length - 1, lines[lines.length - 1].length + 1);
            edits.push(EditOperation.replace(selectionToReplace, lines.join('\n')));
            endCursorState.push(finalSelection);
            linesDeleted += (selection.endLineNumber - selection.startLineNumber + 1) - lines.length;
        }
        editor.pushUndoStop();
        editor.executeEdits(this.id, edits, updateSelection ? endCursorState : undefined);
        editor.pushUndoStop();
    }
}
export class ReverseLinesAction extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.reverseLines',
            label: nls.localize2('lines.reverseLines', "Reverse lines"),
            precondition: EditorContextKeys.writable,
            canTriggerInlineEdits: true
        });
    }
    run(_accessor, editor) {
        if (!editor.hasModel()) {
            return;
        }
        const model = editor.getModel();
        const originalSelections = editor.getSelections();
        let selections = originalSelections;
        if (selections.length === 1 && selections[0].isSingleLine()) {
            // Apply to whole document.
            selections = [new Selection(1, 1, model.getLineCount(), model.getLineMaxColumn(model.getLineCount()))];
        }
        const edits = [];
        const resultingSelections = [];
        for (let i = 0; i < selections.length; i++) {
            const selection = selections[i];
            const originalSelection = originalSelections[i];
            let endLineNumber = selection.endLineNumber;
            if (selection.startLineNumber < selection.endLineNumber && selection.endColumn === 1) {
                endLineNumber--;
            }
            let range = new Range(selection.startLineNumber, 1, endLineNumber, model.getLineMaxColumn(endLineNumber));
            // Exclude last line if empty and we're at the end of the document
            if (endLineNumber === model.getLineCount() && model.getLineContent(range.endLineNumber) === '') {
                range = range.setEndPosition(range.endLineNumber - 1, model.getLineMaxColumn(range.endLineNumber - 1));
            }
            const lines = [];
            for (let i = range.endLineNumber; i >= range.startLineNumber; i--) {
                lines.push(model.getLineContent(i));
            }
            const edit = EditOperation.replace(range, lines.join('\n'));
            edits.push(edit);
            const updateLineNumber = function (lineNumber) {
                return lineNumber <= range.endLineNumber ? range.endLineNumber - lineNumber + range.startLineNumber : lineNumber;
            };
            const updateSelection = function (sel) {
                if (sel.isEmpty()) {
                    // keep just the cursor
                    return new Selection(updateLineNumber(sel.positionLineNumber), sel.positionColumn, updateLineNumber(sel.positionLineNumber), sel.positionColumn);
                }
                else {
                    // keep selection - maintain direction by creating backward selection
                    const newSelectionStart = updateLineNumber(sel.selectionStartLineNumber);
                    const newPosition = updateLineNumber(sel.positionLineNumber);
                    const newSelectionStartColumn = sel.selectionStartColumn;
                    const newPositionColumn = sel.positionColumn;
                    // Create selection: from (newSelectionStart, newSelectionStartColumn) to (newPosition, newPositionColumn)
                    // After reversal: from (3, 2) to (1, 3)
                    return new Selection(newSelectionStart, newSelectionStartColumn, newPosition, newPositionColumn);
                }
            };
            resultingSelections.push(updateSelection(originalSelection));
        }
        editor.pushUndoStop();
        editor.executeEdits(this.id, edits, resultingSelections);
        editor.pushUndoStop();
    }
}
export class TrimTrailingWhitespaceAction extends EditorAction {
    static { this.ID = 'editor.action.trimTrailingWhitespace'; }
    constructor() {
        super({
            id: TrimTrailingWhitespaceAction.ID,
            label: nls.localize2('lines.trimTrailingWhitespace', "Trim Trailing Whitespace"),
            precondition: EditorContextKeys.writable,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 54 /* KeyCode.KeyX */),
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    run(_accessor, editor, args) {
        let cursors = [];
        if (args.reason === 'auto-save') {
            // See https://github.com/editorconfig/editorconfig-vscode/issues/47
            // It is very convenient for the editor config extension to invoke this action.
            // So, if we get a reason:'auto-save' passed in, let's preserve cursor positions.
            cursors = (editor.getSelections() || []).map(s => new Position(s.positionLineNumber, s.positionColumn));
        }
        const selection = editor.getSelection();
        if (selection === null) {
            return;
        }
        const config = _accessor.get(IConfigurationService);
        const model = editor.getModel();
        const trimInRegexAndStrings = config.getValue('files.trimTrailingWhitespaceInRegexAndStrings', { overrideIdentifier: model?.getLanguageId(), resource: model?.uri });
        const command = new TrimTrailingWhitespaceCommand(selection, cursors, trimInRegexAndStrings);
        editor.pushUndoStop();
        editor.executeCommands(this.id, [command]);
        editor.pushUndoStop();
    }
}
export class DeleteLinesAction extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.deleteLines',
            label: nls.localize2('lines.delete', "Delete Line"),
            precondition: EditorContextKeys.writable,
            kbOpts: {
                kbExpr: EditorContextKeys.textInputFocus,
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 41 /* KeyCode.KeyK */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            canTriggerInlineEdits: true,
        });
    }
    run(_accessor, editor) {
        if (!editor.hasModel()) {
            return;
        }
        const ops = this._getLinesToRemove(editor);
        const model = editor.getModel();
        if (model.getLineCount() === 1 && model.getLineMaxColumn(1) === 1) {
            // Model is empty
            return;
        }
        let linesDeleted = 0;
        const edits = [];
        const cursorState = [];
        for (let i = 0, len = ops.length; i < len; i++) {
            const op = ops[i];
            let startLineNumber = op.startLineNumber;
            let endLineNumber = op.endLineNumber;
            let startColumn = 1;
            let endColumn = model.getLineMaxColumn(endLineNumber);
            if (endLineNumber < model.getLineCount()) {
                endLineNumber += 1;
                endColumn = 1;
            }
            else if (startLineNumber > 1) {
                startLineNumber -= 1;
                startColumn = model.getLineMaxColumn(startLineNumber);
            }
            edits.push(EditOperation.replace(new Selection(startLineNumber, startColumn, endLineNumber, endColumn), ''));
            cursorState.push(new Selection(startLineNumber - linesDeleted, op.positionColumn, startLineNumber - linesDeleted, op.positionColumn));
            linesDeleted += (op.endLineNumber - op.startLineNumber + 1);
        }
        editor.pushUndoStop();
        editor.executeEdits(this.id, edits, cursorState);
        editor.revealAllCursors(true);
        editor.pushUndoStop();
    }
    _getLinesToRemove(editor) {
        // Construct delete operations
        const operations = editor.getSelections().map((s) => {
            let endLineNumber = s.endLineNumber;
            if (s.startLineNumber < s.endLineNumber && s.endColumn === 1) {
                endLineNumber -= 1;
            }
            return {
                startLineNumber: s.startLineNumber,
                selectionStartColumn: s.selectionStartColumn,
                endLineNumber: endLineNumber,
                positionColumn: s.positionColumn
            };
        });
        // Sort delete operations
        operations.sort((a, b) => {
            if (a.startLineNumber === b.startLineNumber) {
                return a.endLineNumber - b.endLineNumber;
            }
            return a.startLineNumber - b.startLineNumber;
        });
        // Merge delete operations which are adjacent or overlapping
        const mergedOperations = [];
        let previousOperation = operations[0];
        for (let i = 1; i < operations.length; i++) {
            if (previousOperation.endLineNumber + 1 >= operations[i].startLineNumber) {
                // Merge current operations into the previous one
                previousOperation.endLineNumber = operations[i].endLineNumber;
            }
            else {
                // Push previous operation
                mergedOperations.push(previousOperation);
                previousOperation = operations[i];
            }
        }
        // Push the last operation
        mergedOperations.push(previousOperation);
        return mergedOperations;
    }
}
export class IndentLinesAction extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.indentLines',
            label: nls.localize2('lines.indent', "Indent Line"),
            precondition: EditorContextKeys.writable,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: 2048 /* KeyMod.CtrlCmd */ | 94 /* KeyCode.BracketRight */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            canTriggerInlineEdits: true,
        });
    }
    run(_accessor, editor) {
        const viewModel = editor._getViewModel();
        if (!viewModel) {
            return;
        }
        editor.pushUndoStop();
        editor.executeCommands(this.id, TypeOperations.indent(viewModel.cursorConfig, editor.getModel(), editor.getSelections()));
        editor.pushUndoStop();
    }
}
class OutdentLinesAction extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.outdentLines',
            label: nls.localize2('lines.outdent', "Outdent Line"),
            precondition: EditorContextKeys.writable,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: 2048 /* KeyMod.CtrlCmd */ | 92 /* KeyCode.BracketLeft */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            canTriggerInlineEdits: true,
        });
    }
    run(_accessor, editor) {
        CoreEditingCommands.Outdent.runEditorCommand(_accessor, editor, null);
    }
}
export class InsertLineBeforeAction extends EditorAction {
    static { this.ID = 'editor.action.insertLineBefore'; }
    constructor() {
        super({
            id: InsertLineBeforeAction.ID,
            label: nls.localize2('lines.insertBefore', "Insert Line Above"),
            precondition: EditorContextKeys.writable,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 3 /* KeyCode.Enter */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            canTriggerInlineEdits: true,
        });
    }
    run(_accessor, editor) {
        const viewModel = editor._getViewModel();
        if (!viewModel) {
            return;
        }
        editor.pushUndoStop();
        editor.executeCommands(this.id, EnterOperation.lineInsertBefore(viewModel.cursorConfig, editor.getModel(), editor.getSelections()));
    }
}
export class InsertLineAfterAction extends EditorAction {
    static { this.ID = 'editor.action.insertLineAfter'; }
    constructor() {
        super({
            id: InsertLineAfterAction.ID,
            label: nls.localize2('lines.insertAfter', "Insert Line Below"),
            precondition: EditorContextKeys.writable,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: 2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            canTriggerInlineEdits: true,
        });
    }
    run(_accessor, editor) {
        const viewModel = editor._getViewModel();
        if (!viewModel) {
            return;
        }
        editor.pushUndoStop();
        editor.executeCommands(this.id, EnterOperation.lineInsertAfter(viewModel.cursorConfig, editor.getModel(), editor.getSelections()));
    }
}
export class AbstractDeleteAllToBoundaryAction extends EditorAction {
    run(_accessor, editor) {
        if (!editor.hasModel()) {
            return;
        }
        const primaryCursor = editor.getSelection();
        const rangesToDelete = this._getRangesToDelete(editor);
        // merge overlapping selections
        const effectiveRanges = [];
        for (let i = 0, count = rangesToDelete.length - 1; i < count; i++) {
            const range = rangesToDelete[i];
            const nextRange = rangesToDelete[i + 1];
            if (Range.intersectRanges(range, nextRange) === null) {
                effectiveRanges.push(range);
            }
            else {
                rangesToDelete[i + 1] = Range.plusRange(range, nextRange);
            }
        }
        effectiveRanges.push(rangesToDelete[rangesToDelete.length - 1]);
        const endCursorState = this._getEndCursorState(primaryCursor, effectiveRanges);
        const edits = effectiveRanges.map(range => {
            return EditOperation.replace(range, '');
        });
        editor.pushUndoStop();
        editor.executeEdits(this.id, edits, endCursorState);
        editor.pushUndoStop();
    }
}
export class DeleteAllLeftAction extends AbstractDeleteAllToBoundaryAction {
    constructor() {
        super({
            id: 'deleteAllLeft',
            label: nls.localize2('lines.deleteAllLeft', "Delete All Left"),
            precondition: EditorContextKeys.writable,
            kbOpts: {
                kbExpr: EditorContextKeys.textInputFocus,
                primary: 0,
                mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 1 /* KeyCode.Backspace */ },
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            canTriggerInlineEdits: true,
        });
    }
    _getEndCursorState(primaryCursor, rangesToDelete) {
        let endPrimaryCursor = null;
        const endCursorState = [];
        let deletedLines = 0;
        rangesToDelete.forEach(range => {
            let endCursor;
            if (range.endColumn === 1 && deletedLines > 0) {
                const newStartLine = range.startLineNumber - deletedLines;
                endCursor = new Selection(newStartLine, range.startColumn, newStartLine, range.startColumn);
            }
            else {
                endCursor = new Selection(range.startLineNumber, range.startColumn, range.startLineNumber, range.startColumn);
            }
            deletedLines += range.endLineNumber - range.startLineNumber;
            if (range.intersectRanges(primaryCursor)) {
                endPrimaryCursor = endCursor;
            }
            else {
                endCursorState.push(endCursor);
            }
        });
        if (endPrimaryCursor) {
            endCursorState.unshift(endPrimaryCursor);
        }
        return endCursorState;
    }
    _getRangesToDelete(editor) {
        const selections = editor.getSelections();
        if (selections === null) {
            return [];
        }
        let rangesToDelete = selections;
        const model = editor.getModel();
        if (model === null) {
            return [];
        }
        rangesToDelete.sort(Range.compareRangesUsingStarts);
        rangesToDelete = rangesToDelete.map(selection => {
            if (selection.isEmpty()) {
                if (selection.startColumn === 1) {
                    const deleteFromLine = Math.max(1, selection.startLineNumber - 1);
                    const deleteFromColumn = selection.startLineNumber === 1 ? 1 : model.getLineLength(deleteFromLine) + 1;
                    return new Range(deleteFromLine, deleteFromColumn, selection.startLineNumber, 1);
                }
                else {
                    return new Range(selection.startLineNumber, 1, selection.startLineNumber, selection.startColumn);
                }
            }
            else {
                return new Range(selection.startLineNumber, 1, selection.endLineNumber, selection.endColumn);
            }
        });
        return rangesToDelete;
    }
}
export class DeleteAllRightAction extends AbstractDeleteAllToBoundaryAction {
    constructor() {
        super({
            id: 'deleteAllRight',
            label: nls.localize2('lines.deleteAllRight', "Delete All Right"),
            precondition: EditorContextKeys.writable,
            kbOpts: {
                kbExpr: EditorContextKeys.textInputFocus,
                primary: 0,
                mac: { primary: 256 /* KeyMod.WinCtrl */ | 41 /* KeyCode.KeyK */, secondary: [2048 /* KeyMod.CtrlCmd */ | 20 /* KeyCode.Delete */] },
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            canTriggerInlineEdits: true,
        });
    }
    _getEndCursorState(primaryCursor, rangesToDelete) {
        let endPrimaryCursor = null;
        const endCursorState = [];
        for (let i = 0, len = rangesToDelete.length, offset = 0; i < len; i++) {
            const range = rangesToDelete[i];
            const endCursor = new Selection(range.startLineNumber - offset, range.startColumn, range.startLineNumber - offset, range.startColumn);
            if (range.intersectRanges(primaryCursor)) {
                endPrimaryCursor = endCursor;
            }
            else {
                endCursorState.push(endCursor);
            }
        }
        if (endPrimaryCursor) {
            endCursorState.unshift(endPrimaryCursor);
        }
        return endCursorState;
    }
    _getRangesToDelete(editor) {
        const model = editor.getModel();
        if (model === null) {
            return [];
        }
        const selections = editor.getSelections();
        if (selections === null) {
            return [];
        }
        const rangesToDelete = selections.map((sel) => {
            if (sel.isEmpty()) {
                const maxColumn = model.getLineMaxColumn(sel.startLineNumber);
                if (sel.startColumn === maxColumn) {
                    return new Range(sel.startLineNumber, sel.startColumn, sel.startLineNumber + 1, 1);
                }
                else {
                    return new Range(sel.startLineNumber, sel.startColumn, sel.startLineNumber, maxColumn);
                }
            }
            return sel;
        });
        rangesToDelete.sort(Range.compareRangesUsingStarts);
        return rangesToDelete;
    }
}
export class JoinLinesAction extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.joinLines',
            label: nls.localize2('lines.joinLines', "Join Lines"),
            precondition: EditorContextKeys.writable,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: 0,
                mac: { primary: 256 /* KeyMod.WinCtrl */ | 40 /* KeyCode.KeyJ */ },
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            canTriggerInlineEdits: true,
        });
    }
    run(_accessor, editor) {
        const selections = editor.getSelections();
        if (selections === null) {
            return;
        }
        let primaryCursor = editor.getSelection();
        if (primaryCursor === null) {
            return;
        }
        selections.sort(Range.compareRangesUsingStarts);
        const reducedSelections = [];
        const lastSelection = selections.reduce((previousValue, currentValue) => {
            if (previousValue.isEmpty()) {
                if (previousValue.endLineNumber === currentValue.startLineNumber) {
                    if (primaryCursor.equalsSelection(previousValue)) {
                        primaryCursor = currentValue;
                    }
                    return currentValue;
                }
                if (currentValue.startLineNumber > previousValue.endLineNumber + 1) {
                    reducedSelections.push(previousValue);
                    return currentValue;
                }
                else {
                    return new Selection(previousValue.startLineNumber, previousValue.startColumn, currentValue.endLineNumber, currentValue.endColumn);
                }
            }
            else {
                if (currentValue.startLineNumber > previousValue.endLineNumber) {
                    reducedSelections.push(previousValue);
                    return currentValue;
                }
                else {
                    return new Selection(previousValue.startLineNumber, previousValue.startColumn, currentValue.endLineNumber, currentValue.endColumn);
                }
            }
        });
        reducedSelections.push(lastSelection);
        const model = editor.getModel();
        if (model === null) {
            return;
        }
        const edits = [];
        const endCursorState = [];
        let endPrimaryCursor = primaryCursor;
        let lineOffset = 0;
        for (let i = 0, len = reducedSelections.length; i < len; i++) {
            const selection = reducedSelections[i];
            const startLineNumber = selection.startLineNumber;
            const startColumn = 1;
            let columnDeltaOffset = 0;
            let endLineNumber, endColumn;
            const selectionEndPositionOffset = model.getLineLength(selection.endLineNumber) - selection.endColumn;
            if (selection.isEmpty() || selection.startLineNumber === selection.endLineNumber) {
                const position = selection.getStartPosition();
                if (position.lineNumber < model.getLineCount()) {
                    endLineNumber = startLineNumber + 1;
                    endColumn = model.getLineMaxColumn(endLineNumber);
                }
                else {
                    endLineNumber = position.lineNumber;
                    endColumn = model.getLineMaxColumn(position.lineNumber);
                }
            }
            else {
                endLineNumber = selection.endLineNumber;
                endColumn = model.getLineMaxColumn(endLineNumber);
            }
            let trimmedLinesContent = model.getLineContent(startLineNumber);
            for (let i = startLineNumber + 1; i <= endLineNumber; i++) {
                const lineText = model.getLineContent(i);
                const firstNonWhitespaceIdx = model.getLineFirstNonWhitespaceColumn(i);
                if (firstNonWhitespaceIdx >= 1) {
                    let insertSpace = true;
                    if (trimmedLinesContent === '') {
                        insertSpace = false;
                    }
                    if (insertSpace && (trimmedLinesContent.charAt(trimmedLinesContent.length - 1) === ' ' ||
                        trimmedLinesContent.charAt(trimmedLinesContent.length - 1) === '\t')) {
                        insertSpace = false;
                        trimmedLinesContent = trimmedLinesContent.replace(/[\s\uFEFF\xA0]+$/g, ' ');
                    }
                    const lineTextWithoutIndent = lineText.substr(firstNonWhitespaceIdx - 1);
                    trimmedLinesContent += (insertSpace ? ' ' : '') + lineTextWithoutIndent;
                    if (insertSpace) {
                        columnDeltaOffset = lineTextWithoutIndent.length + 1;
                    }
                    else {
                        columnDeltaOffset = lineTextWithoutIndent.length;
                    }
                }
                else {
                    columnDeltaOffset = 0;
                }
            }
            const deleteSelection = new Range(startLineNumber, startColumn, endLineNumber, endColumn);
            if (!deleteSelection.isEmpty()) {
                let resultSelection;
                if (selection.isEmpty()) {
                    edits.push(EditOperation.replace(deleteSelection, trimmedLinesContent));
                    resultSelection = new Selection(deleteSelection.startLineNumber - lineOffset, trimmedLinesContent.length - columnDeltaOffset + 1, startLineNumber - lineOffset, trimmedLinesContent.length - columnDeltaOffset + 1);
                }
                else {
                    if (selection.startLineNumber === selection.endLineNumber) {
                        edits.push(EditOperation.replace(deleteSelection, trimmedLinesContent));
                        resultSelection = new Selection(selection.startLineNumber - lineOffset, selection.startColumn, selection.endLineNumber - lineOffset, selection.endColumn);
                    }
                    else {
                        edits.push(EditOperation.replace(deleteSelection, trimmedLinesContent));
                        resultSelection = new Selection(selection.startLineNumber - lineOffset, selection.startColumn, selection.startLineNumber - lineOffset, trimmedLinesContent.length - selectionEndPositionOffset);
                    }
                }
                if (Range.intersectRanges(deleteSelection, primaryCursor) !== null) {
                    endPrimaryCursor = resultSelection;
                }
                else {
                    endCursorState.push(resultSelection);
                }
            }
            lineOffset += deleteSelection.endLineNumber - deleteSelection.startLineNumber;
        }
        endCursorState.unshift(endPrimaryCursor);
        editor.pushUndoStop();
        editor.executeEdits(this.id, edits, endCursorState);
        editor.pushUndoStop();
    }
}
export class TransposeAction extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.transpose',
            label: nls.localize2('editor.transpose', "Transpose Characters around the Cursor"),
            precondition: EditorContextKeys.writable,
            canTriggerInlineEdits: true,
        });
    }
    run(_accessor, editor) {
        const selections = editor.getSelections();
        if (selections === null) {
            return;
        }
        const model = editor.getModel();
        if (model === null) {
            return;
        }
        const commands = [];
        for (let i = 0, len = selections.length; i < len; i++) {
            const selection = selections[i];
            if (!selection.isEmpty()) {
                continue;
            }
            const cursor = selection.getStartPosition();
            const maxColumn = model.getLineMaxColumn(cursor.lineNumber);
            if (cursor.column >= maxColumn) {
                if (cursor.lineNumber === model.getLineCount()) {
                    continue;
                }
                // The cursor is at the end of current line and current line is not empty
                // then we transpose the character before the cursor and the line break if there is any following line.
                const deleteSelection = new Range(cursor.lineNumber, Math.max(1, cursor.column - 1), cursor.lineNumber + 1, 1);
                const chars = model.getValueInRange(deleteSelection).split('').reverse().join('');
                commands.push(new ReplaceCommand(new Selection(cursor.lineNumber, Math.max(1, cursor.column - 1), cursor.lineNumber + 1, 1), chars));
            }
            else {
                const deleteSelection = new Range(cursor.lineNumber, Math.max(1, cursor.column - 1), cursor.lineNumber, cursor.column + 1);
                const chars = model.getValueInRange(deleteSelection).split('').reverse().join('');
                commands.push(new ReplaceCommandThatPreservesSelection(deleteSelection, chars, new Selection(cursor.lineNumber, cursor.column + 1, cursor.lineNumber, cursor.column + 1)));
            }
        }
        editor.pushUndoStop();
        editor.executeCommands(this.id, commands);
        editor.pushUndoStop();
    }
}
export class AbstractCaseAction extends EditorAction {
    run(_accessor, editor) {
        const selections = editor.getSelections();
        if (selections === null) {
            return;
        }
        const model = editor.getModel();
        if (model === null) {
            return;
        }
        const wordSeparators = editor.getOption(148 /* EditorOption.wordSeparators */);
        const textEdits = [];
        for (const selection of selections) {
            if (selection.isEmpty()) {
                const cursor = selection.getStartPosition();
                const word = editor.getConfiguredWordAtPosition(cursor);
                if (!word) {
                    continue;
                }
                const wordRange = new Range(cursor.lineNumber, word.startColumn, cursor.lineNumber, word.endColumn);
                const text = model.getValueInRange(wordRange);
                textEdits.push(EditOperation.replace(wordRange, this._modifyText(text, wordSeparators)));
            }
            else {
                const text = model.getValueInRange(selection);
                textEdits.push(EditOperation.replace(selection, this._modifyText(text, wordSeparators)));
            }
        }
        editor.pushUndoStop();
        editor.executeEdits(this.id, textEdits);
        editor.pushUndoStop();
    }
}
export class UpperCaseAction extends AbstractCaseAction {
    constructor() {
        super({
            id: 'editor.action.transformToUppercase',
            label: nls.localize2('editor.transformToUppercase', "Transform to Uppercase"),
            precondition: EditorContextKeys.writable,
            canTriggerInlineEdits: true,
        });
    }
    _modifyText(text, wordSeparators) {
        return text.toLocaleUpperCase();
    }
}
export class LowerCaseAction extends AbstractCaseAction {
    constructor() {
        super({
            id: 'editor.action.transformToLowercase',
            label: nls.localize2('editor.transformToLowercase', "Transform to Lowercase"),
            precondition: EditorContextKeys.writable,
            canTriggerInlineEdits: true
        });
    }
    _modifyText(text, wordSeparators) {
        return text.toLocaleLowerCase();
    }
}
class BackwardsCompatibleRegExp {
    constructor(_pattern, _flags) {
        this._pattern = _pattern;
        this._flags = _flags;
        this._actual = null;
        this._evaluated = false;
    }
    get() {
        if (!this._evaluated) {
            this._evaluated = true;
            try {
                this._actual = new RegExp(this._pattern, this._flags);
            }
            catch (err) {
                // this browser does not support this regular expression
            }
        }
        return this._actual;
    }
    isSupported() {
        return (this.get() !== null);
    }
}
export class TitleCaseAction extends AbstractCaseAction {
    static { this.titleBoundary = new BackwardsCompatibleRegExp('(^|[^\\p{L}\\p{N}\']|((^|\\P{L})\'))\\p{L}', 'gmu'); }
    constructor() {
        super({
            id: 'editor.action.transformToTitlecase',
            label: nls.localize2('editor.transformToTitlecase', "Transform to Title Case"),
            precondition: EditorContextKeys.writable,
            canTriggerInlineEdits: true
        });
    }
    _modifyText(text, wordSeparators) {
        const titleBoundary = TitleCaseAction.titleBoundary.get();
        if (!titleBoundary) {
            // cannot support this
            return text;
        }
        return text
            .toLocaleLowerCase()
            .replace(titleBoundary, (b) => b.toLocaleUpperCase());
    }
}
export class SnakeCaseAction extends AbstractCaseAction {
    static { this.caseBoundary = new BackwardsCompatibleRegExp('(\\p{Ll})(\\p{Lu})', 'gmu'); }
    static { this.singleLetters = new BackwardsCompatibleRegExp('(\\p{Lu}|\\p{N})(\\p{Lu})(\\p{Ll})', 'gmu'); }
    constructor() {
        super({
            id: 'editor.action.transformToSnakecase',
            label: nls.localize2('editor.transformToSnakecase', "Transform to Snake Case"),
            precondition: EditorContextKeys.writable,
            canTriggerInlineEdits: true,
        });
    }
    _modifyText(text, wordSeparators) {
        const caseBoundary = SnakeCaseAction.caseBoundary.get();
        const singleLetters = SnakeCaseAction.singleLetters.get();
        if (!caseBoundary || !singleLetters) {
            // cannot support this
            return text;
        }
        return (text
            .replace(caseBoundary, '$1_$2')
            .replace(singleLetters, '$1_$2$3')
            .toLocaleLowerCase());
    }
}
export class CamelCaseAction extends AbstractCaseAction {
    static { this.singleLineWordBoundary = new BackwardsCompatibleRegExp('[_\\s-]+', 'gm'); }
    static { this.multiLineWordBoundary = new BackwardsCompatibleRegExp('[_-]+', 'gm'); }
    static { this.validWordStart = new BackwardsCompatibleRegExp('^(\\p{Lu}[^\\p{Lu}])', 'gmu'); }
    constructor() {
        super({
            id: 'editor.action.transformToCamelcase',
            label: nls.localize2('editor.transformToCamelcase', "Transform to Camel Case"),
            precondition: EditorContextKeys.writable,
            canTriggerInlineEdits: true
        });
    }
    _modifyText(text, wordSeparators) {
        const wordBoundary = /\r\n|\r|\n/.test(text) ? CamelCaseAction.multiLineWordBoundary.get() : CamelCaseAction.singleLineWordBoundary.get();
        const validWordStart = CamelCaseAction.validWordStart.get();
        if (!wordBoundary || !validWordStart) {
            // cannot support this
            return text;
        }
        const words = text.split(wordBoundary);
        const firstWord = words.shift()?.replace(validWordStart, (start) => start.toLocaleLowerCase());
        return firstWord + words.map((word) => word.substring(0, 1).toLocaleUpperCase() + word.substring(1))
            .join('');
    }
}
export class PascalCaseAction extends AbstractCaseAction {
    static { this.wordBoundary = new BackwardsCompatibleRegExp('[_ \\t-]', 'gm'); }
    static { this.wordBoundaryToMaintain = new BackwardsCompatibleRegExp('(?<=\\.)', 'gm'); }
    static { this.upperCaseWordMatcher = new BackwardsCompatibleRegExp('^\\p{Lu}+$', 'mu'); }
    constructor() {
        super({
            id: 'editor.action.transformToPascalcase',
            label: nls.localize2('editor.transformToPascalcase', "Transform to Pascal Case"),
            precondition: EditorContextKeys.writable,
            canTriggerInlineEdits: true,
        });
    }
    _modifyText(text, wordSeparators) {
        const wordBoundary = PascalCaseAction.wordBoundary.get();
        const wordBoundaryToMaintain = PascalCaseAction.wordBoundaryToMaintain.get();
        const upperCaseWordMatcher = PascalCaseAction.upperCaseWordMatcher.get();
        if (!wordBoundary || !wordBoundaryToMaintain || !upperCaseWordMatcher) {
            // cannot support this
            return text;
        }
        const wordsWithMaintainBoundaries = text.split(wordBoundaryToMaintain);
        const words = wordsWithMaintainBoundaries.map(word => word.split(wordBoundary)).flat();
        return words.map(word => {
            const normalizedWord = word.charAt(0).toLocaleUpperCase() + word.slice(1);
            const isAllCaps = normalizedWord.length > 1 && upperCaseWordMatcher.test(normalizedWord);
            if (isAllCaps) {
                return normalizedWord.charAt(0) + normalizedWord.slice(1).toLocaleLowerCase();
            }
            return normalizedWord;
        }).join('');
    }
}
export class KebabCaseAction extends AbstractCaseAction {
    static isSupported() {
        const areAllRegexpsSupported = [
            this.caseBoundary,
            this.singleLetters,
            this.underscoreBoundary,
        ].every((regexp) => regexp.isSupported());
        return areAllRegexpsSupported;
    }
    static { this.caseBoundary = new BackwardsCompatibleRegExp('(\\p{Ll})(\\p{Lu})', 'gmu'); }
    static { this.singleLetters = new BackwardsCompatibleRegExp('(\\p{Lu}|\\p{N})(\\p{Lu}\\p{Ll})', 'gmu'); }
    static { this.underscoreBoundary = new BackwardsCompatibleRegExp('(\\S)(_)(\\S)', 'gm'); }
    constructor() {
        super({
            id: 'editor.action.transformToKebabcase',
            label: nls.localize2('editor.transformToKebabcase', 'Transform to Kebab Case'),
            precondition: EditorContextKeys.writable,
            canTriggerInlineEdits: true,
        });
    }
    _modifyText(text, _) {
        const caseBoundary = KebabCaseAction.caseBoundary.get();
        const singleLetters = KebabCaseAction.singleLetters.get();
        const underscoreBoundary = KebabCaseAction.underscoreBoundary.get();
        if (!caseBoundary || !singleLetters || !underscoreBoundary) {
            // one or more regexps aren't supported
            return text;
        }
        return text
            .replace(underscoreBoundary, '$1-$3')
            .replace(caseBoundary, '$1-$2')
            .replace(singleLetters, '$1-$2')
            .toLocaleLowerCase();
    }
}
registerEditorAction(CopyLinesUpAction);
registerEditorAction(CopyLinesDownAction);
registerEditorAction(DuplicateSelectionAction);
registerEditorAction(MoveLinesUpAction);
registerEditorAction(MoveLinesDownAction);
registerEditorAction(SortLinesAscendingAction);
registerEditorAction(SortLinesDescendingAction);
registerEditorAction(DeleteDuplicateLinesAction);
registerEditorAction(TrimTrailingWhitespaceAction);
registerEditorAction(DeleteLinesAction);
registerEditorAction(IndentLinesAction);
registerEditorAction(OutdentLinesAction);
registerEditorAction(InsertLineBeforeAction);
registerEditorAction(InsertLineAfterAction);
registerEditorAction(DeleteAllLeftAction);
registerEditorAction(DeleteAllRightAction);
registerEditorAction(JoinLinesAction);
registerEditorAction(TransposeAction);
registerEditorAction(UpperCaseAction);
registerEditorAction(LowerCaseAction);
registerEditorAction(ReverseLinesAction);
if (SnakeCaseAction.caseBoundary.isSupported() && SnakeCaseAction.singleLetters.isSupported()) {
    registerEditorAction(SnakeCaseAction);
}
if (CamelCaseAction.singleLineWordBoundary.isSupported() && CamelCaseAction.multiLineWordBoundary.isSupported()) {
    registerEditorAction(CamelCaseAction);
}
if (PascalCaseAction.wordBoundary.isSupported()) {
    registerEditorAction(PascalCaseAction);
}
if (TitleCaseAction.titleBoundary.isSupported()) {
    registerEditorAction(TitleCaseAction);
}
if (KebabCaseAction.isSupported()) {
    registerEditorAction(KebabCaseAction);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGluZXNPcGVyYXRpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvbGluZXNPcGVyYXRpb25zL2Jyb3dzZXIvbGluZXNPcGVyYXRpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQW1CLE1BQU0scUNBQXFDLENBQUM7QUFDaEYsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDeEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFbkcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFdkUsT0FBTyxFQUFFLFlBQVksRUFBa0Isb0JBQW9CLEVBQW9CLE1BQU0sc0NBQXNDLENBQUM7QUFDNUgsT0FBTyxFQUFFLGNBQWMsRUFBRSxvQ0FBb0MsRUFBRSw2QkFBNkIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ2pKLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBRTFHLE9BQU8sRUFBRSxhQUFhLEVBQXdCLE1BQU0sdUNBQXVDLENBQUM7QUFDNUYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDOUQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUVoRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6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