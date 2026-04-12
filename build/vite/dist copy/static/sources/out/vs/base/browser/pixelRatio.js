/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getWindowId, onDidUnregisterWindow } from './dom.js';
import { Emitter, Event } from '../common/event.js';
import { Disposable, markAsSingleton, toDisposable } from '../common/lifecycle.js';
/**
 * See https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio#monitoring_screen_resolution_or_zoom_level_changes
 */
class DevicePixelRatioMonitor extends Disposable {
    constructor(targetWindow) {
        super();
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._listener = () => this._handleChange(targetWindow, true);
        this._mediaQueryList = null;
        this._handleChange(targetWindow, false);
        this._register(toDisposable(() => this._mediaQueryList?.removeEventListener('change', this._listener)));
    }
    _handleChange(targetWindow, fireEvent) {
        this._mediaQueryList?.removeEventListener('change', this._listener);
        this._mediaQueryList = targetWindow.matchMedia(`(resolution: ${targetWindow.devicePixelRatio}dppx)`);
        this._mediaQueryList.addEventListener('change', this._listener);
        if (fireEvent) {
            this._onDidChange.fire();
        }
    }
}
class PixelRatioMonitorImpl extends Disposable {
    get value() {
        return this._value;
    }
    constructor(targetWindow) {
        super();
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._value = this._getPixelRatio(targetWindow);
        const dprMonitor = this._register(new DevicePixelRatioMonitor(targetWindow));
        this._register(dprMonitor.onDidChange(() => {
            this._value = this._getPixelRatio(targetWindow);
            this._onDidChange.fire(this._value);
        }));
    }
    _getPixelRatio(targetWindow) {
        const ctx = document.createElement('canvas').getContext('2d');
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
    constructor() {
        this.mapWindowIdToPixelRatioMonitor = new Map();
    }
    _getOrCreatePixelRatioMonitor(targetWindow) {
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
    getInstance(targetWindow) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGl4ZWxSYXRpby5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvYnJvd3Nlci9waXhlbFJhdGlvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxXQUFXLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFDOUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUNwRCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQVVuRjs7R0FFRztBQUNILE1BQU0sdUJBQXdCLFNBQVEsVUFBVTtJQVEvQyxZQUFZLFlBQW9CO1FBQy9CLEtBQUssRUFBRSxDQUFDO1FBUFEsaUJBQVksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUMzRCxnQkFBVyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDO1FBUTlDLElBQUksQ0FBQyxTQUFTLEdBQUcsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDOUQsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUM7UUFDNUIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxZQUFZLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxtQkFBbUIsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN6RyxDQUFDO0lBRU8sYUFBYSxDQUFDLFlBQW9CLEVBQUUsU0FBa0I7UUFDN0QsSUFBSSxDQUFDLGVBQWUsRUFBRSxtQkFB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