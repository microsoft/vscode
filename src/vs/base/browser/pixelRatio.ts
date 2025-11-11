/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindowId, onDidUnregisterWindow } from './dom.js';
import { Emitter, Event } from '../common/event.js';
import { Disposable, markAsSingleton } from '../common/lifecycle.js';

type BackingStoreContext = CanvasRenderingContext2D & {
	webkitBackingStorePixelRatio?: number;
	mozBackingStorePixelRatio?: number;
	msBackingStorePixelRatio?: number;
	oBackingStorePixelRatio?: number;
	backingStorePixelRatio?: number;
};

/**
 * See https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio#monitoring_screen_resolution_or_zoom_level_changes
 */
class DevicePixelRatioMonitor extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _listener: () => void;
	private _mediaQueryList: MediaQueryList | null;

	constructor(targetWindow: Window) {
		super();

		this._listener = () => this._handleChange(targetWindow, true);
		this._mediaQueryList = null;
		this._handleChange(targetWindow, false);
	}

	private _handleChange(targetWindow: Window, fireEvent: boolean): void {
		this._mediaQueryList?.removeEventListener('change', this._listener);

		this._mediaQueryList = targetWindow.matchMedia(`(resolution: ${targetWindow.devicePixelRatio}dppx)`);
		this._mediaQueryList.addEventListener('change', this._listener);

		if (fireEvent) {
			this._onDidChange.fire();
		}
	}
}

export interface IPixelRatioMonitor {
	readonly value: number;
	readonly onDidChange: Event<number>;
}

class PixelRatioMonitorImpl extends Disposable implements IPixelRatioMonitor {

	private readonly _onDidChange = this._register(new Emitter<number>());
	readonly onDidChange = this._onDidChange.event;

	private _value: number;

	get value(): number {
		return this._value;
	}

	constructor(targetWindow: Window) {
		super();

		this._value = this._getPixelRatio(targetWindow);

		const dprMonitor = this._register(new DevicePixelRatioMonitor(targetWindow));
		this._register(dprMonitor.onDidChange(() => {
			this._value = this._getPixelRatio(targetWindow);
			this._onDidChange.fire(this._value);
		}));
	}

	private _getPixelRatio(targetWindow: Window): number {
		const ctx = document.createElement('canvas').getContext('2d') as BackingStoreContext | null;
		const dpr = targetWindow.devicePixelRatio || 1;
		const bsr = ctx?.webkitBackingStorePixelRatio ||
			ctx?.mozBackingStorePixelRatio ||
			ctx?.msBackingStorePixelRatio ||
			ctx?.oBackingStorePixelRatio ||
			ctx?.backingStorePixelRatio || 1;
		return dpr / bsr;
	}
}

class PixelRatioMonitorFacade {

	private readonly mapWindowIdToPixelRatioMonitor = new Map<number, PixelRatioMonitorImpl>();

	private _getOrCreatePixelRatioMonitor(targetWindow: Window): PixelRatioMonitorImpl {
		const targetWindowId = getWindowId(targetWindow);
		let pixelRatioMonitor = this.mapWindowIdToPixelRatioMonitor.get(targetWindowId);
		if (!pixelRatioMonitor) {
			pixelRatioMonitor = markAsSingleton(new PixelRatioMonitorImpl(targetWindow));
			this.mapWindowIdToPixelRatioMonitor.set(targetWindowId, pixelRatioMonitor);

			markAsSingleton(Event.once(onDidUnregisterWindow)(({ vscodeWindowId }) => {
				if (vscodeWindowId === targetWindowId) {
					pixelRatioMonitor?.dispose();
					this.mapWindowIdToPixelRatioMonitor.delete(targetWindowId);
				}
			}));
		}
		return pixelRatioMonitor;
	}

	getInstance(targetWindow: Window): IPixelRatioMonitor {
		return this._getOrCreatePixelRatioMonitor(targetWindow);
	}
}

/**
 * Returns the pixel ratio.
 *
 * This is useful for rendering <canvas> elements at native screen resolution or for being used as
 * a cache key when storing font measurements. Fonts might render differently depending on resolution
 * and any measurements need to be discarded for example when a window is moved from a monitor to another.
 */
export const PixelRatio = new PixelRatioMonitorFacade();
