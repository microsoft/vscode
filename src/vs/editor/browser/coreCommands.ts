/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { isFirefox } from 'vs/base/browser/browser';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import * as types from 'vs/base/common/types';
import { status } from 'vs/base/browser/ui/aria/aria';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Command, EditorCommand, ICommandOptions, registerEditorCommand, MultiCommand, UndoCommand, RedoCommand, SelectAllCommand } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { ColumnSelection, IColumnSelectResult } from 'vs/editor/common/cursor/cursorColumnSelection';
import { CursorState, EditOperationType, IColumnSelectData, PartialCursorState } from 'vs/editor/common/cursorCommon';
import { DeleteOperations } from 'vs/editor/common/cursor/cursorDeleteOperations';
import { CursorChangeReason } from 'vs/editor/common/cursorEvents';
import { CursorMove as CursorMove_, CursorMoveCommands } from 'vs/editor/common/cursor/cursorMoveCommands';
import { TypeOperations } from 'vs/editor/common/cursor/cursorTypeOperations';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Handler, ScrollType } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { VerticalRevealType } from 'vs/editor/common/viewEvents';
import { ICommandMetadata } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight, KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IViewModel } from 'vs/editor/common/viewModel';
import { ISelection } from 'vs/editor/common/core/selection';
import { getActiveElement } from 'vs/base/browser/dom';
import { EnterOperation } from 'vs/editor/common/cursor/cursorTypeEditOperations';

const CORE_WEIGHT = KeybindingWeight.EditorCore;

export abstract class CoreEditorCommand<T> extends EditorCommand {
	public runEditorCommand(accessor: ServicesAccessor | null, editor: ICodeEditor, args?: Partial<T> | null): void {
		const viewModel = editor._getViewModel();
		if (!viewModel) {
			// the editor has no view => has no cursors
			return;
		}
		this.runCoreEditorCommand(viewModel, args || {});
	}

	public abstract runCoreEditorCommand(viewModel: IViewModel, args: Partial<T>): void;
}

export namespace EditorScroll_ {

	const isEditorScrollArgs = function (arg: any): boolean {
		if (!types.isObject(arg)) {
			return false;
		}

		const scrollArg: RawArguments = arg;

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

	export const metadata: ICommandMetadata = {
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
	export const RawDirection = {
		Up: 'up',
		Right: 'right',
		Down: 'down',
		Left: 'left'
	};

	/**
	 * Units for editor scroll 'by' argument
	 */
	export const RawUnit = {
		Line: 'line',
		WrappedLine: 'wrappedLine',
		Page: 'page',
		HalfPage: 'halfPage',
		Editor: 'editor',
		Column: 'column'
	};

	/**
	 * Arguments for editor scroll command
	 */
	export interface RawArguments {
		to: string;
		by?: string;
		value?: number;
		revealCursor?: boolean;
		select?: boolean;
	}

	export function parse(args: Partial<RawArguments>): ParsedArguments | null {
		let direction: Direction;
		switch (args.to) {
			case RawDirection.Up:
				direction = Direction.Up;
				break;
			case RawDirection.Right:
				direction = Direction.Right;
				break;
			case RawDirection.Down:
				direction = Direction.Down;
				break;
			case RawDirection.Left:
				direction = Direction.Left;
				break;
			default:
				// Illegal arguments
				return null;
		}

		let unit: Unit;
		switch (args.by) {
			case RawUnit.Line:
				unit = Unit.Line;
				break;
			case RawUnit.WrappedLine:
				unit = Unit.WrappedLine;
				break;
			case RawUnit.Page:
				unit = Unit.Page;
				break;
			case RawUnit.HalfPage:
				unit = Unit.HalfPage;
				break;
			case RawUnit.Editor:
				unit = Unit.Editor;
				break;
			case RawUnit.Column:
				unit = Unit.Column;
				break;
			default:
				unit = Unit.WrappedLine;
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

	export interface ParsedArguments {
		direction: Direction;
		unit: Unit;
		value: number;
		revealCursor: boolean;
		select: boolean;
	}


	export const enum Direction {
		Up = 1,
		Right = 2,
		Down = 3,
		Left = 4
	}

	export const enum Unit {
		Line = 1,
		WrappedLine = 2,
		Page = 3,
		HalfPage = 4,
		Editor = 5,
		Column = 6
	}
}

export namespace RevealLine_ {

	const isRevealLineArgs = function (arg: any): boolean {
		if (!types.isObject(arg)) {
			return false;
		}

		const reveaLineArg: RawArguments = arg;

		if (!types.isNumber(reveaLineArg.lineNumber) && !types.isString(reveaLineArg.lineNumber)) {
			return false;
		}

		if (!types.isUndefined(reveaLineArg.at) && !types.isString(reveaLineArg.at)) {
			return false;
		}

		return true;
	};

	export const metadata: ICommandMetadata = {
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
	 * Arguments for reveal line command
	 */
	export interface RawArguments {
		lineNumber?: number | string;
		at?: string;
	}

	/**
	 * Values for reveal line 'at' argument
	 */
	export const RawAtArgument = {
		Top: 'top',
		Center: 'center',
		Bottom: 'bottom'
	};
}

abstract class EditorOrNativeTextInputCommand {

	constructor(target: MultiCommand) {
		// 1. handle case when focus is in editor.
		target.addImplementation(10000, 'code-editor', (accessor: ServicesAccessor, args: unknown) => {
			// Only if editor text focus (i.e. not if editor has widget focus).
			const focusedEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
			if (focusedEditor && focusedEditor.hasTextFocus()) {
				return this._runEditorCommand(accessor, focusedEditor, args);
			}
			return false;
		});

		// 2. handle case when focus is in some other `input` / `textarea`.
		target.addImplementation(1000, 'generic-dom-input-textarea', (accessor: ServicesAccessor, args: unknown) => {
			// Only if focused on an element that allows for entering text
			const activeElement = getActiveElement();
			if (activeElement && ['input', 'textarea'].indexOf(activeElement.tagName.toLowerCase()) >= 0) {
				this.runDOMCommand(activeElement);
				return true;
			}
			return false;
		});

		// 3. (default) handle case when focus is somewhere else.
		target.addImplementation(0, 'generic-dom', (accessor: ServicesAccessor, args: unknown) => {
			// Redirecting to active editor
			const activeEditor = accessor.get(ICodeEditorService).getActiveCodeEditor();
			if (activeEditor) {
				activeEditor.focus();
				return this._runEditorCommand(accessor, activeEditor, args);
			}
			return false;
		});
	}

	public _runEditorCommand(accessor: ServicesAccessor | null, editor: ICodeEditor, args: unknown): boolean | Promise<void> {
		const result = this.runEditorCommand(accessor, editor, args);
		if (result) {
			return result;
		}
		return true;
	}

	public abstract runDOMCommand(activeElement: Element): void;
	public abstract runEditorCommand(accessor: ServicesAccessor | null, editor: ICodeEditor, args: unknown): void | Promise<void>;
}

export const enum NavigationCommandRevealType {
	/**
	 * Do regular revealing.
	 */
	Regular = 0,
	/**
	 * Do only minimal revealing.
	 */
	Minimal = 1,
	/**
	 * Do not reveal the position.
	 */
	None = 2
}

export namespace CoreNavigationCommands {

	export interface BaseCommandOptions {
		source?: 'mouse' | 'keyboard' | string;
	}

	export interface MoveCommandOptions extends BaseCommandOptions {
		position: IPosition;
		viewPosition?: IPosition;
		revealType: NavigationCommandRevealType;
	}

	class BaseMoveToCommand extends CoreEditorCommand<MoveCommandOptions> {

		private readonly _inSelectionMode: boolean;

		constructor(opts: ICommandOptions & { inSelectionMode: boolean }) {
			super(opts);
			this._inSelectionMode = opts.inSelectionMode;
		}

		public runCoreEditorCommand(viewModel: IViewModel, args: Partial<MoveCommandOptions>): void {
			if (!args.position) {
				return;
			}
			viewModel.model.pushStackElement();
			const cursorStateChanged = viewModel.setCursorStates(
				args.source,
				CursorChangeReason.Explicit,
				[
					CursorMoveCommands.moveTo(viewModel, viewModel.getPrimaryCursorState(), this._inSelectionMode, args.position, args.viewPosition)
				]
			);
			if (cursorStateChanged && args.revealType !== NavigationCommandRevealType.None) {
				viewModel.revealAllCursors(args.source, true, true);
			}
		}
	}

	export const MoveTo: CoreEditorCommand<MoveCommandOptions> = registerEditorCommand(new BaseMoveToCommand({
		id: '_moveTo',
		inSelectionMode: false,
		precondition: undefined
	}));

	export const MoveToSelect: CoreEditorCommand<MoveCommandOptions> = registerEditorCommand(new BaseMoveToCommand({
		id: '_moveToSelect',
		inSelectionMode: true,
		precondition: undefined
	}));

	abstract class ColumnSelectCommand<T extends BaseCommandOptions = BaseCommandOptions> extends CoreEditorCommand<T> {
		public runCoreEditorCommand(viewModel: IViewModel, args: Partial<T>): void {
			viewModel.model.pushStackElement();
			const result = this._getColumnSelectResult(viewModel, viewModel.getPrimaryCursorState(), viewModel.getCursorColumnSelectData(), args);
			if (result === null) {
				// invalid arguments
				return;
			}
			viewModel.setCursorStates(args.source, CursorChangeReason.Explicit, result.viewStates.map((viewState) => CursorState.fromViewState(viewState)));
			viewModel.setCursorColumnSelectData({
				isReal: true,
				fromViewLineNumber: result.fromLineNumber,
				fromViewVisualColumn: result.fromVisualColumn,
				toViewLineNumber: result.toLineNumber,
				toViewVisualColumn: result.toVisualColumn
			});
			if (result.reversed) {
				viewModel.revealTopMostCursor(args.source);
			} else {
				viewModel.revealBottomMostCursor(args.source);
			}
		}

		protected abstract _getColumnSelectResult(viewModel: IViewModel, primary: CursorState, prevColumnSelectData: IColumnSelectData, args: Partial<T>): IColumnSelectResult | null;

	}

	export interface ColumnSelectCommandOptions extends BaseCommandOptions {
		position: IPosition;
		viewPosition: IPosition;
		mouseColumn: number;
		doColumnSelect: boolean;
	}

	export const ColumnSelect: CoreEditorCommand<ColumnSelectCommandOptions> = registerEditorCommand(new class extends ColumnSelectCommand<ColumnSelectCommandOptions> {
		constructor() {
			super({
				id: 'columnSelect',
				precondition: undefined
			});
		}

		protected _getColumnSelectResult(viewModel: IViewModel, primary: CursorState, prevColumnSelectData: IColumnSelectData, args: Partial<ColumnSelectCommandOptions>): IColumnSelectResult | null {
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

	export const CursorColumnSelectLeft: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new class extends ColumnSelectCommand {
		constructor() {
			super({
				id: 'cursorColumnSelectLeft',
				precondition: undefined,
				kbOpts: {
					weight: CORE_WEIGHT,
					kbExpr: EditorContextKeys.textInputFocus,
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.LeftArrow,
					linux: { primary: 0 }
				}
			});
		}

		protected _getColumnSelectResult(viewModel: IViewModel, primary: CursorState, prevColumnSelectData: IColumnSelectData, args: Partial<BaseCommandOptions>): IColumnSelectResult {
			return ColumnSelection.columnSelectLeft(viewModel.cursorConfig, viewModel, prevColumnSelectData);
		}
	});

	export const CursorColumnSelectRight: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new class extends ColumnSelectCommand {
		constructor() {
			super({
				id: 'cursorColumnSelectRight',
				precondition: undefined,
				kbOpts: {
					weight: CORE_WEIGHT,
					kbExpr: EditorContextKeys.textInputFocus,
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.RightArrow,
					linux: { primary: 0 }
				}
			});
		}

		protected _getColumnSelectResult(viewModel: IViewModel, primary: CursorState, prevColumnSelectData: IColumnSelectData, args: Partial<BaseCommandOptions>): IColumnSelectResult {
			return ColumnSelection.columnSelectRight(viewModel.cursorConfig, viewModel, prevColumnSelectData);
		}
	});

	class ColumnSelectUpCommand extends ColumnSelectCommand {

		private readonly _isPaged: boolean;

		constructor(opts: ICommandOptions & { isPaged: boolean }) {
			super(opts);
			this._isPaged = opts.isPaged;
		}

		protected _getColumnSelectResult(viewModel: IViewModel, primary: CursorState, prevColumnSelectData: IColumnSelectData, args: Partial<BaseCommandOptions>): IColumnSelectResult {
			return ColumnSelection.columnSelectUp(viewModel.cursorConfig, viewModel, prevColumnSelectData, this._isPaged);
		}
	}

	export const CursorColumnSelectUp: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new ColumnSelectUpCommand({
		isPaged: false,
		id: 'cursorColumnSelectUp',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.UpArrow,
			linux: { primary: 0 }
		}
	}));

	export const CursorColumnSelectPageUp: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new ColumnSelectUpCommand({
		isPaged: true,
		id: 'cursorColumnSelectPageUp',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.PageUp,
			linux: { primary: 0 }
		}
	}));

	class ColumnSelectDownCommand extends ColumnSelectCommand {

		private readonly _isPaged: boolean;

		constructor(opts: ICommandOptions & { isPaged: boolean }) {
			super(opts);
			this._isPaged = opts.isPaged;
		}

		protected _getColumnSelectResult(viewModel: IViewModel, primary: CursorState, prevColumnSelectData: IColumnSelectData, args: Partial<BaseCommandOptions>): IColumnSelectResult {
			return ColumnSelection.columnSelectDown(viewModel.cursorConfig, viewModel, prevColumnSelectData, this._isPaged);
		}
	}

	export const CursorColumnSelectDown: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new ColumnSelectDownCommand({
		isPaged: false,
		id: 'cursorColumnSelectDown',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.DownArrow,
			linux: { primary: 0 }
		}
	}));

	export const CursorColumnSelectPageDown: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new ColumnSelectDownCommand({
		isPaged: true,
		id: 'cursorColumnSelectPageDown',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.PageDown,
			linux: { primary: 0 }
		}
	}));

	export class CursorMoveImpl extends CoreEditorCommand<CursorMove_.RawArguments> {
		constructor() {
			super({
				id: 'cursorMove',
				precondition: undefined,
				metadata: CursorMove_.metadata
			});
		}

		public runCoreEditorCommand(viewModel: IViewModel, args: Partial<BaseCommandOptions & CursorMove_.RawArguments>): void {
			const parsed = CursorMove_.parse(args);
			if (!parsed) {
				// illegal arguments
				return;
			}
			this._runCursorMove(viewModel, args.source, parsed);
		}

		private _runCursorMove(viewModel: IViewModel, source: string | null | undefined, args: CursorMove_.ParsedArguments): void {
			viewModel.model.pushStackElement();
			viewModel.setCursorStates(
				source,
				CursorChangeReason.Explicit,
				CursorMoveImpl._move(viewModel, viewModel.getCursorStates(), args)
			);
			viewModel.revealAllCursors(source, true);
		}

		private static _move(viewModel: IViewModel, cursors: CursorState[], args: CursorMove_.ParsedArguments): PartialCursorState[] | null {
			const inSelectionMode = args.select;
			const value = args.value;

			switch (args.direction) {
				case CursorMove_.Direction.Left:
				case CursorMove_.Direction.Right:
				case CursorMove_.Direction.Up:
				case CursorMove_.Direction.Down:
				case CursorMove_.Direction.PrevBlankLine:
				case CursorMove_.Direction.NextBlankLine:
				case CursorMove_.Direction.WrappedLineStart:
				case CursorMove_.Direction.WrappedLineFirstNonWhitespaceCharacter:
				case CursorMove_.Direction.WrappedLineColumnCenter:
				case CursorMove_.Direction.WrappedLineEnd:
				case CursorMove_.Direction.WrappedLineLastNonWhitespaceCharacter:
					return CursorMoveCommands.simpleMove(viewModel, cursors, args.direction, inSelectionMode, value, args.unit);

				case CursorMove_.Direction.ViewPortTop:
				case CursorMove_.Direction.ViewPortBottom:
				case CursorMove_.Direction.ViewPortCenter:
				case CursorMove_.Direction.ViewPortIfOutside:
					return CursorMoveCommands.viewportMove(viewModel, cursors, args.direction, inSelectionMode, value);
				default:
					return null;
			}
		}
	}

	export const CursorMove: CursorMoveImpl = registerEditorCommand(new CursorMoveImpl());

	const enum Constants {
		PAGE_SIZE_MARKER = -1
	}

	export interface CursorMoveCommandOptions extends BaseCommandOptions {
		pageSize?: number;
	}

	class CursorMoveBasedCommand extends CoreEditorCommand<CursorMoveCommandOptions> {

		private readonly _staticArgs: CursorMove_.SimpleMoveArguments;

		constructor(opts: ICommandOptions & { args: CursorMove_.SimpleMoveArguments }) {
			super(opts);
			this._staticArgs = opts.args;
		}

		public runCoreEditorCommand(viewModel: IViewModel, dynamicArgs: Partial<CursorMoveCommandOptions>): void {
			let args = this._staticArgs;
			if (this._staticArgs.value === Constants.PAGE_SIZE_MARKER) {
				// -1 is a marker for page size
				args = {
					direction: this._staticArgs.direction,
					unit: this._staticArgs.unit,
					select: this._staticArgs.select,
					value: dynamicArgs.pageSize || viewModel.cursorConfig.pageSize
				};
			}

			viewModel.model.pushStackElement();
			viewModel.setCursorStates(
				dynamicArgs.source,
				CursorChangeReason.Explicit,
				CursorMoveCommands.simpleMove(viewModel, viewModel.getCursorStates(), args.direction, args.select, args.value, args.unit)
			);
			viewModel.revealAllCursors(dynamicArgs.source, true);
		}
	}

	export const CursorLeft: CoreEditorCommand<CursorMoveCommandOptions> = registerEditorCommand(new CursorMoveBasedCommand({
		args: {
			direction: CursorMove_.Direction.Left,
			unit: CursorMove_.Unit.None,
			select: false,
			value: 1
		},
		id: 'cursorLeft',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: KeyCode.LeftArrow,
			mac: { primary: KeyCode.LeftArrow, secondary: [KeyMod.WinCtrl | KeyCode.KeyB] }
		}
	}));

	export const CursorLeftSelect: CoreEditorCommand<CursorMoveCommandOptions> = registerEditorCommand(new CursorMoveBasedCommand({
		args: {
			direction: CursorMove_.Direction.Left,
			unit: CursorMove_.Unit.None,
			select: true,
			value: 1
		},
		id: 'cursorLeftSelect',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: KeyMod.Shift | KeyCode.LeftArrow
		}
	}));

	export const CursorRight: CoreEditorCommand<CursorMoveCommandOptions> = registerEditorCommand(new CursorMoveBasedCommand({
		args: {
			direction: CursorMove_.Direction.Right,
			unit: CursorMove_.Unit.None,
			select: false,
			value: 1
		},
		id: 'cursorRight',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: KeyCode.RightArrow,
			mac: { primary: KeyCode.RightArrow, secondary: [KeyMod.WinCtrl | KeyCode.KeyF] }
		}
	}));

	export const CursorRightSelect: CoreEditorCommand<CursorMoveCommandOptions> = registerEditorCommand(new CursorMoveBasedCommand({
		args: {
			direction: CursorMove_.Direction.Right,
			unit: CursorMove_.Unit.None,
			select: true,
			value: 1
		},
		id: 'cursorRightSelect',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: KeyMod.Shift | KeyCode.RightArrow
		}
	}));

	export const CursorUp: CoreEditorCommand<CursorMoveCommandOptions> = registerEditorCommand(new CursorMoveBasedCommand({
		args: {
			direction: CursorMove_.Direction.Up,
			unit: CursorMove_.Unit.WrappedLine,
			select: false,
			value: 1
		},
		id: 'cursorUp',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: KeyCode.UpArrow,
			mac: { primary: KeyCode.UpArrow, secondary: [KeyMod.WinCtrl | KeyCode.KeyP] }
		}
	}));

	export const CursorUpSelect: CoreEditorCommand<CursorMoveCommandOptions> = registerEditorCommand(new CursorMoveBasedCommand({
		args: {
			direction: CursorMove_.Direction.Up,
			unit: CursorMove_.Unit.WrappedLine,
			select: true,
			value: 1
		},
		id: 'cursorUpSelect',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: KeyMod.Shift | KeyCode.UpArrow,
			secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow],
			mac: { primary: KeyMod.Shift | KeyCode.UpArrow },
			linux: { primary: KeyMod.Shift | KeyCode.UpArrow }
		}
	}));

	export const CursorPageUp: CoreEditorCommand<CursorMoveCommandOptions> = registerEditorCommand(new CursorMoveBasedCommand({
		args: {
			direction: CursorMove_.Direction.Up,
			unit: CursorMove_.Unit.WrappedLine,
			select: false,
			value: Constants.PAGE_SIZE_MARKER
		},
		id: 'cursorPageUp',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: KeyCode.PageUp
		}
	}));

	export const CursorPageUpSelect: CoreEditorCommand<CursorMoveCommandOptions> = registerEditorCommand(new CursorMoveBasedCommand({
		args: {
			direction: CursorMove_.Direction.Up,
			unit: CursorMove_.Unit.WrappedLine,
			select: true,
			value: Constants.PAGE_SIZE_MARKER
		},
		id: 'cursorPageUpSelect',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: KeyMod.Shift | KeyCode.PageUp
		}
	}));

	export const CursorDown: CoreEditorCommand<CursorMoveCommandOptions> = registerEditorCommand(new CursorMoveBasedCommand({
		args: {
			direction: CursorMove_.Direction.Down,
			unit: CursorMove_.Unit.WrappedLine,
			select: false,
			value: 1
		},
		id: 'cursorDown',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: KeyCode.DownArrow,
			mac: { primary: KeyCode.DownArrow, secondary: [KeyMod.WinCtrl | KeyCode.KeyN] }
		}
	}));

	export const CursorDownSelect: CoreEditorCommand<CursorMoveCommandOptions> = registerEditorCommand(new CursorMoveBasedCommand({
		args: {
			direction: CursorMove_.Direction.Down,
			unit: CursorMove_.Unit.WrappedLine,
			select: true,
			value: 1
		},
		id: 'cursorDownSelect',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: KeyMod.Shift | KeyCode.DownArrow,
			secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow],
			mac: { primary: KeyMod.Shift | KeyCode.DownArrow },
			linux: { primary: KeyMod.Shift | KeyCode.DownArrow }
		}
	}));

	export const CursorPageDown: CoreEditorCommand<CursorMoveCommandOptions> = registerEditorCommand(new CursorMoveBasedCommand({
		args: {
			direction: CursorMove_.Direction.Down,
			unit: CursorMove_.Unit.WrappedLine,
			select: false,
			value: Constants.PAGE_SIZE_MARKER
		},
		id: 'cursorPageDown',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: KeyCode.PageDown
		}
	}));

	export const CursorPageDownSelect: CoreEditorCommand<CursorMoveCommandOptions> = registerEditorCommand(new CursorMoveBasedCommand({
		args: {
			direction: CursorMove_.Direction.Down,
			unit: CursorMove_.Unit.WrappedLine,
			select: true,
			value: Constants.PAGE_SIZE_MARKER
		},
		id: 'cursorPageDownSelect',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: KeyMod.Shift | KeyCode.PageDown
		}
	}));

	export interface CreateCursorCommandOptions extends MoveCommandOptions {
		wholeLine?: boolean;
	}

	export const CreateCursor: CoreEditorCommand<CreateCursorCommandOptions> = registerEditorCommand(new class extends CoreEditorCommand<CreateCursorCommandOptions> {
		constructor() {
			super({
				id: 'createCursor',
				precondition: undefined
			});
		}

		public runCoreEditorCommand(viewModel: IViewModel, args: Partial<CreateCursorCommandOptions>): void {
			if (!args.position) {
				return;
			}
			let newState: PartialCursorState;
			if (args.wholeLine) {
				newState = CursorMoveCommands.line(viewModel, viewModel.getPrimaryCursorState(), false, args.position, args.viewPosition);
			} else {
				newState = CursorMoveCommands.moveTo(viewModel, viewModel.getPrimaryCursorState(), false, args.position, args.viewPosition);
			}

			const states: PartialCursorState[] = viewModel.getCursorStates();

			// Check if we should remove a cursor (sort of like a toggle)
			if (states.length > 1) {
				const newModelPosition = (newState.modelState ? newState.modelState.position : null);
				const newViewPosition = (newState.viewState ? newState.viewState.position : null);

				for (let i = 0, len = states.length; i < len; i++) {
					const state = states[i];

					if (newModelPosition && !state.modelState!.selection.containsPosition(newModelPosition)) {
						continue;
					}

					if (newViewPosition && !state.viewState!.selection.containsPosition(newViewPosition)) {
						continue;
					}

					// => Remove the cursor
					states.splice(i, 1);

					viewModel.model.pushStackElement();
					viewModel.setCursorStates(
						args.source,
						CursorChangeReason.Explicit,
						states
					);
					return;
				}
			}

			// => Add the new cursor
			states.push(newState);

			viewModel.model.pushStackElement();
			viewModel.setCursorStates(
				args.source,
				CursorChangeReason.Explicit,
				states
			);
		}
	});

	export const LastCursorMoveToSelect: CoreEditorCommand<MoveCommandOptions> = registerEditorCommand(new class extends CoreEditorCommand<MoveCommandOptions> {
		constructor() {
			super({
				id: '_lastCursorMoveToSelect',
				precondition: undefined
			});
		}

		public runCoreEditorCommand(viewModel: IViewModel, args: Partial<MoveCommandOptions>): void {
			if (!args.position) {
				return;
			}
			const lastAddedCursorIndex = viewModel.getLastAddedCursorIndex();

			const states = viewModel.getCursorStates();
			const newStates: PartialCursorState[] = states.slice(0);
			newStates[lastAddedCursorIndex] = CursorMoveCommands.moveTo(viewModel, states[lastAddedCursorIndex], true, args.position, args.viewPosition);

			viewModel.model.pushStackElement();
			viewModel.setCursorStates(
				args.source,
				CursorChangeReason.Explicit,
				newStates
			);
		}
	});

	class HomeCommand extends CoreEditorCommand<BaseCommandOptions> {

		private readonly _inSelectionMode: boolean;

		constructor(opts: ICommandOptions & { inSelectionMode: boolean }) {
			super(opts);
			this._inSelectionMode = opts.inSelectionMode;
		}

		public runCoreEditorCommand(viewModel: IViewModel, args: Partial<BaseCommandOptions>): void {
			viewModel.model.pushStackElement();
			viewModel.setCursorStates(
				args.source,
				CursorChangeReason.Explicit,
				CursorMoveCommands.moveToBeginningOfLine(viewModel, viewModel.getCursorStates(), this._inSelectionMode)
			);
			viewModel.revealAllCursors(args.source, true);
		}
	}

	export const CursorHome: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new HomeCommand({
		inSelectionMode: false,
		id: 'cursorHome',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: KeyCode.Home,
			mac: { primary: KeyCode.Home, secondary: [KeyMod.CtrlCmd | KeyCode.LeftArrow] }
		}
	}));

	export const CursorHomeSelect: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new HomeCommand({
		inSelectionMode: true,
		id: 'cursorHomeSelect',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: KeyMod.Shift | KeyCode.Home,
			mac: { primary: KeyMod.Shift | KeyCode.Home, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow] }
		}
	}));

	class LineStartCommand extends CoreEditorCommand<BaseCommandOptions> {

		private readonly _inSelectionMode: boolean;

		constructor(opts: ICommandOptions & { inSelectionMode: boolean }) {
			super(opts);
			this._inSelectionMode = opts.inSelectionMode;
		}

		public runCoreEditorCommand(viewModel: IViewModel, args: Partial<BaseCommandOptions>): void {
			viewModel.model.pushStackElement();
			viewModel.setCursorStates(
				args.source,
				CursorChangeReason.Explicit,
				this._exec(viewModel.getCursorStates())
			);
			viewModel.revealAllCursors(args.source, true);
		}

		private _exec(cursors: CursorState[]): PartialCursorState[] {
			const result: PartialCursorState[] = [];
			for (let i = 0, len = cursors.length; i < len; i++) {
				const cursor = cursors[i];
				const lineNumber = cursor.modelState.position.lineNumber;
				result[i] = CursorState.fromModelState(cursor.modelState.move(this._inSelectionMode, lineNumber, 1, 0));
			}
			return result;
		}
	}

	export const CursorLineStart: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new LineStartCommand({
		inSelectionMode: false,
		id: 'cursorLineStart',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: 0,
			mac: { primary: KeyMod.WinCtrl | KeyCode.KeyA }
		}
	}));

	export const CursorLineStartSelect: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new LineStartCommand({
		inSelectionMode: true,
		id: 'cursorLineStartSelect',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: 0,
			mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KeyA }
		}
	}));

	export interface EndCommandOptions extends BaseCommandOptions {
		sticky?: boolean;
	}

	class EndCommand extends CoreEditorCommand<EndCommandOptions> {

		private readonly _inSelectionMode: boolean;

		constructor(opts: ICommandOptions & { inSelectionMode: boolean }) {
			super(opts);
			this._inSelectionMode = opts.inSelectionMode;
		}

		public runCoreEditorCommand(viewModel: IViewModel, args: Partial<EndCommandOptions>): void {
			viewModel.model.pushStackElement();
			viewModel.setCursorStates(
				args.source,
				CursorChangeReason.Explicit,
				CursorMoveCommands.moveToEndOfLine(viewModel, viewModel.getCursorStates(), this._inSelectionMode, args.sticky || false)
			);
			viewModel.revealAllCursors(args.source, true);
		}
	}

	export const CursorEnd: CoreEditorCommand<EndCommandOptions> = registerEditorCommand(new EndCommand({
		inSelectionMode: false,
		id: 'cursorEnd',
		precondition: undefined,
		kbOpts: {
			args: { sticky: false },
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: KeyCode.End,
			mac: { primary: KeyCode.End, secondary: [KeyMod.CtrlCmd | KeyCode.RightArrow] }
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

	export const CursorEndSelect: CoreEditorCommand<EndCommandOptions> = registerEditorCommand(new EndCommand({
		inSelectionMode: true,
		id: 'cursorEndSelect',
		precondition: undefined,
		kbOpts: {
			args: { sticky: false },
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: KeyMod.Shift | KeyCode.End,
			mac: { primary: KeyMod.Shift | KeyCode.End, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow] }
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

	class LineEndCommand extends CoreEditorCommand<BaseCommandOptions> {

		private readonly _inSelectionMode: boolean;

		constructor(opts: ICommandOptions & { inSelectionMode: boolean }) {
			super(opts);
			this._inSelectionMode = opts.inSelectionMode;
		}

		public runCoreEditorCommand(viewModel: IViewModel, args: Partial<BaseCommandOptions>): void {
			viewModel.model.pushStackElement();
			viewModel.setCursorStates(
				args.source,
				CursorChangeReason.Explicit,
				this._exec(viewModel, viewModel.getCursorStates())
			);
			viewModel.revealAllCursors(args.source, true);
		}

		private _exec(viewModel: IViewModel, cursors: CursorState[]): PartialCursorState[] {
			const result: PartialCursorState[] = [];
			for (let i = 0, len = cursors.length; i < len; i++) {
				const cursor = cursors[i];
				const lineNumber = cursor.modelState.position.lineNumber;
				const maxColumn = viewModel.model.getLineMaxColumn(lineNumber);
				result[i] = CursorState.fromModelState(cursor.modelState.move(this._inSelectionMode, lineNumber, maxColumn, 0));
			}
			return result;
		}
	}

	export const CursorLineEnd: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new LineEndCommand({
		inSelectionMode: false,
		id: 'cursorLineEnd',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: 0,
			mac: { primary: KeyMod.WinCtrl | KeyCode.KeyE }
		}
	}));

	export const CursorLineEndSelect: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new LineEndCommand({
		inSelectionMode: true,
		id: 'cursorLineEndSelect',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: 0,
			mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KeyE }
		}
	}));

	class TopCommand extends CoreEditorCommand<BaseCommandOptions> {

		private readonly _inSelectionMode: boolean;

		constructor(opts: ICommandOptions & { inSelectionMode: boolean }) {
			super(opts);
			this._inSelectionMode = opts.inSelectionMode;
		}

		public runCoreEditorCommand(viewModel: IViewModel, args: Partial<BaseCommandOptions>): void {
			viewModel.model.pushStackElement();
			viewModel.setCursorStates(
				args.source,
				CursorChangeReason.Explicit,
				CursorMoveCommands.moveToBeginningOfBuffer(viewModel, viewModel.getCursorStates(), this._inSelectionMode)
			);
			viewModel.revealAllCursors(args.source, true);
		}
	}

	export const CursorTop: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new TopCommand({
		inSelectionMode: false,
		id: 'cursorTop',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: KeyMod.CtrlCmd | KeyCode.Home,
			mac: { primary: KeyMod.CtrlCmd | KeyCode.UpArrow }
		}
	}));

	export const CursorTopSelect: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new TopCommand({
		inSelectionMode: true,
		id: 'cursorTopSelect',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Home,
			mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow }
		}
	}));

	class BottomCommand extends CoreEditorCommand<BaseCommandOptions> {

		private readonly _inSelectionMode: boolean;

		constructor(opts: ICommandOptions & { inSelectionMode: boolean }) {
			super(opts);
			this._inSelectionMode = opts.inSelectionMode;
		}

		public runCoreEditorCommand(viewModel: IViewModel, args: Partial<BaseCommandOptions>): void {
			viewModel.model.pushStackElement();
			viewModel.setCursorStates(
				args.source,
				CursorChangeReason.Explicit,
				CursorMoveCommands.moveToEndOfBuffer(viewModel, viewModel.getCursorStates(), this._inSelectionMode)
			);
			viewModel.revealAllCursors(args.source, true);
		}
	}

	export const CursorBottom: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new BottomCommand({
		inSelectionMode: false,
		id: 'cursorBottom',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: KeyMod.CtrlCmd | KeyCode.End,
			mac: { primary: KeyMod.CtrlCmd | KeyCode.DownArrow }
		}
	}));

	export const CursorBottomSelect: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new BottomCommand({
		inSelectionMode: true,
		id: 'cursorBottomSelect',
		precondition: undefined,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textInputFocus,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.End,
			mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow }
		}
	}));

	export type EditorScrollCommandOptions = EditorScroll_.RawArguments & BaseCommandOptions;

	export class EditorScrollImpl extends CoreEditorCommand<EditorScrollCommandOptions> {
		constructor() {
			super({
				id: 'editorScroll',
				precondition: undefined,
				metadata: EditorScroll_.metadata
			});
		}

		determineScrollMethod(args: EditorScroll_.ParsedArguments) {
			const horizontalUnits = [EditorScroll_.Unit.Column];
			const verticalUnits = [
				EditorScroll_.Unit.Line,
				EditorScroll_.Unit.WrappedLine,
				EditorScroll_.Unit.Page,
				EditorScroll_.Unit.HalfPage,
				EditorScroll_.Unit.Editor,
				EditorScroll_.Unit.Column
			];
			const horizontalDirections = [EditorScroll_.Direction.Left, EditorScroll_.Direction.Right];
			const verticalDirections = [EditorScroll_.Direction.Up, EditorScroll_.Direction.Down];

			if (horizontalUnits.includes(args.unit) && horizontalDirections.includes(args.direction)) {
				return this._runHorizontalEditorScroll.bind(this);
			}
			if (verticalUnits.includes(args.unit) && verticalDirections.includes(args.direction)) {
				return this._runVerticalEditorScroll.bind(this);
			}
			return null;
		}

		public runCoreEditorCommand(viewModel: IViewModel, args: Partial<EditorScrollCommandOptions>): void {
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

		_runVerticalEditorScroll(viewModel: IViewModel, source: string | null | undefined, args: EditorScroll_.ParsedArguments): void {

			const desiredScrollTop = this._computeDesiredScrollTop(viewModel, args);

			if (args.revealCursor) {
				// must ensure cursor is in new visible range
				const desiredVisibleViewRange = viewModel.getCompletelyVisibleViewRangeAtScrollTop(desiredScrollTop);
				viewModel.setCursorStates(
					source,
					CursorChangeReason.Explicit,
					[
						CursorMoveCommands.findPositionInViewportIfOutside(viewModel, viewModel.getPrimaryCursorState(), desiredVisibleViewRange, args.select)
					]
				);
			}

			viewModel.viewLayout.setScrollPosition({ scrollTop: desiredScrollTop }, ScrollType.Smooth);
		}

		private _computeDesiredScrollTop(viewModel: IViewModel, args: EditorScroll_.ParsedArguments): number {

			if (args.unit === EditorScroll_.Unit.Line) {
				// scrolling by model lines
				const futureViewport = viewModel.viewLayout.getFutureViewport();
				const visibleViewRange = viewModel.getCompletelyVisibleViewRangeAtScrollTop(futureViewport.top);
				const visibleModelRange = viewModel.coordinatesConverter.convertViewRangeToModelRange(visibleViewRange);

				let desiredTopModelLineNumber: number;
				if (args.direction === EditorScroll_.Direction.Up) {
					// must go x model lines up
					desiredTopModelLineNumber = Math.max(1, visibleModelRange.startLineNumber - args.value);
				} else {
					// must go x model lines down
					desiredTopModelLineNumber = Math.min(viewModel.model.getLineCount(), visibleModelRange.startLineNumber + args.value);
				}

				const viewPosition = viewModel.coordinatesConverter.convertModelPositionToViewPosition(new Position(desiredTopModelLineNumber, 1));
				return viewModel.viewLayout.getVerticalOffsetForLineNumber(viewPosition.lineNumber);
			}

			if (args.unit === EditorScroll_.Unit.Editor) {
				let desiredTopModelLineNumber = 0;
				if (args.direction === EditorScroll_.Direction.Down) {
					desiredTopModelLineNumber = viewModel.model.getLineCount() - viewModel.cursorConfig.pageSize;
				}
				return viewModel.viewLayout.getVerticalOffsetForLineNumber(desiredTopModelLineNumber);
			}

			let noOfLines: number;
			if (args.unit === EditorScroll_.Unit.Page) {
				noOfLines = viewModel.cursorConfig.pageSize * args.value;
			} else if (args.unit === EditorScroll_.Unit.HalfPage) {
				noOfLines = Math.round(viewModel.cursorConfig.pageSize / 2) * args.value;
			} else {
				noOfLines = args.value;
			}
			const deltaLines = (args.direction === EditorScroll_.Direction.Up ? -1 : 1) * noOfLines;
			return viewModel.viewLayout.getCurrentScrollTop() + deltaLines * viewModel.cursorConfig.lineHeight;
		}

		_runHorizontalEditorScroll(viewModel: IViewModel, source: string | null | undefined, args: EditorScroll_.ParsedArguments): void {
			const desiredScrollLeft = this._computeDesiredScrollLeft(viewModel, args);
			viewModel.viewLayout.setScrollPosition({ scrollLeft: desiredScrollLeft }, ScrollType.Smooth);
		}

		_computeDesiredScrollLeft(viewModel: IViewModel, args: EditorScroll_.ParsedArguments) {
			const deltaColumns = (args.direction === EditorScroll_.Direction.Left ? -1 : 1) * args.value;
			return viewModel.viewLayout.getCurrentScrollLeft() + deltaColumns * viewModel.cursorConfig.typicalHalfwidthCharacterWidth;
		}
	}

	export const EditorScroll: EditorScrollImpl = registerEditorCommand(new EditorScrollImpl());

	export const ScrollLineUp: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new class extends CoreEditorCommand<BaseCommandOptions> {
		constructor() {
			super({
				id: 'scrollLineUp',
				precondition: undefined,
				kbOpts: {
					weight: CORE_WEIGHT,
					kbExpr: EditorContextKeys.textInputFocus,
					primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
					mac: { primary: KeyMod.WinCtrl | KeyCode.PageUp }
				}
			});
		}

		runCoreEditorCommand(viewModel: IViewModel, args: Partial<BaseCommandOptions>): void {
			EditorScroll.runCoreEditorCommand(viewModel, {
				to: EditorScroll_.RawDirection.Up,
				by: EditorScroll_.RawUnit.WrappedLine,
				value: 1,
				revealCursor: false,
				select: false,
				source: args.source
			});
		}
	});

	export const ScrollPageUp: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new class extends CoreEditorCommand<BaseCommandOptions> {
		constructor() {
			super({
				id: 'scrollPageUp',
				precondition: undefined,
				kbOpts: {
					weight: CORE_WEIGHT,
					kbExpr: EditorContextKeys.textInputFocus,
					primary: KeyMod.CtrlCmd | KeyCode.PageUp,
					win: { primary: KeyMod.Alt | KeyCode.PageUp },
					linux: { primary: KeyMod.Alt | KeyCode.PageUp }
				}
			});
		}

		runCoreEditorCommand(viewModel: IViewModel, args: Partial<BaseCommandOptions>): void {
			EditorScroll.runCoreEditorCommand(viewModel, {
				to: EditorScroll_.RawDirection.Up,
				by: EditorScroll_.RawUnit.Page,
				value: 1,
				revealCursor: false,
				select: false,
				source: args.source
			});
		}
	});

	export const ScrollEditorTop: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new class extends CoreEditorCommand<BaseCommandOptions> {
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

		runCoreEditorCommand(viewModel: IViewModel, args: Partial<BaseCommandOptions>): void {
			EditorScroll.runCoreEditorCommand(viewModel, {
				to: EditorScroll_.RawDirection.Up,
				by: EditorScroll_.RawUnit.Editor,
				value: 1,
				revealCursor: false,
				select: false,
				source: args.source
			});
		}
	});

	export const ScrollLineDown: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new class extends CoreEditorCommand<BaseCommandOptions> {
		constructor() {
			super({
				id: 'scrollLineDown',
				precondition: undefined,
				kbOpts: {
					weight: CORE_WEIGHT,
					kbExpr: EditorContextKeys.textInputFocus,
					primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
					mac: { primary: KeyMod.WinCtrl | KeyCode.PageDown }
				}
			});
		}

		runCoreEditorCommand(viewModel: IViewModel, args: Partial<BaseCommandOptions>): void {
			EditorScroll.runCoreEditorCommand(viewModel, {
				to: EditorScroll_.RawDirection.Down,
				by: EditorScroll_.RawUnit.WrappedLine,
				value: 1,
				revealCursor: false,
				select: false,
				source: args.source
			});
		}
	});

	export const ScrollPageDown: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new class extends CoreEditorCommand<BaseCommandOptions> {
		constructor() {
			super({
				id: 'scrollPageDown',
				precondition: undefined,
				kbOpts: {
					weight: CORE_WEIGHT,
					kbExpr: EditorContextKeys.textInputFocus,
					primary: KeyMod.CtrlCmd | KeyCode.PageDown,
					win: { primary: KeyMod.Alt | KeyCode.PageDown },
					linux: { primary: KeyMod.Alt | KeyCode.PageDown }
				}
			});
		}

		runCoreEditorCommand(viewModel: IViewModel, args: Partial<BaseCommandOptions>): void {
			EditorScroll.runCoreEditorCommand(viewModel, {
				to: EditorScroll_.RawDirection.Down,
				by: EditorScroll_.RawUnit.Page,
				value: 1,
				revealCursor: false,
				select: false,
				source: args.source
			});
		}
	});

	export const ScrollEditorBottom: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new class extends CoreEditorCommand<BaseCommandOptions> {
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

		runCoreEditorCommand(viewModel: IViewModel, args: Partial<BaseCommandOptions>): void {
			EditorScroll.runCoreEditorCommand(viewModel, {
				to: EditorScroll_.RawDirection.Down,
				by: EditorScroll_.RawUnit.Editor,
				value: 1,
				revealCursor: false,
				select: false,
				source: args.source
			});
		}
	});

	export const ScrollLeft: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new class extends CoreEditorCommand<BaseCommandOptions> {
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

		runCoreEditorCommand(viewModel: IViewModel, args: Partial<BaseCommandOptions>): void {
			EditorScroll.runCoreEditorCommand(viewModel, {
				to: EditorScroll_.RawDirection.Left,
				by: EditorScroll_.RawUnit.Column,
				value: 2,
				revealCursor: false,
				select: false,
				source: args.source
			});
		}
	});

	export const ScrollRight: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new class extends CoreEditorCommand<BaseCommandOptions> {
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

		runCoreEditorCommand(viewModel: IViewModel, args: Partial<BaseCommandOptions>): void {
			EditorScroll.runCoreEditorCommand(viewModel, {
				to: EditorScroll_.RawDirection.Right,
				by: EditorScroll_.RawUnit.Column,
				value: 2,
				revealCursor: false,
				select: false,
				source: args.source
			});
		}
	});

	class WordCommand extends CoreEditorCommand<MoveCommandOptions> {

		private readonly _inSelectionMode: boolean;

		constructor(opts: ICommandOptions & { inSelectionMode: boolean }) {
			super(opts);
			this._inSelectionMode = opts.inSelectionMode;
		}

		public runCoreEditorCommand(viewModel: IViewModel, args: Partial<MoveCommandOptions>): void {
			if (!args.position) {
				return;
			}
			viewModel.model.pushStackElement();
			viewModel.setCursorStates(
				args.source,
				CursorChangeReason.Explicit,
				[
					CursorMoveCommands.word(viewModel, viewModel.getPrimaryCursorState(), this._inSelectionMode, args.position)
				]
			);
			if (args.revealType !== NavigationCommandRevealType.None) {
				viewModel.revealAllCursors(args.source, true, true);
			}
		}
	}

	export const WordSelect: CoreEditorCommand<MoveCommandOptions> = registerEditorCommand(new WordCommand({
		inSelectionMode: false,
		id: '_wordSelect',
		precondition: undefined
	}));

	export const WordSelectDrag: CoreEditorCommand<MoveCommandOptions> = registerEditorCommand(new WordCommand({
		inSelectionMode: true,
		id: '_wordSelectDrag',
		precondition: undefined
	}));

	export const LastCursorWordSelect: CoreEditorCommand<MoveCommandOptions> = registerEditorCommand(new class extends CoreEditorCommand<MoveCommandOptions> {
		constructor() {
			super({
				id: 'lastCursorWordSelect',
				precondition: undefined
			});
		}

		public runCoreEditorCommand(viewModel: IViewModel, args: Partial<MoveCommandOptions>): void {
			if (!args.position) {
				return;
			}
			const lastAddedCursorIndex = viewModel.getLastAddedCursorIndex();

			const states = viewModel.getCursorStates();
			const newStates: PartialCursorState[] = states.slice(0);
			const lastAddedState = states[lastAddedCursorIndex];
			newStates[lastAddedCursorIndex] = CursorMoveCommands.word(viewModel, lastAddedState, lastAddedState.modelState.hasSelection(), args.position);

			viewModel.model.pushStackElement();
			viewModel.setCursorStates(
				args.source,
				CursorChangeReason.Explicit,
				newStates
			);
		}
	});

	class LineCommand extends CoreEditorCommand<MoveCommandOptions> {
		private readonly _inSelectionMode: boolean;

		constructor(opts: ICommandOptions & { inSelectionMode: boolean }) {
			super(opts);
			this._inSelectionMode = opts.inSelectionMode;
		}

		public runCoreEditorCommand(viewModel: IViewModel, args: Partial<MoveCommandOptions>): void {
			if (!args.position) {
				return;
			}
			viewModel.model.pushStackElement();
			viewModel.setCursorStates(
				args.source,
				CursorChangeReason.Explicit,
				[
					CursorMoveCommands.line(viewModel, viewModel.getPrimaryCursorState(), this._inSelectionMode, args.position, args.viewPosition)
				]
			);
			if (args.revealType !== NavigationCommandRevealType.None) {
				viewModel.revealAllCursors(args.source, false, true);
			}
		}
	}

	export const LineSelect: CoreEditorCommand<MoveCommandOptions> = registerEditorCommand(new LineCommand({
		inSelectionMode: false,
		id: '_lineSelect',
		precondition: undefined
	}));

	export const LineSelectDrag: CoreEditorCommand<MoveCommandOptions> = registerEditorCommand(new LineCommand({
		inSelectionMode: true,
		id: '_lineSelectDrag',
		precondition: undefined
	}));

	class LastCursorLineCommand extends CoreEditorCommand<MoveCommandOptions> {
		private readonly _inSelectionMode: boolean;

		constructor(opts: ICommandOptions & { inSelectionMode: boolean }) {
			super(opts);
			this._inSelectionMode = opts.inSelectionMode;
		}

		public runCoreEditorCommand(viewModel: IViewModel, args: Partial<MoveCommandOptions>): void {
			if (!args.position) {
				return;
			}
			const lastAddedCursorIndex = viewModel.getLastAddedCursorIndex();

			const states = viewModel.getCursorStates();
			const newStates: PartialCursorState[] = states.slice(0);
			newStates[lastAddedCursorIndex] = CursorMoveCommands.line(viewModel, states[lastAddedCursorIndex], this._inSelectionMode, args.position, args.viewPosition);

			viewModel.model.pushStackElement();
			viewModel.setCursorStates(
				args.source,
				CursorChangeReason.Explicit,
				newStates
			);
		}
	}

	export const LastCursorLineSelect: CoreEditorCommand<MoveCommandOptions> = registerEditorCommand(new LastCursorLineCommand({
		inSelectionMode: false,
		id: 'lastCursorLineSelect',
		precondition: undefined
	}));

	export const LastCursorLineSelectDrag: CoreEditorCommand<MoveCommandOptions> = registerEditorCommand(new LastCursorLineCommand({
		inSelectionMode: true,
		id: 'lastCursorLineSelectDrag',
		precondition: undefined
	}));

	export const CancelSelection: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new class extends CoreEditorCommand<BaseCommandOptions> {
		constructor() {
			super({
				id: 'cancelSelection',
				precondition: EditorContextKeys.hasNonEmptySelection,
				kbOpts: {
					weight: CORE_WEIGHT,
					kbExpr: EditorContextKeys.textInputFocus,
					primary: KeyCode.Escape,
					secondary: [KeyMod.Shift | KeyCode.Escape]
				}
			});
		}

		public runCoreEditorCommand(viewModel: IViewModel, args: Partial<BaseCommandOptions>): void {
			viewModel.model.pushStackElement();
			viewModel.setCursorStates(
				args.source,
				CursorChangeReason.Explicit,
				[
					CursorMoveCommands.cancelSelection(viewModel, viewModel.getPrimaryCursorState())
				]
			);
			viewModel.revealAllCursors(args.source, true);
		}
	});

	export const RemoveSecondaryCursors: CoreEditorCommand<BaseCommandOptions> = registerEditorCommand(new class extends CoreEditorCommand<BaseCommandOptions> {
		constructor() {
			super({
				id: 'removeSecondaryCursors',
				precondition: EditorContextKeys.hasMultipleSelections,
				kbOpts: {
					weight: CORE_WEIGHT + 1,
					kbExpr: EditorContextKeys.textInputFocus,
					primary: KeyCode.Escape,
					secondary: [KeyMod.Shift | KeyCode.Escape]
				}
			});
		}

		public runCoreEditorCommand(viewModel: IViewModel, args: Partial<BaseCommandOptions>): void {
			viewModel.model.pushStackElement();
			viewModel.setCursorStates(
				args.source,
				CursorChangeReason.Explicit,
				[
					viewModel.getPrimaryCursorState()
				]
			);
			viewModel.revealAllCursors(args.source, true);
			status(nls.localize('removedCursor', "Removed secondary cursors"));
		}
	});

	export type RevealLineCommandOptions = RevealLine_.RawArguments & BaseCommandOptions;

	export const RevealLine: CoreEditorCommand<RevealLineCommandOptions> = registerEditorCommand(new class extends CoreEditorCommand<RevealLineCommandOptions> {
		constructor() {
			super({
				id: 'revealLine',
				precondition: undefined,
				metadata: RevealLine_.metadata
			});
		}

		public runCoreEditorCommand(viewModel: IViewModel, args: Partial<RevealLineCommandOptions>): void {
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

			const range = new Range(
				lineNumber, 1,
				lineNumber, viewModel.model.getLineMaxColumn(lineNumber)
			);

			let revealAt = VerticalRevealType.Simple;
			if (revealLineArg.at) {
				switch (revealLineArg.at) {
					case RevealLine_.RawAtArgument.Top:
						revealAt = VerticalRevealType.Top;
						break;
					case RevealLine_.RawAtArgument.Center:
						revealAt = VerticalRevealType.Center;
						break;
					case RevealLine_.RawAtArgument.Bottom:
						revealAt = VerticalRevealType.Bottom;
						break;
					default:
						break;
				}
			}

			const viewRange = viewModel.coordinatesConverter.convertModelRangeToViewRange(range);

			viewModel.revealRange(args.source, false, viewRange, revealAt, ScrollType.Smooth);
		}
	});

	export const SelectAll = new class extends EditorOrNativeTextInputCommand {
		constructor() {
			super(SelectAllCommand);
		}
		public runDOMCommand(activeElement: Element): void {
			if (isFirefox) {
				(<HTMLInputElement>activeElement).focus();
				(<HTMLInputElement>activeElement).select();
			}

			activeElement.ownerDocument.execCommand('selectAll');
		}
		public runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, args: unknown): void {
			const viewModel = editor._getViewModel();
			if (!viewModel) {
				// the editor has no view => has no cursors
				return;
			}
			this.runCoreEditorCommand(viewModel, args);
		}
		public runCoreEditorCommand(viewModel: IViewModel, args: unknown): void {
			viewModel.model.pushStackElement();
			viewModel.setCursorStates(
				'keyboard',
				CursorChangeReason.Explicit,
				[
					CursorMoveCommands.selectAll(viewModel, viewModel.getPrimaryCursorState())
				]
			);
		}
	}();

	export interface SetSelectionCommandOptions extends BaseCommandOptions {
		selection: ISelection;
	}

	export const SetSelection: CoreEditorCommand<SetSelectionCommandOptions> = registerEditorCommand(new class extends CoreEditorCommand<SetSelectionCommandOptions> {
		constructor() {
			super({
				id: 'setSelection',
				precondition: undefined
			});
		}

		public runCoreEditorCommand(viewModel: IViewModel, args: Partial<SetSelectionCommandOptions>): void {
			if (!args.selection) {
				return;
			}
			viewModel.model.pushStackElement();
			viewModel.setCursorStates(
				args.source,
				CursorChangeReason.Explicit,
				[
					CursorState.fromModelSelection(args.selection)
				]
			);
		}
	});
}

const columnSelectionCondition = ContextKeyExpr.and(
	EditorContextKeys.textInputFocus,
	EditorContextKeys.columnSelection
);
function registerColumnSelection(id: string, keybinding: number): void {
	KeybindingsRegistry.registerKeybindingRule({
		id: id,
		primary: keybinding,
		when: columnSelectionCondition,
		weight: CORE_WEIGHT + 1
	});
}

registerColumnSelection(CoreNavigationCommands.CursorColumnSelectLeft.id, KeyMod.Shift | KeyCode.LeftArrow);
registerColumnSelection(CoreNavigationCommands.CursorColumnSelectRight.id, KeyMod.Shift | KeyCode.RightArrow);
registerColumnSelection(CoreNavigationCommands.CursorColumnSelectUp.id, KeyMod.Shift | KeyCode.UpArrow);
registerColumnSelection(CoreNavigationCommands.CursorColumnSelectPageUp.id, KeyMod.Shift | KeyCode.PageUp);
registerColumnSelection(CoreNavigationCommands.CursorColumnSelectDown.id, KeyMod.Shift | KeyCode.DownArrow);
registerColumnSelection(CoreNavigationCommands.CursorColumnSelectPageDown.id, KeyMod.Shift | KeyCode.PageDown);

function registerCommand<T extends Command>(command: T): T {
	command.register();
	return command;
}

export namespace CoreEditingCommands {

	export abstract class CoreEditingCommand extends EditorCommand {
		public runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, args: unknown): void {
			const viewModel = editor._getViewModel();
			if (!viewModel) {
				// the editor has no view => has no cursors
				return;
			}
			this.runCoreEditingCommand(editor, viewModel, args || {});
		}

		public abstract runCoreEditingCommand(editor: ICodeEditor, viewModel: IViewModel, args: unknown): void;
	}

	export const LineBreakInsert: EditorCommand = registerEditorCommand(new class extends CoreEditingCommand {
		constructor() {
			super({
				id: 'lineBreakInsert',
				precondition: EditorContextKeys.writable,
				kbOpts: {
					weight: CORE_WEIGHT,
					kbExpr: EditorContextKeys.textInputFocus,
					primary: 0,
					mac: { primary: KeyMod.WinCtrl | KeyCode.KeyO }
				}
			});
		}

		public runCoreEditingCommand(editor: ICodeEditor, viewModel: IViewModel, args: unknown): void {
			editor.pushUndoStop();
			editor.executeCommands(this.id, EnterOperation.lineBreakInsert(viewModel.cursorConfig, viewModel.model, viewModel.getCursorStates().map(s => s.modelState.selection)));
		}
	});

	export const Outdent: EditorCommand = registerEditorCommand(new class extends CoreEditingCommand {
		constructor() {
			super({
				id: 'outdent',
				precondition: EditorContextKeys.writable,
				kbOpts: {
					weight: CORE_WEIGHT,
					kbExpr: ContextKeyExpr.and(
						EditorContextKeys.editorTextFocus,
						EditorContextKeys.tabDoesNotMoveFocus
					),
					primary: KeyMod.Shift | KeyCode.Tab
				}
			});
		}

		public runCoreEditingCommand(editor: ICodeEditor, viewModel: IViewModel, args: unknown): void {
			editor.pushUndoStop();
			editor.executeCommands(this.id, TypeOperations.outdent(viewModel.cursorConfig, viewModel.model, viewModel.getCursorStates().map(s => s.modelState.selection)));
			editor.pushUndoStop();
		}
	});

	export const Tab: EditorCommand = registerEditorCommand(new class extends CoreEditingCommand {
		constructor() {
			super({
				id: 'tab',
				precondition: EditorContextKeys.writable,
				kbOpts: {
					weight: CORE_WEIGHT,
					kbExpr: ContextKeyExpr.and(
						EditorContextKeys.editorTextFocus,
						EditorContextKeys.tabDoesNotMoveFocus
					),
					primary: KeyCode.Tab
				}
			});
		}

		public runCoreEditingCommand(editor: ICodeEditor, viewModel: IViewModel, args: unknown): void {
			editor.pushUndoStop();
			editor.executeCommands(this.id, TypeOperations.tab(viewModel.cursorConfig, viewModel.model, viewModel.getCursorStates().map(s => s.modelState.selection)));
			editor.pushUndoStop();
		}
	});

	export const DeleteLeft: EditorCommand = registerEditorCommand(new class extends CoreEditingCommand {
		constructor() {
			super({
				id: 'deleteLeft',
				precondition: undefined,
				kbOpts: {
					weight: CORE_WEIGHT,
					kbExpr: EditorContextKeys.textInputFocus,
					primary: KeyCode.Backspace,
					secondary: [KeyMod.Shift | KeyCode.Backspace],
					mac: { primary: KeyCode.Backspace, secondary: [KeyMod.Shift | KeyCode.Backspace, KeyMod.WinCtrl | KeyCode.KeyH, KeyMod.WinCtrl | KeyCode.Backspace] }
				}
			});
		}

		public runCoreEditingCommand(editor: ICodeEditor, viewModel: IViewModel, args: unknown): void {
			const [shouldPushStackElementBefore, commands] = DeleteOperations.deleteLeft(viewModel.getPrevEditOperationType(), viewModel.cursorConfig, viewModel.model, viewModel.getCursorStates().map(s => s.modelState.selection), viewModel.getCursorAutoClosedCharacters());
			if (shouldPushStackElementBefore) {
				editor.pushUndoStop();
			}
			editor.executeCommands(this.id, commands);
			viewModel.setPrevEditOperationType(EditOperationType.DeletingLeft);
		}
	});

	export const DeleteRight: EditorCommand = registerEditorCommand(new class extends CoreEditingCommand {
		constructor() {
			super({
				id: 'deleteRight',
				precondition: undefined,
				kbOpts: {
					weight: CORE_WEIGHT,
					kbExpr: EditorContextKeys.textInputFocus,
					primary: KeyCode.Delete,
					mac: { primary: KeyCode.Delete, secondary: [KeyMod.WinCtrl | KeyCode.KeyD, KeyMod.WinCtrl | KeyCode.Delete] }
				}
			});
		}

		public runCoreEditingCommand(editor: ICodeEditor, viewModel: IViewModel, args: unknown): void {
			const [shouldPushStackElementBefore, commands] = DeleteOperations.deleteRight(viewModel.getPrevEditOperationType(), viewModel.cursorConfig, viewModel.model, viewModel.getCursorStates().map(s => s.modelState.selection));
			if (shouldPushStackElementBefore) {
				editor.pushUndoStop();
			}
			editor.executeCommands(this.id, commands);
			viewModel.setPrevEditOperationType(EditOperationType.DeletingRight);
		}
	});

	export const Undo = new class extends EditorOrNativeTextInputCommand {
		constructor() {
			super(UndoCommand);
		}
		public runDOMCommand(activeElement: Element): void {
			activeElement.ownerDocument.execCommand('undo');
		}
		public runEditorCommand(accessor: ServicesAccessor | null, editor: ICodeEditor, args: unknown): void | Promise<void> {
			if (!editor.hasModel() || editor.getOption(EditorOption.readOnly) === true) {
				return;
			}
			return editor.getModel().undo();
		}
	}();

	export const Redo = new class extends EditorOrNativeTextInputCommand {
		constructor() {
			super(RedoCommand);
		}
		public runDOMCommand(activeElement: Element): void {
			activeElement.ownerDocument.execCommand('redo');
		}
		public runEditorCommand(accessor: ServicesAccessor | null, editor: ICodeEditor, args: unknown): void | Promise<void> {
			if (!editor.hasModel() || editor.getOption(EditorOption.readOnly) === true) {
				return;
			}
			return editor.getModel().redo();
		}
	}();
}

/**
 * A command that will invoke a command on the focused editor.
 */
class EditorHandlerCommand extends Command {

	private readonly _handlerId: string;

	constructor(id: string, handlerId: string, metadata?: ICommandMetadata) {
		super({
			id: id,
			precondition: undefined,
			metadata
		});
		this._handlerId = handlerId;
	}

	public runCommand(accessor: ServicesAccessor, args: unknown): void {
		const editor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
		if (!editor) {
			return;
		}

		editor.trigger('keyboard', this._handlerId, args);
	}
}

function registerOverwritableCommand(handlerId: string, metadata?: ICommandMetadata): void {
	registerCommand(new EditorHandlerCommand('default:' + handlerId, handlerId));
	registerCommand(new EditorHandlerCommand(handlerId, handlerId, metadata));
}

registerOverwritableCommand(Handler.Type, {
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
registerOverwritableCommand(Handler.ReplacePreviousChar);
registerOverwritableCommand(Handler.CompositionType);
registerOverwritableCommand(Handler.CompositionStart);
registerOverwritableCommand(Handler.CompositionEnd);
registerOverwritableCommand(Handler.Paste);
registerOverwritableCommand(Handler.Cut);
