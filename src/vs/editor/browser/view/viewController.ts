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

	private _validateViewColumn(viewPosition:editorCommon.IEditorPosition): editorCommon.IEditorPosition {
		var minColumn = this.viewModel.getLineMinColumn(viewPosition.lineNumber);
		if (viewPosition.column < minColumn) {
			return new Position(viewPosition.lineNumber, minColumn);
		}
		return viewPosition;
	}

	public dispatchMouse(data:IMouseDispatchData): void {
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
					// Do multi-cursor operations only when purely alt is pressed
					if (data.inSelectionMode) {
						this.lastCursorMoveToSelect('mouse', data.position);
					} else {
						this.createCursor('mouse', data.position, false);
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

	public moveTo(source:string, viewPosition:editorCommon.IEditorPosition): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.MoveTo, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition
		});
	}

	private moveToSelect(source:string, viewPosition:editorCommon.IEditorPosition): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.MoveToSelect, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition
		});
	}

	private createCursor(source:string, viewPosition:editorCommon.IEditorPosition, wholeLine:boolean): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.CreateCursor, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition,
			wholeLine: wholeLine
		});
	}

	private lastCursorMoveToSelect(source:string, viewPosition:editorCommon.IEditorPosition): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.LastCursorMoveToSelect, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition
		});
	}

	private wordSelect(source:string, viewPosition:editorCommon.IEditorPosition): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.WordSelect, {
			position: this.convertViewToModelPosition(viewPosition)
		});
	}

	private wordSelectDrag(source:string, viewPosition:editorCommon.IEditorPosition): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.WordSelectDrag, {
			position: this.convertViewToModelPosition(viewPosition)
		});
	}

	private lastCursorWordSelect(source:string, viewPosition:editorCommon.IEditorPosition): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.LastCursorWordSelect, {
			position: this.convertViewToModelPosition(viewPosition)
		});
	}

	private lineSelect(source:string, viewPosition:editorCommon.IEditorPosition): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.LineSelect, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition
		});
	}

	private lineSelectDrag(source:string, viewPosition:editorCommon.IEditorPosition): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.LineSelectDrag, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition
		});
	}

	private lastCursorLineSelect(source:string, viewPosition:editorCommon.IEditorPosition): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.LastCursorLineSelect, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition
		});
	}

	private lastCursorLineSelectDrag(source:string, viewPosition:editorCommon.IEditorPosition): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.LastCursorLineSelectDrag, {
			position: this.convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition
		});
	}

	private selectAll(source:string): void {
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.SelectAll, null);
	}

	// ----------------------

	private convertViewToModelPosition(viewPosition:editorCommon.IEditorPosition): editorCommon.IEditorPosition {
		return this.viewModel.convertViewPositionToModelPosition(viewPosition.lineNumber, viewPosition.column);
	}

	private convertViewToModelRange(viewRange:editorCommon.IRange): editorCommon.IEditorRange {
		return this.viewModel.convertViewRangeToModelRange(viewRange);
	}

	private convertViewToModelMouseEvent(e:IEditorMouseEvent): void {
		if (e.target) {
			if (e.target.position) {
				e.target.position = this.convertViewToModelPosition(e.target.position);
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