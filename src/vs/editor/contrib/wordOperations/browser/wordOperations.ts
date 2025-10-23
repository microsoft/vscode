/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorAction, EditorCommand, ICommandOptions, registerEditorAction, registerEditorCommand, ServicesAccessor } from '../../../browser/editorExtensions.js';
import { ReplaceCommand } from '../../../common/commands/replaceCommand.js';
import { EditorOption, EditorOptions } from '../../../common/config/editorOptions.js';
import { CursorState } from '../../../common/cursorCommon.js';
import { CursorChangeReason } from '../../../common/cursorEvents.js';
import { DeleteWordContext, WordNavigationType, WordOperations } from '../../../common/cursor/cursorWordOperations.js';
import { getMapForWordSeparators, WordCharacterClassifier } from '../../../common/core/wordCharacterClassifier.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { ScrollType } from '../../../common/editorCommon.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { ITextModel } from '../../../common/model.js';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';
import * as nls from '../../../../nls.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../platform/accessibility/common/accessibility.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IsWindowsContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';

export interface MoveWordOptions extends ICommandOptions {
	inSelectionMode: boolean;
	wordNavigationType: WordNavigationType;
}

export abstract class MoveWordCommand extends EditorCommand {

	private readonly _inSelectionMode: boolean;
	private readonly _wordNavigationType: WordNavigationType;

	constructor(opts: MoveWordOptions) {
		super(opts);
		this._inSelectionMode = opts.inSelectionMode;
		this._wordNavigationType = opts.wordNavigationType;
	}

	public runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, args: any): void {
		if (!editor.hasModel()) {
			return;
		}
		const wordSeparators = getMapForWordSeparators(editor.getOption(EditorOption.wordSeparators), editor.getOption(EditorOption.wordSegmenterLocales));
		const model = editor.getModel();
		const selections = editor.getSelections();
		const hasMulticursor = selections.length > 1;
		const result = selections.map((sel) => {
			const inPosition = new Position(sel.positionLineNumber, sel.positionColumn);
			const outPosition = this._move(wordSeparators, model, inPosition, this._wordNavigationType, hasMulticursor);
			return this._moveTo(sel, outPosition, this._inSelectionMode);
		});

		model.pushStackElement();
		editor._getViewModel().setCursorStates('moveWordCommand', CursorChangeReason.Explicit, result.map(r => CursorState.fromModelSelection(r)));
		if (result.length === 1) {
			const pos = new Position(result[0].positionLineNumber, result[0].positionColumn);
			editor.revealPosition(pos, ScrollType.Smooth);
		}
	}

	private _moveTo(from: Selection, to: Position, inSelectionMode: boolean): Selection {
		if (inSelectionMode) {
			// move just position
			return new Selection(
				from.selectionStartLineNumber,
				from.selectionStartColumn,
				to.lineNumber,
				to.column
			);
		} else {
			// move everything
			return new Selection(
				to.lineNumber,
				to.column,
				to.lineNumber,
				to.column
			);
		}
	}

	protected abstract _move(wordSeparators: WordCharacterClassifier, model: ITextModel, position: Position, wordNavigationType: WordNavigationType, hasMulticursor: boolean): Position;
}

export class WordLeftCommand extends MoveWordCommand {
	protected _move(wordSeparators: WordCharacterClassifier, model: ITextModel, position: Position, wordNavigationType: WordNavigationType, hasMulticursor: boolean): Position {
		return WordOperations.moveWordLeft(wordSeparators, model, position, wordNavigationType, hasMulticursor);
	}
}

export class WordRightCommand extends MoveWordCommand {
	protected _move(wordSeparators: WordCharacterClassifier, model: ITextModel, position: Position, wordNavigationType: WordNavigationType, hasMulticursor: boolean): Position {
		return WordOperations.moveWordRight(wordSeparators, model, position, wordNavigationType);
	}
}

export class CursorWordStartLeft extends WordLeftCommand {
	constructor() {
		super({
			inSelectionMode: false,
			wordNavigationType: WordNavigationType.WordStart,
			id: 'cursorWordStartLeft',
			precondition: undefined
		});
	}
}

export class CursorWordEndLeft extends WordLeftCommand {
	constructor() {
		super({
			inSelectionMode: false,
			wordNavigationType: WordNavigationType.WordEnd,
			id: 'cursorWordEndLeft',
			precondition: undefined
		});
	}
}

export class CursorWordLeft extends WordLeftCommand {
	constructor() {
		super({
			inSelectionMode: false,
			wordNavigationType: WordNavigationType.WordStartFast,
			id: 'cursorWordLeft',
			precondition: undefined,
			kbOpts: {
				kbExpr: ContextKeyExpr.and(EditorContextKeys.textInputFocus, ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext)?.negate()),
				primary: KeyMod.CtrlCmd | KeyCode.LeftArrow,
				mac: { primary: KeyMod.Alt | KeyCode.LeftArrow },
				weight: KeybindingWeight.EditorContrib
			}
		});
	}
}

export class CursorWordStartLeftSelect extends WordLeftCommand {
	constructor() {
		super({
			inSelectionMode: true,
			wordNavigationType: WordNavigationType.WordStart,
			id: 'cursorWordStartLeftSelect',
			precondition: undefined
		});
	}
}

export class CursorWordEndLeftSelect extends WordLeftCommand {
	constructor() {
		super({
			inSelectionMode: true,
			wordNavigationType: WordNavigationType.WordEnd,
			id: 'cursorWordEndLeftSelect',
			precondition: undefined
		});
	}
}

export class CursorWordLeftSelect extends WordLeftCommand {
	constructor() {
		super({
			inSelectionMode: true,
			wordNavigationType: WordNavigationType.WordStartFast,
			id: 'cursorWordLeftSelect',
			precondition: undefined,
			kbOpts: {
				kbExpr: ContextKeyExpr.and(EditorContextKeys.textInputFocus, ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext)?.negate()),
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow,
				mac: { primary: KeyMod.Alt | KeyMod.Shift | KeyCode.LeftArrow },
				weight: KeybindingWeight.EditorContrib
			}
		});
	}
}

// Accessibility navigation commands should only be enabled on windows since they are tuned to what NVDA expects
export class CursorWordAccessibilityLeft extends WordLeftCommand {
	constructor() {
		super({
			inSelectionMode: false,
			wordNavigationType: WordNavigationType.WordAccessibility,
			id: 'cursorWordAccessibilityLeft',
			precondition: undefined
		});
	}

	protected override _move(wordCharacterClassifier: WordCharacterClassifier, model: ITextModel, position: Position, wordNavigationType: WordNavigationType, hasMulticursor: boolean): Position {
		return super._move(getMapForWordSeparators(EditorOptions.wordSeparators.defaultValue, wordCharacterClassifier.intlSegmenterLocales), model, position, wordNavigationType, hasMulticursor);
	}
}

export class CursorWordAccessibilityLeftSelect extends WordLeftCommand {
	constructor() {
		super({
			inSelectionMode: true,
			wordNavigationType: WordNavigationType.WordAccessibility,
			id: 'cursorWordAccessibilityLeftSelect',
			precondition: undefined
		});
	}

	protected override _move(wordCharacterClassifier: WordCharacterClassifier, model: ITextModel, position: Position, wordNavigationType: WordNavigationType, hasMulticursor: boolean): Position {
		return super._move(getMapForWordSeparators(EditorOptions.wordSeparators.defaultValue, wordCharacterClassifier.intlSegmenterLocales), model, position, wordNavigationType, hasMulticursor);
	}
}

export class CursorWordStartRight extends WordRightCommand {
	constructor() {
		super({
			inSelectionMode: false,
			wordNavigationType: WordNavigationType.WordStart,
			id: 'cursorWordStartRight',
			precondition: undefined
		});
	}
}

export class CursorWordEndRight extends WordRightCommand {
	constructor() {
		super({
			inSelectionMode: false,
			wordNavigationType: WordNavigationType.WordEnd,
			id: 'cursorWordEndRight',
			precondition: undefined,
			kbOpts: {
				kbExpr: ContextKeyExpr.and(EditorContextKeys.textInputFocus, ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext)?.negate()),
				primary: KeyMod.CtrlCmd | KeyCode.RightArrow,
				mac: { primary: KeyMod.Alt | KeyCode.RightArrow },
				weight: KeybindingWeight.EditorContrib
			}
		});
	}
}

export class CursorWordRight extends WordRightCommand {
	constructor() {
		super({
			inSelectionMode: false,
			wordNavigationType: WordNavigationType.WordEnd,
			id: 'cursorWordRight',
			precondition: undefined
		});
	}
}

export class CursorWordStartRightSelect extends WordRightCommand {
	constructor() {
		super({
			inSelectionMode: true,
			wordNavigationType: WordNavigationType.WordStart,
			id: 'cursorWordStartRightSelect',
			precondition: undefined
		});
	}
}

export class CursorWordEndRightSelect extends WordRightCommand {
	constructor() {
		super({
			inSelectionMode: true,
			wordNavigationType: WordNavigationType.WordEnd,
			id: 'cursorWordEndRightSelect',
			precondition: undefined,
			kbOpts: {
				kbExpr: ContextKeyExpr.and(EditorContextKeys.textInputFocus, ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext)?.negate()),
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow,
				mac: { primary: KeyMod.Alt | KeyMod.Shift | KeyCode.RightArrow },
				weight: KeybindingWeight.EditorContrib
			}
		});
	}
}

export class CursorWordRightSelect extends WordRightCommand {
	constructor() {
		super({
			inSelectionMode: true,
			wordNavigationType: WordNavigationType.WordEnd,
			id: 'cursorWordRightSelect',
			precondition: undefined
		});
	}
}

export class CursorWordAccessibilityRight extends WordRightCommand {
	constructor() {
		super({
			inSelectionMode: false,
			wordNavigationType: WordNavigationType.WordAccessibility,
			id: 'cursorWordAccessibilityRight',
			precondition: undefined
		});
	}

	protected override _move(wordCharacterClassifier: WordCharacterClassifier, model: ITextModel, position: Position, wordNavigationType: WordNavigationType, hasMulticursor: boolean): Position {
		return super._move(getMapForWordSeparators(EditorOptions.wordSeparators.defaultValue, wordCharacterClassifier.intlSegmenterLocales), model, position, wordNavigationType, hasMulticursor);
	}
}

export class CursorWordAccessibilityRightSelect extends WordRightCommand {
	constructor() {
		super({
			inSelectionMode: true,
			wordNavigationType: WordNavigationType.WordAccessibility,
			id: 'cursorWordAccessibilityRightSelect',
			precondition: undefined
		});
	}

	protected override _move(wordCharacterClassifier: WordCharacterClassifier, model: ITextModel, position: Position, wordNavigationType: WordNavigationType, hasMulticursor: boolean): Position {
		return super._move(getMapForWordSeparators(EditorOptions.wordSeparators.defaultValue, wordCharacterClassifier.intlSegmenterLocales), model, position, wordNavigationType, hasMulticursor);
	}
}

export interface DeleteWordOptions extends ICommandOptions {
	whitespaceHeuristics: boolean;
	wordNavigationType: WordNavigationType;
}

export abstract class DeleteWordCommand extends EditorCommand {
	private readonly _whitespaceHeuristics: boolean;
	private readonly _wordNavigationType: WordNavigationType;

	constructor(opts: DeleteWordOptions) {
		super(opts);
		this._whitespaceHeuristics = opts.whitespaceHeuristics;
		this._wordNavigationType = opts.wordNavigationType;
	}

	public runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, args: any): void {
		const languageConfigurationService = accessor?.get(ILanguageConfigurationService);

		if (!editor.hasModel() || !languageConfigurationService) {
			return;
		}
		const wordSeparators = getMapForWordSeparators(editor.getOption(EditorOption.wordSeparators), editor.getOption(EditorOption.wordSegmenterLocales));
		const model = editor.getModel();
		const selections = editor.getSelections();
		const autoClosingBrackets = editor.getOption(EditorOption.autoClosingBrackets);
		const autoClosingQuotes = editor.getOption(EditorOption.autoClosingQuotes);
		const autoClosingPairs = languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).getAutoClosingPairs();
		const viewModel = editor._getViewModel();

		const commands = selections.map((sel) => {
			const deleteRange = this._delete({
				wordSeparators,
				model,
				selection: sel,
				whitespaceHeuristics: this._whitespaceHeuristics,
				autoClosingDelete: editor.getOption(EditorOption.autoClosingDelete),
				autoClosingBrackets,
				autoClosingQuotes,
				autoClosingPairs,
				autoClosedCharacters: viewModel.getCursorAutoClosedCharacters(),
			}, this._wordNavigationType);
			return new ReplaceCommand(deleteRange, '');
		});

		editor.pushUndoStop();
		editor.executeCommands(this.id, commands);
		editor.pushUndoStop();
	}

	protected abstract _delete(ctx: DeleteWordContext, wordNavigationType: WordNavigationType): Range;
}

export class DeleteWordLeftCommand extends DeleteWordCommand {
	protected _delete(ctx: DeleteWordContext, wordNavigationType: WordNavigationType): Range {
		const r = WordOperations.deleteWordLeft(ctx, wordNavigationType);
		if (r) {
			return r;
		}
		return new Range(1, 1, 1, 1);
	}
}

export class DeleteWordRightCommand extends DeleteWordCommand {
	protected _delete(ctx: DeleteWordContext, wordNavigationType: WordNavigationType): Range {
		const r = WordOperations.deleteWordRight(ctx, wordNavigationType);
		if (r) {
			return r;
		}
		const lineCount = ctx.model.getLineCount();
		const maxColumn = ctx.model.getLineMaxColumn(lineCount);
		return new Range(lineCount, maxColumn, lineCount, maxColumn);
	}
}

export class DeleteWordStartLeft extends DeleteWordLeftCommand {
	constructor() {
		super({
			whitespaceHeuristics: false,
			wordNavigationType: WordNavigationType.WordStart,
			id: 'deleteWordStartLeft',
			precondition: EditorContextKeys.writable
		});
	}
}

export class DeleteWordEndLeft extends DeleteWordLeftCommand {
	constructor() {
		super({
			whitespaceHeuristics: false,
			wordNavigationType: WordNavigationType.WordEnd,
			id: 'deleteWordEndLeft',
			precondition: EditorContextKeys.writable
		});
	}
}

export class DeleteWordLeft extends DeleteWordLeftCommand {
	constructor() {
		super({
			whitespaceHeuristics: true,
			wordNavigationType: WordNavigationType.WordStart,
			id: 'deleteWordLeft',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyMod.CtrlCmd | KeyCode.Backspace,
				mac: { primary: KeyMod.Alt | KeyCode.Backspace },
				weight: KeybindingWeight.EditorContrib
			}
		});
	}
}

export class DeleteWordStartRight extends DeleteWordRightCommand {
	constructor() {
		super({
			whitespaceHeuristics: false,
			wordNavigationType: WordNavigationType.WordStart,
			id: 'deleteWordStartRight',
			precondition: EditorContextKeys.writable
		});
	}
}

export class DeleteWordEndRight extends DeleteWordRightCommand {
	constructor() {
		super({
			whitespaceHeuristics: false,
			wordNavigationType: WordNavigationType.WordEnd,
			id: 'deleteWordEndRight',
			precondition: EditorContextKeys.writable
		});
	}
}

export class DeleteWordRight extends DeleteWordRightCommand {
	constructor() {
		super({
			whitespaceHeuristics: true,
			wordNavigationType: WordNavigationType.WordEnd,
			id: 'deleteWordRight',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyMod.CtrlCmd | KeyCode.Delete,
				mac: { primary: KeyMod.Alt | KeyCode.Delete },
				weight: KeybindingWeight.EditorContrib
			}
		});
	}
}

export class DeleteInsideWord extends EditorAction {

	constructor() {
		super({
			id: 'deleteInsideWord',
			precondition: EditorContextKeys.writable,
			label: nls.localize2('deleteInsideWord', "Delete Word"),
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor, args: any): void {
		if (!editor.hasModel()) {
			return;
		}
		const wordSeparators = getMapForWordSeparators(editor.getOption(EditorOption.wordSeparators), editor.getOption(EditorOption.wordSegmenterLocales));
		const model = editor.getModel();
		const selections = editor.getSelections();

		const commands = selections.map((sel) => {
			const deleteRange = WordOperations.deleteInsideWord(wordSeparators, model, sel);
			return new ReplaceCommand(deleteRange, '');
		});

		editor.pushUndoStop();
		editor.executeCommands(this.id, commands);
		editor.pushUndoStop();
	}
}

registerEditorCommand(new CursorWordStartLeft());
registerEditorCommand(new CursorWordEndLeft());
registerEditorCommand(new CursorWordLeft());
registerEditorCommand(new CursorWordStartLeftSelect());
registerEditorCommand(new CursorWordEndLeftSelect());
registerEditorCommand(new CursorWordLeftSelect());
registerEditorCommand(new CursorWordStartRight());
registerEditorCommand(new CursorWordEndRight());
registerEditorCommand(new CursorWordRight());
registerEditorCommand(new CursorWordStartRightSelect());
registerEditorCommand(new CursorWordEndRightSelect());
registerEditorCommand(new CursorWordRightSelect());
registerEditorCommand(new CursorWordAccessibilityLeft());
registerEditorCommand(new CursorWordAccessibilityLeftSelect());
registerEditorCommand(new CursorWordAccessibilityRight());
registerEditorCommand(new CursorWordAccessibilityRightSelect());
registerEditorCommand(new DeleteWordStartLeft());
registerEditorCommand(new DeleteWordEndLeft());
registerEditorCommand(new DeleteWordLeft());
registerEditorCommand(new DeleteWordStartRight());
registerEditorCommand(new DeleteWordEndRight());
registerEditorCommand(new DeleteWordRight());
registerEditorAction(DeleteInsideWord);
