/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Position } from 'vs/editor/common/core/position';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { CursorState, ICursors, RevealTarget, IColumnSelectData, CursorContext } from 'vs/editor/common/controller/cursorCommon';
import { CursorChangeReason } from "vs/editor/common/controller/cursorEvents";
import { CursorMoveCommands, CursorMove as CursorMove_ } from "vs/editor/common/controller/cursorMoveCommands";
import { EditorCommand, ICommandOptions } from "vs/editor/common/config/config";
import { ServicesAccessor } from "vs/platform/instantiation/common/instantiation";
import { registerEditorCommand } from "vs/editor/common/editorCommonExtensions";
import { IColumnSelectResult, ColumnSelection } from "vs/editor/common/controller/cursorColumnSelection";
import { EditorContextKeys } from "vs/editor/common/editorContextKeys";
import { KeyMod, KeyCode } from "vs/base/common/keyCodes";
import { KeybindingsRegistry } from "vs/platform/keybinding/common/keybindingsRegistry";

const CORE_WEIGHT = KeybindingsRegistry.WEIGHT.editorCore();

export abstract class CoreEditorCommand extends EditorCommand {
	public runEditorCommand(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor, args: any): void {
		this.runCoreEditorCommand(editor._getCursors(), args || {});
	}

	public abstract runCoreEditorCommand(cursors: ICursors, args: any): void;
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
		id: 'moveTo',
		inSelectionMode: false,
		precondition: null
	}));

	export const MoveToSelect: CoreEditorCommand = registerEditorCommand(new BaseMoveToCommand({
		id: 'moveToSelect',
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
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.UpArrow,
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
				id: 'lastCursorMoveToSelect',
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
};
