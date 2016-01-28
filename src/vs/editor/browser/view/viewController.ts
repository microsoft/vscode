/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EventEmitter = require('vs/base/common/eventEmitter');
import DomUtils = require('vs/base/browser/dom');

import EditorBrowser = require('vs/editor/browser/editorBrowser');
import Configuration = require('vs/editor/browser/config/configuration');
import Position = require('vs/editor/common/core/position');
import EditorCommon = require('vs/editor/common/editorCommon');

export class ViewController implements EditorBrowser.IViewController {

	private viewModel:EditorCommon.IViewModel;
	private configuration:Configuration.Configuration;
	private outgoingEventBus:EventEmitter.IEventEmitter;

	constructor(viewModel:EditorCommon.IViewModel, configuration:Configuration.Configuration, outgoingEventBus:EventEmitter.IEventEmitter) {
		this.viewModel = viewModel;
		this.configuration = configuration;
		this.outgoingEventBus = outgoingEventBus;
	}

	public paste(source:string, text:string, pasteOnNewLine:boolean): void {
		this.configuration.handlerDispatcher.trigger(source, EditorCommon.Handler.Paste, {
			text: text,
			pasteOnNewLine: pasteOnNewLine,
		});
	}

	public type(source:string, text:string): void {
		this.configuration.handlerDispatcher.trigger(source, EditorCommon.Handler.Type, {
			text: text
		});
	}

	public replacePreviousChar(source: string, text: string, replaceCharCnt:number): void {
		this.configuration.handlerDispatcher.trigger(source, EditorCommon.Handler.ReplacePreviousChar, {
			text: text,
			replaceCharCnt: replaceCharCnt
		});
	}

	public cut(source:string): void {
		this.configuration.handlerDispatcher.trigger(source, EditorCommon.Handler.Cut, null);
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
		this.configuration.handlerDispatcher.trigger(source, EditorCommon.Handler.MoveTo, {
			position: this.convertViewToModelPosition(lineNumber, column),
			viewPosition: new Position.Position(lineNumber, column)
		});
	}

	public moveToSelect(source:string, lineNumber:number, column:number): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, EditorCommon.Handler.MoveToSelect, {
			position: this.convertViewToModelPosition(lineNumber, column),
			viewPosition: new Position.Position(lineNumber, column)
		});
	}

	public createCursor(source:string, lineNumber:number, column:number, wholeLine:boolean): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, EditorCommon.Handler.CreateCursor, {
			position: this.convertViewToModelPosition(lineNumber, column),
			viewPosition: new Position.Position(lineNumber, column),
			wholeLine: wholeLine
		});
	}

	public lastCursorMoveToSelect(source:string, lineNumber:number, column:number): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, EditorCommon.Handler.LastCursorMoveToSelect, {
			position: this.convertViewToModelPosition(lineNumber, column),
			viewPosition: new Position.Position(lineNumber, column)
		});
	}

	public wordSelect(source:string, lineNumber:number, column:number, preference:string): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, EditorCommon.Handler.WordSelect, {
			position: this.convertViewToModelPosition(lineNumber, column),
			preference: preference
		});
	}

	public wordSelectDrag(source:string, lineNumber:number, column:number, preference:string): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, EditorCommon.Handler.WordSelectDrag, {
			position: this.convertViewToModelPosition(lineNumber, column),
			preference: preference
		});
	}

	public lastCursorWordSelect(source:string, lineNumber:number, column:number, preference:string): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, EditorCommon.Handler.LastCursorWordSelect, {
			position: this.convertViewToModelPosition(lineNumber, column),
			preference: preference
		});
	}

	public lineSelect(source:string, lineNumber:number, column:number): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, EditorCommon.Handler.LineSelect, {
			position: this.convertViewToModelPosition(lineNumber, column),
			viewPosition: new Position.Position(lineNumber, column)
		});
	}

	public lineSelectDrag(source:string, lineNumber:number, column:number): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, EditorCommon.Handler.LineSelectDrag, {
			position: this.convertViewToModelPosition(lineNumber, column),
			viewPosition: new Position.Position(lineNumber, column)
		});
	}

	public lastCursorLineSelect(source:string, lineNumber:number, column:number): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, EditorCommon.Handler.LastCursorLineSelect, {
			position: this.convertViewToModelPosition(lineNumber, column),
			viewPosition: new Position.Position(lineNumber, column)
		});
	}

	public lastCursorLineSelectDrag(source:string, lineNumber:number, column:number): void {
		column = this._validateViewColumn(lineNumber, column);
		this.configuration.handlerDispatcher.trigger(source, EditorCommon.Handler.LastCursorLineSelectDrag, {
			position: this.convertViewToModelPosition(lineNumber, column),
			viewPosition: new Position.Position(lineNumber, column)
		});
	}

	public selectAll(source:string): void {
		this.configuration.handlerDispatcher.trigger(source, EditorCommon.Handler.SelectAll, null);
	}

	// ----------------------

	private convertViewToModelPosition(lineNumber:number, column:number): EditorCommon.IEditorPosition {
		return this.viewModel.convertViewPositionToModelPosition(lineNumber, column);
	}

	private convertViewToModelRange(viewRange:EditorCommon.IRange): EditorCommon.IEditorRange {
		return this.viewModel.convertViewRangeToModelRange(viewRange);
	}

	private convertViewToModelMouseEvent(e:EditorBrowser.IMouseEvent): void {
		if (e.target) {
			if (e.target.position) {
				e.target.position = this.convertViewToModelPosition(e.target.position.lineNumber, e.target.position.column);
			}
			if (e.target.range) {
				e.target.range = this.convertViewToModelRange(e.target.range);
			}
		}
	}

	public emitKeyDown(e:DomUtils.IKeyboardEvent): void {
		this.outgoingEventBus.emit(EditorCommon.EventType.KeyDown, e);
	}

	public emitKeyUp(e:DomUtils.IKeyboardEvent): void {
		this.outgoingEventBus.emit(EditorCommon.EventType.KeyUp, e);
	}

	public emitContextMenu(e:EditorBrowser.IMouseEvent): void {
		this.convertViewToModelMouseEvent(e);
		this.outgoingEventBus.emit(EditorCommon.EventType.ContextMenu, e);
	}

	public emitMouseMove(e:EditorBrowser.IMouseEvent): void {
		this.convertViewToModelMouseEvent(e);
		this.outgoingEventBus.emit(EditorCommon.EventType.MouseMove, e);
	}

	public emitMouseLeave(e:EditorBrowser.IMouseEvent): void {
		this.convertViewToModelMouseEvent(e);
		this.outgoingEventBus.emit(EditorCommon.EventType.MouseLeave, e);
	}

	public emitMouseUp(e:EditorBrowser.IMouseEvent): void {
		this.convertViewToModelMouseEvent(e);
		this.outgoingEventBus.emit(EditorCommon.EventType.MouseUp, e);
	}

	public emitMouseDown(e:EditorBrowser.IMouseEvent): void {
		this.convertViewToModelMouseEvent(e);
		this.outgoingEventBus.emit(EditorCommon.EventType.MouseDown, e);
	}

}