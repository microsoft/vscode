/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../nls.js';
import { isFirefox } from '../../base/browser/browser.js';
import * as types from '../../base/common/types.js';
import { status } from '../../base/browser/ui/aria/aria.js';
import { Command, EditorCommand, registerEditorCommand, UndoCommand, RedoCommand, SelectAllCommand } from './editorExtensions.js';
import { ICodeEditorService } from './services/codeEditorService.js';
import { ColumnSelection } from '../common/cursor/cursorColumnSelection.js';
import { CursorState } from '../common/cursorCommon.js';
import { DeleteOperations } from '../common/cursor/cursorDeleteOperations.js';
import { CursorMove as CursorMove_, CursorMoveCommands } from '../common/cursor/cursorMoveCommands.js';
import { TypeOperations } from '../common/cursor/cursorTypeOperations.js';
import { Position } from '../common/core/position.js';
import { Range } from '../common/core/range.js';
import { EditorContextKeys } from '../common/editorContextKeys.js';
import { ContextKeyExpr } from '../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry } from '../../platform/keybinding/common/keybindingsRegistry.js';
import { getActiveElement, isEditableElement } from '../../base/browser/dom.js';
import { EnterOperation } from '../common/cursor/cursorTypeEditOperations.js';
const CORE_WEIGHT = 0 /* KeybindingWeight.EditorCore */;
export class CoreEditorCommand extends EditorCommand {
    runEditorCommand(accessor, editor, args) {
        const viewModel = editor._getViewModel();
        if (!viewModel) {
            // the editor has no view => has no cursors
            return;
        }
        this.runCoreEditorCommand(viewModel, args || {});
    }
}
export var EditorScroll_;
(function (EditorScroll_) {
    const isEditorScrollArgs = function (arg) {
        if (!types.isObject(arg)) {
            return false;
        }
        const scrollArg = arg;
        if (!types.isString(scrollArg.to)) {
            return false;
        }
        if (!types.isUndefined(scrollArg.by) && !types.isString(scrollArg.by)) {
            return false;
        }
        if (!types.isUndefined(scrollArg.value) && !types.isNumber(scrollArg.value)) {
            return false;
        }
        if (!types.isUndefined(scrollArg.revealCursor) && !types.isBoolean(scrollArg.revealCursor)) {
            return false;
        }
        return true;
    };
    EditorScroll_.metadata = {
        description: 'Scroll editor in the given direction',
        args: [
            {
                name: 'Editor scroll argument object',
                description: `Property-value pairs that can be passed through this argument:
					* 'to': A mandatory direction value.
						\`\`\`
						'up', 'down'
						\`\`\`
					* 'by': Unit to move. Default is computed based on 'to' value.
						\`\`\`
						'line', 'wrappedLine', 'page', 'halfPage', 'editor'
						\`\`\`
					* 'value': Number of units to move. Default is '1'.
					* 'revealCursor': If 'true' reveals the cursor if it is outside view port.
				`,
                constraint: isEditorScrollArgs,
                schema: {
                    'type': 'object',
                    'required': ['to'],
                    'properties': {
                        'to': {
                            'type': 'string',
                            'enum': ['up', 'down']
                        },
                        'by': {
                            'type': 'string',
                            'enum': ['line', 'wrappedLine', 'page', 'halfPage', 'editor']
                        },
                        'value': {
                            'type': 'number',
                            'default': 1
                        },
                        'revealCursor': {
                            'type': 'boolean',
                        }
                    }
                }
            }
        ]
    };
    /**
     * Directions in the view for editor scroll command.
     */
    EditorScroll_.RawDirection = {
        Up: 'up',
        Right: 'right',
        Down: 'down',
        Left: 'left'
    };
    /**
     * Units for editor scroll 'by' argument
     */
    EditorScroll_.RawUnit = {
        Line: 'line',
        WrappedLine: 'wrappedLine',
        Page: 'page',
        HalfPage: 'halfPage',
        Editor: 'editor',
        Column: 'column'
    };
    function parse(args) {
        let direction;
        switch (args.to) {
            case EditorScroll_.RawDirection.Up:
                direction = 1 /* Direction.Up */;
                break;
            case EditorScroll_.RawDirection.Right:
                direction = 2 /* Direction.Right */;
                break;
            case EditorScroll_.RawDirection.Down:
                direction = 3 /* Direction.Down */;
                break;
            case EditorScroll_.RawDirection.Left:
                direction = 4 /* Direction.Left */;
                break;
            default:
                // Illegal arguments
                return null;
        }
        let unit;
        switch (args.by) {
            case EditorScroll_.RawUnit.Line:
                unit = 1 /* Unit.Line */;
                break;
            case EditorScroll_.RawUnit.WrappedLine:
                unit = 2 /* Unit.WrappedLine */;
                break;
            case EditorScroll_.RawUnit.Page:
                unit = 3 /* Unit.Page */;
                break;
            case EditorScroll_.RawUnit.HalfPage:
                unit = 4 /* Unit.HalfPage */;
                break;
            case EditorScroll_.RawUnit.Editor:
                unit = 5 /* Unit.Editor */;
                break;
            case EditorScroll_.RawUnit.Column:
                unit = 6 /* Unit.Column */;
                break;
            default:
                unit = 2 /* Unit.WrappedLine */;
        }
        const value = Math.floor(args.value || 1);
        const revealCursor = !!args.revealCursor;
        return {
            direction: direction,
            unit: unit,
            value: value,
            revealCursor: revealCursor,
            select: (!!args.select)
        };
    }
    EditorScroll_.parse = parse;
    let Direction;
    (function (Direction) {
        Direction[Direction["Up"] = 1] = "Up";
        Direction[Direction["Right"] = 2] = "Right";
        Direction[Direction["Down"] = 3] = "Down";
        Direction[Direction["Left"] = 4] = "Left";
    })(Direction = EditorScroll_.Direction || (EditorScroll_.Direction = {}));
    let Unit;
    (function (Unit) {
        Unit[Unit["Line"] = 1] = "Line";
        Unit[Unit["WrappedLine"] = 2] = "WrappedLine";
        Unit[Unit["Page"] = 3] = "Page";
        Unit[Unit["HalfPage"] = 4] = "HalfPage";
        Unit[Unit["Editor"] = 5] = "Editor";
        Unit[Unit["Column"] = 6] = "Column";
    })(Unit = EditorScroll_.Unit || (EditorScroll_.Unit = {}));
})(EditorScroll_ || (EditorScroll_ = {}));
export var RevealLine_;
(function (RevealLine_) {
    const isRevealLineArgs = function (arg) {
        if (!types.isObject(arg)) {
            return false;
        }
        const reveaLineArg = arg;
        if (!types.isNumber(reveaLineArg.lineNumber) && !types.isString(reveaLineArg.lineNumber)) {
            return false;
        }
        if (!types.isUndefined(reveaLineArg.at) && !types.isString(reveaLineArg.at)) {
            return false;
        }
        return true;
    };
    RevealLine_.metadata = {
        description: 'Reveal the given line at the given logical position',
        args: [
            {
                name: 'Reveal line argument object',
                description: `Property-value pairs that can be passed through this argument:
					* 'lineNumber': A mandatory line number value.
					* 'at': Logical position at which line has to be revealed.
						\`\`\`
						'top', 'center', 'bottom'
						\`\`\`
				`,
                constraint: isRevealLineArgs,
                schema: {
                    'type': 'object',
                    'required': ['lineNumber'],
                    'properties': {
                        'lineNumber': {
                            'type': ['number', 'string'],
                        },
                        'at': {
                            'type': 'string',
                            'enum': ['top', 'center', 'bottom']
                        }
                    }
                }
            }
        ]
    };
    /**
     * Values for reveal line 'at' argument
     */
    RevealLine_.RawAtArgument = {
        Top: 'top',
        Center: 'center',
        Bottom: 'bottom'
    };
})(RevealLine_ || (RevealLine_ = {}));
class EditorOrNativeTextInputCommand {
    constructor(target) {
        // 1. handle case when focus is in editor.
        target.addImplementation(10000, 'code-editor', (accessor, args) => {
            // Only if editor text focus (i.e. not if editor has widget focus).
            const focusedEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
            if (focusedEditor && focusedEditor.hasTextFocus()) {
                return this._runEditorCommand(accessor, focusedEditor, args);
            }
            return false;
        });
        // 2. handle case when focus is in some other `input` / `textarea`.
        target.addImplementation(1000, 'generic-dom-input-textarea', (accessor, args) => {
            // Only if focused on an element that allows for entering text
            const activeElement = getActiveElement();
            if (activeElement && isEditableElement(activeElement)) {
                this.runDOMCommand(activeElement);
                return true;
            }
            return false;
        });
        // 3. (default) handle case when focus is somewhere else.
        target.addImplementation(0, 'generic-dom', (accessor, args) => {
            // Redirecting to active editor
            const activeEditor = accessor.get(ICodeEditorService).getActiveCodeEditor();
            if (activeEditor) {
                activeEditor.focus();
                return this._runEditorCommand(accessor, activeEditor, args);
            }
            return false;
        });
    }
    _runEditorCommand(accessor, editor, args) {
        const result = this.runEditorCommand(accessor, editor, args);
        if (result) {
            return result;
        }
        return true;
    }
}
export var NavigationCommandRevealType;
(function (NavigationCommandRevealType) {
    /**
     * Do regular revealing.
     */
    NavigationCommandRevealType[NavigationCommandRevealType["Regular"] = 0] = "Regular";
    /**
     * Do only minimal revealing.
     */
    NavigationCommandRevealType[NavigationCommandRevealType["Minimal"] = 1] = "Minimal";
    /**
     * Do not reveal the position.
     */
    NavigationCommandRevealType[NavigationCommandRevealType["None"] = 2] = "None";
})(NavigationCommandRevealType || (NavigationCommandRevealType = {}));
export var CoreNavigationCommands;
(function (CoreNavigationCommands) {
    class BaseMoveToCommand extends CoreEditorCommand {
        constructor(opts) {
            super(opts);
            this._inSelectionMode = opts.inSelectionMode;
        }
        runCoreEditorCommand(viewModel, args) {
            if (!args.position) {
                return;
            }
            viewModel.model.pushStackElement();
            const cursorStateChanged = viewModel.setCursorStates(args.source, 3 /* CursorChangeReason.Explicit */, [
                CursorMoveCommands.moveTo(viewModel, viewModel.getPrimaryCursorState(), this._inSelectionMode, args.position, args.viewPosition)
            ]);
            if (cursorStateChanged && args.revealType !== 2 /* NavigationCommandRevealType.None */) {
                viewModel.revealAllCursors(args.source, true, true);
            }
        }
    }
    CoreNavigationCommands.MoveTo = registerEditorCommand(new BaseMoveToCommand({
        id: '_moveTo',
        inSelectionMode: false,
        precondition: undefined
    }));
    CoreNavigationCommands.MoveToSelect = registerEditorCommand(new BaseMoveToCommand({
        id: '_moveToSelect',
        inSelectionMode: true,
        precondition: undefined
    }));
    class ColumnSelectCommand extends CoreEditorCommand {
        runCoreEditorCommand(viewModel, args) {
            viewModel.model.pushStackElement();
            const result = this._getColumnSelectResult(viewModel, viewModel.getPrimaryCursorState(), viewModel.getCursorColumnSelectData(), args);
            if (result === null) {
                // invalid arguments
                return;
            }
            viewModel.setCursorStates(args.source, 3 /* CursorChangeReason.Explicit */, result.viewStates.map((viewState) => CursorState.fromViewState(viewState)));
            viewModel.setCursorColumnSelectData({
                isReal: true,
                fromViewLineNumber: result.fromLineNumber,
                fromViewVisualColumn: result.fromVisualColumn,
                toViewLineNumber: result.toLineNumber,
                toViewVisualColumn: result.toVisualColumn
            });
            if (result.reversed) {
                viewModel.revealTopMostCursor(args.source);
            }
            else {
                viewModel.revealBottomMostCursor(args.source);
            }
        }
    }
    CoreNavigationCommands.ColumnSelect = registerEditorCommand(new class extends ColumnSelectCommand {
        constructor() {
            super({
                id: 'columnSelect',
                precondition: undefined
            });
        }
        _getColumnSelectResult(viewModel, primary, prevColumnSelectData, args) {
            if (typeof args.position === 'undefined' || typeof args.viewPosition === 'undefined' || typeof args.mouseColumn === 'undefined') {
                return null;
            }
            // validate `args`
            const validatedPosition = viewModel.model.validatePosition(args.position);
            const validatedViewPosition = viewModel.coordinatesConverter.validateViewPosition(new Position(args.viewPosition.lineNumber, args.viewPosition.column), validatedPosition);
            const fromViewLineNumber = args.doColumnSelect ? prevColumnSelectData.fromViewLineNumber : validatedViewPosition.lineNumber;
            const fromViewVisualColumn = args.doColumnSelect ? prevColumnSelectData.fromViewVisualColumn : args.mouseColumn - 1;
            return ColumnSelection.columnSelect(viewModel.cursorConfig, viewModel, fromViewLineNumber, fromViewVisualColumn, validatedViewPosition.lineNumber, args.mouseColumn - 1);
        }
    });
    CoreNavigationCommands.CursorColumnSelectLeft = registerEditorCommand(new class extends ColumnSelectCommand {
        constructor() {
            super({
                id: 'cursorColumnSelectLeft',
                precondition: undefined,
                kbOpts: {
                    weight: CORE_WEIGHT,
                    kbExpr: EditorContextKeys.textInputFocus,
                    primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 15 /* KeyCode.LeftArrow */,
                    linux: { primary: 0 }
                }
            });
        }
        _getColumnSelectResult(viewModel, primary, prevColumnSelectData, args) {
            return ColumnSelection.columnSelectLeft(viewModel.cursorConfig, viewModel, prevColumnSelectData);
        }
    });
    CoreNavigationCommands.CursorColumnSelectRight = registerEditorCommand(new class extends ColumnSelectCommand {
        constructor() {
            super({
                id: 'cursorColumnSelectRight',
                precondition: undefined,
                kbOpts: {
                    weight: CORE_WEIGHT,
                    kbExpr: EditorContextKeys.textInputFocus,
                    primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 17 /* KeyCode.RightArrow */,
                    linux: { primary: 0 }
                }
            });
        }
        _getColumnSelectResult(viewModel, primary, prevColumnSelectData, args) {
            return ColumnSelection.columnSelectRight(viewModel.cursorConfig, viewModel, prevColumnSelectData);
        }
    });
    class ColumnSelectUpCommand extends ColumnSelectCommand {
        constructor(opts) {
            super(opts);
            this._isPaged = opts.isPaged;
        }
        _getColumnSelectResult(viewModel, primary, prevColumnSelectData, args) {
            return ColumnSelection.columnSelectUp(viewModel.cursorConfig, viewModel, prevColumnSelectData, this._isPaged);
        }
    }
    CoreNavigationCommands.CursorColumnSelectUp = registerEditorCommand(new ColumnSelectUpCommand({
        isPaged: false,
        id: 'cursorColumnSelectUp',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 16 /* KeyCode.UpArrow */,
            linux: { primary: 0 }
        }
    }));
    CoreNavigationCommands.CursorColumnSelectPageUp = registerEditorCommand(new ColumnSelectUpCommand({
        isPaged: true,
        id: 'cursorColumnSelectPageUp',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 11 /* KeyCode.PageUp */,
            linux: { primary: 0 }
        }
    }));
    class ColumnSelectDownCommand extends ColumnSelectCommand {
        constructor(opts) {
            super(opts);
            this._isPaged = opts.isPaged;
        }
        _getColumnSelectResult(viewModel, primary, prevColumnSelectData, args) {
            return ColumnSelection.columnSelectDown(viewModel.cursorConfig, viewModel, prevColumnSelectData, this._isPaged);
        }
    }
    CoreNavigationCommands.CursorColumnSelectDown = registerEditorCommand(new ColumnSelectDownCommand({
        isPaged: false,
        id: 'cursorColumnSelectDown',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 18 /* KeyCode.DownArrow */,
            linux: { primary: 0 }
        }
    }));
    CoreNavigationCommands.CursorColumnSelectPageDown = registerEditorCommand(new ColumnSelectDownCommand({
        isPaged: true,
        id: 'cursorColumnSelectPageDown',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 12 /* KeyCode.PageDown */,
            linux: { primary: 0 }
        }
    }));
    class CursorMoveImpl extends CoreEditorCommand {
        constructor() {
            super({
                id: 'cursorMove',
                precondition: undefined,
                metadata: CursorMove_.metadata
            });
        }
        runCoreEditorCommand(viewModel, args) {
            const parsed = CursorMove_.parse(args);
            if (!parsed) {
                // illegal arguments
                return;
            }
            this._runCursorMove(viewModel, args.source, parsed);
        }
        _runCursorMove(viewModel, source, args) {
            // If noHistory is true, use PROGRAMMATIC source to prevent adding to navigation history
            const effectiveSource = args.noHistory ? "api" /* TextEditorSelectionSource.PROGRAMMATIC */ : source;
            viewModel.model.pushStackElement();
            viewModel.setCursorStates(effectiveSource, 3 /* CursorChangeReason.Explicit */, CursorMoveImpl._move(viewModel, viewModel.getCursorStates(), args));
            viewModel.revealAllCursors(effectiveSource, true);
        }
        static _move(viewModel, cursors, args) {
            const inSelectionMode = args.select;
            const value = args.value;
            switch (args.direction) {
                case 0 /* CursorMove_.Direction.Left */:
                case 1 /* CursorMove_.Direction.Right */:
                case 2 /* CursorMove_.Direction.Up */:
                case 3 /* CursorMove_.Direction.Down */:
                case 4 /* CursorMove_.Direction.PrevBlankLine */:
                case 5 /* CursorMove_.Direction.NextBlankLine */:
                case 6 /* CursorMove_.Direction.WrappedLineStart */:
                case 7 /* CursorMove_.Direction.WrappedLineFirstNonWhitespaceCharacter */:
                case 8 /* CursorMove_.Direction.WrappedLineColumnCenter */:
                case 9 /* CursorMove_.Direction.WrappedLineEnd */:
                case 10 /* CursorMove_.Direction.WrappedLineLastNonWhitespaceCharacter */:
                    return CursorMoveCommands.simpleMove(viewModel, cursors, args.direction, inSelectionMode, value, args.unit);
                case 11 /* CursorMove_.Direction.ViewPortTop */:
                case 13 /* CursorMove_.Direction.ViewPortBottom */:
                case 12 /* CursorMove_.Direction.ViewPortCenter */:
                case 14 /* CursorMove_.Direction.ViewPortIfOutside */:
                    return CursorMoveCommands.viewportMove(viewModel, cursors, args.direction, inSelectionMode, value);
                default:
                    return null;
            }
        }
    }
    CoreNavigationCommands.CursorMoveImpl = CursorMoveImpl;
    CoreNavigationCommands.CursorMove = registerEditorCommand(new CursorMoveImpl());
    let Constants;
    (function (Constants) {
        Constants[Constants["PAGE_SIZE_MARKER"] = -1] = "PAGE_SIZE_MARKER";
    })(Constants || (Constants = {}));
    class CursorMoveBasedCommand extends CoreEditorCommand {
        constructor(opts) {
            super(opts);
            this._staticArgs = opts.args;
        }
        runCoreEditorCommand(viewModel, dynamicArgs) {
            let args = this._staticArgs;
            if (this._staticArgs.value === -1 /* Constants.PAGE_SIZE_MARKER */) {
                // -1 is a marker for page size
                args = {
                    direction: this._staticArgs.direction,
                    unit: this._staticArgs.unit,
                    select: this._staticArgs.select,
                    value: dynamicArgs.pageSize || viewModel.cursorConfig.pageSize
                };
            }
            viewModel.model.pushStackElement();
            viewModel.setCursorStates(dynamicArgs.source, 3 /* CursorChangeReason.Explicit */, CursorMoveCommands.simpleMove(viewModel, viewModel.getCursorStates(), args.direction, args.select, args.value, args.unit));
            viewModel.revealAllCursors(dynamicArgs.source, true);
        }
    }
    CoreNavigationCommands.CursorLeft = registerEditorCommand(new CursorMoveBasedCommand({
        args: {
            direction: 0 /* CursorMove_.Direction.Left */,
            unit: 0 /* CursorMove_.Unit.None */,
            select: false,
            value: 1
        },
        id: 'cursorLeft',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 15 /* KeyCode.LeftArrow */,
            mac: { primary: 15 /* KeyCode.LeftArrow */, secondary: [256 /* KeyMod.WinCtrl */ | 32 /* KeyCode.KeyB */] }
        }
    }));
    CoreNavigationCommands.CursorLeftSelect = registerEditorCommand(new CursorMoveBasedCommand({
        args: {
            direction: 0 /* CursorMove_.Direction.Left */,
            unit: 0 /* CursorMove_.Unit.None */,
            select: true,
            value: 1
        },
        id: 'cursorLeftSelect',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 1024 /* KeyMod.Shift */ | 15 /* KeyCode.LeftArrow */
        }
    }));
    CoreNavigationCommands.CursorRight = registerEditorCommand(new CursorMoveBasedCommand({
        args: {
            direction: 1 /* CursorMove_.Direction.Right */,
            unit: 0 /* CursorMove_.Unit.None */,
            select: false,
            value: 1
        },
        id: 'cursorRight',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 17 /* KeyCode.RightArrow */,
            mac: { primary: 17 /* KeyCode.RightArrow */, secondary: [256 /* KeyMod.WinCtrl */ | 36 /* KeyCode.KeyF */] }
        }
    }));
    CoreNavigationCommands.CursorRightSelect = registerEditorCommand(new CursorMoveBasedCommand({
        args: {
            direction: 1 /* CursorMove_.Direction.Right */,
            unit: 0 /* CursorMove_.Unit.None */,
            select: true,
            value: 1
        },
        id: 'cursorRightSelect',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 1024 /* KeyMod.Shift */ | 17 /* KeyCode.RightArrow */
        }
    }));
    CoreNavigationCommands.CursorUp = registerEditorCommand(new CursorMoveBasedCommand({
        args: {
            direction: 2 /* CursorMove_.Direction.Up */,
            unit: 2 /* CursorMove_.Unit.WrappedLine */,
            select: false,
            value: 1
        },
        id: 'cursorUp',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 16 /* KeyCode.UpArrow */,
            mac: { primary: 16 /* KeyCode.UpArrow */, secondary: [256 /* KeyMod.WinCtrl */ | 46 /* KeyCode.KeyP */] }
        }
    }));
    CoreNavigationCommands.CursorUpSelect = registerEditorCommand(new CursorMoveBasedCommand({
        args: {
            direction: 2 /* CursorMove_.Direction.Up */,
            unit: 2 /* CursorMove_.Unit.WrappedLine */,
            select: true,
            value: 1
        },
        id: 'cursorUpSelect',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 1024 /* KeyMod.Shift */ | 16 /* KeyCode.UpArrow */,
            secondary: [2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 16 /* KeyCode.UpArrow */],
            mac: { primary: 1024 /* KeyMod.Shift */ | 16 /* KeyCode.UpArrow */ },
            linux: { primary: 1024 /* KeyMod.Shift */ | 16 /* KeyCode.UpArrow */ }
        }
    }));
    CoreNavigationCommands.CursorPageUp = registerEditorCommand(new CursorMoveBasedCommand({
        args: {
            direction: 2 /* CursorMove_.Direction.Up */,
            unit: 2 /* CursorMove_.Unit.WrappedLine */,
            select: false,
            value: -1 /* Constants.PAGE_SIZE_MARKER */
        },
        id: 'cursorPageUp',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 11 /* KeyCode.PageUp */
        }
    }));
    CoreNavigationCommands.CursorPageUpSelect = registerEditorCommand(new CursorMoveBasedCommand({
        args: {
            direction: 2 /* CursorMove_.Direction.Up */,
            unit: 2 /* CursorMove_.Unit.WrappedLine */,
            select: true,
            value: -1 /* Constants.PAGE_SIZE_MARKER */
        },
        id: 'cursorPageUpSelect',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 1024 /* KeyMod.Shift */ | 11 /* KeyCode.PageUp */
        }
    }));
    CoreNavigationCommands.CursorDown = registerEditorCommand(new CursorMoveBasedCommand({
        args: {
            direction: 3 /* CursorMove_.Direction.Down */,
            unit: 2 /* CursorMove_.Unit.WrappedLine */,
            select: false,
            value: 1
        },
        id: 'cursorDown',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 18 /* KeyCode.DownArrow */,
            mac: { primary: 18 /* KeyCode.DownArrow */, secondary: [256 /* KeyMod.WinCtrl */ | 44 /* KeyCode.KeyN */] }
        }
    }));
    CoreNavigationCommands.CursorDownSelect = registerEditorCommand(new CursorMoveBasedCommand({
        args: {
            direction: 3 /* CursorMove_.Direction.Down */,
            unit: 2 /* CursorMove_.Unit.WrappedLine */,
            select: true,
            value: 1
        },
        id: 'cursorDownSelect',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 1024 /* KeyMod.Shift */ | 18 /* KeyCode.DownArrow */,
            secondary: [2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 18 /* KeyCode.DownArrow */],
            mac: { primary: 1024 /* KeyMod.Shift */ | 18 /* KeyCode.DownArrow */ },
            linux: { primary: 1024 /* KeyMod.Shift */ | 18 /* KeyCode.DownArrow */ }
        }
    }));
    CoreNavigationCommands.CursorPageDown = registerEditorCommand(new CursorMoveBasedCommand({
        args: {
            direction: 3 /* CursorMove_.Direction.Down */,
            unit: 2 /* CursorMove_.Unit.WrappedLine */,
            select: false,
            value: -1 /* Constants.PAGE_SIZE_MARKER */
        },
        id: 'cursorPageDown',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 12 /* KeyCode.PageDown */
        }
    }));
    CoreNavigationCommands.CursorPageDownSelect = registerEditorCommand(new CursorMoveBasedCommand({
        args: {
            direction: 3 /* CursorMove_.Direction.Down */,
            unit: 2 /* CursorMove_.Unit.WrappedLine */,
            select: true,
            value: -1 /* Constants.PAGE_SIZE_MARKER */
        },
        id: 'cursorPageDownSelect',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 1024 /* KeyMod.Shift */ | 12 /* KeyCode.PageDown */
        }
    }));
    CoreNavigationCommands.CreateCursor = registerEditorCommand(new class extends CoreEditorCommand {
        constructor() {
            super({
                id: 'createCursor',
                precondition: undefined
            });
        }
        runCoreEditorCommand(viewModel, args) {
            if (!args.position) {
                return;
            }
            let newState;
            if (args.wholeLine) {
                newState = CursorMoveCommands.line(viewModel, viewModel.getPrimaryCursorState(), false, args.position, args.viewPosition);
            }
            else {
                newState = CursorMoveCommands.moveTo(viewModel, viewModel.getPrimaryCursorState(), false, args.position, args.viewPosition);
            }
            const states = viewModel.getCursorStates();
            // Check if we should remove a cursor (sort of like a toggle)
            if (states.length > 1) {
                const newModelPosition = (newState.modelState ? newState.modelState.position : null);
                const newViewPosition = (newState.viewState ? newState.viewState.position : null);
                for (let i = 0, len = states.length; i < len; i++) {
                    const state = states[i];
                    if (newModelPosition && !state.modelState.selection.containsPosition(newModelPosition)) {
                        continue;
                    }
                    if (newViewPosition && !state.viewState.selection.containsPosition(newViewPosition)) {
                        continue;
                    }
                    // => Remove the cursor
                    states.splice(i, 1);
                    viewModel.model.pushStackElement();
                    viewModel.setCursorStates(args.source, 3 /* CursorChangeReason.Explicit */, states);
                    return;
                }
            }
            // => Add the new cursor
            states.push(newState);
            viewModel.model.pushStackElement();
            viewModel.setCursorStates(args.source, 3 /* CursorChangeReason.Explicit */, states);
        }
    });
    CoreNavigationCommands.LastCursorMoveToSelect = registerEditorCommand(new class extends CoreEditorCommand {
        constructor() {
            super({
                id: '_lastCursorMoveToSelect',
                precondition: undefined
            });
        }
        runCoreEditorCommand(viewModel, args) {
            if (!args.position) {
                return;
            }
            const lastAddedCursorIndex = viewModel.getLastAddedCursorIndex();
            const states = viewModel.getCursorStates();
            const newStates = states.slice(0);
            newStates[lastAddedCursorIndex] = CursorMoveCommands.moveTo(viewModel, states[lastAddedCursorIndex], true, args.position, args.viewPosition);
            viewModel.model.pushStackElement();
            viewModel.setCursorStates(args.source, 3 /* CursorChangeReason.Explicit */, newStates);
        }
    });
    class HomeCommand extends CoreEditorCommand {
        constructor(opts) {
            super(opts);
            this._inSelectionMode = opts.inSelectionMode;
        }
        runCoreEditorCommand(viewModel, args) {
            viewModel.model.pushStackElement();
            viewModel.setCursorStates(args.source, 3 /* CursorChangeReason.Explicit */, CursorMoveCommands.moveToBeginningOfLine(viewModel, viewModel.getCursorStates(), this._inSelectionMode));
            viewModel.revealAllCursors(args.source, true);
        }
    }
    CoreNavigationCommands.CursorHome = registerEditorCommand(new HomeCommand({
        inSelectionMode: false,
        id: 'cursorHome',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 14 /* KeyCode.Home */,
            mac: { primary: 14 /* KeyCode.Home */, secondary: [2048 /* KeyMod.CtrlCmd */ | 15 /* KeyCode.LeftArrow */] }
        }
    }));
    CoreNavigationCommands.CursorHomeSelect = registerEditorCommand(new HomeCommand({
        inSelectionMode: true,
        id: 'cursorHomeSelect',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 1024 /* KeyMod.Shift */ | 14 /* KeyCode.Home */,
            mac: { primary: 1024 /* KeyMod.Shift */ | 14 /* KeyCode.Home */, secondary: [2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 15 /* KeyCode.LeftArrow */] }
        }
    }));
    class LineStartCommand extends CoreEditorCommand {
        constructor(opts) {
            super(opts);
            this._inSelectionMode = opts.inSelectionMode;
        }
        runCoreEditorCommand(viewModel, args) {
            viewModel.model.pushStackElement();
            viewModel.setCursorStates(args.source, 3 /* CursorChangeReason.Explicit */, this._exec(viewModel.getCursorStates()));
            viewModel.revealAllCursors(args.source, true);
        }
        _exec(cursors) {
            const result = [];
            for (let i = 0, len = cursors.length; i < len; i++) {
                const cursor = cursors[i];
                const lineNumber = cursor.modelState.position.lineNumber;
                result[i] = CursorState.fromModelState(cursor.modelState.move(this._inSelectionMode, lineNumber, 1, 0));
            }
            return result;
        }
    }
    CoreNavigationCommands.CursorLineStart = registerEditorCommand(new LineStartCommand({
        inSelectionMode: false,
        id: 'cursorLineStart',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 0,
            mac: { primary: 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */ }
        }
    }));
    CoreNavigationCommands.CursorLineStartSelect = registerEditorCommand(new LineStartCommand({
        inSelectionMode: true,
        id: 'cursorLineStartSelect',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 0,
            mac: { primary: 256 /* KeyMod.WinCtrl */ | 1024 /* KeyMod.Shift */ | 31 /* KeyCode.KeyA */ }
        }
    }));
    class EndCommand extends CoreEditorCommand {
        constructor(opts) {
            super(opts);
            this._inSelectionMode = opts.inSelectionMode;
        }
        runCoreEditorCommand(viewModel, args) {
            viewModel.model.pushStackElement();
            viewModel.setCursorStates(args.source, 3 /* CursorChangeReason.Explicit */, CursorMoveCommands.moveToEndOfLine(viewModel, viewModel.getCursorStates(), this._inSelectionMode, args.sticky || false));
            viewModel.revealAllCursors(args.source, true);
        }
    }
    CoreNavigationCommands.CursorEnd = registerEditorCommand(new EndCommand({
        inSelectionMode: false,
        id: 'cursorEnd',
        precondition: undefined,
        kbOpts: {
            args: { sticky: false },
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 13 /* KeyCode.End */,
            mac: { primary: 13 /* KeyCode.End */, secondary: [2048 /* KeyMod.CtrlCmd */ | 17 /* KeyCode.RightArrow */] }
        },
        metadata: {
            description: `Go to End`,
            args: [{
                    name: 'args',
                    schema: {
                        type: 'object',
                        properties: {
                            'sticky': {
                                description: nls.localize('stickydesc', "Stick to the end even when going to longer lines"),
                                type: 'boolean',
                                default: false
                            }
                        }
                    }
                }]
        }
    }));
    CoreNavigationCommands.CursorEndSelect = registerEditorCommand(new EndCommand({
        inSelectionMode: true,
        id: 'cursorEndSelect',
        precondition: undefined,
        kbOpts: {
            args: { sticky: false },
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 1024 /* KeyMod.Shift */ | 13 /* KeyCode.End */,
            mac: { primary: 1024 /* KeyMod.Shift */ | 13 /* KeyCode.End */, secondary: [2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 17 /* KeyCode.RightArrow */] }
        },
        metadata: {
            description: `Select to End`,
            args: [{
                    name: 'args',
                    schema: {
                        type: 'object',
                        properties: {
                            'sticky': {
                                description: nls.localize('stickydesc', "Stick to the end even when going to longer lines"),
                                type: 'boolean',
                                default: false
                            }
                        }
                    }
                }]
        }
    }));
    class LineEndCommand extends CoreEditorCommand {
        constructor(opts) {
            super(opts);
            this._inSelectionMode = opts.inSelectionMode;
        }
        runCoreEditorCommand(viewModel, args) {
            viewModel.model.pushStackElement();
            viewModel.setCursorStates(args.source, 3 /* CursorChangeReason.Explicit */, this._exec(viewModel, viewModel.getCursorStates()));
            viewModel.revealAllCursors(args.source, true);
        }
        _exec(viewModel, cursors) {
            const result = [];
            for (let i = 0, len = cursors.length; i < len; i++) {
                const cursor = cursors[i];
                const lineNumber = cursor.modelState.position.lineNumber;
                const maxColumn = viewModel.model.getLineMaxColumn(lineNumber);
                result[i] = CursorState.fromModelState(cursor.modelState.move(this._inSelectionMode, lineNumber, maxColumn, 0));
            }
            return result;
        }
    }
    CoreNavigationCommands.CursorLineEnd = registerEditorCommand(new LineEndCommand({
        inSelectionMode: false,
        id: 'cursorLineEnd',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 0,
            mac: { primary: 256 /* KeyMod.WinCtrl */ | 35 /* KeyCode.KeyE */ }
        }
    }));
    CoreNavigationCommands.CursorLineEndSelect = registerEditorCommand(new LineEndCommand({
        inSelectionMode: true,
        id: 'cursorLineEndSelect',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 0,
            mac: { primary: 256 /* KeyMod.WinCtrl */ | 1024 /* KeyMod.Shift */ | 35 /* KeyCode.KeyE */ }
        }
    }));
    class TopCommand extends CoreEditorCommand {
        constructor(opts) {
            super(opts);
            this._inSelectionMode = opts.inSelectionMode;
        }
        runCoreEditorCommand(viewModel, args) {
            viewModel.model.pushStackElement();
            viewModel.setCursorStates(args.source, 3 /* CursorChangeReason.Explicit */, CursorMoveCommands.moveToBeginningOfBuffer(viewModel, viewModel.getCursorStates(), this._inSelectionMode));
            viewModel.revealAllCursors(args.source, true);
        }
    }
    CoreNavigationCommands.CursorTop = registerEditorCommand(new TopCommand({
        inSelectionMode: false,
        id: 'cursorTop',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 2048 /* KeyMod.CtrlCmd */ | 14 /* KeyCode.Home */,
            mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 16 /* KeyCode.UpArrow */ }
        }
    }));
    CoreNavigationCommands.CursorTopSelect = registerEditorCommand(new TopCommand({
        inSelectionMode: true,
        id: 'cursorTopSelect',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 14 /* KeyCode.Home */,
            mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 16 /* KeyCode.UpArrow */ }
        }
    }));
    class BottomCommand extends CoreEditorCommand {
        constructor(opts) {
            super(opts);
            this._inSelectionMode = opts.inSelectionMode;
        }
        runCoreEditorCommand(viewModel, args) {
            viewModel.model.pushStackElement();
            viewModel.setCursorStates(args.source, 3 /* CursorChangeReason.Explicit */, CursorMoveCommands.moveToEndOfBuffer(viewModel, viewModel.getCursorStates(), this._inSelectionMode));
            viewModel.revealAllCursors(args.source, true);
        }
    }
    CoreNavigationCommands.CursorBottom = registerEditorCommand(new BottomCommand({
        inSelectionMode: false,
        id: 'cursorBottom',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 2048 /* KeyMod.CtrlCmd */ | 13 /* KeyCode.End */,
            mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */ }
        }
    }));
    CoreNavigationCommands.CursorBottomSelect = registerEditorCommand(new BottomCommand({
        inSelectionMode: true,
        id: 'cursorBottomSelect',
        precondition: undefined,
        kbOpts: {
            weight: CORE_WEIGHT,
            kbExpr: EditorContextKeys.textInputFocus,
            primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 13 /* KeyCode.End */,
            mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 18 /* KeyCode.DownArrow */ }
        }
    }));
    class EditorScrollImpl extends CoreEditorCommand {
        constructor() {
            super({
                id: 'editorScroll',
                precondition: undefined,
                metadata: EditorScroll_.metadata
            });
        }
        determineScrollMethod(args) {
            const horizontalUnits = [6 /* EditorScroll_.Unit.Column */];
            const verticalUnits = [
                1 /* EditorScroll_.Unit.Line */,
                2 /* EditorScroll_.Unit.WrappedLine */,
                3 /* EditorScroll_.Unit.Page */,
                4 /* EditorScroll_.Unit.HalfPage */,
                5 /* EditorScroll_.Unit.Editor */
            ];
            const horizontalDirections = [4 /* EditorScroll_.Direction.Left */, 2 /* EditorScroll_.Direction.Right */];
            const verticalDirections = [1 /* EditorScroll_.Direction.Up */, 3 /* EditorScroll_.Direction.Down */];
            if (horizontalUnits.includes(args.unit) && horizontalDirections.includes(args.direction)) {
                return this._runHorizontalEditorScroll.bind(this);
            }
            if (verticalUnits.includes(args.unit) && verticalDirections.includes(args.direction)) {
                return this._runVerticalEditorScroll.bind(this);
            }
            return null;
        }
        runCoreEditorCommand(viewModel, args) {
            const parsed = EditorScroll_.parse(args);
            if (!parsed) {
                // illegal arguments
                return;
            }
            const runEditorScroll = this.determineScrollMethod(parsed);
            if (!runEditorScroll) {
                // Incompatible unit and direction
                return;
            }
            runEditorScroll(viewModel, args.source, parsed);
        }
        _runVerticalEditorScroll(viewModel, source, args) {
            const desiredScrollTop = this._computeDesiredScrollTop(viewModel, args);
            if (args.revealCursor) {
                // must ensure cursor is in new visible range
                const desiredVisibleViewRange = viewModel.getCompletelyVisibleViewRangeAtScrollTop(desiredScrollTop);
                const paddedRange = viewModel.getViewRangeWithCursorPadding(desiredVisibleViewRange);
                viewModel.setCursorStates(source, 3 /* CursorChangeReason.Explicit */, [
                    CursorMoveCommands.findPositionInViewportIfOutside(viewModel, viewModel.getPrimaryCursorState(), paddedRange, args.select)
                ]);
            }
            viewModel.viewLayout.setScrollPosition({ scrollTop: desiredScrollTop }, 0 /* ScrollType.Smooth */);
        }
        _computeDesiredScrollTop(viewModel, args) {
            if (args.unit === 1 /* EditorScroll_.Unit.Line */) {
                // scrolling by model lines
                const futureViewport = viewModel.viewLayout.getFutureViewport();
                const visibleViewRange = viewModel.getCompletelyVisibleViewRangeAtScrollTop(futureViewport.top);
                const visibleModelRange = viewModel.coordinatesConverter.convertViewRangeToModelRange(visibleViewRange);
                let desiredTopModelLineNumber;
                if (args.direction === 1 /* EditorScroll_.Direction.Up */) {
                    // must go x model lines up
                    desiredTopModelLineNumber = Math.max(1, visibleModelRange.startLineNumber - args.value);
                }
                else {
                    // must go x model lines down
                    desiredTopModelLineNumber = Math.min(viewModel.model.getLineCount(), visibleModelRange.startLineNumber + args.value);
                }
                const viewPosition = viewModel.coordinatesConverter.convertModelPositionToViewPosition(new Position(desiredTopModelLineNumber, 1));
                return viewModel.viewLayout.getVerticalOffsetForLineNumber(viewPosition.lineNumber);
            }
            if (args.unit === 5 /* EditorScroll_.Unit.Editor */) {
                let desiredTopModelLineNumber = 0;
                if (args.direction === 3 /* EditorScroll_.Direction.Down */) {
                    desiredTopModelLineNumber = viewModel.model.getLineCount() - viewModel.cursorConfig.pageSize;
                }
                return viewModel.viewLayout.getVerticalOffsetForLineNumber(desiredTopModelLineNumber);
            }
            let noOfLines;
            if (args.unit === 3 /* EditorScroll_.Unit.Page */) {
                noOfLines = viewModel.cursorConfig.pageSize * args.value;
            }
            else if (args.unit === 4 /* EditorScroll_.Unit.HalfPage */) {
                noOfLines = Math.round(viewModel.cursorConfig.pageSize / 2) * args.value;
            }
            else {
                noOfLines = args.value;
            }
            const deltaLines = (args.direction === 1 /* EditorScroll_.Direction.Up */ ? -1 : 1) * noOfLines;
            return viewModel.viewLayout.getCurrentScrollTop() + deltaLines * viewModel.cursorConfig.lineHeight;
        }
        _runHorizontalEditorScroll(viewModel, source, args) {
            const desiredScrollLeft = this._computeDesiredScrollLeft(viewModel, args);
            viewModel.viewLayout.setScrollPosition({ scrollLeft: desiredScrollLeft }, 0 /* ScrollType.Smooth */);
        }
        _computeDesiredScrollLeft(viewModel, args) {
            const deltaColumns = (args.direction === 4 /* EditorScroll_.Direction.Left */ ? -1 : 1) * args.value;
            return viewModel.viewLayout.getCurrentScrollLeft() + deltaColumns * viewModel.cursorConfig.typicalHalfwidthCharacterWidth;
        }
    }
    CoreNavigationCommands.EditorScrollImpl = EditorScrollImpl;
    CoreNavigationCommands.EditorScroll = registerEditorCommand(new EditorScrollImpl());
    CoreNavigationCommands.ScrollLineUp = registerEditorCommand(new class extends CoreEditorCommand {
        constructor() {
            super({
                id: 'scrollLineUp',
                precondition: undefined,
                kbOpts: {
                    weight: CORE_WEIGHT,
                    kbExpr: EditorContextKeys.textInputFocus,
                    primary: 2048 /* KeyMod.CtrlCmd */ | 16 /* KeyCode.UpArrow */,
                    mac: { primary: 256 /* KeyMod.WinCtrl */ | 11 /* KeyCode.PageUp */ }
                }
            });
        }
        runCoreEditorCommand(viewModel, args) {
            CoreNavigationCommands.EditorScroll.runCoreEditorCommand(viewModel, {
                to: EditorScroll_.RawDirection.Up,
                by: EditorScroll_.RawUnit.WrappedLine,
                value: 1,
                revealCursor: false,
                select: false,
                source: args.source
            });
        }
    });
    CoreNavigationCommands.ScrollPageUp = registerEditorCommand(new class extends CoreEditorCommand {
        constructor() {
            super({
                id: 'scrollPageUp',
                precondition: undefined,
                kbOpts: {
                    weight: CORE_WEIGHT,
                    kbExpr: EditorContextKeys.textInputFocus,
                    primary: 2048 /* KeyMod.CtrlCmd */ | 11 /* KeyCode.PageUp */,
                    win: { primary: 512 /* KeyMod.Alt */ | 11 /* KeyCode.PageUp */ },
                    linux: { primary: 512 /* KeyMod.Alt */ | 11 /* KeyCode.PageUp */ }
                }
            });
        }
        runCoreEditorCommand(viewModel, args) {
            CoreNavigationCommands.EditorScroll.runCoreEditorCommand(viewModel, {
                to: EditorScroll_.RawDirection.Up,
                by: EditorScroll_.RawUnit.Page,
                value: 1,
                revealCursor: false,
                select: false,
                source: args.source
            });
        }
    });
    CoreNavigationCommands.ScrollEditorTop = registerEditorCommand(new class extends CoreEditorCommand {
        constructor() {
            super({
                id: 'scrollEditorTop',
                precondition: undefined,
                kbOpts: {
                    weight: CORE_WEIGHT,
                    kbExpr: EditorContextKeys.textInputFocus,
                }
            });
        }
        runCoreEditorCommand(viewModel, args) {
            CoreNavigationCommands.EditorScroll.runCoreEditorCommand(viewModel, {
                to: EditorScroll_.RawDirection.Up,
                by: EditorScroll_.RawUnit.Editor,
                value: 1,
                revealCursor: false,
                select: false,
                source: args.source
            });
        }
    });
    CoreNavigationCommands.ScrollLineDown = registerEditorCommand(new class extends CoreEditorCommand {
        constructor() {
            super({
                id: 'scrollLineDown',
                precondition: undefined,
                kbOpts: {
                    weight: CORE_WEIGHT,
                    kbExpr: EditorContextKeys.textInputFocus,
                    primary: 2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */,
                    mac: { primary: 256 /* KeyMod.WinCtrl */ | 12 /* KeyCode.PageDown */ }
                }
            });
        }
        runCoreEditorCommand(viewModel, args) {
            CoreNavigationCommands.EditorScroll.runCoreEditorCommand(viewModel, {
                to: EditorScroll_.RawDirection.Down,
                by: EditorScroll_.RawUnit.WrappedLine,
                value: 1,
                revealCursor: false,
                select: false,
                source: args.source
            });
        }
    });
    CoreNavigationCommands.ScrollPageDown = registerEditorCommand(new class extends CoreEditorCommand {
        constructor() {
            super({
                id: 'scrollPageDown',
                precondition: undefined,
                kbOpts: {
                    weight: CORE_WEIGHT,
                    kbExpr: EditorContextKeys.textInputFocus,
                    primary: 2048 /* KeyMod.CtrlCmd */ | 12 /* KeyCode.PageDown */,
                    win: { primary: 512 /* KeyMod.Alt */ | 12 /* KeyCode.PageDown */ },
                    linux: { primary: 512 /* KeyMod.Alt */ | 12 /* KeyCode.PageDown */ }
                }
            });
        }
        runCoreEditorCommand(viewModel, args) {
            CoreNavigationCommands.EditorScroll.runCoreEditorCommand(viewModel, {
                to: EditorScroll_.RawDirection.Down,
                by: EditorScroll_.RawUnit.Page,
                value: 1,
                revealCursor: false,
                select: false,
                source: args.source
            });
        }
    });
    CoreNavigationCommands.ScrollEditorBottom = registerEditorCommand(new class extends CoreEditorCommand {
        constructor() {
            super({
                id: 'scrollEditorBottom',
                precondition: undefined,
                kbOpts: {
                    weight: CORE_WEIGHT,
                    kbExpr: EditorContextKeys.textInputFocus,
                }
            });
        }
        runCoreEditorCommand(viewModel, args) {
            CoreNavigationCommands.EditorScroll.runCoreEditorCommand(viewModel, {
                to: EditorScroll_.RawDirection.Down,
                by: EditorScroll_.RawUnit.Editor,
                value: 1,
                revealCursor: false,
                select: false,
                source: args.source
            });
        }
    });
    CoreNavigationCommands.ScrollLeft = registerEditorCommand(new class extends CoreEditorCommand {
        constructor() {
            super({
                id: 'scrollLeft',
                precondition: undefined,
                kbOpts: {
                    weight: CORE_WEIGHT,
                    kbExpr: EditorContextKeys.textInputFocus,
                }
            });
        }
        runCoreEditorCommand(viewModel, args) {
            CoreNavigationCommands.EditorScroll.runCoreEditorCommand(viewModel, {
                to: EditorScroll_.RawDirection.Left,
                by: EditorScroll_.RawUnit.Column,
                value: 2,
                revealCursor: false,
                select: false,
                source: args.source
            });
        }
    });
    CoreNavigationCommands.ScrollRight = registerEditorCommand(new class extends CoreEditorCommand {
        constructor() {
            super({
                id: 'scrollRight',
                precondition: undefined,
                kbOpts: {
                    weight: CORE_WEIGHT,
                    kbExpr: EditorContextKeys.textInputFocus,
                }
            });
        }
        runCoreEditorCommand(viewModel, args) {
            CoreNavigationCommands.EditorScroll.runCoreEditorCommand(viewModel, {
                to: EditorScroll_.RawDirection.Right,
                by: EditorScroll_.RawUnit.Column,
                value: 2,
                revealCursor: false,
                select: false,
                source: args.source
            });
        }
    });
    class WordCommand extends CoreEditorCommand {
        constructor(opts) {
            super(opts);
            this._inSelectionMode = opts.inSelectionMode;
        }
        runCoreEditorCommand(viewModel, args) {
            if (!args.position) {
                return;
            }
            viewModel.model.pushStackElement();
            viewModel.setCursorStates(args.source, 3 /* CursorChangeReason.Explicit */, [
                CursorMoveCommands.word(viewModel, viewModel.getPrimaryCursorState(), this._inSelectionMode, args.position)
            ]);
            if (args.revealType !== 2 /* NavigationCommandRevealType.None */) {
                viewModel.revealAllCursors(args.source, true, true);
            }
        }
    }
    CoreNavigationCommands.WordSelect = registerEditorCommand(new WordCommand({
        inSelectionMode: false,
        id: '_wordSelect',
        precondition: undefined
    }));
    CoreNavigationCommands.WordSelectDrag = registerEditorCommand(new WordCommand({
        inSelectionMode: true,
        id: '_wordSelectDrag',
        precondition: undefined
    }));
    CoreNavigationCommands.LastCursorWordSelect = registerEditorCommand(new class extends CoreEditorCommand {
        constructor() {
            super({
                id: 'lastCursorWordSelect',
                precondition: undefined
            });
        }
        runCoreEditorCommand(viewModel, args) {
            if (!args.position) {
                return;
            }
            const lastAddedCursorIndex = viewModel.getLastAddedCursorIndex();
            const states = viewModel.getCursorStates();
            const newStates = states.slice(0);
            const lastAddedState = states[lastAddedCursorIndex];
            newStates[lastAddedCursorIndex] = CursorMoveCommands.word(viewModel, lastAddedState, lastAddedState.modelState.hasSelection(), args.position);
            viewModel.model.pushStackElement();
            viewModel.setCursorStates(args.source, 3 /* CursorChangeReason.Explicit */, newStates);
        }
    });
    class LineCommand extends CoreEditorCommand {
        constructor(opts) {
            super(opts);
            this._inSelectionMode = opts.inSelectionMode;
        }
        runCoreEditorCommand(viewModel, args) {
            if (!args.position) {
                return;
            }
            viewModel.model.pushStackElement();
            viewModel.setCursorStates(args.source, 3 /* CursorChangeReason.Explicit */, [
                CursorMoveCommands.line(viewModel, viewModel.getPrimaryCursorState(), this._inSelectionMode, args.position, args.viewPosition)
            ]);
            if (args.revealType !== 2 /* NavigationCommandRevealType.None */) {
                viewModel.revealAllCursors(args.source, false, true);
            }
        }
    }
    CoreNavigationCommands.LineSelect = registerEditorCommand(new LineCommand({
        inSelectionMode: false,
        id: '_lineSelect',
        precondition: undefined
    }));
    CoreNavigationCommands.LineSelectDrag = registerEditorCommand(new LineCommand({
        inSelectionMode: true,
        id: '_lineSelectDrag',
        precondition: undefined
    }));
    class LastCursorLineCommand extends CoreEditorCommand {
        constructor(opts) {
            super(opts);
            this._inSelectionMode = opts.inSelectionMode;
        }
        runCoreEditorCommand(viewModel, args) {
            if (!args.position) {
                return;
            }
            const lastAddedCursorIndex = viewModel.getLastAddedCursorIndex();
            const states = viewModel.getCursorStates();
            const newStates = states.slice(0);
            newStates[lastAddedCursorIndex] = CursorMoveCommands.line(viewModel, states[lastAddedCursorIndex], this._inSelectionMode, args.position, args.viewPosition);
            viewModel.model.pushStackElement();
            viewModel.setCursorStates(args.source, 3 /* CursorChangeReason.Explicit */, newStates);
        }
    }
    CoreNavigationCommands.LastCursorLineSelect = registerEditorCommand(new LastCursorLineCommand({
        inSelectionMode: false,
        id: 'lastCursorLineSelect',
        precondition: undefined
    }));
    CoreNavigationCommands.LastCursorLineSelectDrag = registerEditorCommand(new LastCursorLineCommand({
        inSelectionMode: true,
        id: 'lastCursorLineSelectDrag',
        precondition: undefined
    }));
    CoreNavigationCommands.CancelSelection = registerEditorCommand(new class extends CoreEditorCommand {
        constructor() {
            super({
                id: 'cancelSelection',
                precondition: EditorContextKeys.hasNonEmptySelection,
                kbOpts: {
                    weight: CORE_WEIGHT,
                    kbExpr: EditorContextKeys.textInputFocus,
                    primary: 9 /* KeyCode.Escape */,
                    secondary: [1024 /* KeyMod.Shift */ | 9 /* KeyCode.Escape */]
                }
            });
        }
        runCoreEditorCommand(viewModel, args) {
            viewModel.model.pushStackElement();
            viewModel.setCursorStates(args.source, 3 /* CursorChangeReason.Explicit */, [
                CursorMoveCommands.cancelSelection(viewModel, viewModel.getPrimaryCursorState())
            ]);
            viewModel.revealAllCursors(args.source, true);
        }
    });
    CoreNavigationCommands.RemoveSecondaryCursors = registerEditorCommand(new class extends CoreEditorCommand {
        constructor() {
            super({
                id: 'removeSecondaryCursors',
                precondition: EditorContextKeys.hasMultipleSelections,
                kbOpts: {
                    weight: CORE_WEIGHT + 1,
                    kbExpr: EditorContextKeys.textInputFocus,
                    primary: 9 /* KeyCode.Escape */,
                    secondary: [1024 /* KeyMod.Shift */ | 9 /* KeyCode.Escape */]
                }
            });
        }
        runCoreEditorCommand(viewModel, args) {
            viewModel.model.pushStackElement();
            viewModel.setCursorStates(args.source, 3 /* CursorChangeReason.Explicit */, [
                viewModel.getPrimaryCursorState()
            ]);
            viewModel.revealAllCursors(args.source, true);
            status(nls.localize('removedCursor', "Removed secondary cursors"));
        }
    });
    CoreNavigationCommands.RevealLine = registerEditorCommand(new class extends CoreEditorCommand {
        constructor() {
            super({
                id: 'revealLine',
                precondition: undefined,
                metadata: RevealLine_.metadata
            });
        }
        runCoreEditorCommand(viewModel, args) {
            const revealLineArg = args;
            const lineNumberArg = revealLineArg.lineNumber || 0;
            let lineNumber = typeof lineNumberArg === 'number' ? (lineNumberArg + 1) : (parseInt(lineNumberArg) + 1);
            if (lineNumber < 1) {
                lineNumber = 1;
            }
            const lineCount = viewModel.model.getLineCount();
            if (lineNumber > lineCount) {
                lineNumber = lineCount;
            }
            const range = new Range(lineNumber, 1, lineNumber, viewModel.model.getLineMaxColumn(lineNumber));
            let revealAt = 0 /* VerticalRevealType.Simple */;
            if (revealLineArg.at) {
                switch (revealLineArg.at) {
                    case RevealLine_.RawAtArgument.Top:
                        revealAt = 3 /* VerticalRevealType.Top */;
                        break;
                    case RevealLine_.RawAtArgument.Center:
                        revealAt = 1 /* VerticalRevealType.Center */;
                        break;
                    case RevealLine_.RawAtArgument.Bottom:
                        revealAt = 4 /* VerticalRevealType.Bottom */;
                        break;
                    default:
                        break;
                }
            }
            const viewRange = viewModel.coordinatesConverter.convertModelRangeToViewRange(range);
            viewModel.revealRange(args.source, false, viewRange, revealAt, 0 /* ScrollType.Smooth */);
        }
    });
    CoreNavigationCommands.SelectAll = new class extends EditorOrNativeTextInputCommand {
        constructor() {
            super(SelectAllCommand);
        }
        runDOMCommand(activeElement) {
            if (isFirefox) {
                activeElement.focus();
                activeElement.select();
            }
            activeElement.ownerDocument.execCommand('selectAll');
        }
        runEditorCommand(accessor, editor, args) {
            const viewModel = editor._getViewModel();
            if (!viewModel) {
                // the editor has no view => has no cursors
                return;
            }
            this.runCoreEditorCommand(viewModel, args);
        }
        runCoreEditorCommand(viewModel, args) {
            viewModel.model.pushStackElement();
            viewModel.setCursorStates('keyboard', 3 /* CursorChangeReason.Explicit */, [
                CursorMoveCommands.selectAll(viewModel, viewModel.getPrimaryCursorState())
            ]);
        }
    }();
    CoreNavigationCommands.SetSelection = registerEditorCommand(new class extends CoreEditorCommand {
        constructor() {
            super({
                id: 'setSelection',
                precondition: undefined
            });
        }
        runCoreEditorCommand(viewModel, args) {
            if (!args.selection) {
                return;
            }
            viewModel.model.pushStackElement();
            viewModel.setCursorStates(args.source, 3 /* CursorChangeReason.Explicit */, [
                CursorState.fromModelSelection(args.selection)
            ]);
        }
    });
})(CoreNavigationCommands || (CoreNavigationCommands = {}));
const columnSelectionCondition = ContextKeyExpr.and(EditorContextKeys.textInputFocus, EditorContextKeys.columnSelection);
function registerColumnSelection(id, keybinding) {
    KeybindingsRegistry.registerKeybindingRule({
        id: id,
        primary: keybinding,
        when: columnSelectionCondition,
        weight: CORE_WEIGHT + 1
    });
}
registerColumnSelection(CoreNavigationCommands.CursorColumnSelectLeft.id, 1024 /* KeyMod.Shift */ | 15 /* KeyCode.LeftArrow */);
registerColumnSelection(CoreNavigationCommands.CursorColumnSelectRight.id, 1024 /* KeyMod.Shift */ | 17 /* KeyCode.RightArrow */);
registerColumnSelection(CoreNavigationCommands.CursorColumnSelectUp.id, 1024 /* KeyMod.Shift */ | 16 /* KeyCode.UpArrow */);
registerColumnSelection(CoreNavigationCommands.CursorColumnSelectPageUp.id, 1024 /* KeyMod.Shift */ | 11 /* KeyCode.PageUp */);
registerColumnSelection(CoreNavigationCommands.CursorColumnSelectDown.id, 1024 /* KeyMod.Shift */ | 18 /* KeyCode.DownArrow */);
registerColumnSelection(CoreNavigationCommands.CursorColumnSelectPageDown.id, 1024 /* KeyMod.Shift */ | 12 /* KeyCode.PageDown */);
function registerCommand(command) {
    command.register();
    return command;
}
export var CoreEditingCommands;
(function (CoreEditingCommands) {
    class CoreEditingCommand extends EditorCommand {
        runEditorCommand(accessor, editor, args) {
            const viewModel = editor._getViewModel();
            if (!viewModel) {
                // the editor has no view => has no cursors
                return;
            }
            this.runCoreEditingCommand(editor, viewModel, args || {});
        }
    }
    CoreEditingCommands.CoreEditingCommand = CoreEditingCommand;
    CoreEditingCommands.LineBreakInsert = registerEditorCommand(new class extends CoreEditingCommand {
        constructor() {
            super({
                id: 'lineBreakInsert',
                precondition: EditorContextKeys.writable,
                kbOpts: {
                    weight: CORE_WEIGHT,
                    kbExpr: EditorContextKeys.textInputFocus,
                    primary: 0,
                    mac: { primary: 256 /* KeyMod.WinCtrl */ | 45 /* KeyCode.KeyO */ }
                }
            });
        }
        runCoreEditingCommand(editor, viewModel, args) {
            editor.pushUndoStop();
            editor.executeCommands(this.id, EnterOperation.lineBreakInsert(viewModel.cursorConfig, viewModel.model, viewModel.getCursorStates().map(s => s.modelState.selection)));
        }
    });
    CoreEditingCommands.Outdent = registerEditorCommand(new class extends CoreEditingCommand {
        constructor() {
            super({
                id: 'outdent',
                precondition: EditorContextKeys.writable,
                kbOpts: {
                    weight: CORE_WEIGHT,
                    kbExpr: ContextKeyExpr.and(EditorContextKeys.editorTextFocus, EditorContextKeys.tabDoesNotMoveFocus),
                    primary: 1024 /* KeyMod.Shift */ | 2 /* KeyCode.Tab */
                }
            });
        }
        runCoreEditingCommand(editor, viewModel, args) {
            editor.pushUndoStop();
            editor.executeCommands(this.id, TypeOperations.outdent(viewModel.cursorConfig, viewModel.model, viewModel.getCursorStates().map(s => s.modelState.selection)));
            editor.pushUndoStop();
        }
    });
    CoreEditingCommands.Tab = registerEditorCommand(new class extends CoreEditingCommand {
        constructor() {
            super({
                id: 'tab',
                precondition: EditorContextKeys.writable,
                kbOpts: {
                    weight: CORE_WEIGHT,
                    kbExpr: ContextKeyExpr.and(EditorContextKeys.editorTextFocus, EditorContextKeys.tabDoesNotMoveFocus),
                    primary: 2 /* KeyCode.Tab */
                }
            });
        }
        runCoreEditingCommand(editor, viewModel, args) {
            editor.pushUndoStop();
            editor.executeCommands(this.id, TypeOperations.tab(viewModel.cursorConfig, viewModel.model, viewModel.getCursorStates().map(s => s.modelState.selection)));
            editor.pushUndoStop();
        }
    });
    CoreEditingCommands.DeleteLeft = registerEditorCommand(new class extends CoreEditingCommand {
        constructor() {
            super({
                id: 'deleteLeft',
                precondition: undefined,
                kbOpts: {
                    weight: CORE_WEIGHT,
                    kbExpr: EditorContextKeys.textInputFocus,
                    primary: 1 /* KeyCode.Backspace */,
                    secondary: [1024 /* KeyMod.Shift */ | 1 /* KeyCode.Backspace */],
                    mac: { primary: 1 /* KeyCode.Backspace */, secondary: [1024 /* KeyMod.Shift */ | 1 /* KeyCode.Backspace */, 256 /* KeyMod.WinCtrl */ | 38 /* KeyCode.KeyH */, 256 /* KeyMod.WinCtrl */ | 1 /* KeyCode.Backspace */] }
                }
            });
        }
        runCoreEditingCommand(editor, viewModel, args) {
            const [shouldPushStackElementBefore, commands] = DeleteOperations.deleteLeft(viewModel.getPrevEditOperationType(), viewModel.cursorConfig, viewModel.model, viewModel.getCursorStates().map(s => s.modelState.selection), viewModel.getCursorAutoClosedCharacters());
            if (shouldPushStackElementBefore) {
                editor.pushUndoStop();
            }
            editor.executeCommands(this.id, commands);
            viewModel.setPrevEditOperationType(2 /* EditOperationType.DeletingLeft */);
        }
    });
    CoreEditingCommands.DeleteRight = registerEditorCommand(new class extends CoreEditingCommand {
        constructor() {
            super({
                id: 'deleteRight',
                precondition: undefined,
                kbOpts: {
                    weight: CORE_WEIGHT,
                    kbExpr: EditorContextKeys.textInputFocus,
                    primary: 20 /* KeyCode.Delete */,
                    mac: { primary: 20 /* KeyCode.Delete */, secondary: [256 /* KeyMod.WinCtrl */ | 34 /* KeyCode.KeyD */, 256 /* KeyMod.WinCtrl */ | 20 /* KeyCode.Delete */] }
                }
            });
        }
        runCoreEditingCommand(editor, viewModel, args) {
            const [shouldPushStackElementBefore, commands] = DeleteOperations.deleteRight(viewModel.getPrevEditOperationType(), viewModel.cursorConfig, viewModel.model, viewModel.getCursorStates().map(s => s.modelState.selection));
            if (shouldPushStackElementBefore) {
                editor.pushUndoStop();
            }
            editor.executeCommands(this.id, commands);
            viewModel.setPrevEditOperationType(3 /* EditOperationType.DeletingRight */);
        }
    });
    CoreEditingCommands.Undo = new class extends EditorOrNativeTextInputCommand {
        constructor() {
            super(UndoCommand);
        }
        runDOMCommand(activeElement) {
            activeElement.ownerDocument.execCommand('undo');
        }
        runEditorCommand(accessor, editor, args) {
            if (!editor.hasModel() || editor.getOption(104 /* EditorOption.readOnly */) === true) {
                return;
            }
            return editor.getModel().undo();
        }
    }();
    CoreEditingCommands.Redo = new class extends EditorOrNativeTextInputCommand {
        constructor() {
            super(RedoCommand);
        }
        runDOMCommand(activeElement) {
            activeElement.ownerDocument.execCommand('redo');
        }
        runEditorCommand(accessor, editor, args) {
            if (!editor.hasModel() || editor.getOption(104 /* EditorOption.readOnly */) === true) {
                return;
            }
            return editor.getModel().redo();
        }
    }();
})(CoreEditingCommands || (CoreEditingCommands = {}));
/**
 * A command that will invoke a command on the focused editor.
 */
class EditorHandlerCommand extends Command {
    constructor(id, handlerId, metadata) {
        super({
            id: id,
            precondition: undefined,
            metadata
        });
        this._handlerId = handlerId;
    }
    runCommand(accessor, args) {
        const editor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
        if (!editor) {
            return;
        }
        editor.trigger('keyboard', this._handlerId, args);
    }
}
function registerOverwritableCommand(handlerId, metadata) {
    registerCommand(new EditorHandlerCommand('default:' + handlerId, handlerId));
    registerCommand(new EditorHandlerCommand(handlerId, handlerId, metadata));
}
registerOverwritableCommand("type" /* Handler.Type */, {
    description: `Type`,
    args: [{
            name: 'args',
            schema: {
                'type': 'object',
                'required': ['text'],
                'properties': {
                    'text': {
                        'type': 'string'
                    }
                },
            }
        }]
});
registerOverwritableCommand("replacePreviousChar" /* Handler.ReplacePreviousChar */);
registerOverwritableCommand("compositionType" /* Handler.CompositionType */);
registerOverwritableCommand("compositionStart" /* Handler.CompositionStart */);
registerOverwritableCommand("compositionEnd" /* Handler.CompositionEnd */);
registerOverwritableCommand("paste" /* Handler.Paste */);
registerOverwritableCommand("cut" /* Handler.Cut */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29yZUNvbW1hbmRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvY29yZUNvbW1hbmRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sY0FBYyxDQUFDO0FBQ3BDLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUUxRCxPQUFPLEtBQUssS0FBSyxNQUFNLDRCQUE0QixDQUFDO0FBQ3BELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUU1RCxPQUFPLEVBQUUsT0FBTyxFQUFFLGFBQWEsRUFBbUIscUJBQXFCLEVBQWdCLFdBQVcsRUFBRSxXQUFXLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqSyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZUFBZSxFQUF1QixNQUFNLDJDQUEyQyxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxXQUFXLEVBQTRELE1BQU0sMkJBQTJCLENBQUM7QUFDbEgsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFOUUsT0FBTyxFQUFFLFVBQVUsSUFBSSxXQUFXLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN2RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDMUUsT0FBTyxFQUFhLFFBQVEsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ2pFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUVoRCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUduRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFF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