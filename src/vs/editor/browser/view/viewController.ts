/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IEventEmitter} from 'vs/base/common/eventEmitter';
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {Position} from 'vs/editor/common/core/position';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {Configuration} from 'vs/editor/browser/config/configuration';
import {IEditorMouseEvent, IViewController, IMouseDispatchData} from 'vs/editor/browser/editorBrowser';

export class ViewController implements IViewController {

	private viewModel:editorCommon.IViewModel;
	private configuration:Configuration;
	private outgoingEventBus:IEventEmitter;

	constructor(viewModel:editorCommon.IViewModel, configuration:Configuration, outgoingEventBus:IEventEmitter) {
		this.viewModel = viewModel;
		this.configuration = configuration;
		this.outgoingEventBus = outgoingEventBus;
	}

	public paste(source:string, text:string, pasteOnNewLine:boolean): void {
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.Paste, {
			text: text,
			pasteOnNewLine: pasteOnNewLine,
		});
	}

	public type(source:string, text:string): void {
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.Type, {
			text: text
		});
	}

	public replacePreviousChar(source: string, text: string, replaceCharCnt:number): void {
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.ReplacePreviousChar, {
			text: text,
			replaceCharCnt: replaceCharCnt
		});
	}

	public cut(source:string): void {
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.Cut, null);
	}

	private _validateViewColumn(lineNumber: number, column: number): number {
		var minColumn = this.viewModel.getLineMinColumn(lineNumber);
		if (column < minColumn) {
			return minColumn;
		}
		return column;
	}

	public dispatchMouse(data:IMouseDispatchData): void {
		if (data.startTargetType === editorCommon.MouseTargetType.GUTTER_LINE_NUMBERS) {
			// If the dragging started on the gutter, then have operations work on the entire line
			if (data.altKey) {
				if (data.inSelectionMode) {
					this.lastCursorLineSelect('mouse', data.lineNumber, data.column);
				} else {
					this.createCursor('mouse', data.lineNumber, data.column, true);
				}
			} else {
				if (data.inSelectionMode) {
					this.lineSelectDrag('mouse', data.lineNumber, data.column);
				} else {
					this.lineSelect('mouse', data.lineNumber, data.column);
				}
			}
		} else if (data.mouseDownCount >= 4) {
			this.selectAll('mouse');
		} else if (data.mouseDownCount === 3) {
			if (data.altKey) {
				if (data.inSelectionMode) {
					this.lastCursorLineSelectDrag('mouse', data.lineNumber, data.column);
				} else {
					this.lastCursorLineSelect('mouse', data.lineNumber, data.column);
				}
			} else {
				if (data.inSelectionMode) {
					this.lineSelectDrag('mouse', data.lineNumber, data.column);
				} else {
					this.lineSelect('mouse', data.lineNumber, data.column);
				}
			}
		} else if (data.mouseDownCount === 2) {
			if (data.altKey) {
				this.lastCursorWordSelect('mouse', data.lineNumber, data.column);
			} else {
				if (data.inSelectionMode) {
					this.wordSelectDrag('mouse', data.lineNumber, data.column);
				} else {
					this.wordSelect('mouse', data.lineNumber, data.column);
				}
			}
		} else {
			if (data.altKey) {
				if (!data.ctrlKey && !data.metaKey) {
					// Do multi-cursor operations only when purely alt is pressed
					if (data.inSelectionMode) {
						this.lastCursorMoveToSelect('mouse', data.lineNumber, data.column);
					} else {
						this.createCursor('mouse', data.lineNumber, data.column, false);
					}
				}
			} else {
				if (data.inSelectionMode) {
					this.moveToSelect('mouse', data.lineNumber, data.column);
				} else {
					this.moveTo('mouse', data.lineNumber, data.column);
				}
			}
		}
	}

	private moveTo(source:string, lineNumber:number, column:number): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.MoveTo, {
			position: this.convertViewToModelPosition(lineNumber, column),
			viewPosition: new Position(lineNumber, column)
		});
	}

	private moveToSelect(source:string, lineNumber:number, column:number): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.MoveToSelect, {
			position: this.convertViewToModelPosition(lineNumber, column),
			viewPosition: new Position(lineNumber, column)
		});
	}

	private createCursor(source:string, lineNumber:number, column:number, wholeLine:boolean): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.CreateCursor, {
			position: this.convertViewToModelPosition(lineNumber, column),
			viewPosition: new Position(lineNumber, column),
			wholeLine: wholeLine
		});
	}

	private lastCursorMoveToSelect(source:string, lineNumber:number, column:number): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.LastCursorMoveToSelect, {
			position: this.convertViewToModelPosition(lineNumber, column),
			viewPosition: new Position(lineNumber, column)
		});
	}

	private wordSelect(source:string, lineNumber:number, column:number): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.WordSelect, {
			position: this.convertViewToModelPosition(lineNumber, column)
		});
	}

	private wordSelectDrag(source:string, lineNumber:number, column:number): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.WordSelectDrag, {
			position: this.convertViewToModelPosition(lineNumber, column)
		});
	}

	private lastCursorWordSelect(source:string, lineNumber:number, column:number): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.LastCursorWordSelect, {
			position: this.convertViewToModelPosition(lineNumber, column)
		});
	}

	private lineSelect(source:string, lineNumber:number, column:number): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.LineSelect, {
			position: this.convertViewToModelPosition(lineNumber, column),
			viewPosition: new Position(lineNumber, column)
		});
	}

	private lineSelectDrag(source:string, lineNumber:number, column:number): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.LineSelectDrag, {
			position: this.convertViewToModelPosition(lineNumber, column),
			viewPosition: new Position(lineNumber, column)
		});
	}

	private lastCursorLineSelect(source:string, lineNumber:number, column:number): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.LastCursorLineSelect, {
			position: this.convertViewToModelPosition(lineNumber, column),
			viewPosition: new Position(lineNumber, column)
		});
	}

	private lastCursorLineSelectDrag(source:string, lineNumber:number, column:number): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.LastCursorLineSelectDrag, {
			position: this.convertViewToModelPosition(lineNumber, column),
			viewPosition: new Position(lineNumber, column)
		});
	}

	private selectAll(source:string): void {
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.SelectAll, null);
	}

	// ----------------------

	private convertViewToModelPosition(lineNumber:number, column:number): editorCommon.IEditorPosition {
		return this.viewModel.convertViewPositionToModelPosition(lineNumber, column);
	}

	private convertViewToModelRange(viewRange:editorCommon.IRange): editorCommon.IEditorRange {
		return this.viewModel.convertViewRangeToModelRange(viewRange);
	}

	private convertViewToModelMouseEvent(e:IEditorMouseEvent): void {
		if (e.target) {
			if (e.target.position) {
				e.target.position = this.convertViewToModelPosition(e.target.position.lineNumber, e.target.position.column);
			}
			if (e.target.range) {
				e.target.range = this.convertViewToModelRange(e.target.range);
			}
		}
	}

	public emitKeyDown(e:IKeyboardEvent): void {
		this.outgoingEventBus.emit(editorCommon.EventType.KeyDown, e);
	}

	public emitKeyUp(e:IKeyboardEvent): void {
		this.outgoingEventBus.emit(editorCommon.EventType.KeyUp, e);
	}

	public emitContextMenu(e:IEditorMouseEvent): void {
		this.convertViewToModelMouseEvent(e);
		this.outgoingEventBus.emit(editorCommon.EventType.ContextMenu, e);
	}

	public emitMouseMove(e:IEditorMouseEvent): void {
		this.convertViewToModelMouseEvent(e);
		this.outgoingEventBus.emit(editorCommon.EventType.MouseMove, e);
	}

	public emitMouseLeave(e:IEditorMouseEvent): void {
		this.convertViewToModelMouseEvent(e);
		this.outgoingEventBus.emit(editorCommon.EventType.MouseLeave, e);
	}

	public emitMouseUp(e:IEditorMouseEvent): void {
		this.convertViewToModelMouseEvent(e);
		this.outgoingEventBus.emit(editorCommon.EventType.MouseUp, e);
	}

	public emitMouseDown(e:IEditorMouseEvent): void {
		this.convertViewToModelMouseEvent(e);
		this.outgoingEventBus.emit(editorCommon.EventType.MouseDown, e);
	}

}