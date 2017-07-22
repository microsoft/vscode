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
import Event, { Emitter } from 'vs/base/common/event';

export class ViewOutgoingEvents extends Disposable {

	private readonly _onDidScroll: Emitter<IScrollEvent> = this._register(new Emitter<IScrollEvent>());
	public readonly onDidScroll: Event<IScrollEvent> = this._onDidScroll.event;

	private readonly _onDidGainFocus: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidGainFocus: Event<void> = this._onDidGainFocus.event;

	private readonly _onDidLoseFocus: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidLoseFocus: Event<void> = this._onDidLoseFocus.event;

	private readonly _onKeyDown: Emitter<IKeyboardEvent> = this._register(new Emitter<IKeyboardEvent>());
	public readonly onKeyDown: Event<IKeyboardEvent> = this._onKeyDown.event;

	private readonly _onKeyUp: Emitter<IKeyboardEvent> = this._register(new Emitter<IKeyboardEvent>());
	public readonly onKeyUp: Event<IKeyboardEvent> = this._onKeyUp.event;

	private readonly _onContextMenu: Emitter<IEditorMouseEvent> = this._register(new Emitter<IEditorMouseEvent>());
	public readonly onContextMenu: Event<IEditorMouseEvent> = this._onContextMenu.event;

	private readonly _onMouseMove: Emitter<IEditorMouseEvent> = this._register(new Emitter<IEditorMouseEvent>());
	public readonly onMouseMove: Event<IEditorMouseEvent> = this._onMouseMove.event;

	private readonly _onMouseLeave: Emitter<IEditorMouseEvent> = this._register(new Emitter<IEditorMouseEvent>());
	public readonly onMouseLeave: Event<IEditorMouseEvent> = this._onMouseLeave.event;

	private readonly _onMouseUp: Emitter<IEditorMouseEvent> = this._register(new Emitter<IEditorMouseEvent>());
	public readonly onMouseUp: Event<IEditorMouseEvent> = this._onMouseUp.event;

	private readonly _onMouseDown: Emitter<IEditorMouseEvent> = this._register(new Emitter<IEditorMouseEvent>());
	public readonly onMouseDown: Event<IEditorMouseEvent> = this._onMouseDown.event;

	private readonly _onMouseDrag: Emitter<IEditorMouseEvent> = this._register(new Emitter<IEditorMouseEvent>());
	public readonly onMouseDrag: Event<IEditorMouseEvent> = this._onMouseDrag.event;

	private readonly _onMouseDrop: Emitter<IEditorMouseEvent> = this._register(new Emitter<IEditorMouseEvent>());
	public readonly onMouseDrop: Event<IEditorMouseEvent> = this._onMouseDrop.event;

	private _viewModel: IViewModel;

	constructor(viewModel: IViewModel) {
		super();
		this._viewModel = viewModel;
	}

	public emitScrollChanged(e: viewEvents.ViewScrollChangedEvent): void {
		this._onDidScroll.fire(e);
	}

	public emitViewFocusGained(): void {
		this._onDidGainFocus.fire();
	}

	public emitViewFocusLost(): void {
		this._onDidLoseFocus.fire();
	}

	public emitKeyDown(e: IKeyboardEvent): void {
		this._onKeyDown.fire(e);
	}

	public emitKeyUp(e: IKeyboardEvent): void {
		this._onKeyUp.fire(e);
	}

	public emitContextMenu(e: IEditorMouseEvent): void {
		this._onContextMenu.fire(this._convertViewToModelMouseEvent(e));
	}

	public emitMouseMove(e: IEditorMouseEvent): void {
		this._onMouseMove.fire(this._convertViewToModelMouseEvent(e));
	}

	public emitMouseLeave(e: IEditorMouseEvent): void {
		this._onMouseLeave.fire(this._convertViewToModelMouseEvent(e));
	}

	public emitMouseUp(e: IEditorMouseEvent): void {
		this._onMouseUp.fire(this._convertViewToModelMouseEvent(e));
	}

	public emitMouseDown(e: IEditorMouseEvent): void {
		this._onMouseDown.fire(this._convertViewToModelMouseEvent(e));
	}

	public emitMouseDrag(e: IEditorMouseEvent): void {
		this._onMouseDrag.fire(this._convertViewToModelMouseEvent(e));
	}

	public emitMouseDrop(e: IEditorMouseEvent): void {
		this._onMouseDrop.fire(this._convertViewToModelMouseEvent(e));
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
