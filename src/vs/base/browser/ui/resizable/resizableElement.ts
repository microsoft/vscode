/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/resizer';
import { Widget } from 'vs/base/browser/ui/widget';
import { ResizeEvent, Resizer } from 'vs/base/browser/ui/resizable/resizer';
import { Emitter, Event } from 'vs/base/common/event';
import { IDimension } from 'vs/base/browser/dom';

export class ResizableElement extends Widget {
	private readonly _domNode: HTMLElement;
	private readonly _element: HTMLElement;
	private readonly _resizer: Resizer;
	private _currentDimensions: IDimension;
	private _initialDimensions: IDimension;
	private _isResizing: boolean;

	private _onResize = this._register(new Emitter<void>());
	public readonly onResize: Event<void> = this._onResize.event;
	private _onResizeEnd = this._register(new Emitter<IDimension>());
	public readonly onResizeEnd: Event<IDimension> = this._onResizeEnd.event;

	constructor(element: HTMLElement) {
		super();
		this._resizer = new Resizer();
		this._currentDimensions = {
			width: 0,
			height: 0
		};
		this._initialDimensions = {
			width: 0,
			height: 0
		};
		this._isResizing = false;
		this._element = element;

		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-resizable-element';
		this._domNode.appendChild(this._element);
		this._domNode.appendChild(this._resizer.domNode.domNode);

		this._register(this._resizer.onResizeStart(() => this._handleResizeStart()));
		this._register(this._resizer.onResize((e) => this._handleResize(e)));
		this._register(this._resizer.onResizeEnd(() => this._handleResizeEnd()));
	}

	public get isResizing() {
		return this._isResizing;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	private _handleResizeStart() {
		this._initialDimensions = {
			width: this._domNode.clientWidth,
			height: this._domNode.clientHeight
		};
		this._isResizing = true;
	}

	private _handleResize(e: ResizeEvent) {
		if (e.widthChange === 0 && e.heightChange === 0) {
			return;
		}
		this._element.style.removeProperty('maxHeight');
		this._element.style.removeProperty('maxWidth');
		const { width, height } = this._initialDimensions;
		this._currentDimensions = {
			width: width + e.widthChange,
			height: height + e.heightChange
		};
		this.setDimensions(this._currentDimensions);
		this._onResize.fire();
	}

	private _handleResizeEnd() {
		this._isResizing = false;
		this._onResizeEnd.fire(this._currentDimensions);
	}

	public setDimensions(dimensions: IDimension) {
		const { width, height } = dimensions;
		this._domNode.style.width = `${width}px`;
		this._domNode.style.height = `${height}px`;
	}

	public clearResize() {
		this._domNode.style.removeProperty('width');
		this._domNode.style.removeProperty('height');
	}
}
