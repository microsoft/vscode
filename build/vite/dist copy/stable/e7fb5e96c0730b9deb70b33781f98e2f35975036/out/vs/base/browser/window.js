/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export function ensureCodeWindow(targetWindow, fallbackWindowId) {
    const codeWindow = targetWindow;
    if (typeof codeWindow.vscodeWindowId !== 'number') {
        Object.defineProperty(codeWindow, 'vscodeWindowId', {
            get: () => fallbackWindowId
        });
    }
}
// eslint-disable-next-line no-restricted-globals
export const mainWindow = window;
export function isAuxiliaryWindow(obj) {
    if (obj === mainWindow) {
        return false;
    }
    const candidate = obj;
    return typeof candidate?.vscodeWindowId === 'number';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2luZG93LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9icm93c2VyL3dpbmRvdy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQU1oRyxNQUFNLFVBQVUsZ0JBQWdCLENBQUMsWUFBb0IsRUFBRSxnQkFBd0I7SUFDOUUsTUFBTSxVQUFVLEdBQUcsWUFBbUMsQ0FBQztJQUV2RCxJQUFJLE9BQU8sVUFBVSxDQUFDLGNBQWMsS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUNuRCxNQUFNLENBQUMsY0FBYyxDQUFDLFVBQVUsRUFBRSxnQkFBZ0IsRUFBRTtZQUNuRCxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsZ0JBQWdCO1NBQzNCLENBQUMsQ0FBQztJQUNKLENBQUM7QUFDRixDQUFDO0FBRUQsaURBQWlEO0FBQ2pELE1BQU0sQ0FBQyxNQUFNLFVBQVUsR0FBRyxNQUFvQixDQUFDO0FBRS9DLE1BQU0sVUFBVSxpQkFBaUIsQ0FBQyxHQUFXO0lBQzVDLElBQUksR0FBRyxLQUFLLFVBQVUsRUFBRSxDQUFDO1FBQ3hCLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVELE1BQU0sU0FBUyxHQUFHLEdBQTZCLENBQUM7SUFFaEQsT0FBTyxPQUFPLFNBQVMsRUFBRSxjQUFjLEtBQUssUUFBUSxDQUFDO0FBQ3RELENBQUMifQ==