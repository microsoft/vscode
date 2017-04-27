/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { CursorState, ICursors, RevealTarget, IColumnSelectData, CursorContext } from 'vs/editor/common/controller/cursorCommon';
import { CursorChangeReason, VerticalRevealType } from 'vs/editor/common/controller/cursorEvents';
import { CursorMoveCommands, CursorMove as CursorMove_ } from 'vs/editor/common/controller/cursorMoveCommands';
import { EditorCommand, ICommandOptions, Command } from 'vs/editor/common/config/config';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { registerEditorCommand } from 'vs/editor/common/editorCommonExtensions';
import { IColumnSelectResult, ColumnSelection } from 'vs/editor/common/controller/cursorColumnSelection';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import H = editorCommon.Handler;
import { ICodeEditorService, getCodeEditor } from 'vs/editor/common/services/codeEditorService';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import * as types from 'vs/base/common/types';
import { ICommandHandlerDescription } from 'vs/platform/commands/common/commands';
import { IEditorService } from 'vs/platform/editor/common/editor';

const CORE_WEIGHT = KeybindingsRegistry.WEIGHT.editorCore();

export abstract class CoreEditorCommand extends EditorCommand {
	public runEditorCommand(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor, args: any): void {
		this.runCoreEditorCommand(editor._getCursors(), args || {});
	}

	public abstract runCoreEditorCommand(cursors: ICursors, args: any): void;
}

export namespace EditorScroll_ {

	const isEditorScrollArgs = function (arg): boolean {
		if (!types.isObject(arg)) {
			return false;
		}

		let scrollArg: RawArguments = arg;

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

	export const description = <ICommandHandlerDescription>{
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
						'line', 'wrappedLine', 'page', 'halfPage'
						\`\`\`
					* 'value': Number of units to move. Default is '1'.
					* 'revealCursor': If 'true' reveals the cursor if it is outside view port.
				`,
				constraint: isEditorScrollArgs
			}
		]
	};

	/**
	 * Directions in the view for editor scroll command.
	 */
	export const RawDirection = {
		Up: 'up',
		Down: 'down',
	};

	/**
	 * Units for editor scroll 'by' argument
	 */
	export const RawUnit = {
		Line: 'line',
		WrappedLine: 'wrappedLine',
		Page: 'page',
		HalfPage: 'halfPage'
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
	};

	export function parse(args: RawArguments): ParsedArguments {
		let direction: Direction;
		switch (args.to) {
			case RawDirection.Up:
				direction = Direction.Up;
				break;
			case RawDirection.Down:
				direction = Direction.Down;
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
		Down = 2
	}

	export const enum Unit {
		Line = 1,
		WrappedLine = 2,
		Page = 3,
		HalfPage = 4
	}
}

export namespace RevealLine_ {

	const isRevealLineArgs = function (arg): boolean {
		if (!types.isObject(arg)) {
			return false;
		}

		let reveaLineArg: RawArguments = arg;

		if (!types.isNumber(reveaLineArg.lineNumber)) {
			return false;
		}

		if (!types.isUndefined(reveaLineArg.at) && !types.isString(reveaLineArg.at)) {
			return false;
		}

		return true;
	};

	export const description = <ICommandHandlerDescription>{
		description: 'Reveal the given line at the given logical position',
		args: [
			{
				name: 'Reveal line argument object',
				description: `Property-value pairs that can be passed through this argument:
					* 'lineNumber': A mandatory line number value.
					* 'at': Logical position at which line has to be revealed .
						\`\`\`
						'top', 'center', 'bottom'
						\`\`\`
				`,
				constraint: isRevealLineArgs
			}
		]
	};

	/**
	 * Arguments for reveal line command
	 */
	export interface RawArguments {
		lineNumber?: number;
		at?: string;
	};

	/**
	 * Values for reveal line 'at' argument
	 */
	export const RawAtArgument = {
		Top: 'top',
		Center: 'center',
		Bottom: 'bottom'
	};
}

export namespace CoreCommands {

	class BaseMoveToCommand extends CoreEditorCommand {

		private readonly _inSelectionMode: boolean;

		constructor(opts: ICommandOptions & { inSelectionMode: boolean; }) {
			super(opts);
			this._inSelectionMode = opts.inSelectionMode;
		}

		public runCoreEditorCommand(cursors: ICursors, args: any): void {
			cursors.context.model.pushStackElement();
			cursors.setStates(
				args.source,
				CursorChangeReason.Explicit,
				[
					CursorMoveCommands.moveTo(cursors.context, cursors.getPrimaryCursor(), this._inSelectionMode, args.position, args.viewPosition)
				]
			);
			cursors.reveal(true, RevealTarget.Primary);
		}
	}

	export const MoveTo: CoreEditorCommand = registerEditorCommand(new BaseMoveToCommand({
		id: '_moveTo',
		inSelectionMode: false,
		precondition: null
	}));

	export const MoveToSelect: CoreEditorCommand = registerEditorCommand(new BaseMoveToCommand({
		id: '_moveToSelect',
		inSelectionMode: true,
		precondition: null
	}));

	abstract class ColumnSelectCommand extends CoreEditorCommand {
		public runCoreEditorCommand(cursors: ICursors, args: any): void {
			cursors.context.model.pushStackElement();
			const result = this._getColumnSelectResult(cursors.context, cursors.getPrimaryCursor(), cursors.getColumnSelectData(), args);
			cursors.setStates(args.source, CursorChangeReason.Explicit, result.viewStates.map((viewState) => CursorState.fromViewState(viewState)));
			cursors.setColumnSelectData({
				toViewLineNumber: result.toLineNumber,
				toViewVisualColumn: result.toVisualColumn
			});
			cursors.reveal(true, (result.reversed ? RevealTarget.TopMost : RevealTarget.BottomMost));
		}

		protected abstract _getColumnSelectResult(context: CursorContext, primary: CursorState, prevColumnSelectData: IColumnSelectData, args: any): IColumnSelectResult;

	}

	export const ColumnSelect: CoreEditorCommand = registerEditorCommand(new class extends ColumnSelectCommand {
		constructor() {
			super({
				id: 'columnSelect',
				precondition: null
			});
		}

		protected _getColumnSelectResult(context: CursorContext, primary: CursorState, prevColumnSelectData: IColumnSelectData, args: any): IColumnSelectResult {

			// validate `args`
			const validatedPosition = context.model.validatePosition(args.position);

			let validatedViewPosition: Position;
			if (args.viewPosition) {
				validatedViewPosition = context.validateViewPosition(new Position(args.viewPosition.lineNumber, args.viewPosition.column), validatedPosition);
			} else {
				validatedViewPosition = context.convertModelPositionToViewPosition(validatedPosition);
			}

			return ColumnSelection.columnSelect(context.config, context.viewModel, primary.viewState.selection, validatedViewPosition.lineNumber, args.mouseColumn - 1);
		}
	});

	export const CursorColumnSelectLeft: CoreEditorCommand = registerEditorCommand(new class extends ColumnSelectCommand {
		constructor() {
			super({
				id: 'cursorColumnSelectLeft',
				precondition: null,
				kbOpts: {
					weight: CORE_WEIGHT,
					kbExpr: EditorContextKeys.textFocus,
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.LeftArrow,
					linux: { primary: 0 }
				}
			});
		}

		protected _getColumnSelectResult(context: CursorContext, primary: CursorState, prevColumnSelectData: IColumnSelectData, args: any): IColumnSelectResult {
			return ColumnSelection.columnSelectLeft(context.config, context.viewModel, primary.viewState, prevColumnSelectData.toViewLineNumber, prevColumnSelectData.toViewVisualColumn);
		}
	});

	export const CursorColumnSelectRight: CoreEditorCommand = registerEditorCommand(new class extends ColumnSelectCommand {
		constructor() {
			super({
				id: 'cursorColumnSelectRight',
				precondition: null,
				kbOpts: {
					weight: CORE_WEIGHT,
					kbExpr: EditorContextKeys.textFocus,
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.RightArrow,
					linux: { primary: 0 }
				}
			});
		}

		protected _getColumnSelectResult(context: CursorContext, primary: CursorState, prevColumnSelectData: IColumnSelectData, args: any): IColumnSelectResult {
			return ColumnSelection.columnSelectRight(context.config, context.viewModel, primary.viewState, prevColumnSelectData.toViewLineNumber, prevColumnSelectData.toViewVisualColumn);
		}
	});

	class ColumnSelectUpCommand extends ColumnSelectCommand {

		private readonly _isPaged: boolean;

		constructor(opts: ICommandOptions & { isPaged: boolean; }) {
			super(opts);
			this._isPaged = opts.isPaged;
		}

		protected _getColumnSelectResult(context: CursorContext, primary: CursorState, prevColumnSelectData: IColumnSelectData, args: any): IColumnSelectResult {
			return ColumnSelection.columnSelectUp(context.config, context.viewModel, primary.viewState, this._isPaged, prevColumnSelectData.toViewLineNumber, prevColumnSelectData.toViewVisualColumn);
		}
	}

	export const CursorColumnSelectUp: CoreEditorCommand = registerEditorCommand(new ColumnSelectUpCommand({
		isPaged: false,
		id: 'cursorColumnSelectUp',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.UpArrow,
			linux: { primary: 0 }
		}
	}));

	export const CursorColumnSelectPageUp: CoreEditorCommand = registerEditorCommand(new ColumnSelectUpCommand({
		isPaged: true,
		id: 'cursorColumnSelectPageUp',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.PageUp,
			linux: { primary: 0 }
		}
	}));

	class ColumnSelectDownCommand extends ColumnSelectCommand {

		private readonly _isPaged: boolean;

		constructor(opts: ICommandOptions & { isPaged: boolean; }) {
			super(opts);
			this._isPaged = opts.isPaged;
		}

		protected _getColumnSelectResult(context: CursorContext, primary: CursorState, prevColumnSelectData: IColumnSelectData, args: any): IColumnSelectResult {
			return ColumnSelection.columnSelectDown(context.config, context.viewModel, primary.viewState, this._isPaged, prevColumnSelectData.toViewLineNumber, prevColumnSelectData.toViewVisualColumn);
		}
	}

	export const CursorColumnSelectDown: CoreEditorCommand = registerEditorCommand(new ColumnSelectDownCommand({
		isPaged: false,
		id: 'cursorColumnSelectDown',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.DownArrow,
			linux: { primary: 0 }
		}
	}));

	export const CursorColumnSelectPageDown: CoreEditorCommand = registerEditorCommand(new ColumnSelectDownCommand({
		isPaged: true,
		id: 'cursorColumnSelectPageDown',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.PageDown,
			linux: { primary: 0 }
		}
	}));

	export class CursorMoveImpl extends CoreEditorCommand {
		constructor() {
			super({
				id: 'cursorMove',
				precondition: null,
				description: CursorMove_.description
			});
		}

		public runCoreEditorCommand(cursors: ICursors, args: any): void {
			const parsed = CursorMove_.parse(args);
			if (!parsed) {
				// illegal arguments
				return;
			}
			this._runCursorMove(cursors, args.source, parsed);
		}

		_runCursorMove(cursors: ICursors, source: string, args: CursorMove_.ParsedArguments): void {
			cursors.context.model.pushStackElement();
			cursors.setStates(
				source,
				CursorChangeReason.Explicit,
				CursorState.ensureInEditableRange(
					cursors.context,
					CursorMoveCommands.move(cursors.context, cursors.getAll(), args)
				)
			);
			cursors.reveal(true, RevealTarget.Primary);
		}
	}

	export const CursorMove: CursorMoveImpl = registerEditorCommand(new CursorMoveImpl());

	const enum Constants {
		PAGE_SIZE_MARKER = -1
	}

	class CursorMoveBasedCommand extends CoreEditorCommand {

		private readonly _staticArgs: CursorMove_.ParsedArguments;

		constructor(opts: ICommandOptions & { args: CursorMove_.ParsedArguments }) {
			super(opts);
			this._staticArgs = opts.args;
		}

		public runCoreEditorCommand(cursors: ICursors, dynamicArgs: any): void {
			let args = this._staticArgs;
			if (this._staticArgs.value === Constants.PAGE_SIZE_MARKER) {
				// -1 is a marker for page size
				args = {
					direction: this._staticArgs.direction,
					unit: this._staticArgs.unit,
					select: this._staticArgs.select,
					value: cursors.context.config.pageSize
				};
			}
			CursorMove._runCursorMove(cursors, dynamicArgs.source, args);
		}
	}

	export const CursorLeft: CoreEditorCommand = registerEditorCommand(new CursorMoveBasedCommand({
		args: {
			direction: CursorMove_.Direction.Left,
			unit: CursorMove_.Unit.None,
			select: false,
			value: 1
		},
		id: 'cursorLeft',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyCode.LeftArrow,
			mac: { primary: KeyCode.LeftArrow, secondary: [KeyMod.WinCtrl | KeyCode.KEY_B] }
		}
	}));

	export const CursorLeftSelect: CoreEditorCommand = registerEditorCommand(new CursorMoveBasedCommand({
		args: {
			direction: CursorMove_.Direction.Left,
			unit: CursorMove_.Unit.None,
			select: true,
			value: 1
		},
		id: 'cursorLeftSelect',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyMod.Shift | KeyCode.LeftArrow
		}
	}));

	export const CursorRight: CoreEditorCommand = registerEditorCommand(new CursorMoveBasedCommand({
		args: {
			direction: CursorMove_.Direction.Right,
			unit: CursorMove_.Unit.None,
			select: false,
			value: 1
		},
		id: 'cursorRight',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyCode.RightArrow,
			mac: { primary: KeyCode.RightArrow, secondary: [KeyMod.WinCtrl | KeyCode.KEY_F] }
		}
	}));

	export const CursorRightSelect: CoreEditorCommand = registerEditorCommand(new CursorMoveBasedCommand({
		args: {
			direction: CursorMove_.Direction.Right,
			unit: CursorMove_.Unit.None,
			select: true,
			value: 1
		},
		id: 'cursorRightSelect',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyMod.Shift | KeyCode.RightArrow
		}
	}));

	export const CursorUp: CoreEditorCommand = registerEditorCommand(new CursorMoveBasedCommand({
		args: {
			direction: CursorMove_.Direction.Up,
			unit: CursorMove_.Unit.WrappedLine,
			select: false,
			value: 1
		},
		id: 'cursorUp',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyCode.UpArrow,
			mac: { primary: KeyCode.UpArrow, secondary: [KeyMod.WinCtrl | KeyCode.KEY_P] }
		}
	}));

	export const CursorUpSelect: CoreEditorCommand = registerEditorCommand(new CursorMoveBasedCommand({
		args: {
			direction: CursorMove_.Direction.Up,
			unit: CursorMove_.Unit.WrappedLine,
			select: true,
			value: 1
		},
		id: 'cursorUpSelect',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyMod.Shift | KeyCode.UpArrow,
			secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow],
			mac: { primary: KeyMod.Shift | KeyCode.UpArrow },
			linux: { primary: KeyMod.Shift | KeyCode.UpArrow }
		}
	}));

	export const CursorPageUp: CoreEditorCommand = registerEditorCommand(new CursorMoveBasedCommand({
		args: {
			direction: CursorMove_.Direction.Up,
			unit: CursorMove_.Unit.WrappedLine,
			select: false,
			value: Constants.PAGE_SIZE_MARKER
		},
		id: 'cursorPageUp',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyCode.PageUp
		}
	}));

	export const CursorPageUpSelect: CoreEditorCommand = registerEditorCommand(new CursorMoveBasedCommand({
		args: {
			direction: CursorMove_.Direction.Up,
			unit: CursorMove_.Unit.WrappedLine,
			select: true,
			value: Constants.PAGE_SIZE_MARKER
		},
		id: 'cursorPageUpSelect',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyMod.Shift | KeyCode.PageUp
		}
	}));

	export const CursorDown: CoreEditorCommand = registerEditorCommand(new CursorMoveBasedCommand({
		args: {
			direction: CursorMove_.Direction.Down,
			unit: CursorMove_.Unit.WrappedLine,
			select: false,
			value: 1
		},
		id: 'cursorDown',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyCode.DownArrow,
			mac: { primary: KeyCode.DownArrow, secondary: [KeyMod.WinCtrl | KeyCode.KEY_N] }
		}
	}));

	export const CursorDownSelect: CoreEditorCommand = registerEditorCommand(new CursorMoveBasedCommand({
		args: {
			direction: CursorMove_.Direction.Down,
			unit: CursorMove_.Unit.WrappedLine,
			select: true,
			value: 1
		},
		id: 'cursorDownSelect',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyMod.Shift | KeyCode.DownArrow,
			secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow],
			mac: { primary: KeyMod.Shift | KeyCode.DownArrow },
			linux: { primary: KeyMod.Shift | KeyCode.DownArrow }
		}
	}));

	export const CursorPageDown: CoreEditorCommand = registerEditorCommand(new CursorMoveBasedCommand({
		args: {
			direction: CursorMove_.Direction.Down,
			unit: CursorMove_.Unit.WrappedLine,
			select: false,
			value: Constants.PAGE_SIZE_MARKER
		},
		id: 'cursorPageDown',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyCode.PageDown
		}
	}));

	export const CursorPageDownSelect: CoreEditorCommand = registerEditorCommand(new CursorMoveBasedCommand({
		args: {
			direction: CursorMove_.Direction.Down,
			unit: CursorMove_.Unit.WrappedLine,
			select: true,
			value: Constants.PAGE_SIZE_MARKER
		},
		id: 'cursorPageDownSelect',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyMod.Shift | KeyCode.PageDown
		}
	}));

	export const CreateCursor: CoreEditorCommand = registerEditorCommand(new class extends CoreEditorCommand {
		constructor() {
			super({
				id: 'createCursor',
				precondition: null
			});
		}

		public runCoreEditorCommand(cursors: ICursors, args: any): void {
			const context = cursors.context;

			if (context.config.readOnly || context.model.hasEditableRange()) {
				return;
			}

			let newState: CursorState;
			if (args.wholeLine) {
				newState = CursorMoveCommands.line(context, cursors.getPrimaryCursor(), false, args.position, args.viewPosition);
			} else {
				newState = CursorMoveCommands.moveTo(context, cursors.getPrimaryCursor(), false, args.position, args.viewPosition);
			}

			let newStates = cursors.getAll().slice(0);
			newStates.push(newState);

			cursors.context.model.pushStackElement();
			cursors.setStates(
				args.source,
				CursorChangeReason.Explicit,
				newStates
			);
		}
	});

	export const LastCursorMoveToSelect: CoreEditorCommand = registerEditorCommand(new class extends CoreEditorCommand {
		constructor() {
			super({
				id: '_lastCursorMoveToSelect',
				precondition: null
			});
		}

		public runCoreEditorCommand(cursors: ICursors, args: any): void {
			const context = cursors.context;

			if (context.config.readOnly || context.model.hasEditableRange()) {
				return;
			}

			const lastAddedCursorIndex = cursors.getLastAddedCursorIndex();

			let newStates = cursors.getAll().slice(0);
			newStates[lastAddedCursorIndex] = CursorMoveCommands.moveTo(context, newStates[lastAddedCursorIndex], true, args.position, args.viewPosition);

			cursors.context.model.pushStackElement();
			cursors.setStates(
				args.source,
				CursorChangeReason.Explicit,
				newStates
			);
		}
	});

	class HomeCommand extends CoreEditorCommand {

		private readonly _inSelectionMode: boolean;

		constructor(opts: ICommandOptions & { inSelectionMode: boolean; }) {
			super(opts);
			this._inSelectionMode = opts.inSelectionMode;
		}

		public runCoreEditorCommand(cursors: ICursors, args: any): void {
			cursors.context.model.pushStackElement();
			cursors.setStates(
				args.source,
				CursorChangeReason.Explicit,
				CursorState.ensureInEditableRange(
					cursors.context,
					CursorMoveCommands.moveToBeginningOfLine(cursors.context, cursors.getAll(), this._inSelectionMode)
				)
			);
			cursors.reveal(true, RevealTarget.Primary);
		}
	}

	export const CursorHome: CoreEditorCommand = registerEditorCommand(new HomeCommand({
		inSelectionMode: false,
		id: 'cursorHome',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyCode.Home,
			mac: { primary: KeyCode.Home, secondary: [KeyMod.CtrlCmd | KeyCode.LeftArrow, KeyMod.WinCtrl | KeyCode.KEY_A] }
		}
	}));

	export const CursorHomeSelect: CoreEditorCommand = registerEditorCommand(new HomeCommand({
		inSelectionMode: true,
		id: 'cursorHomeSelect',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyMod.Shift | KeyCode.Home,
			mac: { primary: KeyMod.Shift | KeyCode.Home, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow] }
		}
	}));

	class EndCommand extends CoreEditorCommand {

		private readonly _inSelectionMode: boolean;

		constructor(opts: ICommandOptions & { inSelectionMode: boolean; }) {
			super(opts);
			this._inSelectionMode = opts.inSelectionMode;
		}

		public runCoreEditorCommand(cursors: ICursors, args: any): void {
			cursors.context.model.pushStackElement();
			cursors.setStates(
				args.source,
				CursorChangeReason.Explicit,
				CursorState.ensureInEditableRange(
					cursors.context,
					CursorMoveCommands.moveToEndOfLine(cursors.context, cursors.getAll(), this._inSelectionMode)
				)
			);
			cursors.reveal(true, RevealTarget.Primary);
		}
	}

	export const CursorEnd: CoreEditorCommand = registerEditorCommand(new EndCommand({
		inSelectionMode: false,
		id: 'cursorEnd',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyCode.End,
			mac: { primary: KeyCode.End, secondary: [KeyMod.CtrlCmd | KeyCode.RightArrow, KeyMod.WinCtrl | KeyCode.KEY_E] }
		}
	}));

	export const CursorEndSelect: CoreEditorCommand = registerEditorCommand(new EndCommand({
		inSelectionMode: true,
		id: 'cursorEndSelect',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyMod.Shift | KeyCode.End,
			mac: { primary: KeyMod.Shift | KeyCode.End, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow] }
		}
	}));

	class TopCommand extends CoreEditorCommand {

		private readonly _inSelectionMode: boolean;

		constructor(opts: ICommandOptions & { inSelectionMode: boolean; }) {
			super(opts);
			this._inSelectionMode = opts.inSelectionMode;
		}

		public runCoreEditorCommand(cursors: ICursors, args: any): void {
			cursors.context.model.pushStackElement();
			cursors.setStates(
				args.source,
				CursorChangeReason.Explicit,
				CursorState.ensureInEditableRange(
					cursors.context,
					CursorMoveCommands.moveToBeginningOfBuffer(cursors.context, cursors.getAll(), this._inSelectionMode)
				)
			);
			cursors.reveal(true, RevealTarget.Primary);
		}
	}

	export const CursorTop: CoreEditorCommand = registerEditorCommand(new TopCommand({
		inSelectionMode: false,
		id: 'cursorTop',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyMod.CtrlCmd | KeyCode.Home,
			mac: { primary: KeyMod.CtrlCmd | KeyCode.UpArrow }
		}
	}));

	export const CursorTopSelect: CoreEditorCommand = registerEditorCommand(new TopCommand({
		inSelectionMode: true,
		id: 'cursorTopSelect',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Home,
			mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow }
		}
	}));

	class BottomCommand extends CoreEditorCommand {

		private readonly _inSelectionMode: boolean;

		constructor(opts: ICommandOptions & { inSelectionMode: boolean; }) {
			super(opts);
			this._inSelectionMode = opts.inSelectionMode;
		}

		public runCoreEditorCommand(cursors: ICursors, args: any): void {
			cursors.context.model.pushStackElement();
			cursors.setStates(
				args.source,
				CursorChangeReason.Explicit,
				CursorState.ensureInEditableRange(
					cursors.context,
					CursorMoveCommands.moveToEndOfBuffer(cursors.context, cursors.getAll(), this._inSelectionMode)
				)
			);
			cursors.reveal(true, RevealTarget.Primary);
		}
	}

	export const CursorBottom: CoreEditorCommand = registerEditorCommand(new BottomCommand({
		inSelectionMode: false,
		id: 'cursorBottom',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyMod.CtrlCmd | KeyCode.End,
			mac: { primary: KeyMod.CtrlCmd | KeyCode.DownArrow }
		}
	}));

	export const CursorBottomSelect: CoreEditorCommand = registerEditorCommand(new BottomCommand({
		inSelectionMode: true,
		id: 'cursorBottomSelect',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.End,
			mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow }
		}
	}));

	export class EditorScrollImpl extends CoreEditorCommand {
		constructor() {
			super({
				id: 'editorScroll',
				precondition: null,
				description: EditorScroll_.description
			});
		}

		public runCoreEditorCommand(cursors: ICursors, args: any): void {
			const parsed = EditorScroll_.parse(args);
			if (!parsed) {
				// illegal arguments
				return;
			}
			this._runEditorScroll(cursors, args.source, parsed);
		}

		_runEditorScroll(cursors: ICursors, source: string, args: EditorScroll_.ParsedArguments): void {

			const desiredScrollTop = this._computeDesiredScrollTop(cursors.context, args);

			if (args.revealCursor) {
				// must ensure cursor is in new visible range
				const desiredVisibleViewRange = cursors.context.getCompletelyVisibleViewRangeAtScrollTop(desiredScrollTop);
				cursors.setStates(
					source,
					CursorChangeReason.Explicit,
					[
						CursorMoveCommands.findPositionInViewportIfOutside(cursors.context, cursors.getPrimaryCursor(), desiredVisibleViewRange, args.select)
					]
				);
			}

			cursors.scrollTo(desiredScrollTop);
		}

		private _computeDesiredScrollTop(context: CursorContext, args: EditorScroll_.ParsedArguments): number {

			if (args.unit === EditorScroll_.Unit.Line) {
				// scrolling by model lines
				const visibleModelRange = context.getCompletelyVisibleModelRange();

				let desiredTopModelLineNumber: number;
				if (args.direction === EditorScroll_.Direction.Up) {
					// must go x model lines up
					desiredTopModelLineNumber = Math.max(1, visibleModelRange.startLineNumber - args.value);
				} else {
					// must go x model lines down
					desiredTopModelLineNumber = Math.min(context.model.getLineCount(), visibleModelRange.startLineNumber + args.value);
				}

				const desiredTopViewPosition = context.convertModelPositionToViewPosition(new Position(desiredTopModelLineNumber, 1));
				return context.getVerticalOffsetForViewLine(desiredTopViewPosition.lineNumber);
			}

			let noOfLines: number;
			if (args.unit === EditorScroll_.Unit.Page) {
				noOfLines = context.config.pageSize * args.value;
			} else if (args.unit === EditorScroll_.Unit.HalfPage) {
				noOfLines = Math.round(context.config.pageSize / 2) * args.value;
			} else {
				noOfLines = args.value;
			}
			const deltaLines = (args.direction === EditorScroll_.Direction.Up ? -1 : 1) * noOfLines;
			return context.getScrollTop() + deltaLines * context.config.lineHeight;
		}
	}

	export const EditorScroll: EditorScrollImpl = registerEditorCommand(new EditorScrollImpl());

	export const ScrollLineUp: CoreEditorCommand = registerEditorCommand(new class extends CoreEditorCommand {
		constructor() {
			super({
				id: 'scrollLineUp',
				precondition: null,
				kbOpts: {
					weight: CORE_WEIGHT,
					kbExpr: EditorContextKeys.textFocus,
					primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
					mac: { primary: KeyMod.WinCtrl | KeyCode.PageUp }
				}
			});
		}

		runCoreEditorCommand(cursors: ICursors, args: any): void {
			EditorScroll._runEditorScroll(cursors, args.source, {
				direction: EditorScroll_.Direction.Up,
				unit: EditorScroll_.Unit.WrappedLine,
				value: 1,
				revealCursor: false,
				select: false
			});
		}
	});

	export const ScrollPageUp: CoreEditorCommand = registerEditorCommand(new class extends CoreEditorCommand {
		constructor() {
			super({
				id: 'scrollPageUp',
				precondition: null,
				kbOpts: {
					weight: CORE_WEIGHT,
					kbExpr: EditorContextKeys.textFocus,
					primary: KeyMod.CtrlCmd | KeyCode.PageUp,
					win: { primary: KeyMod.Alt | KeyCode.PageUp },
					linux: { primary: KeyMod.Alt | KeyCode.PageUp }
				}
			});
		}

		runCoreEditorCommand(cursors: ICursors, args: any): void {
			EditorScroll._runEditorScroll(cursors, args.source, {
				direction: EditorScroll_.Direction.Up,
				unit: EditorScroll_.Unit.Page,
				value: 1,
				revealCursor: false,
				select: false
			});
		}
	});

	export const ScrollLineDown: CoreEditorCommand = registerEditorCommand(new class extends CoreEditorCommand {
		constructor() {
			super({
				id: 'scrollLineDown',
				precondition: null,
				kbOpts: {
					weight: CORE_WEIGHT,
					kbExpr: EditorContextKeys.textFocus,
					primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
					mac: { primary: KeyMod.WinCtrl | KeyCode.PageDown }
				}
			});
		}

		runCoreEditorCommand(cursors: ICursors, args: any): void {
			EditorScroll._runEditorScroll(cursors, args.source, {
				direction: EditorScroll_.Direction.Down,
				unit: EditorScroll_.Unit.WrappedLine,
				value: 1,
				revealCursor: false,
				select: false
			});
		}
	});

	export const ScrollPageDown: CoreEditorCommand = registerEditorCommand(new class extends CoreEditorCommand {
		constructor() {
			super({
				id: 'scrollPageDown',
				precondition: null,
				kbOpts: {
					weight: CORE_WEIGHT,
					kbExpr: EditorContextKeys.textFocus,
					primary: KeyMod.CtrlCmd | KeyCode.PageDown,
					win: { primary: KeyMod.Alt | KeyCode.PageDown },
					linux: { primary: KeyMod.Alt | KeyCode.PageDown }
				}
			});
		}

		runCoreEditorCommand(cursors: ICursors, args: any): void {
			EditorScroll._runEditorScroll(cursors, args.source, {
				direction: EditorScroll_.Direction.Down,
				unit: EditorScroll_.Unit.Page,
				value: 1,
				revealCursor: false,
				select: false
			});
		}
	});

	class WordCommand extends CoreEditorCommand {

		private readonly _inSelectionMode: boolean;

		constructor(opts: ICommandOptions & { inSelectionMode: boolean; }) {
			super(opts);
			this._inSelectionMode = opts.inSelectionMode;
		}

		public runCoreEditorCommand(cursors: ICursors, args: any): void {
			cursors.context.model.pushStackElement();
			cursors.setStates(
				args.source,
				CursorChangeReason.Explicit,
				[
					CursorMoveCommands.word(cursors.context, cursors.getPrimaryCursor(), this._inSelectionMode, args.position)
				]
			);
			cursors.reveal(true, RevealTarget.Primary);
		}
	}

	export const WordSelect: CoreEditorCommand = registerEditorCommand(new WordCommand({
		inSelectionMode: false,
		id: '_wordSelect',
		precondition: null
	}));

	export const WordSelectDrag: CoreEditorCommand = registerEditorCommand(new WordCommand({
		inSelectionMode: true,
		id: '_wordSelectDrag',
		precondition: null
	}));

	export const LastCursorWordSelect: CoreEditorCommand = registerEditorCommand(new class extends CoreEditorCommand {
		constructor() {
			super({
				id: 'lastCursorWordSelect',
				precondition: null
			});
		}

		public runCoreEditorCommand(cursors: ICursors, args: any): void {
			const context = cursors.context;
			if (context.config.readOnly || context.model.hasEditableRange()) {
				return;
			}

			const lastAddedCursorIndex = cursors.getLastAddedCursorIndex();

			let newStates = cursors.getAll().slice(0);
			newStates[lastAddedCursorIndex] = CursorMoveCommands.word(context, newStates[lastAddedCursorIndex], true, args.position);

			context.model.pushStackElement();
			cursors.setStates(
				args.source,
				CursorChangeReason.Explicit,
				newStates
			);
		}
	});

	class LineCommand extends CoreEditorCommand {
		private readonly _inSelectionMode: boolean;

		constructor(opts: ICommandOptions & { inSelectionMode: boolean; }) {
			super(opts);
			this._inSelectionMode = opts.inSelectionMode;
		}

		public runCoreEditorCommand(cursors: ICursors, args: any): void {
			cursors.context.model.pushStackElement();
			cursors.setStates(
				args.source,
				CursorChangeReason.Explicit,
				[
					CursorMoveCommands.line(cursors.context, cursors.getPrimaryCursor(), this._inSelectionMode, args.position, args.viewPosition)
				]
			);
			cursors.reveal(false, RevealTarget.Primary);
		}
	}

	export const LineSelect: CoreEditorCommand = registerEditorCommand(new LineCommand({
		inSelectionMode: false,
		id: '_lineSelect',
		precondition: null
	}));

	export const LineSelectDrag: CoreEditorCommand = registerEditorCommand(new LineCommand({
		inSelectionMode: true,
		id: '_lineSelectDrag',
		precondition: null
	}));

	class LastCursorLineCommand extends CoreEditorCommand {
		private readonly _inSelectionMode: boolean;

		constructor(opts: ICommandOptions & { inSelectionMode: boolean; }) {
			super(opts);
			this._inSelectionMode = opts.inSelectionMode;
		}

		public runCoreEditorCommand(cursors: ICursors, args: any): void {
			const context = cursors.context;

			if (context.config.readOnly || context.model.hasEditableRange()) {
				return;
			}

			const lastAddedCursorIndex = cursors.getLastAddedCursorIndex();

			let newStates = cursors.getAll().slice(0);
			newStates[lastAddedCursorIndex] = CursorMoveCommands.line(cursors.context, newStates[lastAddedCursorIndex], this._inSelectionMode, args.position, args.viewPosition);

			cursors.context.model.pushStackElement();
			cursors.setStates(
				args.source,
				CursorChangeReason.Explicit,
				newStates
			);
		}
	}

	export const LastCursorLineSelect: CoreEditorCommand = registerEditorCommand(new LastCursorLineCommand({
		inSelectionMode: false,
		id: 'lastCursorLineSelect',
		precondition: null
	}));

	export const LastCursorLineSelectDrag: CoreEditorCommand = registerEditorCommand(new LastCursorLineCommand({
		inSelectionMode: true,
		id: 'lastCursorLineSelectDrag',
		precondition: null
	}));

	export const ExpandLineSelection: CoreEditorCommand = registerEditorCommand(new class extends CoreEditorCommand {
		constructor() {
			super({
				id: 'expandLineSelection',
				precondition: null,
				kbOpts: {
					weight: CORE_WEIGHT,
					kbExpr: EditorContextKeys.textFocus,
					primary: KeyMod.CtrlCmd | KeyCode.KEY_I
				}
			});
		}

		public runCoreEditorCommand(cursors: ICursors, args: any): void {
			cursors.context.model.pushStackElement();
			cursors.setStates(
				args.source,
				CursorChangeReason.Explicit,
				CursorState.ensureInEditableRange(
					cursors.context,
					CursorMoveCommands.expandLineSelection(cursors.context, cursors.getAll())
				)
			);
			cursors.reveal(true, RevealTarget.Primary);
		}

	});

	export const CancelSelection: CoreEditorCommand = registerEditorCommand(new class extends CoreEditorCommand {
		constructor() {
			super({
				id: 'cancelSelection',
				precondition: EditorContextKeys.hasNonEmptySelection,
				kbOpts: {
					weight: CORE_WEIGHT,
					kbExpr: EditorContextKeys.textFocus,
					primary: KeyCode.Escape,
					secondary: [KeyMod.Shift | KeyCode.Escape]
				}
			});
		}

		public runCoreEditorCommand(cursors: ICursors, args: any): void {
			cursors.context.model.pushStackElement();
			cursors.setStates(
				args.source,
				CursorChangeReason.Explicit,
				[
					CursorMoveCommands.cancelSelection(cursors.context, cursors.getPrimaryCursor())
				]
			);
			cursors.reveal(true, RevealTarget.Primary);
		}
	});

	export const RemoveSecondaryCursors: CoreEditorCommand = registerEditorCommand(new class extends CoreEditorCommand {
		constructor() {
			super({
				id: 'removeSecondaryCursors',
				precondition: EditorContextKeys.hasMultipleSelections,
				kbOpts: {
					weight: CORE_WEIGHT + 1,
					kbExpr: EditorContextKeys.textFocus,
					primary: KeyCode.Escape,
					secondary: [KeyMod.Shift | KeyCode.Escape]
				}
			});
		}

		public runCoreEditorCommand(cursors: ICursors, args: any): void {
			cursors.context.model.pushStackElement();
			cursors.setStates(
				args.source,
				CursorChangeReason.Explicit,
				[
					cursors.getPrimaryCursor()
				]
			);
			cursors.reveal(true, RevealTarget.Primary);
		}
	});

	export const RevealLine: CoreEditorCommand = registerEditorCommand(new class extends CoreEditorCommand {
		constructor() {
			super({
				id: 'revealLine',
				precondition: null,
				description: RevealLine_.description
			});
		}

		public runCoreEditorCommand(cursors: ICursors, args: any): void {
			const revealLineArg = <RevealLine_.RawArguments>args;
			let lineNumber = revealLineArg.lineNumber + 1;
			if (lineNumber < 1) {
				lineNumber = 1;
			}
			const lineCount = cursors.context.model.getLineCount();
			if (lineNumber > lineCount) {
				lineNumber = lineCount;
			}

			const range = new Range(
				lineNumber, 1,
				lineNumber, cursors.context.model.getLineMaxColumn(lineNumber)
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

			cursors.revealRange(false, range, null, revealAt);
		}
	});

	export const SelectAll: CoreEditorCommand = registerEditorCommand(new class extends CoreEditorCommand {
		constructor() {
			super({
				id: 'selectAll',
				precondition: null
			});
		}

		public runCoreEditorCommand(cursors: ICursors, args: any): void {
			cursors.context.model.pushStackElement();
			cursors.setStates(
				args.source,
				CursorChangeReason.Explicit,
				[
					CursorMoveCommands.selectAll(cursors.context, cursors.getPrimaryCursor())
				]
			);
		}
	});
};

namespace Config {

	function findFocusedEditor(accessor: ServicesAccessor): editorCommon.ICommonCodeEditor {
		return accessor.get(ICodeEditorService).getFocusedCodeEditor();
	}

	function getActiveEditorWidget(accessor: ServicesAccessor): editorCommon.ICommonCodeEditor {
		const editorService = accessor.get(IEditorService);
		let activeEditor = (<any>editorService).getActiveEditor && (<any>editorService).getActiveEditor();
		return getCodeEditor(activeEditor);
	}

	function withCodeEditorFromCommandHandler(accessor: ServicesAccessor, callback: (editor: editorCommon.ICommonCodeEditor) => void): void {
		let editor = findFocusedEditor(accessor);
		if (editor) {
			callback(editor);
		}
	}

	function triggerEditorHandler(handlerId: string, accessor: ServicesAccessor, args: any): void {
		withCodeEditorFromCommandHandler(accessor, (editor) => {
			editor.trigger('keyboard', handlerId, args);
		});
	}

	class CoreCommand extends Command {
		public runCommand(accessor: ServicesAccessor, args: any): void {
			triggerEditorHandler(this.id, accessor, args);
		}
	}

	function registerCommand(command: Command) {
		KeybindingsRegistry.registerCommandAndKeybindingRule(command.toCommandAndKeybindingRule(CORE_WEIGHT));
	}

	registerCommand(new CoreCommand({
		id: H.Tab,
		precondition: EditorContextKeys.writable,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: ContextKeyExpr.and(
				EditorContextKeys.textFocus,
				EditorContextKeys.tabDoesNotMoveFocus
			),
			primary: KeyCode.Tab
		}
	}));
	registerCommand(new CoreCommand({
		id: H.Outdent,
		precondition: EditorContextKeys.writable,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: ContextKeyExpr.and(
				EditorContextKeys.textFocus,
				EditorContextKeys.tabDoesNotMoveFocus
			),
			primary: KeyMod.Shift | KeyCode.Tab
		}
	}));

	registerCommand(new CoreCommand({
		id: H.DeleteLeft,
		precondition: EditorContextKeys.writable,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyCode.Backspace,
			secondary: [KeyMod.Shift | KeyCode.Backspace],
			mac: { primary: KeyCode.Backspace, secondary: [KeyMod.Shift | KeyCode.Backspace, KeyMod.WinCtrl | KeyCode.KEY_H, KeyMod.WinCtrl | KeyCode.Backspace] }
		}
	}));
	registerCommand(new CoreCommand({
		id: H.DeleteRight,
		precondition: EditorContextKeys.writable,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyCode.Delete,
			mac: { primary: KeyCode.Delete, secondary: [KeyMod.WinCtrl | KeyCode.KEY_D, KeyMod.WinCtrl | KeyCode.Delete] }
		}
	}));

	registerCommand(new CoreCommand({
		id: H.LineBreakInsert,
		precondition: EditorContextKeys.writable,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: null,
			mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_O }
		}
	}));


	class BaseTextInputAwareCommand extends Command {

		private readonly _editorHandler: string | EditorCommand;
		private readonly _inputHandler: string;

		constructor(opts: ICommandOptions & { editorHandler: string | EditorCommand; inputHandler: string; }) {
			super(opts);
			this._editorHandler = opts.editorHandler;
			this._inputHandler = opts.inputHandler;
		}

		public runCommand(accessor: ServicesAccessor, args: any): void {

			let focusedEditor = findFocusedEditor(accessor);
			// Only if editor text focus (i.e. not if editor has widget focus).
			if (focusedEditor && focusedEditor.isFocused()) {
				return this._runEditorHandler(focusedEditor, args);
			}

			// Ignore this action when user is focussed on an element that allows for entering text
			let activeElement = <HTMLElement>document.activeElement;
			if (activeElement && ['input', 'textarea'].indexOf(activeElement.tagName.toLowerCase()) >= 0) {
				document.execCommand(this._inputHandler);
				return;
			}

			// Redirecting to last active editor
			let activeEditor = getActiveEditorWidget(accessor);
			if (activeEditor) {
				activeEditor.focus();
				return this._runEditorHandler(activeEditor, args);
			}
		}

		private _runEditorHandler(editor: editorCommon.ICommonCodeEditor, args: any): void {
			let HANDLER = this._editorHandler;
			if (typeof HANDLER === 'string') {
				editor.trigger('keyboard', HANDLER, args);
			} else {
				args = args || {};
				args.source = 'keyboard';
				HANDLER.runEditorCommand(null, editor, args);
			}
		}
	}

	registerCommand(new BaseTextInputAwareCommand({
		editorHandler: CoreCommands.SelectAll,
		inputHandler: 'selectAll',
		id: 'editor.action.selectAll',
		precondition: null,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: null,
			primary: KeyMod.CtrlCmd | KeyCode.KEY_A
		}
	}));

	registerCommand(new BaseTextInputAwareCommand({
		editorHandler: H.Undo,
		inputHandler: 'undo',
		id: H.Undo,
		precondition: EditorContextKeys.writable,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyMod.CtrlCmd | KeyCode.KEY_Z
		}
	}));

	registerCommand(new BaseTextInputAwareCommand({
		editorHandler: H.Redo,
		inputHandler: 'redo',
		id: H.Redo,
		precondition: EditorContextKeys.writable,
		kbOpts: {
			weight: CORE_WEIGHT,
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyMod.CtrlCmd | KeyCode.KEY_Y,
			secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z],
			mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z }
		}
	}));

}
