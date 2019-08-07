/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { CoreEditorCommand, CoreNavigationCommands } from 'vs/editor/browser/controller/coreCommands';
import { IEditorMouseEvent, IPartialEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { ViewOutgoingEvents } from 'vs/editor/browser/view/viewOutgoingEvents';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { IConfiguration } from 'vs/editor/common/editorCommon';
import { IViewModel } from 'vs/editor/common/viewModel/viewModel';
import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';

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

	leftButton: boolean;
	middleButton: boolean;
}

export interface ICommandDelegate {
	executeEditorCommand(editorCommand: CoreEditorCommand, args: any): void;

	paste(source: string, text: string, pasteOnNewLine: boolean, multicursorText: string[] | null): void;
	type(source: string, text: string): void;
	replacePreviousChar(source: string, text: string, replaceCharCnt: number): void;
	compositionStart(source: string): void;
	compositionEnd(source: string): void;
	cut(source: string): void;
}

export class ViewController {

	private readonly configuration: IConfiguration;
	private readonly viewModel: IViewModel;
	private readonly outgoingEvents: ViewOutgoingEvents;
	private readonly commandDelegate: ICommandDelegate;

	constructor(
		configuration: IConfiguration,
		viewModel: IViewModel,
		outgoingEvents: ViewOutgoingEvents,
		commandDelegate: ICommandDelegate
	) {
		this.configuration = configuration;
		this.viewModel = viewModel;
		this.outgoingEvents = outgoingEvents;
		this.commandDelegate = commandDelegate;
	}

	private _execMouseCommand(editorCommand: CoreEditorCommand, args: any): void {
		args.source = 'mouse';
		this.commandDelegate.executeEditorCommand(editorCommand, args);
	}

	public paste(source: string, text: string, pasteOnNewLine: boolean, multicursorText: string[] | null): void {
		this.commandDelegate.paste(source, text, pasteOnNewLine, multicursorText);
	}

	public type(source: string, text: string): void {
		this.commandDelegate.type(source, text);
	}

	public replacePreviousChar(source: string, text: string, replaceCharCnt: number): void {
		this.commandDelegate.replacePreviousChar(source, text, replaceCharCnt);
	}

	public compositionStart(source: string): void {
		this.commandDelegate.compositionStart(source);
	}

	public compositionEnd(source: string): void {
		this.commandDelegate.compositionEnd(source);
	}

	public cut(source: string): void {
		this.commandDelegate.cut(source);
	}

	public setSelection(source: string, modelSelection: Selection): void {
		this.commandDelegate.executeEditorCommand(CoreNavigationCommands.SetSelection, {
			source: source,
			selection: modelSelection
		});
	}

	private _validateViewColumn(viewPosition: Position): Position {
		const minColumn = this.viewModel.getLineMinColumn(viewPosition.lineNumber);
		if (viewPosition.column < minColumn) {
			return new Position(viewPosition.lineNumber, minColumn);
		}
		return viewPosition;
	}

	private _hasMulticursorModifier(data: IMouseDispatchData): boolean {
		switch (this.configuration.editor.multiCursorModifier) {
			case 'altKey':
				return data.altKey;
			case 'ctrlKey':
				return data.ctrlKey;
			case 'metaKey':
				return data.metaKey;
		}
		return false;
	}

	private _hasNonMulticursorModifier(data: IMouseDispatchData): boolean {
		switch (this.configuration.editor.multiCursorModifier) {
			case 'altKey':
				return data.ctrlKey || data.metaKey;
			case 'ctrlKey':
				return data.altKey || data.metaKey;
			case 'metaKey':
				return data.ctrlKey || data.altKey;
		}
		return false;
	}

	public dispatchMouse(data: IMouseDispatchData): void {
		if (data.middleButton) {
			if (data.inSelectionMode) {
				this._columnSelect(data.position, data.mouseColumn, true);
			} else {
				this.moveTo(data.position);
			}
		} else if (data.startedOnLineNumbers) {
			// If the dragging started on the gutter, then have operations work on the entire line
			if (this._hasMulticursorModifier(data)) {
				if (data.inSelectionMode) {
					this._lastCursorLineSelect(data.position);
				} else {
					this._createCursor(data.position, true);
				}
			} else {
				if (data.inSelectionMode) {
					this._lineSelectDrag(data.position);
				} else {
					this._lineSelect(data.position);
				}
			}
		} else if (data.mouseDownCount >= 4) {
			this._selectAll();
		} else if (data.mouseDownCount === 3) {
			if (this._hasMulticursorModifier(data)) {
				if (data.inSelectionMode) {
					this._lastCursorLineSelectDrag(data.position);
				} else {
					this._lastCursorLineSelect(data.position);
				}
			} else {
				if (data.inSelectionMode) {
					this._lineSelectDrag(data.position);
				} else {
					this._lineSelect(data.position);
				}
			}
		} else if (data.mouseDownCount === 2) {
			if (this._hasMulticursorModifier(data)) {
				this._lastCursorWordSelect(data.position);
			} else {
				if (data.inSelectionMode) {
					this._wordSelectDrag(data.position);
				} else {
					this._wordSelect(data.position);
				}
			}
		} else {
			if (this._hasMulticursorModifier(data)) {
				if (!this._hasNonMulticursorModifier(data)) {
					if (data.shiftKey) {
						this._columnSelect(data.position, data.mouseColumn, false);
					} else {
						// Do multi-cursor operations only when purely alt is pressed
						if (data.inSelectionMode) {
							this._lastCursorMoveToSelect(data.position);
						} else {
							this._createCursor(data.position, false);
						}
					}
				}
			} else {
				if (data.inSelectionMode) {
					if (data.altKey) {
						this._columnSelect(data.position, data.mouseColumn, true);
					} else {
						this._moveToSelect(data.position);
					}
				} else {
					this.moveTo(data.position);
				}
			}
		}
	}

	private _usualArgs(viewPosition: Position) {
		viewPosition = this._validateViewColumn(viewPosition);
		return {
			position: this._convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition
		};
	}

	public moveTo(viewPosition: Position): void {
		this._execMouseCommand(CoreNavigationCommands.MoveTo, this._usualArgs(viewPosition));
	}

	private _moveToSelect(viewPosition: Position): void {
		this._execMouseCommand(CoreNavigationCommands.MoveToSelect, this._usualArgs(viewPosition));
	}

	private _columnSelect(viewPosition: Position, mouseColumn: number, setAnchorIfNotSet: boolean): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this._execMouseCommand(CoreNavigationCommands.ColumnSelect, {
			position: this._convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition,
			mouseColumn: mouseColumn,
			setAnchorIfNotSet: setAnchorIfNotSet
		});
	}

	private _createCursor(viewPosition: Position, wholeLine: boolean): void {
		viewPosition = this._validateViewColumn(viewPosition);
		this._execMouseCommand(CoreNavigationCommands.CreateCursor, {
			position: this._convertViewToModelPosition(viewPosition),
			viewPosition: viewPosition,
			wholeLine: wholeLine
		});
	}

	private _lastCursorMoveToSelect(viewPosition: Position): void {
		this._execMouseCommand(CoreNavigationCommands.LastCursorMoveToSelect, this._usualArgs(viewPosition));
	}

	private _wordSelect(viewPosition: Position): void {
		this._execMouseCommand(CoreNavigationCommands.WordSelect, this._usualArgs(viewPosition));
	}

	private _wordSelectDrag(viewPosition: Position): void {
		this._execMouseCommand(CoreNavigationCommands.WordSelectDrag, this._usualArgs(viewPosition));
	}

	private _lastCursorWordSelect(viewPosition: Position): void {
		this._execMouseCommand(CoreNavigationCommands.LastCursorWordSelect, this._usualArgs(viewPosition));
	}

	private _lineSelect(viewPosition: Position): void {
		this._execMouseCommand(CoreNavigationCommands.LineSelect, this._usualArgs(viewPosition));
	}

	private _lineSelectDrag(viewPosition: Position): void {
		this._execMouseCommand(CoreNavigationCommands.LineSelectDrag, this._usualArgs(viewPosition));
	}

	private _lastCursorLineSelect(viewPosition: Position): void {
		this._execMouseCommand(CoreNavigationCommands.LastCursorLineSelect, this._usualArgs(viewPosition));
	}

	private _lastCursorLineSelectDrag(viewPosition: Position): void {
		this._execMouseCommand(CoreNavigationCommands.LastCursorLineSelectDrag, this._usualArgs(viewPosition));
	}

	private _selectAll(): void {
		this._execMouseCommand(CoreNavigationCommands.SelectAll, {});
	}

	// ----------------------

	private _convertViewToModelPosition(viewPosition: Position): Position {
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

	public emitMouseLeave(e: IPartialEditorMouseEvent): void {
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

	public emitMouseDrop(e: IPartialEditorMouseEvent): void {
		this.outgoingEvents.emitMouseDrop(e);
	}

	public emitMouseWheel(e: IMouseWheelEvent): void {
		this.outgoingEvents.emitMouseWheel(e);
	}
}
