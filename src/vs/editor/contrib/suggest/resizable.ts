/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Dimension } from 'vs/base/browser/dom';
import { Orientation, Sash } from 'vs/base/browser/ui/sash/sash';


export class ResizableHTMLElement {

	readonly domNode: HTMLElement;

	private readonly _onDidResize = new Emitter<Dimension>();
	readonly onDidResize: Event<Dimension> = this._onDidResize.event;

	private readonly _eastSash: Sash;
	private readonly _southSash: Sash;
	private readonly _sashListener = new DisposableStore();

	private _size?: Dimension;

	constructor() {
		this.domNode = document.createElement('div');
		this._eastSash = new Sash(this.domNode, { getVerticalSashLeft: () => this._size?.width ?? 0 }, { orientation: Orientation.VERTICAL });
		this._southSash = new Sash(this.domNode, { getHorizontalSashTop: () => this._size?.height ?? 0 }, { orientation: Orientation.HORIZONTAL });

		this._eastSash.orthogonalEndSash = this._southSash;
		this._southSash.orthogonalEndSash = this._eastSash;

		let currentSize: Dimension | undefined;
		let deltaY = 0;
		let deltaX = 0;

		this._sashListener.add(Event.any(this._eastSash.onDidEnd, this._southSash.onDidEnd)(() => {
			currentSize = undefined;
			deltaY = 0;
			deltaX = 0;
		}));
		this._sashListener.add(Event.any(this._eastSash.onDidStart, this._southSash.onDidStart)(() => {
			currentSize = this._size;
			deltaY = 0;
			deltaX = 0;
		}));
		this._sashListener.add(this._southSash.onDidChange(e => {
			if (currentSize) {
				deltaY = e.currentY - e.startY;
				this._resize(currentSize.height + deltaY, currentSize.width + deltaX);
			}
		}));
		this._sashListener.add(this._eastSash.onDidChange(e => {
			if (currentSize) {
				deltaX = e.currentX - e.startX;
				this._resize(currentSize.height + deltaY, currentSize.width + deltaX);
			}
		}));
	}

	dispose(): void {
		this._southSash.dispose();
		this._eastSash.dispose();
		this._sashListener.dispose();
		this.domNode.remove();
	}

	private _resize(height: number, width: number): void {
		this.layout(height, width);
		this._onDidResize.fire(this._size!);
	}

	layout(height: number, width: number): void {
		const newSize = new Dimension(width, height);
		if (!Dimension.equals(newSize, this._size)) {
			this.domNode.style.height = height + 'px';
			this.domNode.style.width = width + 'px';
			this._size = newSize;
			this._southSash.layout();
			this._eastSash.layout();
		}
	}
}
