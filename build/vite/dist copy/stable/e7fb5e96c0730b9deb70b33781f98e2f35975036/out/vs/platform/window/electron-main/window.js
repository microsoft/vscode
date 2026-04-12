/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import electron from 'electron';
import { DEFAULT_AUX_WINDOW_SIZE, DEFAULT_EMPTY_WINDOW_SIZE, DEFAULT_WORKSPACE_WINDOW_SIZE } from '../common/window.js';
export var LoadReason;
(function (LoadReason) {
    /**
     * The window is loaded for the first time.
     */
    LoadReason[LoadReason["INITIAL"] = 1] = "INITIAL";
    /**
     * The window is loaded into a different workspace context.
     */
    LoadReason[LoadReason["LOAD"] = 2] = "LOAD";
    /**
     * The window is reloaded.
     */
    LoadReason[LoadReason["RELOAD"] = 3] = "RELOAD";
})(LoadReason || (LoadReason = {}));
export var UnloadReason;
(function (UnloadReason) {
    /**
     * The window is closed.
     */
    UnloadReason[UnloadReason["CLOSE"] = 1] = "CLOSE";
    /**
     * All windows unload because the application quits.
     */
    UnloadReason[UnloadReason["QUIT"] = 2] = "QUIT";
    /**
     * The window is reloaded.
     */
    UnloadReason[UnloadReason["RELOAD"] = 3] = "RELOAD";
    /**
     * The window is loaded into a different workspace context.
     */
    UnloadReason[UnloadReason["LOAD"] = 4] = "LOAD";
})(UnloadReason || (UnloadReason = {}));
export const defaultWindowState = function (mode = 1 /* WindowMode.Normal */, hasWorkspace = false) {
    const size = hasWorkspace ? DEFAULT_WORKSPACE_WINDOW_SIZE : DEFAULT_EMPTY_WINDOW_SIZE;
    return {
        width: size.width,
        height: size.height,
        mode
    };
};
export const defaultAuxWindowState = function () {
    // Auxiliary windows are being created from a `window.open` call
    // that sets `windowFeatures` that encode the desired size and
    // position of the new window (`top`, `left`).
    // In order to truly override this to a good default window state
    // we need to set not only width and height but also x and y to
    // a good location on the primary display.
    const width = DEFAULT_AUX_WINDOW_SIZE.width;
    const height = DEFAULT_AUX_WINDOW_SIZE.height;
    const workArea = electron.screen.getPrimaryDisplay().workArea;
    const x = Math.max(workArea.x + (workArea.width / 2) - (width / 2), 0);
    const y = Math.max(workArea.y + (workArea.height / 2) - (height / 2), 0);
    return {
        x,
        y,
        width,
        height,
        mode: 1 /* WindowMode.Normal */
    };
};
export var WindowMode;
(function (WindowMode) {
    WindowMode[WindowMode["Maximized"] = 0] = "Maximized";
    WindowMode[WindowMode["Normal"] = 1] = "Normal";
    WindowMode[WindowMode["Minimized"] = 2] = "Minimized";
    WindowMode[WindowMode["Fullscreen"] = 3] = "Fullscreen";
})(WindowMode || (WindowMode = {}));
export var WindowError;
(function (WindowError) {
    /**
     * Maps to the `unresponsive` event on a `BrowserWindow`.
     */
    WindowError[WindowError["UNRESPONSIVE"] = 1] = "UNRESPONSIVE";
    /**
     * Maps to the `render-process-gone` event on a `WebContents`.
     */
    WindowError[WindowError["PROCESS_GONE"] = 2] = "PROCESS_GONE";
    /**
     * Maps to the `did-fail-load` event on a `WebContents`.
     */
    WindowError[WindowError["LOAD"] = 3] = "LOAD";
    /**
     * Maps to the `responsive` event on a `BrowserWindow`.
     */
    WindowError[WindowError["RESPONSIVE"] = 4] = "RESPONSIVE";
})(WindowError || (WindowError = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2luZG93LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vd2luZG93L2VsZWN0cm9uLW1haW4vd2luZG93LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sUUFBUSxNQUFNLFVBQVUsQ0FBQztBQVNoQyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUseUJBQXlCLEVBQUUsNkJBQTZCLEVBQThCLE1BQU0scUJBQXFCLENBQUM7QUEyRXBKLE1BQU0sQ0FBTixJQUFrQixVQWdCakI7QUFoQkQsV0FBa0IsVUFBVTtJQUUzQjs7T0FFRztJQUNILGlEQUFXLENBQUE7SUFFWDs7T0FFRztJQUNILDJDQUFJLENBQUE7SUFFSjs7T0FFRztJQUNILCtDQUFNLENBQUE7QUFDUCxDQUFDLEVBaEJpQixVQUFVLEtBQVYsVUFBVSxRQWdCM0I7QUFFRCxNQUFNLENBQU4sSUFBa0IsWUFxQmpCO0FBckJELFdBQWtCLFlBQVk7SUFFN0I7O09BRUc7SUFDSCxpREFBUyxDQUFBO0lBRVQ7O09BRUc7SUFDSCwrQ0FBSSxDQUFBO0lBRUo7O09BRUc7SUFDSCxtREFBTSxDQUFBO0lBRU47O09BRUc7SUFDSCwrQ0FBSSxDQUFBO0FBQ0wsQ0FBQyxFQXJCaUIsWUFBWSxLQUFaLFlBQVksUUFxQjdCO0FBWUQsTUFBTSxDQUFDLE1BQU0sa0JBQWtCLEdBQUcsVUFBVSxJQUFJLDRCQUFvQixFQUFFLFlBQVksR0FBRyxLQUFLO0lBQ3pGLE1BQU0sSUFBSSxHQUFHLFlBQVksQ0FBQyxDQUFDLENBQUMsNkJBQTZCLENBQUMsQ0FBQyxDQUFDLHlCQUF5QixDQUFDO0lBQ3RGLE9BQU87UUFDTixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7UUFDakIsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNO1FBQ25CLElBQUk7S0FDSixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBRUYsTUFBTSxDQUFDLE1BQU0scUJBQXFCLEdBQUc7SUFFcEMsZ0VBQWdFO0lBQ2hFLDhEQUE4RDtJQUM5RCw4Q0FBOEM7SUFDOUMsaUVBQWlFO0lBQ2pFLCtEQUErRDtJQUMvRCwwQ0FBMEM7SUFFMUMsTUFBTSxLQUFLLEdBQUcsdUJBQXVCLENBQUMsS0FBSyxDQUFDO0lBQzVDLE1BQU0sTUFBTSxHQUFHLHVCQUF1QixDQUFDLE1BQU0sQ0FBQztJQUM5QyxNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDLGlCQUFpQixFQUFFLENBQUMsUUFBUSxDQUFDO0lBQzlELE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDdkUsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUV6RSxPQUFPO1FBQ04sQ0FBQztRQUNELENBQUM7UUFDRCxLQUFLO1FBQ0wsTUFBTTtRQUNOLElBQUksMkJBQW1CO0tBQ3ZCLENBQUM7QUFDSCxDQUFDLENBQUM7QUFFRixNQUFNLENBQU4sSUFBa0IsVUFLakI7QUFMRCxXQUFrQixVQUFVO0lBQzNCLHFEQUFTLENBQUE7SUFDVCwrQ0FBTSxDQUFBO0lBQ04scURBQVMsQ0FBQTtJQUNULHVEQUFVLENBQUE7QUFDWCxDQUFDLEVBTGlCLFVBQVUsS0FBVixVQUFVLFFBSzNCO0FBT0QsTUFBTSxDQUFOLElBQWtCLFdBcUJqQjtBQXJCRCxXQUFrQixXQUFXO0lBRTVCOztPQUVHO0lBQ0gsNkRBQWdCLENBQUE7SUFFaEI7O09BRUc7SUFDSCw2REFBZ0IsQ0FBQTtJQUVoQjs7T0FFRztJQUNILDZDQUFRLENBQUE7SUFFUjs7T0FFRztJQUNILHlEQUFjLENBQUE7QUFDZixDQUFDLEVBckJpQixXQUFXLEtBQVgsV0FBVyxRQXFCNUIifQ==