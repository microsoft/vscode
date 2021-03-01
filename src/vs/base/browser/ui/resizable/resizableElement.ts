/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/resizer';
import { Widget } from 'vs/base/browser/ui/widget';
import { ResizeEvent, Resizer } from 'vs/base/browser/ui/resizable/resizer';
import { Emitter, Event } from 'vs/base/common/event';

export class ResizableElement extends Widget {
	private readonly _domNode: HTMLElement;
	private readonly _element: HTMLElement;
	private readonly _resizer: Resizer;
	private _initialWidth: number;
	private _currentWidth: number;
	private _initialHeight: number;
	private _currentHeight: number;
	private _isResizing: boolean;

	private _savedWidth?: number;
	private _savedHeight?: number;

	private _onResize = this._register(new Emitter<void>());
	public readonly onResize: Event<void> = this._onResize.event;

	constructor(element: HTMLElement) {
		super();
		this._resizer = new Resizer();
		this._initialWidth = 0;
		this._currentWidth = 0;
		this._initialHeight = 0;
		this._currentHeight = 0;
		this._isResizing = false;
		this._element = element;

		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-resizable-element';
		this._domNode.appendChild(this._element);
		this._domNode.appendChild(this._resizer.domNode.domNode);

		this._register(this._resizer.onResizeStart(() => this._onResizeStart()));
		this._register(this._resizer.onResize((e) => this._onResizeGoing(e)));
		this._register(this._resizer.onResizeEnd(() => this._onResizeEnd()));
	}

	public get isResizing() {
		return this._isResizing;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	private _onResizeStart() {
		this._initialWidth = this._domNode.clientWidth;
		this._initialHeight = this._domNode.clientHeight;
		this._isResizing = true;
	}

	private _onResizeGoing(e: ResizeEvent) {
		if (e.widthChange === 0 && e.heightChange === 0) {
			return;
		}
		this._element.style.removeProperty('maxHeight');
		this._element.style.removeProperty('maxWidth');
		this._currentWidth = this._initialWidth + e.widthChange;
		this._currentHeight = this._initialHeight + e.heightChange;
		this._domNode.style.width = `${this._currentWidth}px`;
		this._domNode.style.height = `${this._currentHeight}px`;
		this._onResize.fire();
	}

	private _onResizeEnd() {
		this._isResizing = false;
	}

	public clearResize() {
		this._domNode.style.removeProperty('width');
		this._domNode.style.removeProperty('height');
	}

	public saveResize() {
		this._savedWidth = this._currentWidth;
		this._savedHeight = this._currentHeight;
	}

	public restoreResize() {
		if (this._savedWidth && this._savedHeight) {
			this._domNode.style.width = `${this._savedWidth}px`;
			this._domNode.style.height = `${this._savedHeight}px`;
		}
	}
}
