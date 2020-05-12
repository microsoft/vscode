/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { Disposable } from 'vs/base/common/lifecycle';
import { MouseTarget } from 'vs/editor/browser/controller/mouseTarget';
import { IEditorMouseEvent, IMouseTarget, IPartialEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IScrollEvent, IContentSizeChangedEvent } from 'vs/editor/common/editorCommon';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { IViewModel, ICoordinatesConverter } from 'vs/editor/common/viewModel/viewModel';
import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';

export interface EventCallback<T> {
	(event: T): void;
}

export class ViewOutgoingEvents extends Disposable {

	public onDidContentSizeChange: EventCallback<IContentSizeChangedEvent> | null = null;
	public onDidScroll: EventCallback<IScrollEvent> | null = null;
	public onDidGainFocus: EventCallback<void> | null = null;
	public onDidLoseFocus: EventCallback<void> | null = null;
	public onKeyDown: EventCallback<IKeyboardEvent> | null = null;
	public onKeyUp: EventCallback<IKeyboardEvent> | null = null;
	public onContextMenu: EventCallback<IEditorMouseEvent> | null = null;
	public onMouseMove: EventCallback<IEditorMouseEvent> | null = null;
	public onMouseLeave: EventCallback<IPartialEditorMouseEvent> | null = null;
	public onMouseUp: EventCallback<IEditorMouseEvent> | null = null;
	public onMouseDown: EventCallback<IEditorMouseEvent> | null = null;
	public onMouseDrag: EventCallback<IEditorMouseEvent> | null = null;
	public onMouseDrop: EventCallback<IPartialEditorMouseEvent> | null = null;
	public onMouseWheel: EventCallback<IMouseWheelEvent> | null = null;

	private readonly _viewModel: IViewModel;

	constructor(viewModel: IViewModel) {
		super();
		this._viewModel = viewModel;
	}

	public emitContentSizeChange(e: viewEvents.ViewContentSizeChangedEvent): void {
		if (this.onDidContentSizeChange) {
			this.onDidContentSizeChange(e);
		}
	}

	public emitScrollChanged(e: viewEvents.ViewScrollChangedEvent): void {
		if (this.onDidScroll) {
			this.onDidScroll(e);
		}
	}

	public emitViewFocusGained(): void {
		if (this.onDidGainFocus) {
			this.onDidGainFocus(undefined);
		}
	}

	public emitViewFocusLost(): void {
		if (this.onDidLoseFocus) {
			this.onDidLoseFocus(undefined);
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

	public emitMouseLeave(e: IPartialEditorMouseEvent): void {
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

	public emitMouseDrop(e: IPartialEditorMouseEvent): void {
		if (this.onMouseDrop) {
			this.onMouseDrop(this._convertViewToModelMouseEvent(e));
		}
	}

	public emitMouseWheel(e: IMouseWheelEvent): void {
		if (this.onMouseWheel) {
			this.onMouseWheel(e);
		}
	}

	private _convertViewToModelMouseEvent(e: IEditorMouseEvent): IEditorMouseEvent;
	private _convertViewToModelMouseEvent(e: IPartialEditorMouseEvent): IPartialEditorMouseEvent;
	private _convertViewToModelMouseEvent(e: IEditorMouseEvent | IPartialEditorMouseEvent): IEditorMouseEvent | IPartialEditorMouseEvent {
		if (e.target) {
			return {
				event: e.event,
				target: this._convertViewToModelMouseTarget(e.target)
			};
		}
		return e;
	}

	private _convertViewToModelMouseTarget(target: IMouseTarget): IMouseTarget {
		return ViewOutgoingEvents.convertViewToModelMouseTarget(target, this._viewModel.coordinatesConverter);
	}

	public static convertViewToModelMouseTarget(target: IMouseTarget, coordinatesConverter: ICoordinatesConverter): IMouseTarget {
		return new ExternalMouseTarget(
			target.element,
			target.type,
			target.mouseColumn,
			target.position ? coordinatesConverter.convertViewPositionToModelPosition(target.position) : null,
			target.range ? coordinatesConverter.convertViewRangeToModelRange(target.range) : null,
			target.detail
		);
	}
}

class ExternalMouseTarget implements IMouseTarget {

	public readonly element: Element | null;
	public readonly type: MouseTargetType;
	public readonly mouseColumn: number;
	public readonly position: Position | null;
	public readonly range: Range | null;
	public readonly detail: any;

	constructor(element: Element | null, type: MouseTargetType, mouseColumn: number, position: Position | null, range: Range | null, detail: any) {
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
