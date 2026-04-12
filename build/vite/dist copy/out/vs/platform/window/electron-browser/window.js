/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getZoomLevel, setZoomFactor, setZoomLevel } from '../../../base/browser/browser.js';
import { getActiveWindow, getWindows } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { ipcRenderer, webFrame } from '../../../base/parts/sandbox/electron-browser/globals.js';
import { zoomLevelToZoomFactor } from '../common/window.js';
export var ApplyZoomTarget;
(function (ApplyZoomTarget) {
    ApplyZoomTarget[ApplyZoomTarget["ACTIVE_WINDOW"] = 1] = "ACTIVE_WINDOW";
    ApplyZoomTarget[ApplyZoomTarget["ALL_WINDOWS"] = 2] = "ALL_WINDOWS";
})(ApplyZoomTarget || (ApplyZoomTarget = {}));
export const MAX_ZOOM_LEVEL = 8;
export const MIN_ZOOM_LEVEL = -8;
/**
 * Apply a zoom level to the window. Also sets it in our in-memory
 * browser helper so that it can be accessed in non-electron layers.
 */
export function applyZoom(zoomLevel, target) {
    zoomLevel = Math.min(Math.max(zoomLevel, MIN_ZOOM_LEVEL), MAX_ZOOM_LEVEL); // cap zoom levels between -8 and 8
    const targetWindows = [];
    if (target === ApplyZoomTarget.ACTIVE_WINDOW) {
        targetWindows.push(getActiveWindow());
    }
    else if (target === ApplyZoomTarget.ALL_WINDOWS) {
        targetWindows.push(...Array.from(getWindows()).map(({ window }) => window));
    }
    else {
        targetWindows.push(target);
    }
    for (const targetWindow of targetWindows) {
        getGlobals(targetWindow)?.webFrame?.setZoomLevel(zoomLevel);
        setZoomFactor(zoomLevelToZoomFactor(zoomLevel), targetWindow);
        setZoomLevel(zoomLevel, targetWindow);
    }
}
function getGlobals(win) {
    if (win === mainWindow) {
        // main window
        return { ipcRenderer, webFrame };
    }
    else {
        // auxiliary window
        const auxiliaryWindow = win;
        if (auxiliaryWindow?.vscode?.ipcRenderer && auxiliaryWindow?.vscode?.webFrame) {
            return auxiliaryWindow.vscode;
        }
    }
    return undefined;
}
export function zoomIn(target) {
    applyZoom(getZoomLevel(typeof target === 'number' ? getActiveWindow() : target) + 1, target);
}
export function zoomOut(target) {
    applyZoom(getZoomLevel(typeof target === 'number' ? getActiveWindow() : target) - 1, target);
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2luZG93LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vd2luZG93L2VsZWN0cm9uLWJyb3dzZXIvd2luZG93LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxZQUFZLEVBQUUsYUFBYSxFQUFFLFlBQVksRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzdGLE9BQU8sRUFBRSxlQUFlLEVBQUUsVUFBVSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDM0UsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRTdELE9BQU8sRUFBbUIsV0FBVyxFQUFFLFFBQVEsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ2pILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRTVELE1BQU0sQ0FBTixJQUFZLGVBR1g7QUFIRCxXQUFZLGVBQWU7SUFDMUIsdUVBQWlCLENBQUE7SUFDakIsbUVBQVcsQ0FBQTtBQUNaLENBQUMsRUFIVyxlQUFlLEtBQWYsZUFBZSxRQUcxQjtBQUVELE1BQU0sQ0FBQyxNQUFNLGNBQWMsR0FBRyxDQUFDLENBQUM7QUFDaEMsTUFBTSxDQUFDLE1BQU0sY0FBYyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBRWpDOzs7R0FHRztBQUNILE1BQU0sVUFBVSxTQUFTLENBQUMsU0FBaUIsRUFBRSxNQUFnQztJQUM1RSxTQUFTLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxjQUFjLENBQUMsRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDLG1DQUFtQztJQUU5RyxNQUFNLGFBQWEsR0FBYSxFQUFFLENBQUM7SUFDbkMsSUFBSSxNQUFNLEtBQUssZUFBZSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQzlDLGFBQWEsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQztJQUN2QyxDQUFDO1NBQU0sSUFBSSxNQUFNLEtBQUssZUFBZSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ25ELGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztJQUM3RSxDQUFDO1NBQU0sQ0FBQztRQUNQLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDNUIsQ0FBQztJQUVELEtBQUssTUFBTSxZQUFZLElBQUksYUFBYSxFQUFFLENBQUM7UUFDMUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxFQUFFLFFBQVEsRUFBRSxZQUFZLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDNUQsYUFBYSxDQUFDLHFCQUFxQixDQUFDLFNBQVMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQzlELFlBQVksQ0FBQyxTQUFTLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDdkMsQ0FBQztBQUNGLENBQUM7QUFFRCxTQUFTLFVBQVUsQ0FBQyxHQUFXO0lBQzlCLElBQUksR0FBRyxLQUFLLFVBQVUsRUFBRSxDQUFDO1FBQ3hCLGNBQWM7UUFDZCxPQUFPLEVBQUUsV0FBVyxFQUFFLFFBQVEsRUFBRSxDQUFDO0lBQ2xDLENBQUM7U0FBTSxDQUFDO1FBQ1AsbUJBQW1CO1FBQ25CLE1BQU0sZUFBZSxHQUFHLEdBQTZDLENBQUM7UUFDdEUsSUFBSSxlQUFlLEVBQUUsTUFBTSxFQUFFLFdBQVcsSUFBSSxlQUFlLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxDQUFDO1lBQy9FLE9BQU8sZUFBZSxDQUFDLE1BQU0sQ0FBQztRQUMvQixDQUFDO0lBQ0YsQ0FBQztJQUVELE9BQU8sU0FBUyxDQUFDO0FBQ2xCLENBQUM7QUFFRCxNQUFNLFVBQVUsTUFBTSxDQUFDLE1BQWdDO0lBQ3RELFNBQVMsQ0FBQyxZQUFZLENBQUMsT0FBTyxNQUFNLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0FBQzlGLENBQUM7QUFFRCxNQUFNLFVBQVUsT0FBTyxDQUFDLE1BQWdDO0lBQ3ZELFNBQVMsQ0FBQyxZQUFZLENBQUMsT0FBTyxNQUFNLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0FBQzlGLENBQUM7QUEwQkQsWUFBWSJ9