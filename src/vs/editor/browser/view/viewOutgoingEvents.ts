/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Disposable } from 'vs/base/common/lifecycle';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IViewModel } from 'vs/editor/common/viewModel/viewModel';
import { IScrollEvent } from 'vs/editor/common/editorCommon';
import { IEditorMouseEvent, IMouseTarget, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { MouseTarget } from 'vs/editor/browser/controller/mouseTarget';
import * as viewEvents from 'vs/editor/common/view/viewEvents';

export interface EventCallback<T> {
	(event: T): void;
}

export class ViewOutgoingEvents extends Disposable {

	public onDidScroll: EventCallback<IScrollEvent> = null;
	public onDidGainFocus: EventCallback<void> = null;
	public onDidLoseFocus: EventCallback<void> = null;
	public onKeyDown: EventCallback<IKeyboardEvent> = null;
	public onKeyUp: EventCallback<IKeyboardEvent> = null;
	public onContextMenu: EventCallback<IEditorMouseEvent> = null;
	public onMouseMove: EventCallback<IEditorMouseEvent> = null;
	public onMouseLeave: EventCallback<IEditorMouseEvent> = null;
	public onMouseUp: EventCallback<IEditorMouseEvent> = null;
	public onMouseDown: EventCallback<IEditorMouseEvent> = null;
	public onMouseDrag: EventCallback<IEditorMouseEvent> = null;
	public onMouseDrop: EventCallback<IEditorMouseEvent> = null;

	private _viewModel: IViewModel;

	constructor(viewModel: IViewModel) {
		super();
		this._viewModel = viewModel;
	}

	public emitScrollChanged(e: viewEvents.ViewScrollChangedEvent): void {
		if (this.onDidScroll) {
			this.onDidScroll(e);
		}
	}

	public emitViewFocusGained(): void {
		if (this.onDidGainFocus) {
			this.onDidGainFocus(void 0);
		}
	}

	public emitViewFocusLost(): void {
		if (this.onDidLoseFocus) {
			this.onDidLoseFocus(void 0);
		}
	}

	public emitKeyDown(e: IKeyboardEvent): void {
		if (this.onKeyDown) {
			this.onKeyDown(e);
		}
	}

	public emitKeyUp(e: IKeyboardEvent): void {
		if (this.onKeyUp) {
			this.onKeyUp(e);
		}
	}

	public emitContextMenu(e: IEditorMouseEvent): void {
		if (this.onContextMenu) {
			this.onContextMenu(this._convertViewToModelMouseEvent(e));
		}
	}

	public emitMouseMove(e: IEditorMouseEvent): void {
		if (this.onMouseMove) {
			this.onMouseMove(this._convertViewToModelMouseEvent(e));
		}
	}

	public emitMouseLeave(e: IEditorMouseEvent): void {
		if (this.onMouseLeave) {
			this.onMouseLeave(this._convertViewToModelMouseEvent(e));
		}
	}

	public emitMouseUp(e: IEditorMouseEvent): void {
		if (this.onMouseUp) {
			this.onMouseUp(this._convertViewToModelMouseEvent(e));
		}
	}

	public emitMouseDown(e: IEditorMouseEvent): void {
		if (this.onMouseDown) {
			this.onMouseDown(this._convertViewToModelMouseEvent(e));
		}
	}

	public emitMouseDrag(e: IEditorMouseEvent): void {
		if (this.onMouseDrag) {
			this.onMouseDrag(this._convertViewToModelMouseEvent(e));
		}
	}

	public emitMouseDrop(e: IEditorMouseEvent): void {
		if (this.onMouseDrop) {
			this.onMouseDrop(this._convertViewToModelMouseEvent(e));
		}
	}

	private _convertViewToModelMouseEvent(e: IEditorMouseEvent): IEditorMouseEvent {
		if (e.target) {
			return {
				event: e.event,
				target: this._convertViewToModelMouseTarget(e.target)
			};
		}
		return e;
	}

	private _convertViewToModelMouseTarget(target: IMouseTarget): IMouseTarget {
		return new ExternalMouseTarget(
			target.element,
			target.type,
			target.mouseColumn,
			target.position ? this._convertViewToModelPosition(target.position) : null,
			target.range ? this._convertViewToModelRange(target.range) : null,
			target.detail
		);
	}

	private _convertViewToModelPosition(viewPosition: Position): Position {
		return this._viewModel.coordinatesConverter.convertViewPositionToModelPosition(viewPosition);
	}

	private _convertViewToModelRange(viewRange: Range): Range {
		return this._viewModel.coordinatesConverter.convertViewRangeToModelRange(viewRange);
	}
}

class ExternalMouseTarget implements IMouseTarget {

	public readonly element: Element;
	public readonly type: MouseTargetType;
	public readonly mouseColumn: number;
	public readonly position: Position;
	public readonly range: Range;
	public readonly detail: any;

	constructor(element: Element, type: MouseTargetType, mouseColumn: number, position: Position, range: Range, detail: any) {
		this.element = element;
		this.type = type;
		this.mouseColumn = mouseColumn;
		this.position = position;
		this.range = range;
		this.detail = detail;
	}

	public toString(): string {
		return MouseTarget.toString(this);
	}
}
