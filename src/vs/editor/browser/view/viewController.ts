/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { Position } from 'vs/editor/common/core/position';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { IEditorMouseEvent, IViewController, IMouseDispatchData } from 'vs/editor/browser/editorBrowser';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IViewModel } from 'vs/editor/common/viewModel/viewModel';
import { ViewOutgoingEvents } from 'vs/editor/browser/view/viewOutgoingEvents';

export interface TriggerCursorHandler {
	(source: string, handlerId: string, payload: any): void;
}

export class ViewController implements IViewController {

	private viewModel: IViewModel;
	private triggerCursorHandler: TriggerCursorHandler;
	private outgoingEvents: ViewOutgoingEvents;
	private commandService: ICommandService;

	constructor(
		viewModel: IViewModel,
		triggerCursorHandler: TriggerCursorHandler,
		outgoingEvents: ViewOutgoingEvents,
		commandService: ICommandService
	) {
		this.viewModel = viewModel;
		this.triggerCursorHandler = triggerCursorHandler;
		this.outgoingEvents = outgoingEvents;
		this.commandService = commandService;
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
					this.lastCursorLineSelect('mouse', data.position);
				} else {
					this.createCursor('mouse', data.position, true);
				}
			} else {
				if (data.inSelectionMode) {
					this.lineSelectDrag('mouse', data.position);
				} else {
					this.lineSelect('mouse', data.position);
				}
			}
		} else if (data.mouseDownCount >= 4) {
			this.selectAll('mouse');
		} else if (data.mouseDownCount === 3) {
			if (data.altKey) {
				if (data.inSelectionMode) {
					this.lastCursorLineSelectDrag('mouse', data.position);
				} else {
					this.lastCursorLineSelect('mouse', data.position);
				}
			} else {
				if (data.inSelectionMode) {
					this.lineSelectDrag('mouse', data.position);
				} else {
					this.lineSelect('mouse', data.position);
				}
			}
		} else if (data.mouseDownCount === 2) {
			if (data.altKey) {
				this.lastCursorWordSelect('mouse', data.position);
			} else {
				if (data.inSelectionMode) {
					this.wordSelectDrag('mouse', data.position);
				} else {
					this.wordSelect('mouse', data.position);
				}
			}
		} else {
			if (data.altKey) {
				if (!data.ctrlKey && !data.metaKey) {
					if (data.shiftKey) {
						this.columnSelect('mouse', data.position, data.mouseColumn);
					} else {
						// Do multi-cursor operations only when purely alt is pressed
						if (data.inSelectionMode) {
							this.lastCursorMoveToSelect('mouse', data.position);
						} else {
							this.createCursor('mouse', data.position, false);
						}
					}
				}
			} else {
				if (data.inSelectionMode) {
					this.moveToSelect('mouse', data.position);
				} else {
					this.moveTo('mouse', data.position);
				}
			}
		}
	}

	public moveTo(source: string, viewPosition: Position): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this.triggerCursorHandler(source, editorCommon.Handler.MoveTo, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition
		});
	}

	private moveToSelect(source: string, viewPosition: Position): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this.triggerCursorHandler(source, editorCommon.Handler.MoveToSelect, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition
		});
	}

	private columnSelect(source: string, viewPosition: Position, mouseColumn: number): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this.triggerCursorHandler(source, editorCommon.Handler.ColumnSelect, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition,
			mouseColumn: mouseColumn
		});
	}

	private createCursor(source: string, viewPosition: Position, wholeLine: boolean): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this.triggerCursorHandler(source, editorCommon.Handler.CreateCursor, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition,
			wholeLine: wholeLine
		});
	}

	private lastCursorMoveToSelect(source: string, viewPosition: Position): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this.triggerCursorHandler(source, editorCommon.Handler.LastCursorMoveToSelect, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition
		});
	}

	private wordSelect(source: string, viewPosition: Position): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this.triggerCursorHandler(source, editorCommon.Handler.WordSelect, {
			position: this.convertViewToModelPosition(viewPosition)
		});
	}

	private wordSelectDrag(source: string, viewPosition: Position): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this.triggerCursorHandler(source, editorCommon.Handler.WordSelectDrag, {
			position: this.convertViewToModelPosition(viewPosition)
		});
	}

	private lastCursorWordSelect(source: string, viewPosition: Position): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this.triggerCursorHandler(source, editorCommon.Handler.LastCursorWordSelect, {
			position: this.convertViewToModelPosition(viewPosition)
		});
	}

	private lineSelect(source: string, viewPosition: Position): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this.triggerCursorHandler(source, editorCommon.Handler.LineSelect, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition
		});
	}

	private lineSelectDrag(source: string, viewPosition: Position): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this.triggerCursorHandler(source, editorCommon.Handler.LineSelectDrag, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition
		});
	}

	private lastCursorLineSelect(source: string, viewPosition: Position): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this.triggerCursorHandler(source, editorCommon.Handler.LastCursorLineSelect, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition
		});
	}

	private lastCursorLineSelectDrag(source: string, viewPosition: Position): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this.triggerCursorHandler(source, editorCommon.Handler.LastCursorLineSelectDrag, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition
		});
	}

	private selectAll(source: string): void {
		this.triggerCursorHandler(source, editorCommon.Handler.SelectAll, null);
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
