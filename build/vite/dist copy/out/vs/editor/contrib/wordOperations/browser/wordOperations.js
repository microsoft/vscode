/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../platform/accessibility/common/accessibility.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IsWindowsContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { EditorAction, EditorCommand, registerEditorAction, registerEditorCommand } from '../../../browser/editorExtensions.js';
import { ReplaceCommand } from '../../../common/commands/replaceCommand.js';
import { EditorOptions } from '../../../common/config/editorOptions.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { getMapForWordSeparators } from '../../../common/core/wordCharacterClassifier.js';
import { WordOperations } from '../../../common/cursor/cursorWordOperations.js';
import { CursorState } from '../../../common/cursorCommon.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';
export class MoveWordCommand extends EditorCommand {
    constructor(opts) {
        super(opts);
        this._inSelectionMode = opts.inSelectionMode;
        this._wordNavigationType = opts.wordNavigationType;
    }
    runEditorCommand(accessor, editor, args) {
        if (!editor.hasModel()) {
            return;
        }
        const wordSeparators = getMapForWordSeparators(editor.getOption(148 /* EditorOption.wordSeparators */), editor.getOption(147 /* EditorOption.wordSegmenterLocales */));
        const model = editor.getModel();
        const selections = editor.getSelections();
        const hasMulticursor = selections.length > 1;
        const result = selections.map((sel) => {
            const inPosition = new Position(sel.positionLineNumber, sel.positionColumn);
            const outPosition = this._move(wordSeparators, model, inPosition, this._wordNavigationType, hasMulticursor);
            return this._moveTo(sel, outPosition, this._inSelectionMode);
        });
        model.pushStackElement();
        editor._getViewModel().setCursorStates('moveWordCommand', 3 /* CursorChangeReason.Explicit */, result.map(r => CursorState.fromModelSelection(r)));
        if (result.length === 1) {
            const pos = new Position(result[0].positionLineNumber, result[0].positionColumn);
            editor.revealPosition(pos, 0 /* ScrollType.Smooth */);
        }
    }
    _moveTo(from, to, inSelectionMode) {
        if (inSelectionMode) {
            // move just position
            return new Selection(from.selectionStartLineNumber, from.selectionStartColumn, to.lineNumber, to.column);
        }
        else {
            // move everything
            return new Selection(to.lineNumber, to.column, to.lineNumber, to.column);
        }
    }
}
export class WordLeftCommand extends MoveWordCommand {
    _move(wordSeparators, model, position, wordNavigationType, hasMulticursor) {
        return WordOperations.moveWordLeft(wordSeparators, model, position, wordNavigationType, hasMulticursor);
    }
}
export class WordRightCommand extends MoveWordCommand {
    _move(wordSeparators, model, position, wordNavigationType, hasMulticursor) {
        return WordOperations.moveWordRight(wordSeparators, model, position, wordNavigationType);
    }
}
export class CursorWordStartLeft extends WordLeftCommand {
    constructor() {
        super({
            inSelectionMode: false,
            wordNavigationType: 0 /* WordNavigationType.WordStart */,
            id: 'cursorWordStartLeft',
            precondition: undefined
        });
    }
}
export class CursorWordEndLeft extends WordLeftCommand {
    constructor() {
        super({
            inSelectionMode: false,
            wordNavigationType: 2 /* WordNavigationType.WordEnd */,
            id: 'cursorWordEndLeft',
            precondition: undefined
        });
    }
}
export class CursorWordLeft extends WordLeftCommand {
    constructor() {
        super({
            inSelectionMode: false,
            wordNavigationType: 1 /* WordNavigationType.WordStartFast */,
            id: 'cursorWordLeft',
            precondition: undefined,
            kbOpts: {
                kbExpr: ContextKeyExpr.and(EditorContextKeys.textInputFocus, ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext)?.negate()),
                primary: 2048 /* KeyMod.CtrlCmd */ | 15 /* KeyCode.LeftArrow */,
                mac: { primary: 512 /* KeyMod.Alt */ | 15 /* KeyCode.LeftArrow */ },
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
}
export class CursorWordStartLeftSelect extends WordLeftCommand {
    constructor() {
        super({
            inSelectionMode: true,
            wordNavigationType: 0 /* WordNavigationType.WordStart */,
            id: 'cursorWordStartLeftSelect',
            precondition: undefined
        });
    }
}
export class CursorWordEndLeftSelect extends WordLeftCommand {
    constructor() {
        super({
            inSelectionMode: true,
            wordNavigationType: 2 /* WordNavigationType.WordEnd */,
            id: 'cursorWordEndLeftSelect',
            precondition: undefined
        });
    }
}
export class CursorWordLeftSelect extends WordLeftCommand {
    constructor() {
        super({
            inSelectionMode: true,
            wordNavigationType: 1 /* WordNavigationType.WordStartFast */,
            id: 'cursorWordLeftSelect',
            precondition: undefined,
            kbOpts: {
                kbExpr: ContextKeyExpr.and(EditorContextKeys.textInputFocus, ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext)?.negate()),
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 15 /* KeyCode.LeftArrow */,
                mac: { primary: 512 /* KeyMod.Alt */ | 1024 /* KeyMod.Shift */ | 15 /* KeyCode.LeftArrow */ },
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
}
// Accessibility navigation commands should only be enabled on windows since they are tuned to what NVDA expects
export class CursorWordAccessibilityLeft extends WordLeftCommand {
    constructor() {
        super({
            inSelectionMode: false,
            wordNavigationType: 3 /* WordNavigationType.WordAccessibility */,
            id: 'cursorWordAccessibilityLeft',
            precondition: undefined
        });
    }
    _move(wordCharacterClassifier, model, position, wordNavigationType, hasMulticursor) {
        return super._move(getMapForWordSeparators(EditorOptions.wordSeparators.defaultValue, wordCharacterClassifier.intlSegmenterLocales), model, position, wordNavigationType, hasMulticursor);
    }
}
export class CursorWordAccessibilityLeftSelect extends WordLeftCommand {
    constructor() {
        super({
            inSelectionMode: true,
            wordNavigationType: 3 /* WordNavigationType.WordAccessibility */,
            id: 'cursorWordAccessibilityLeftSelect',
            precondition: undefined
        });
    }
    _move(wordCharacterClassifier, model, position, wordNavigationType, hasMulticursor) {
        return super._move(getMapForWordSeparators(EditorOptions.wordSeparators.defaultValue, wordCharacterClassifier.intlSegmenterLocales), model, position, wordNavigationType, hasMulticursor);
    }
}
export class CursorWordStartRight extends WordRightCommand {
    constructor() {
        super({
            inSelectionMode: false,
            wordNavigationType: 0 /* WordNavigationType.WordStart */,
            id: 'cursorWordStartRight',
            precondition: undefined
        });
    }
}
export class CursorWordEndRight extends WordRightCommand {
    constructor() {
        super({
            inSelectionMode: false,
            wordNavigationType: 2 /* WordNavigationType.WordEnd */,
            id: 'cursorWordEndRight',
            precondition: undefined,
            kbOpts: {
                kbExpr: ContextKeyExpr.and(EditorContextKeys.textInputFocus, ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext)?.negate()),
                primary: 2048 /* KeyMod.CtrlCmd */ | 17 /* KeyCode.RightArrow */,
                mac: { primary: 512 /* KeyMod.Alt */ | 17 /* KeyCode.RightArrow */ },
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
}
export class CursorWordRight extends WordRightCommand {
    constructor() {
        super({
            inSelectionMode: false,
            wordNavigationType: 2 /* WordNavigationType.WordEnd */,
            id: 'cursorWordRight',
            precondition: undefined
        });
    }
}
export class CursorWordStartRightSelect extends WordRightCommand {
    constructor() {
        super({
            inSelectionMode: true,
            wordNavigationType: 0 /* WordNavigationType.WordStart */,
            id: 'cursorWordStartRightSelect',
            precondition: undefined
        });
    }
}
export class CursorWordEndRightSelect extends WordRightCommand {
    constructor() {
        super({
            inSelectionMode: true,
            wordNavigationType: 2 /* WordNavigationType.WordEnd */,
            id: 'cursorWordEndRightSelect',
            precondition: undefined,
            kbOpts: {
                kbExpr: ContextKeyExpr.and(EditorContextKeys.textInputFocus, ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext)?.negate()),
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 17 /* KeyCode.RightArrow */,
                mac: { primary: 512 /* KeyMod.Alt */ | 1024 /* KeyMod.Shift */ | 17 /* KeyCode.RightArrow */ },
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
}
export class CursorWordRightSelect extends WordRightCommand {
    constructor() {
        super({
            inSelectionMode: true,
            wordNavigationType: 2 /* WordNavigationType.WordEnd */,
            id: 'cursorWordRightSelect',
            precondition: undefined
        });
    }
}
export class CursorWordAccessibilityRight extends WordRightCommand {
    constructor() {
        super({
            inSelectionMode: false,
            wordNavigationType: 3 /* WordNavigationType.WordAccessibility */,
            id: 'cursorWordAccessibilityRight',
            precondition: undefined
        });
    }
    _move(wordCharacterClassifier, model, position, wordNavigationType, hasMulticursor) {
        return super._move(getMapForWordSeparators(EditorOptions.wordSeparators.defaultValue, wordCharacterClassifier.intlSegmenterLocales), model, position, wordNavigationType, hasMulticursor);
    }
}
export class CursorWordAccessibilityRightSelect extends WordRightCommand {
    constructor() {
        super({
            inSelectionMode: true,
            wordNavigationType: 3 /* WordNavigationType.WordAccessibility */,
            id: 'cursorWordAccessibilityRightSelect',
            precondition: undefined
        });
    }
    _move(wordCharacterClassifier, model, position, wordNavigationType, hasMulticursor) {
        return super._move(getMapForWordSeparators(EditorOptions.wordSeparators.defaultValue, wordCharacterClassifier.intlSegmenterLocales), model, position, wordNavigationType, hasMulticursor);
    }
}
export class DeleteWordCommand extends EditorCommand {
    constructor(opts) {
        super({ canTriggerInlineEdits: true, ...opts });
        this._whitespaceHeuristics = opts.whitespaceHeuristics;
        this._wordNavigationType = opts.wordNavigationType;
    }
    runEditorCommand(accessor, editor, args) {
        const languageConfigurationService = accessor?.get(ILanguageConfigurationService);
        if (!editor.hasModel() || !languageConfigurationService) {
            return;
        }
        const wordSeparators = getMapForWordSeparators(editor.getOption(148 /* EditorOption.wordSeparators */), editor.getOption(147 /* EditorOption.wordSegmenterLocales */));
        const model = editor.getModel();
        const selections = editor.getSelections();
        const autoClosingBrackets = editor.getOption(10 /* EditorOption.autoClosingBrackets */);
        const autoClosingQuotes = editor.getOption(15 /* EditorOption.autoClosingQuotes */);
        const autoClosingPairs = languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).getAutoClosingPairs();
        const viewModel = editor._getViewModel();
        const commands = selections.map((sel) => {
            const deleteRange = this._delete({
                wordSeparators,
                model,
                selection: sel,
                whitespaceHeuristics: this._whitespaceHeuristics,
                autoClosingDelete: editor.getOption(13 /* EditorOption.autoClosingDelete */),
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
}
export class DeleteWordLeftCommand extends DeleteWordCommand {
    _delete(ctx, wordNavigationType) {
        const r = WordOperations.deleteWordLeft(ctx, wordNavigationType);
        if (r) {
            return r;
        }
        return new Range(1, 1, 1, 1);
    }
}
export class DeleteWordRightCommand extends DeleteWordCommand {
    _delete(ctx, wordNavigationType) {
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
            wordNavigationType: 0 /* WordNavigationType.WordStart */,
            id: 'deleteWordStartLeft',
            precondition: EditorContextKeys.writable
        });
    }
}
export class DeleteWordEndLeft extends DeleteWordLeftCommand {
    constructor() {
        super({
            whitespaceHeuristics: false,
            wordNavigationType: 2 /* WordNavigationType.WordEnd */,
            id: 'deleteWordEndLeft',
            precondition: EditorContextKeys.writable
        });
    }
}
export class DeleteWordLeft extends DeleteWordLeftCommand {
    constructor() {
        super({
            whitespaceHeuristics: true,
            wordNavigationType: 0 /* WordNavigationType.WordStart */,
            id: 'deleteWordLeft',
            precondition: EditorContextKeys.writable,
            kbOpts: {
                kbExpr: EditorContextKeys.textInputFocus,
                primary: 2048 /* KeyMod.CtrlCmd */ | 1 /* KeyCode.Backspace */,
                mac: { primary: 512 /* KeyMod.Alt */ | 1 /* KeyCode.Backspace */ },
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
}
export class DeleteWordStartRight extends DeleteWordRightCommand {
    constructor() {
        super({
            whitespaceHeuristics: false,
            wordNavigationType: 0 /* WordNavigationType.WordStart */,
            id: 'deleteWordStartRight',
            precondition: EditorContextKeys.writable
        });
    }
}
export class DeleteWordEndRight extends DeleteWordRightCommand {
    constructor() {
        super({
            whitespaceHeuristics: false,
            wordNavigationType: 2 /* WordNavigationType.WordEnd */,
            id: 'deleteWordEndRight',
            precondition: EditorContextKeys.writable
        });
    }
}
export class DeleteWordRight extends DeleteWordRightCommand {
    constructor() {
        super({
            whitespaceHeuristics: true,
            wordNavigationType: 2 /* WordNavigationType.WordEnd */,
            id: 'deleteWordRight',
            precondition: EditorContextKeys.writable,
            kbOpts: {
                kbExpr: EditorContextKeys.textInputFocus,
                primary: 2048 /* KeyMod.CtrlCmd */ | 20 /* KeyCode.Delete */,
                mac: { primary: 512 /* KeyMod.Alt */ | 20 /* KeyCode.Delete */ },
                weight: 100 /* KeybindingWeight.EditorContrib */
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
            metadata: {
                description: nls.localize2('deleteInsideWord.description', "Delete the word at the cursor"),
                args: [{
                        name: 'args',
                        schema: {
                            type: 'object',
                            properties: {
                                'onlyWord': {
                                    type: 'boolean',
                                    default: false,
                                    description: nls.localize('deleteInsideWord.args.onlyWord', "Delete only the word and leave surrounding whitespace")
                                }
                            }
                        }
                    }]
            }
        });
    }
    run(accessor, editor, args) {
        if (!editor.hasModel()) {
            return;
        }
        const onlyWord = !!(args && typeof args === 'object' && args.onlyWord);
        const wordSeparators = getMapForWordSeparators(editor.getOption(148 /* EditorOption.wordSeparators */), editor.getOption(147 /* EditorOption.wordSegmenterLocales */));
        const model = editor.getModel();
        const selections = editor.getSelections();
        const commands = selections.map((sel) => {
            const deleteRange = WordOperations.deleteInsideWord(wordSeparators, model, sel, onlyWord);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29yZE9wZXJhdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi93b3JkT3BlcmF0aW9ucy9icm93c2VyL3dvcmRPcGVyYXRpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDaEgsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBR3pGLE9BQU8sRUFBRSxZQUFZLEVBQUUsYUFBYSxFQUFtQixvQkFBb0IsRUFBRSxxQkFBcUIsRUFBb0IsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuSyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDNUUsT0FBTyxFQUFnQixhQUFhLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDNUQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsdUJBQXVCLEVBQTJCLE1BQU0saURBQWlELENBQUM7QUFDbkgsT0FBTyxFQUF5QyxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN2SCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFHOUQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekUsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFRM0cs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