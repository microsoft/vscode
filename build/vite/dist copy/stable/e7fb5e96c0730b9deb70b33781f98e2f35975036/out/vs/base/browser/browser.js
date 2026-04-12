/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { mainWindow } from './window.js';
import { Emitter } from '../common/event.js';
class WindowManager {
    constructor() {
        // --- Zoom Level
        this.mapWindowIdToZoomLevel = new Map();
        this._onDidChangeZoomLevel = new Emitter();
        this.onDidChangeZoomLevel = this._onDidChangeZoomLevel.event;
        // --- Zoom Factor
        this.mapWindowIdToZoomFactor = new Map();
        // --- Fullscreen
        this._onDidChangeFullscreen = new Emitter();
        this.onDidChangeFullscreen = this._onDidChangeFullscreen.event;
        this.mapWindowIdToFullScreen = new Map();
    }
    static { this.INSTANCE = new WindowManager(); }
    getZoomLevel(targetWindow) {
        return this.mapWindowIdToZoomLevel.get(this.getWindowId(targetWindow)) ?? 0;
    }
    setZoomLevel(zoomLevel, targetWindow) {
        if (this.getZoomLevel(targetWindow) === zoomLevel) {
            return;
        }
        const targetWindowId = this.getWindowId(targetWindow);
        this.mapWindowIdToZoomLevel.set(targetWindowId, zoomLevel);
        this._onDidChangeZoomLevel.fire(targetWindowId);
    }
    getZoomFactor(targetWindow) {
        return this.mapWindowIdToZoomFactor.get(this.getWindowId(targetWindow)) ?? 1;
    }
    setZoomFactor(zoomFactor, targetWindow) {
        this.mapWindowIdToZoomFactor.set(this.getWindowId(targetWindow), zoomFactor);
    }
    setFullscreen(fullscreen, targetWindow) {
        if (this.isFullscreen(targetWindow) === fullscreen) {
            return;
        }
        const windowId = this.getWindowId(targetWindow);
        this.mapWindowIdToFullScreen.set(windowId, fullscreen);
        this._onDidChangeFullscreen.fire(windowId);
    }
    isFullscreen(targetWindow) {
        return !!this.mapWindowIdToFullScreen.get(this.getWindowId(targetWindow));
    }
    getWindowId(targetWindow) {
        return targetWindow.vscodeWindowId;
    }
}
export function addMatchMediaChangeListener(targetWindow, query, callback) {
    if (typeof query === 'string') {
        query = targetWindow.matchMedia(query);
    }
    query.addEventListener('change', callback);
}
/** A zoom index, e.g. 1, 2, 3 */
export function setZoomLevel(zoomLevel, targetWindow) {
    WindowManager.INSTANCE.setZoomLevel(zoomLevel, targetWindow);
}
export function getZoomLevel(targetWindow) {
    return WindowManager.INSTANCE.getZoomLevel(targetWindow);
}
export const onDidChangeZoomLevel = WindowManager.INSTANCE.onDidChangeZoomLevel;
/** The zoom scale for an index, e.g. 1, 1.2, 1.4 */
export function getZoomFactor(targetWindow) {
    return WindowManager.INSTANCE.getZoomFactor(targetWindow);
}
export function setZoomFactor(zoomFactor, targetWindow) {
    WindowManager.INSTANCE.setZoomFactor(zoomFactor, targetWindow);
}
export function setFullscreen(fullscreen, targetWindow) {
    WindowManager.INSTANCE.setFullscreen(fullscreen, targetWindow);
}
export function isFullscreen(targetWindow) {
    return WindowManager.INSTANCE.isFullscreen(targetWindow);
}
export const onDidChangeFullscreen = WindowManager.INSTANCE.onDidChangeFullscreen;
const userAgent = navigator.userAgent;
export const isFirefox = (userAgent.indexOf('Firefox') >= 0);
export const isWebKit = (userAgent.indexOf('AppleWebKit') >= 0);
export const isChrome = (userAgent.indexOf('Chrome') >= 0);
export const isSafari = (!isChrome && (userAgent.indexOf('Safari') >= 0));
export const isWebkitWebView = (!isChrome && !isSafari && isWebKit);
export const isElectron = (userAgent.indexOf('Electron/') >= 0);
export const isAndroid = (userAgent.indexOf('Android') >= 0);
let standalone = false;
if (typeof mainWindow.matchMedia === 'function') {
    const standaloneMatchMedia = mainWindow.matchMedia('(display-mode: standalone) or (display-mode: window-controls-overlay)');
    const fullScreenMatchMedia = mainWindow.matchMedia('(display-mode: fullscreen)');
    standalone = standaloneMatchMedia.matches;
    addMatchMediaChangeListener(mainWindow, standaloneMatchMedia, ({ matches }) => {
        // entering fullscreen would change standaloneMatchMedia.matches to false
        // if standalone is true (running as PWA) and entering fullscreen, skip this change
        if (standalone && fullScreenMatchMedia.matches) {
            return;
        }
        // otherwise update standalone (browser to PWA or PWA to browser)
        standalone = matches;
    });
}
export function isStandalone() {
    return standalone;
}
// Visible means that the feature is enabled, not necessarily being rendered
// e.g. visible is true even in fullscreen mode where the controls are hidden
// See docs at https://developer.mozilla.org/en-US/docs/Web/API/WindowControlsOverlay/visible
export function isWCOEnabled() {
    return !!navigator?.windowControlsOverlay?.visible;
}
// Returns the bounding rect of the titlebar area if it is supported and defined
// See docs at https://developer.mozilla.org/en-US/docs/Web/API/WindowControlsOverlay/getTitlebarAreaRect
export function getWCOTitlebarAreaRect(targetWindow) {
    return targetWindow.navigator?.windowControlsOverlay?.getTitlebarAreaRect();
}
export function getMonacoEnvironment() {
    return globalThis.MonacoEnvironment;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3Nlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvYnJvd3Nlci9icm93c2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBYyxVQUFVLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDckQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRTdDLE1BQU0sYUFBYTtJQUFuQjtRQUlDLGlCQUFpQjtRQUVBLDJCQUFzQixHQUFHLElBQUksR0FBRyxFQUFrQixDQUFDO1FBRW5ELDBCQUFxQixHQUFHLElBQUksT0FBTyxFQUFVLENBQUM7UUFDdEQseUJBQW9CLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEtBQUssQ0FBQztRQWVqRSxrQkFBa0I7UUFFRCw0QkFBdUIsR0FBRyxJQUFJLEdBQUcsRUFBa0IsQ0FBQztRQVNyRSxpQkFBaUI7UUFFQSwyQkFBc0IsR0FBRyxJQUFJLE9BQU8sRUFBVSxDQUFDO1FBQ3ZELDBCQUFxQixHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxLQUFLLENBQUM7UUFFbEQsNEJBQXVCLEdBQUcsSUFBSSxHQUFHLEVBQW1CLENBQUM7SUFrQnZFLENBQUM7YUF4RGdCLGFBQVEsR0FBRyxJQUFJLGFBQWEsRUFBRSxBQUF0QixDQUF1QjtJQVMvQyxZQUFZLENBQUMsWUFBb0I7UUFDaEMsT0FBTyxJQUFJLENBQUMsc0JBQXNCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDN0UsQ0FBQztJQUNELFlBQVksQ0FBQyxTQUFpQixFQUFFLFlBQW9CO1FBQ25ELElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxZQUFZLENBQUMsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUNuRCxPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDdEQsSUFBSSxDQUFDLHNCQUFzQixDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDM0QsSUFBSSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUNqRCxDQUFDO0lBTUQsYUFBYSxDQUFDLFlBQW9CO1FBQ2pDLE9BQU8sSUFBSSxDQUFDLHVCQUF1QixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzlFLENBQUM7SUFDRCxhQUFhLENBQUMsVUFBa0IsRUFBRSxZQUFvQjtRQUNyRCxJQUFJLENBQUMsdUJBQXVCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLEVBQUUsVUFBVSxDQUFDLENBQUM7SUFDOUUsQ0FBQztJQVNELGFBQWEsQ0FBQyxVQUFtQixFQUFFLFlBQW9CO1FBQ3RELElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxZQUFZLENBQUMsS0FBSyxVQUFVLEVBQUUsQ0FBQztZQUNwRCxPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDaEQsSUFBSSxDQUFDLHVCQUF1QixDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDdkQsSUFBSSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBQ0QsWUFBWSxDQUFDLFlBQW9CO1FBQ2hDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO0lBQzNFLENBQUM7SUFFTyxXQUFXLENBQUMsWUFBb0I7UUFDdkMsT0FBUSxZQUEyQixDQUFDLGNBQWMsQ0FBQztJQUNwRCxDQUFDOztBQUdGLE1BQU0sVUFBVSwyQkFBMkIsQ0FBQyxZQUFvQixFQUFFLEtBQThCLEVBQUUsUUFBb0U7SUFDckssSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUMvQixLQUFLLEdBQUcsWUFBWSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN4QyxDQUFDO0lBQ0QsS0FBSyxDQUFDLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQztBQUM1QyxDQUFDO0FBRUQsaUNBQWlDO0FBQ2pDLE1BQU0sVUFBVSxZQUFZLENBQUMsU0FBaUIsRUFBRSxZQUFvQjtJQUNuRSxhQUFhLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsWUFBWSxDQUFDLENBQUM7QUFDOUQsQ0FBQztBQUNELE1BQU0sVUFBVSxZQUFZLENBQUMsWUFBb0I7SUFDaEQsT0FBTyxhQUFhLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUMxRCxDQUFDO0FBQ0QsTUFBTSxDQUFDLE1BQU0sb0JBQW9CLEdBQUcsYUFBYSxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQztBQUVoRixvREFBb0Q7QUFDcEQsTUFBTSxVQUFVLGFBQWEsQ0FBQyxZQUFvQjtJQUNqRCxPQUFPLGFBQWEsQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBQzNELENBQUM7QUFDRCxNQUFNLFVBQVUsYUFBYSxDQUFDLFVBQWtCLEVBQUUsWUFBb0I7SUFDckUsYUFBYSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsVUFBVSxFQUFFLFlBQVksQ0FBQyxDQUFDO0FBQ2hFLENBQUM7QUFFRCxNQUFNLFVBQVUsYUFBYSxDQUFDLFVBQW1CLEVBQUUsWUFBb0I7SUFDdEUsYUFBYSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsVUFBVSxFQUFFLFlBQVksQ0FBQyxDQUFDO0FBQ2hFLENBQUM7QUFDRCxNQUFNLFVBQVUsWUFBWSxDQUFDLFlBQW9CO0lBQ2hELE9BQU8sYUFBYSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDMUQsQ0FBQztBQUNELE1BQU0sQ0FBQyxNQUFNLHFCQUFxQixHQUFHLGFBQWEsQ0FBQyxRQUFRLENBQUMscUJBQXFCLENBQUM7QUFFbEYsTUFBTSxTQUFTLEdBQUcsU0FBUyxDQUFDLFNBQVMsQ0FBQztBQUV0QyxNQUFNLENBQUMsTUFBTSxTQUFTLEdBQUcsQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQzdELE1BQU0sQ0FBQyxNQUFNLFFBQVEsR0FBRyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDaEUsTUFBTSxDQUFDLE1BQU0sUUFBUSxHQUFHLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztBQUMzRCxNQUFNLENBQUMsTUFBTSxRQUFRLEdBQUcsQ0FBQyxDQUFDLFFBQVEsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUMxRSxNQUFNLENBQUMsTUFBTSxlQUFlLEdBQUcsQ0FBQyxDQUFDLFFBQVEsSUFBSSxDQUFDLFFBQVEsSUFBSSxRQUFRLENBQUMsQ0FBQztBQUNwRSxNQUFNLENBQUMsTUFBTSxVQUFVLEdBQUcsQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQ2hFLE1BQU0sQ0FBQyxNQUFNLFNBQVMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7QUFFN0QsSUFBSSxVQUFVLEdBQUcsS0FBSyxDQUFDO0FBQ3ZCLElBQUksT0FBTyxVQUFVLENBQUMsVUFBVSxLQUFLLFVBQVUsRUFBRSxDQUFDO0lBQ2pELE1BQU0sb0JBQW9CLEdBQUcsVUFBVSxDQUFDLFVBQVUsQ0FBQyx1RUFBdUUsQ0FBQyxDQUFDO0lBQzVILE1BQU0sb0JBQW9CLEdBQUcsVUFBVSxDQUFDLFVBQVUsQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO0lBQ2pGLFVBQVUsR0FBRyxvQkFBb0IsQ0FBQyxPQUFPLENBQUM7SUFDMUMsMkJBQTJCLENBQUMsVUFBVSxFQUFFLG9CQUFvQixFQUFFLENBQUMsRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFO1FBQzdFLHlFQUF5RTtRQUN6RSxtRkFBbUY7UUFDbkYsSUFBSSxVQUFVLElBQUksb0JBQW9CLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDaEQsT0FBTztRQUNSLENBQUM7UUFDRCxpRUFBaUU7UUFDakUsVUFBVSxHQUFHLE9BQU8sQ0FBQztJQUN0QixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFDRCxNQUFNLFVBQVUsWUFBWTtJQUMzQixPQUFPLFVBQVUsQ0FBQztBQUNuQixDQUFDO0FBRUQsNEVBQTRFO0FBQzVFLDZFQUE2RTtBQUM3RSw2RkFBNkY7QUFDN0YsTUFBTSxVQUFVLFlBQVk7SUFDM0IsT0FBTyxDQUFDLENBQUUsU0FBMEUsRUFBRSxxQkFBcUIsRUFBRSxPQUFPLENBQUM7QUFDdEgsQ0FBQztBQUVELGdGQUFnRjtBQUNoRix5R0FBeUc7QUFDekcsTUFBTSxVQUFVLHNCQUFzQixDQUFDLFlBQW9CO0lBQzFELE9BQVEsWUFBWSxDQUFDLFNBQTRGLEVBQUUscUJBQXFCLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQztBQUNqSyxDQUFDO0FBbUJELE1BQU0sVUFBVSxvQkFBb0I7SUFDbkMsT0FBUSxVQUEyQyxDQUFDLGlCQUFpQixDQUFDO0FBQ3ZFLENBQUMifQ==