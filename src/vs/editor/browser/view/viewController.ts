/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { Position } from 'vs/editor/common/core/position';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IViewModel } from 'vs/editor/common/viewModel/viewModel';
import { ViewOutgoingEvents } from 'vs/editor/browser/view/viewOutgoingEvents';
import { CoreCommands, CoreEditorCommand } from 'vs/editor/common/controller/coreCommands';

export interface ExecCoreEditorCommandFunc {
	(editorCommand: CoreEditorCommand, args: any): void;
}

export interface IMouseDispatchData {
	position: Position;
	/**
	 * Desired mouse column (e.g. when position.column gets clamped to text length -- clicking after text on a line).
	 */
	mouseColumn: number;
	startedOnLineNumbers: boolean;

	inSelectionMode: boolean;
	mouseDownCount: number;
	altKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
	shiftKey: boolean;
}

export class ViewController {

	private readonly viewModel: IViewModel;
	private readonly _execCoreEditorCommandFunc: ExecCoreEditorCommandFunc;
	private readonly outgoingEvents: ViewOutgoingEvents;
	private readonly commandService: ICommandService;

	constructor(
		viewModel: IViewModel,
		execCommandFunc: ExecCoreEditorCommandFunc,
		outgoingEvents: ViewOutgoingEvents,
		commandService: ICommandService
	) {
		this.viewModel = viewModel;
		this._execCoreEditorCommandFunc = execCommandFunc;
		this.outgoingEvents = outgoingEvents;
		this.commandService = commandService;
	}

	private _execMouseCommand(editorCommand: CoreEditorCommand, args: any): void {
		args.source = 'mouse';
		this._execCoreEditorCommandFunc(editorCommand, args);
	}

	public paste(source: string, text: string, pasteOnNewLine: boolean): void {
		this.commandService.executeCommand(editorCommon.Handler.Paste, {
			text: text,
			pasteOnNewLine: pasteOnNewLine,
		});
	}

	public type(source: string, text: string): void {
		this.commandService.executeCommand(editorCommon.Handler.Type, {
			text: text
		});
	}

	public replacePreviousChar(source: string, text: string, replaceCharCnt: number): void {
		this.commandService.executeCommand(editorCommon.Handler.ReplacePreviousChar, {
			text: text,
			replaceCharCnt: replaceCharCnt
		});
	}

	public compositionStart(source: string): void {
		this.commandService.executeCommand(editorCommon.Handler.CompositionStart, {});
	}

	public compositionEnd(source: string): void {
		this.commandService.executeCommand(editorCommon.Handler.CompositionEnd, {});
	}

	public cut(source: string): void {
		this.commandService.executeCommand(editorCommon.Handler.Cut, {});
	}

	private _validateViewColumn(viewPosition: Position): Position {
		let minColumn = this.viewModel.getLineMinColumn(viewPosition.lineNumber);
		if (viewPosition.column < minColumn) {
			return new Position(viewPosition.lineNumber, minColumn);
		}
		return viewPosition;
	}

	public dispatchMouse(data: IMouseDispatchData): void {
		if (data.startedOnLineNumbers) {
			// If the dragging started on the gutter, then have operations work on the entire line
			if (data.altKey) {
				if (data.inSelectionMode) {
					this.lastCursorLineSelect(data.position);
				} else {
					this.createCursor(data.position, true);
				}
			} else {
				if (data.inSelectionMode) {
					this.lineSelectDrag(data.position);
				} else {
					this.lineSelect(data.position);
				}
			}
		} else if (data.mouseDownCount >= 4) {
			this.selectAll();
		} else if (data.mouseDownCount === 3) {
			if (data.altKey) {
				if (data.inSelectionMode) {
					this.lastCursorLineSelectDrag(data.position);
				} else {
					this.lastCursorLineSelect(data.position);
				}
			} else {
				if (data.inSelectionMode) {
					this.lineSelectDrag(data.position);
				} else {
					this.lineSelect(data.position);
				}
			}
		} else if (data.mouseDownCount === 2) {
			if (data.altKey) {
				this.lastCursorWordSelect(data.position);
			} else {
				if (data.inSelectionMode) {
					this.wordSelectDrag(data.position);
				} else {
					this.wordSelect(data.position);
				}
			}
		} else {
			if (data.altKey) {
				if (!data.ctrlKey && !data.metaKey) {
					if (data.shiftKey) {
						this.columnSelect(data.position, data.mouseColumn);
					} else {
						// Do multi-cursor operations only when purely alt is pressed
						if (data.inSelectionMode) {
							this.lastCursorMoveToSelect(data.position);
						} else {
							this.createCursor(data.position, false);
						}
					}
				}
			} else {
				if (data.inSelectionMode) {
					this.moveToSelect(data.position);
				} else {
					this.moveTo(data.position);
				}
			}
		}
	}

	public moveTo(viewPosition: Position): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this._execMouseCommand(CoreCommands.MoveTo, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition
		});
	}

	private moveToSelect(viewPosition: Position): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this._execMouseCommand(CoreCommands.MoveToSelect, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition
		});
	}

	private columnSelect(viewPosition: Position, mouseColumn: number): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this._execMouseCommand(CoreCommands.ColumnSelect, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition,
			mouseColumn: mouseColumn
		});
	}

	private createCursor(viewPosition: Position, wholeLine: boolean): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this._execMouseCommand(CoreCommands.CreateCursor, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition,
			wholeLine: wholeLine
		});
	}

	private lastCursorMoveToSelect(viewPosition: Position): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this._execMouseCommand(CoreCommands.LastCursorMoveToSelect, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition
		});
	}

	private wordSelect(viewPosition: Position): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this._execMouseCommand(CoreCommands.WordSelect, {
			position: this.convertViewToModelPosition(viewPosition)
		});
	}

	private wordSelectDrag(viewPosition: Position): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this._execMouseCommand(CoreCommands.WordSelectDrag, {
			position: this.convertViewToModelPosition(viewPosition)
		});
	}

	private lastCursorWordSelect(viewPosition: Position): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this._execMouseCommand(CoreCommands.LastCursorWordSelect, {
			position: this.convertViewToModelPosition(viewPosition)
		});
	}

	private lineSelect(viewPosition: Position): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this._execMouseCommand(CoreCommands.LineSelect, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition
		});
	}

	private lineSelectDrag(viewPosition: Position): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this._execMouseCommand(CoreCommands.LineSelectDrag, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition
		});
	}

	private lastCursorLineSelect(viewPosition: Position): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this._execMouseCommand(CoreCommands.LastCursorLineSelect, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition
		});
	}

	private lastCursorLineSelectDrag(viewPosition: Position): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this._execMouseCommand(CoreCommands.LastCursorLineSelectDrag, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition
		});
	}

	private selectAll(): void {
		this._execMouseCommand(CoreCommands.SelectAll, {});
	}

	// ----------------------

	private convertViewToModelPosition(viewPosition: Position): Position {
		return this.viewModel.coordinatesConverter.convertViewPositionToModelPosition(viewPosition);
	}

	public emitKeyDown(e: IKeyboardEvent): void {
		this.outgoingEvents.emitKeyDown(e);
	}

	public emitKeyUp(e: IKeyboardEvent): void {
		this.outgoingEvents.emitKeyUp(e);
	}

	public emitContextMenu(e: IEditorMouseEvent): void {
		this.outgoingEvents.emitContextMenu(e);
	}

	public emitMouseMove(e: IEditorMouseEvent): void {
		this.outgoingEvents.emitMouseMove(e);
	}

	public emitMouseLeave(e: IEditorMouseEvent): void {
		this.outgoingEvents.emitMouseLeave(e);
	}

	public emitMouseUp(e: IEditorMouseEvent): void {
		this.outgoingEvents.emitMouseUp(e);
	}

	public emitMouseDown(e: IEditorMouseEvent): void {
		this.outgoingEvents.emitMouseDown(e);
	}

	public emitMouseDrag(e: IEditorMouseEvent): void {
		this.outgoingEvents.emitMouseDrag(e);
	}

	public emitMouseDrop(e: IEditorMouseEvent): void {
		this.outgoingEvents.emitMouseDrop(e);
	}
}
