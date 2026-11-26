/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer } from '../../../base/common/async.js';
import { Event } from '../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { IPoint, IRectangle } from '../../window/common/window.js';

/** How often the cursor is sampled, about once a frame at 60 Hz. */
const MOUSE_MOVE_SAMPLE_INTERVAL = 16;

/** The window a {@link MouseMoveForwarder} sends mouse moves to. */
export interface IMouseMoveForwarderWindow {
	/** Fires as the window shows or hides. */
	readonly onDidChangeVisibility: Event<unknown>;
	isVisible(): boolean;
	/** The window's content bounds, in the coordinates of the cursor's screen point. */
	getContentBounds(): IRectangle;
	/** Sends a mouse move at `x`, `y` relative to the window's content, in the same units. The page divides them by its zoom. */
	sendMouseMove(x: number, y: number): void;
}

/**
 * Sends a window that ignores mouse events the moves of the mouse over it, as Electron's `setIgnoreMouseEvents(true, { forward: true })`
 * should. On Windows, Electron 43 forwards them to the child window it saw created inside the window. A window opened with `window.open`,
 * such as an auxiliary window, gets that child window from its web contents, which exist before it, so it receives none
 * (electron/electron#55098, fixed in Electron 44). Samples the cursor while the window is visible, and sends a move whenever it moved over
 * the window.
 */
export class MouseMoveForwarder extends Disposable {

	private readonly _sampling = this._register(new MutableDisposable<IntervalTimer>());
	private _lastPoint: IPoint | undefined;

	constructor(
		private readonly _window: IMouseMoveForwarderWindow,
		private readonly _getCursorScreenPoint: () => IPoint,
	) {
		super();

		this._register(this._window.onDidChangeVisibility(() => this._updateSampling()));
		this._updateSampling();
	}

	private _updateSampling(): void {
		if (!this._window.isVisible()) {
			this._sampling.clear();
			this._lastPoint = undefined;
		} else if (!this._sampling.value) {
			const sampling = this._sampling.value = new IntervalTimer();
			sampling.cancelAndSet(() => this._sample(), MOUSE_MOVE_SAMPLE_INTERVAL);
		}
	}

	private _sample(): void {
		const point = this._getCursorScreenPoint();
		if (point.x === this._lastPoint?.x && point.y === this._lastPoint.y) {
			return;
		}
		this._lastPoint = point;
		const bounds = this._window.getContentBounds();
		if (point.x >= bounds.x && point.x < bounds.x + bounds.width && point.y >= bounds.y && point.y < bounds.y + bounds.height) {
			this._window.sendMouseMove(point.x - bounds.x, point.y - bounds.y);
		}
	}
}
