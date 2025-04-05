/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { CoreEditingCommands } from '../../../browser/coreCommands.js';
import { IActiveCodeEditor, ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorAction, IActionOptions, registerEditorAction, ServicesAccessor } from '../../../browser/editorExtensions.js';
import { ReplaceCommand, ReplaceCommandThatPreservesSelection, ReplaceCommandThatSelectsText } from '../../../common/commands/replaceCommand.js';
import { TrimTrailingWhitespaceCommand } from '../../../common/commands/trimTrailingWhitespaceCommand.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { TypeOperations } from '../../../common/cursor/cursorTypeOperations.js';
import { EnterOperation } from '../../../common/cursor/cursorTypeEditOperations.js';
import { EditOperation, ISingleEditOperation } from '../../../common/core/editOperation.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { ICommand } from '../../../common/editorCommon.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { ITextModel } from '../../../common/model.js';
import { CopyLinesCommand } from './copyLinesCommand.js';
import { MoveLinesCommand } from './moveLinesCommand.js';
import { SortLinesCommand } from './sortLinesCommand.js';
import * as nls from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

// copy lines

abstract class AbstractCopyLinesAction extends EditorAction {

	private readonly down: boolean;

	constructor(down: boolean, opts: IActionOptions) {
		super(opts);
		this.down = down;
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
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
				} else {
					// curr wins
					prev.ignore = true;
					prev = curr;
				}
			}
		}

		const commands: ICommand[] = [];
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
				primary: KeyMod.Alt | KeyMod.Shift | KeyCode.UpArrow,
				linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.UpArrow },
				weight: KeybindingWeight.EditorContrib
			},
			menuOpts: {
				menuId: MenuId.MenubarSelectionMenu,
				group: '2_line',
				title: nls.localize({ key: 'miCopyLinesUp', comment: ['&& denotes a mnemonic'] }, "&&Copy Line Up"),
				order: 1
			}
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
				primary: KeyMod.Alt | KeyMod.Shift | KeyCode.DownArrow,
				linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.DownArrow },
				weight: KeybindingWeight.EditorContrib
			},
			menuOpts: {
				menuId: MenuId.MenubarSelectionMenu,
				group: '2_line',
				title: nls.localize({ key: 'miCopyLinesDown', comment: ['&& denotes a mnemonic'] }, "Co&&py Line Down"),
				order: 2
			}
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
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor, args: any): void {
		if (!editor.hasModel()) {
			return;
		}

		const commands: ICommand[] = [];
		const selections = editor.getSelections();
		const model = editor.getModel();

		for (const selection of selections) {
			if (selection.isEmpty()) {
				commands.push(new CopyLinesCommand(selection, true));
			} else {
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

abstract class AbstractMoveLinesAction extends EditorAction {

	private readonly down: boolean;

	constructor(down: boolean, opts: IActionOptions) {
		super(opts);
		this.down = down;
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const languageConfigurationService = accessor.get(ILanguageConfigurationService);

		const commands: ICommand[] = [];
		const selections = editor.getSelections() || [];
		const autoIndent = editor.getOption(EditorOption.autoIndent);

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
				primary: KeyMod.Alt | KeyCode.UpArrow,
				linux: { primary: KeyMod.Alt | KeyCode.UpArrow },
				weight: KeybindingWeight.EditorContrib
			},
			menuOpts: {
				menuId: MenuId.MenubarSelectionMenu,
				group: '2_line',
				title: nls.localize({ key: 'miMoveLinesUp', comment: ['&& denotes a mnemonic'] }, "Mo&&ve Line Up"),
				order: 3
			}
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
				primary: KeyMod.Alt | KeyCode.DownArrow,
				linux: { primary: KeyMod.Alt | KeyCode.DownArrow },
				weight: KeybindingWeight.EditorContrib
			},
			menuOpts: {
				menuId: MenuId.MenubarSelectionMenu,
				group: '2_line',
				title: nls.localize({ key: 'miMoveLinesDown', comment: ['&& denotes a mnemonic'] }, "Move &&Line Down"),
				order: 4
			}
		});
	}
}

export abstract class AbstractSortLinesAction extends EditorAction {
	private readonly descending: boolean;

	constructor(descending: boolean, opts: IActionOptions) {
		super(opts);
		this.descending = descending;
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		if (!editor.hasModel()) {
			return;
		}

		const model = editor.getModel();
		let selections = editor.getSelections();
		if (selections.length === 1 && selections[0].isEmpty()) {
			// Apply to whole document.
			selections = [new Selection(1, 1, model.getLineCount(), model.getLineMaxColumn(model.getLineCount()))];
		}

		for (const selection of selections) {
			if (!SortLinesCommand.canRun(editor.getModel(), selection, this.descending)) {
				return;
			}
		}

		const commands: ICommand[] = [];
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
			precondition: EditorContextKeys.writable
		});
	}
}

export class SortLinesDescendingAction extends AbstractSortLinesAction {
	constructor() {
		super(true, {
			id: 'editor.action.sortLinesDescending',
			label: nls.localize2('lines.sortDescending', "Sort Lines Descending"),
			precondition: EditorContextKeys.writable
		});
	}
}

export class DeleteDuplicateLinesAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.removeDuplicateLines',
			label: nls.localize2('lines.deleteDuplicates', "Delete Duplicate Lines"),
			precondition: EditorContextKeys.writable
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		if (!editor.hasModel()) {
			return;
		}

		const model: ITextModel = editor.getModel();
		if (model.getLineCount() === 1 && model.getLineMaxColumn(1) === 1) {
			return;
		}

		const edits: ISingleEditOperation[] = [];
		const endCursorState: Selection[] = [];

		let linesDeleted = 0;
		let updateSelection = true;

		let selections = editor.getSelections();
		if (selections.length === 1 && selections[0].isEmpty()) {
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


			const selectionToReplace = new Selection(
				selection.startLineNumber,
				1,
				selection.endLineNumber,
				model.getLineMaxColumn(selection.endLineNumber)
			);

			const adjustedSelectionStart = selection.startLineNumber - linesDeleted;
			const finalSelection = new Selection(
				adjustedSelectionStart,
				1,
				adjustedSelectionStart + lines.length - 1,
				lines[lines.length - 1].length
			);

			edits.push(EditOperation.replace(selectionToReplace, lines.join('\n')));
			endCursorState.push(finalSelection);

			linesDeleted += (selection.endLineNumber - selection.startLineNumber + 1) - lines.length;
		}

		editor.pushUndoStop();
		editor.executeEdits(this.id, edits, updateSelection ? endCursorState : undefined);
		editor.pushUndoStop();
	}
}

export class TrimTrailingWhitespaceAction extends EditorAction {

	public static readonly ID = 'editor.action.trimTrailingWhitespace';

	constructor() {
		super({
			id: TrimTrailingWhitespaceAction.ID,
			label: nls.localize2('lines.trimTrailingWhitespace', "Trim Trailing Whitespace"),
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyX),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor, args: any): void {

		let cursors: Position[] = [];
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
		const trimInRegexAndStrings = config.getValue<boolean>('files.trimTrailingWhitespaceInRegexAndStrings', { overrideIdentifier: model?.getLanguageId(), resource: model?.uri });

		const command = new TrimTrailingWhitespaceCommand(selection, cursors, trimInRegexAndStrings);

		editor.pushUndoStop();
		editor.executeCommands(this.id, [command]);
		editor.pushUndoStop();
	}
}

// delete lines

interface IDeleteLinesOperation {
	startLineNumber: number;
	selectionStartColumn: number;
	endLineNumber: number;
	positionColumn: number;
}

export class DeleteLinesAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.deleteLines',
			label: nls.localize2('lines.delete', "Delete Line"),
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyK,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		if (!editor.hasModel()) {
			return;
		}

		const ops = this._getLinesToRemove(editor);

		const model: ITextModel = editor.getModel();
		if (model.getLineCount() === 1 && model.getLineMaxColumn(1) === 1) {
			// Model is empty
			return;
		}

		let linesDeleted = 0;
		const edits: ISingleEditOperation[] = [];
		const cursorState: Selection[] = [];
		for (let i = 0, len = ops.length; i < len; i++) {
			const op = ops[i];

			let startLineNumber = op.startLineNumber;
			let endLineNumber = op.endLineNumber;

			let startColumn = 1;
			let endColumn = model.getLineMaxColumn(endLineNumber);
			if (endLineNumber < model.getLineCount()) {
				endLineNumber += 1;
				endColumn = 1;
			} else if (startLineNumber > 1) {
				startLineNumber -= 1;
				startColumn = model.getLineMaxColumn(startLineNumber);
			}

			edits.push(EditOperation.replace(new Selection(startLineNumber, startColumn, endLineNumber, endColumn), ''));
			cursorState.push(new Selection(startLineNumber - linesDeleted, op.positionColumn, startLineNumber - linesDeleted, op.positionColumn));
			linesDeleted += (op.endLineNumber - op.startLineNumber + 1);
		}

		editor.pushUndoStop();
		editor.executeEdits(this.id, edits, cursorState);
		editor.pushUndoStop();
	}

	private _getLinesToRemove(editor: IActiveCodeEditor): IDeleteLinesOperation[] {
		// Construct delete operations
		const operations: IDeleteLinesOperation[] = editor.getSelections().map((s) => {

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
		const mergedOperations: IDeleteLinesOperation[] = [];
		let previousOperation = operations[0];
		for (let i = 1; i < operations.length; i++) {
			if (previousOperation.endLineNumber + 1 >= operations[i].startLineNumber) {
				// Merge current operations into the previous one
				previousOperation.endLineNumber = operations[i].endLineNumber;
			} else {
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
				primary: KeyMod.CtrlCmd | KeyCode.BracketRight,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
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
				primary: KeyMod.CtrlCmd | KeyCode.BracketLeft,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		CoreEditingCommands.Outdent.runEditorCommand(_accessor, editor, null);
	}
}

export class InsertLineBeforeAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.insertLineBefore',
			label: nls.localize2('lines.insertBefore', "Insert Line Above"),
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		const viewModel = editor._getViewModel();
		if (!viewModel) {
			return;
		}
		editor.pushUndoStop();
		editor.executeCommands(this.id, EnterOperation.lineInsertBefore(viewModel.cursorConfig, editor.getModel(), editor.getSelections()));
	}
}

export class InsertLineAfterAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.insertLineAfter',
			label: nls.localize2('lines.insertAfter', "Insert Line Below"),
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		const viewModel = editor._getViewModel();
		if (!viewModel) {
			return;
		}
		editor.pushUndoStop();
		editor.executeCommands(this.id, EnterOperation.lineInsertAfter(viewModel.cursorConfig, editor.getModel(), editor.getSelections()));
	}
}

export abstract class AbstractDeleteAllToBoundaryAction extends EditorAction {
	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		if (!editor.hasModel()) {
			return;
		}
		const primaryCursor = editor.getSelection();

		const rangesToDelete = this._getRangesToDelete(editor);
		// merge overlapping selections
		const effectiveRanges: Range[] = [];

		for (let i = 0, count = rangesToDelete.length - 1; i < count; i++) {
			const range = rangesToDelete[i];
			const nextRange = rangesToDelete[i + 1];

			if (Range.intersectRanges(range, nextRange) === null) {
				effectiveRanges.push(range);
			} else {
				rangesToDelete[i + 1] = Range.plusRange(range, nextRange);
			}
		}

		effectiveRanges.push(rangesToDelete[rangesToDelete.length - 1]);

		const endCursorState = this._getEndCursorState(primaryCursor, effectiveRanges);

		const edits: ISingleEditOperation[] = effectiveRanges.map(range => {
			return EditOperation.replace(range, '');
		});

		editor.pushUndoStop();
		editor.executeEdits(this.id, edits, endCursorState);
		editor.pushUndoStop();
	}

	/**
	 * Compute the cursor state after the edit operations were applied.
	 */
	protected abstract _getEndCursorState(primaryCursor: Range, rangesToDelete: Range[]): Selection[];

	protected abstract _getRangesToDelete(editor: IActiveCodeEditor): Range[];
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
				mac: { primary: KeyMod.CtrlCmd | KeyCode.Backspace },
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	protected _getEndCursorState(primaryCursor: Range, rangesToDelete: Range[]): Selection[] {
		let endPrimaryCursor: Selection | null = null;
		const endCursorState: Selection[] = [];
		let deletedLines = 0;

		rangesToDelete.forEach(range => {
			let endCursor;
			if (range.endColumn === 1 && deletedLines > 0) {
				const newStartLine = range.startLineNumber - deletedLines;
				endCursor = new Selection(newStartLine, range.startColumn, newStartLine, range.startColumn);
			} else {
				endCursor = new Selection(range.startLineNumber, range.startColumn, range.startLineNumber, range.startColumn);
			}

			deletedLines += range.endLineNumber - range.startLineNumber;

			if (range.intersectRanges(primaryCursor)) {
				endPrimaryCursor = endCursor;
			} else {
				endCursorState.push(endCursor);
			}
		});

		if (endPrimaryCursor) {
			endCursorState.unshift(endPrimaryCursor);
		}

		return endCursorState;
	}

	protected _getRangesToDelete(editor: IActiveCodeEditor): Range[] {
		const selections = editor.getSelections();
		if (selections === null) {
			return [];
		}

		let rangesToDelete: Range[] = selections;
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
				} else {
					return new Range(selection.startLineNumber, 1, selection.startLineNumber, selection.startColumn);
				}
			} else {
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
				mac: { primary: KeyMod.WinCtrl | KeyCode.KeyK, secondary: [KeyMod.CtrlCmd | KeyCode.Delete] },
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	protected _getEndCursorState(primaryCursor: Range, rangesToDelete: Range[]): Selection[] {
		let endPrimaryCursor: Selection | null = null;
		const endCursorState: Selection[] = [];
		for (let i = 0, len = rangesToDelete.length, offset = 0; i < len; i++) {
			const range = rangesToDelete[i];
			const endCursor = new Selection(range.startLineNumber - offset, range.startColumn, range.startLineNumber - offset, range.startColumn);

			if (range.intersectRanges(primaryCursor)) {
				endPrimaryCursor = endCursor;
			} else {
				endCursorState.push(endCursor);
			}
		}

		if (endPrimaryCursor) {
			endCursorState.unshift(endPrimaryCursor);
		}

		return endCursorState;
	}

	protected _getRangesToDelete(editor: IActiveCodeEditor): Range[] {
		const model = editor.getModel();
		if (model === null) {
			return [];
		}

		const selections = editor.getSelections();

		if (selections === null) {
			return [];
		}

		const rangesToDelete: Range[] = selections.map((sel) => {
			if (sel.isEmpty()) {
				const maxColumn = model.getLineMaxColumn(sel.startLineNumber);

				if (sel.startColumn === maxColumn) {
					return new Range(sel.startLineNumber, sel.startColumn, sel.startLineNumber + 1, 1);
				} else {
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
				mac: { primary: KeyMod.WinCtrl | KeyCode.KeyJ },
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		const selections = editor.getSelections();
		if (selections === null) {
			return;
		}

		let primaryCursor = editor.getSelection();
		if (primaryCursor === null) {
			return;
		}

		selections.sort(Range.compareRangesUsingStarts);
		const reducedSelections: Selection[] = [];

		const lastSelection = selections.reduce((previousValue, currentValue) => {
			if (previousValue.isEmpty()) {
				if (previousValue.endLineNumber === currentValue.startLineNumber) {
					if (primaryCursor!.equalsSelection(previousValue)) {
						primaryCursor = currentValue;
					}
					return currentValue;
				}

				if (currentValue.startLineNumber > previousValue.endLineNumber + 1) {
					reducedSelections.push(previousValue);
					return currentValue;
				} else {
					return new Selection(previousValue.startLineNumber, previousValue.startColumn, currentValue.endLineNumber, currentValue.endColumn);
				}
			} else {
				if (currentValue.startLineNumber > previousValue.endLineNumber) {
					reducedSelections.push(previousValue);
					return currentValue;
				} else {
					return new Selection(previousValue.startLineNumber, previousValue.startColumn, currentValue.endLineNumber, currentValue.endColumn);
				}
			}
		});

		reducedSelections.push(lastSelection);

		const model = editor.getModel();
		if (model === null) {
			return;
		}

		const edits: ISingleEditOperation[] = [];
		const endCursorState: Selection[] = [];
		let endPrimaryCursor = primaryCursor;
		let lineOffset = 0;

		for (let i = 0, len = reducedSelections.length; i < len; i++) {
			const selection = reducedSelections[i];
			const startLineNumber = selection.startLineNumber;
			const startColumn = 1;
			let columnDeltaOffset = 0;
			let endLineNumber: number,
				endColumn: number;

			const selectionEndPositionOffset = model.getLineLength(selection.endLineNumber) - selection.endColumn;

			if (selection.isEmpty() || selection.startLineNumber === selection.endLineNumber) {
				const position = selection.getStartPosition();
				if (position.lineNumber < model.getLineCount()) {
					endLineNumber = startLineNumber + 1;
					endColumn = model.getLineMaxColumn(endLineNumber);
				} else {
					endLineNumber = position.lineNumber;
					endColumn = model.getLineMaxColumn(position.lineNumber);
				}
			} else {
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
					} else {
						columnDeltaOffset = lineTextWithoutIndent.length;
					}
				} else {
					columnDeltaOffset = 0;
				}
			}

			const deleteSelection = new Range(startLineNumber, startColumn, endLineNumber, endColumn);

			if (!deleteSelection.isEmpty()) {
				let resultSelection: Selection;

				if (selection.isEmpty()) {
					edits.push(EditOperation.replace(deleteSelection, trimmedLinesContent));
					resultSelection = new Selection(deleteSelection.startLineNumber - lineOffset, trimmedLinesContent.length - columnDeltaOffset + 1, startLineNumber - lineOffset, trimmedLinesContent.length - columnDeltaOffset + 1);
				} else {
					if (selection.startLineNumber === selection.endLineNumber) {
						edits.push(EditOperation.replace(deleteSelection, trimmedLinesContent));
						resultSelection = new Selection(selection.startLineNumber - lineOffset, selection.startColumn,
							selection.endLineNumber - lineOffset, selection.endColumn);
					} else {
						edits.push(EditOperation.replace(deleteSelection, trimmedLinesContent));
						resultSelection = new Selection(selection.startLineNumber - lineOffset, selection.startColumn,
							selection.startLineNumber - lineOffset, trimmedLinesContent.length - selectionEndPositionOffset);
					}
				}

				if (Range.intersectRanges(deleteSelection, primaryCursor) !== null) {
					endPrimaryCursor = resultSelection;
				} else {
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
			precondition: EditorContextKeys.writable
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		const selections = editor.getSelections();
		if (selections === null) {
			return;
		}

		const model = editor.getModel();
		if (model === null) {
			return;
		}

		const commands: ICommand[] = [];

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
			} else {
				const deleteSelection = new Range(cursor.lineNumber, Math.max(1, cursor.column - 1), cursor.lineNumber, cursor.column + 1);
				const chars = model.getValueInRange(deleteSelection).split('').reverse().join('');
				commands.push(new ReplaceCommandThatPreservesSelection(deleteSelection, chars,
					new Selection(cursor.lineNumber, cursor.column + 1, cursor.lineNumber, cursor.column + 1)));
			}
		}

		editor.pushUndoStop();
		editor.executeCommands(this.id, commands);
		editor.pushUndoStop();
	}
}

export abstract class AbstractCaseAction extends EditorAction {
	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		const selections = editor.getSelections();
		if (selections === null) {
			return;
		}

		const model = editor.getModel();
		if (model === null) {
			return;
		}

		const wordSeparators = editor.getOption(EditorOption.wordSeparators);
		const textEdits: ISingleEditOperation[] = [];

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
			} else {
				const text = model.getValueInRange(selection);
				textEdits.push(EditOperation.replace(selection, this._modifyText(text, wordSeparators)));
			}
		}

		editor.pushUndoStop();
		editor.executeEdits(this.id, textEdits);
		editor.pushUndoStop();
	}

	protected abstract _modifyText(text: string, wordSeparators: string): string;
}

export class UpperCaseAction extends AbstractCaseAction {
	constructor() {
		super({
			id: 'editor.action.transformToUppercase',
			label: nls.localize2('editor.transformToUppercase', "Transform to Uppercase"),
			precondition: EditorContextKeys.writable
		});
	}

	protected _modifyText(text: string, wordSeparators: string): string {
		return text.toLocaleUpperCase();
	}
}

export class LowerCaseAction extends AbstractCaseAction {
	constructor() {
		super({
			id: 'editor.action.transformToLowercase',
			label: nls.localize2('editor.transformToLowercase', "Transform to Lowercase"),
			precondition: EditorContextKeys.writable
		});
	}

	protected _modifyText(text: string, wordSeparators: string): string {
		return text.toLocaleLowerCase();
	}
}

class BackwardsCompatibleRegExp {

	private _actual: RegExp | null;
	private _evaluated: boolean;

	constructor(
		private readonly _pattern: string,
		private readonly _flags: string
	) {
		this._actual = null;
		this._evaluated = false;
	}

	public get(): RegExp | null {
		if (!this._evaluated) {
			this._evaluated = true;
			try {
				this._actual = new RegExp(this._pattern, this._flags);
			} catch (err) {
				// this browser does not support this regular expression
			}
		}
		return this._actual;
	}

	public isSupported(): boolean {
		return (this.get() !== null);
	}
}

export class TitleCaseAction extends AbstractCaseAction {

	public static titleBoundary = new BackwardsCompatibleRegExp('(^|[^\\p{L}\\p{N}\']|((^|\\P{L})\'))\\p{L}', 'gmu');

	constructor() {
		super({
			id: 'editor.action.transformToTitlecase',
			label: nls.localize2('editor.transformToTitlecase', "Transform to Title Case"),
			precondition: EditorContextKeys.writable
		});
	}

	protected _modifyText(text: string, wordSeparators: string): string {
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

	public static caseBoundary = new BackwardsCompatibleRegExp('(\\p{Ll})(\\p{Lu})', 'gmu');
	public static singleLetters = new BackwardsCompatibleRegExp('(\\p{Lu}|\\p{N})(\\p{Lu})(\\p{Ll})', 'gmu');

	constructor() {
		super({
			id: 'editor.action.transformToSnakecase',
			label: nls.localize2('editor.transformToSnakecase', "Transform to Snake Case"),
			precondition: EditorContextKeys.writable
		});
	}

	protected _modifyText(text: string, wordSeparators: string): string {
		const caseBoundary = SnakeCaseAction.caseBoundary.get();
		const singleLetters = SnakeCaseAction.singleLetters.get();
		if (!caseBoundary || !singleLetters) {
			// cannot support this
			return text;
		}
		return (text
			.replace(caseBoundary, '$1_$2')
			.replace(singleLetters, '$1_$2$3')
			.toLocaleLowerCase()
		);
	}
}

export class CamelCaseAction extends AbstractCaseAction {
	public static wordBoundary = new BackwardsCompatibleRegExp('[_\\s-]', 'gm');

	constructor() {
		super({
			id: 'editor.action.transformToCamelcase',
			label: nls.localize2('editor.transformToCamelcase', "Transform to Camel Case"),
			precondition: EditorContextKeys.writable
		});
	}

	protected _modifyText(text: string, wordSeparators: string): string {
		const wordBoundary = CamelCaseAction.wordBoundary.get();
		if (!wordBoundary) {
			// cannot support this
			return text;
		}
		const words = text.split(wordBoundary);
		const firstWord = words.shift();
		return firstWord + words.map((word: string) => word.substring(0, 1).toLocaleUpperCase() + word.substring(1))
			.join('');
	}
}

export class PascalCaseAction extends AbstractCaseAction {
	public static wordBoundary = new BackwardsCompatibleRegExp('[_\\s-]', 'gm');
	public static wordBoundaryToMaintain = new BackwardsCompatibleRegExp('(?<=\\.)', 'gm');

	constructor() {
		super({
			id: 'editor.action.transformToPascalcase',
			label: nls.localize2('editor.transformToPascalcase', "Transform to Pascal Case"),
			precondition: EditorContextKeys.writable
		});
	}

	protected _modifyText(text: string, wordSeparators: string): string {
		const wordBoundary = PascalCaseAction.wordBoundary.get();
		const wordBoundaryToMaintain = PascalCaseAction.wordBoundaryToMaintain.get();

		if (!wordBoundary || !wordBoundaryToMaintain) {
			// cannot support this
			return text;
		}

		const wordsWithMaintainBoundaries = text.split(wordBoundaryToMaintain);
		const words = wordsWithMaintainBoundaries.map((word: string) => word.split(wordBoundary)).flat();
		return words.map((word: string) => word.substring(0, 1).toLocaleUpperCase() + word.substring(1))
			.join('');
	}
}

export class KebabCaseAction extends AbstractCaseAction {

	public static isSupported(): boolean {
		const areAllRegexpsSupported = [
			this.caseBoundary,
			this.singleLetters,
			this.underscoreBoundary,
		].every((regexp) => regexp.isSupported());

		return areAllRegexpsSupported;
	}

	private static caseBoundary = new BackwardsCompatibleRegExp('(\\p{Ll})(\\p{Lu})', 'gmu');
	private static singleLetters = new BackwardsCompatibleRegExp('(\\p{Lu}|\\p{N})(\\p{Lu}\\p{Ll})', 'gmu');
	private static underscoreBoundary = new BackwardsCompatibleRegExp('(\\S)(_)(\\S)', 'gm');

	constructor() {
		super({
			id: 'editor.action.transformToKebabcase',
			label: nls.localize2('editor.transformToKebabcase', 'Transform to Kebab Case'),
			precondition: EditorContextKeys.writable
		});
	}

	protected _modifyText(text: string, _: string): string {
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

if (SnakeCaseAction.caseBoundary.isSupported() && SnakeCaseAction.singleLetters.isSupported()) {
	registerEditorAction(SnakeCaseAction);
}
if (CamelCaseAction.wordBoundary.isSupported()) {
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
