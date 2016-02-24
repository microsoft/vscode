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
import {IEditorMouseEvent, IViewController} from 'vs/editor/browser/editorBrowser';

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

	public moveTo(source:string, lineNumber:number, column:number): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.MoveTo, {
			position: this.convertViewToModelPosition(lineNumber, column),
			viewPosition: new Position(lineNumber, column)
		});
	}

	public moveToSelect(source:string, lineNumber:number, column:number): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.MoveToSelect, {
			position: this.convertViewToModelPosition(lineNumber, column),
			viewPosition: new Position(lineNumber, column)
		});
	}

	public createCursor(source:string, lineNumber:number, column:number, wholeLine:boolean): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.CreateCursor, {
			position: this.convertViewToModelPosition(lineNumber, column),
			viewPosition: new Position(lineNumber, column),
			wholeLine: wholeLine
		});
	}

	public lastCursorMoveToSelect(source:string, lineNumber:number, column:number): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.LastCursorMoveToSelect, {
			position: this.convertViewToModelPosition(lineNumber, column),
			viewPosition: new Position(lineNumber, column)
		});
	}

	public wordSelect(source:string, lineNumber:number, column:number, preference:string): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.WordSelect, {
			position: this.convertViewToModelPosition(lineNumber, column),
			preference: preference
		});
	}

	public wordSelectDrag(source:string, lineNumber:number, column:number, preference:string): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.WordSelectDrag, {
			position: this.convertViewToModelPosition(lineNumber, column),
			preference: preference
		});
	}

	public lastCursorWordSelect(source:string, lineNumber:number, column:number, preference:string): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.LastCursorWordSelect, {
			position: this.convertViewToModelPosition(lineNumber, column),
			preference: preference
		});
	}

	public lineSelect(source:string, lineNumber:number, column:number): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.LineSelect, {
			position: this.convertViewToModelPosition(lineNumber, column),
			viewPosition: new Position(lineNumber, column)
		});
	}

	public lineSelectDrag(source:string, lineNumber:number, column:number): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.LineSelectDrag, {
			position: this.convertViewToModelPosition(lineNumber, column),
			viewPosition: new Position(lineNumber, column)
		});
	}

	public lastCursorLineSelect(source:string, lineNumber:number, column:number): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.LastCursorLineSelect, {
			position: this.convertViewToModelPosition(lineNumber, column),
			viewPosition: new Position(lineNumber, column)
		});
	}

	public lastCursorLineSelectDrag(source:string, lineNumber:number, column:number): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, editorCommon.Handler.LastCursorLineSelectDrag, {
			position: this.convertViewToModelPosition(lineNumber, column),
			viewPosition: new Position(lineNumber, column)
		});
	}

	public selectAll(source:string): void {
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