/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Widget } from 'vs/base/browser/ui/widget';
import { createFastDomNode, FastDomNode } from 'vs/base/browser/fastDomNode';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { Emitter, Event } from 'vs/base/common/event';

export interface ResizeEvent {
	widthChange: number;
	heightChange: number;
}

export class Resizer extends Widget {
	public domNode: FastDomNode<HTMLElement>;

	private _dragging: boolean;
	private _initialX: number;
	private _initialY: number;

	private _onResizeStart = this._register(new Emitter<void>());
	public readonly onResizeStart: Event<void> = this._onResizeStart.event;
	private _onResize = this._register(new Emitter<ResizeEvent>());
	public readonly onResize: Event<ResizeEvent> = this._onResize.event;
	private _onResizeEnd = this._register(new Emitter<void>());
	public readonly onResizeEnd: Event<void> = this._onResizeEnd.event;

	constructor() {
		super();
		this._dragging = false;
		this._initialX = 0;
		this._initialY = 0;

		this.domNode = createFastDomNode(document.createElement('div'));
		this.domNode.domNode.className = 'resizer';

		this.onmousedown(document, (e) => this._domNodeMouseDown(e));
		this.onmousemove(document, (e) => this._onMouseMove(e));
		this.onmouseup(document, () => this._onMouseUp());
	}

	private _domNodeMouseDown(e: IMouseEvent) {
		if (e.target !== this.domNode.domNode) {
			return;
		}
		this._onMouseDown(e);
	}

	private _onMouseDown(e: IMouseEvent) {
		this._dragging = true;
		this._initialX = e.posx;
		this._initialY = e.posy;
		this._onResizeStart.fire();
	}

	private _onMouseUp() {
		if (!this._dragging) {
			return;
		}
		this._dragging = false;
		this._onResizeEnd.fire();
	}

	private _onMouseMove(e: IMouseEvent) {
		if (!this._dragging) {
			return;
		}

		this._onResize.fire({
			widthChange: e.posx - this._initialX,
			heightChange: e.posy - this._initialY
		});
	}
}