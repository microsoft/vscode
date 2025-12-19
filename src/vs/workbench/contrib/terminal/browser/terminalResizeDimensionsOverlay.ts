/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable, MutableDisposable, toDisposable, type IDisposable } from '../../../../base/common/lifecycle.js';
import type { XtermTerminal } from './xterm/xtermTerminal.js';

const enum Constants {
	ResizeOverlayHideDelay = 500,
	VisibleClass = 'visible',
}

export class TerminalResizeDimensionsOverlay extends Disposable {

	private _resizeOverlay: HTMLElement | undefined;
	private readonly _resizeOverlayHideTimeout: MutableDisposable<IDisposable> = this._register(new MutableDisposable());

	constructor(
		private readonly _container: HTMLElement,
		xterm: XtermTerminal,
	) {
		super();

		this._register(xterm.raw.onResize(dims => this._handleDimensionsChanged(dims)));
		this._register(toDisposable(() => {
			this._resizeOverlay?.remove();
			this._resizeOverlay = undefined;
		}));
	}

	private _ensureResizeOverlay(): HTMLElement {
		if (!this._resizeOverlay) {
			this._resizeOverlay = $('.terminal-resize-overlay');
			this._resizeOverlay.setAttribute('role', 'status');
			this._resizeOverlay.setAttribute('aria-live', 'polite');
			this._container.appendChild(this._resizeOverlay);
		} else if (this._container && !this._container.contains(this._resizeOverlay)) {
			// If container changed, move overlay to new container
			this._container.appendChild(this._resizeOverlay);
		}
		return this._resizeOverlay;
	}

	private _handleDimensionsChanged(dims: { cols: number; rows: number }): void {
		if (!this._container || !this._container.isConnected) {
			return;
		}

		const overlay = this._ensureResizeOverlay();
		overlay.textContent = `${dims.cols} x ${dims.rows}`;
		overlay.classList.add(Constants.VisibleClass);

		this._resizeOverlayHideTimeout.value = disposableTimeout(() => {
			this._resizeOverlay?.classList.remove(Constants.VisibleClass);
		}, Constants.ResizeOverlayHideDelay);
	}
}
