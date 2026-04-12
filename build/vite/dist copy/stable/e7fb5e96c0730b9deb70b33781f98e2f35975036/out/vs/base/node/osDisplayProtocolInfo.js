/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { constants as FSConstants, promises as FSPromises } from 'fs';
import { join } from '../common/path.js';
import { env } from '../common/process.js';
const XDG_SESSION_TYPE = 'XDG_SESSION_TYPE';
const WAYLAND_DISPLAY = 'WAYLAND_DISPLAY';
const XDG_RUNTIME_DIR = 'XDG_RUNTIME_DIR';
var DisplayProtocolType;
(function (DisplayProtocolType) {
    DisplayProtocolType["Wayland"] = "wayland";
    DisplayProtocolType["XWayland"] = "xwayland";
    DisplayProtocolType["X11"] = "x11";
    DisplayProtocolType["Unknown"] = "unknown";
})(DisplayProtocolType || (DisplayProtocolType = {}));
export async function getDisplayProtocol(errorLogger) {
    const xdgSessionType = env[XDG_SESSION_TYPE];
    if (xdgSessionType) {
        // If XDG_SESSION_TYPE is set, return its value if it's either 'wayland' or 'x11'.
        // We assume that any value other than 'wayland' or 'x11' is an error or unexpected,
        // hence 'unknown' is returned.
        return xdgSessionType === "wayland" /* DisplayProtocolType.Wayland */ || xdgSessionType === "x11" /* DisplayProtocolType.X11 */ ? xdgSessionType : "unknown" /* DisplayProtocolType.Unknown */;
    }
    else {
        const waylandDisplay = env[WAYLAND_DISPLAY];
        if (!waylandDisplay) {
            // If WAYLAND_DISPLAY is empty, then the session is x11.
            return "x11" /* DisplayProtocolType.X11 */;
        }
        else {
            const xdgRuntimeDir = env[XDG_RUNTIME_DIR];
            if (!xdgRuntimeDir) {
                // If XDG_RUNTIME_DIR is empty, then the session can only be guessed.
                return "unknown" /* DisplayProtocolType.Unknown */;
            }
            else {
                // Check for the presence of the file $XDG_RUNTIME_DIR/wayland-0.
                const waylandServerPipe = join(xdgRuntimeDir, 'wayland-0');
                try {
                    await FSPromises.access(waylandServerPipe, FSConstants.R_OK);
                    // If the file exists, then the session is wayland.
                    return "wayland" /* DisplayProtocolType.Wayland */;
                }
                catch (err) {
                    // If the file does not exist or an error occurs, we guess 'unknown'
                    // since WAYLAND_DISPLAY was set but no wayland-0 pipe could be confirmed.
                    errorLogger(err);
                    return "unknown" /* DisplayProtocolType.Unknown */;
                }
            }
        }
    }
}
export function getCodeDisplayProtocol(displayProtocol, ozonePlatform) {
    if (!ozonePlatform) {
        return displayProtocol === "wayland" /* DisplayProtocolType.Wayland */ ? "xwayland" /* DisplayProtocolType.XWayland */ : "x11" /* DisplayProtocolType.X11 */;
    }
    else {
        switch (ozonePlatform) {
            case 'auto':
                return displayProtocol;
            case 'x11':
                return displayProtocol === "wayland" /* DisplayProtocolType.Wayland */ ? "xwayland" /* DisplayProtocolType.XWayland */ : "x11" /* DisplayProtocolType.X11 */;
            case 'wayland':
                return "wayland" /* DisplayProtocolType.Wayland */;
            default:
                return "unknown" /* DisplayProtocolType.Unknown */;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3NEaXNwbGF5UHJvdG9jb2xJbmZvLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9ub2RlL29zRGlzcGxheVByb3RvY29sSW5mby50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsU0FBUyxJQUFJLFdBQVcsRUFBRSxRQUFRLElBQUksVUFBVSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUN6QyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFFM0MsTUFBTSxnQkFBZ0IsR0FBRyxrQkFBa0IsQ0FBQztBQUM1QyxNQUFNLGVBQWUsR0FBRyxpQkFBaUIsQ0FBQztBQUMxQyxNQUFNLGVBQWUsR0FBRyxpQkFBaUIsQ0FBQztBQUUxQyxJQUFXLG1CQUtWO0FBTEQsV0FBVyxtQkFBbUI7SUFDN0IsMENBQW1CLENBQUE7SUFDbkIsNENBQXFCLENBQUE7SUFDckIsa0NBQVcsQ0FBQTtJQUNYLDBDQUFtQixDQUFBO0FBQ3BCLENBQUMsRUFMVSxtQkFBbUIsS0FBbkIsbUJBQW1CLFFBSzdCO0FBRUQsTUFBTSxDQUFDLEtBQUssVUFBVSxrQkFBa0IsQ0FBQyxXQUE0QztJQUNwRixNQUFNLGNBQWMsR0FBRyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztJQUU3QyxJQUFJLGNBQWMsRUFBRSxDQUFDO1FBQ3BCLGtGQUFrRjtRQUNsRixvRkFBb0Y7UUFDcEYsK0JBQStCO1FBQy9CLE9BQU8sY0FBYyxnREFBZ0MsSUFBSSxjQUFjLHdDQUE0QixDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyw0Q0FBNEIsQ0FBQztJQUNwSixDQUFDO1NBQU0sQ0FBQztRQUNQLE1BQU0sY0FBYyxHQUFHLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUU1QyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDckIsd0RBQXdEO1lBQ3hELDJDQUErQjtRQUNoQyxDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUUzQyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQ3BCLHFFQUFxRTtnQkFDckUsbURBQW1DO1lBQ3BDLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxpRUFBaUU7Z0JBQ2pFLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLGFBQWEsRUFBRSxXQUFXLENBQUMsQ0FBQztnQkFFM0QsSUFBSSxDQUFDO29CQUNKLE1BQU0sVUFBVSxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBRTdELG1EQUFtRDtvQkFDbkQsbURBQW1DO2dCQUNwQyxDQUFDO2dCQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7b0JBQ2Qsb0VBQW9FO29CQUNwRSwwRUFBMEU7b0JBQzFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDakIsbURBQW1DO2dCQUNwQyxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0FBQ0YsQ0FBQztBQUdELE1BQU0sVUFBVSxzQkFBc0IsQ0FBQyxlQUFvQyxFQUFFLGFBQWlDO0lBQzdHLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUNwQixPQUFPLGVBQWUsZ0RBQWdDLENBQUMsQ0FBQywrQ0FBOEIsQ0FBQyxvQ0FBd0IsQ0FBQztJQUNqSCxDQUFDO1NBQU0sQ0FBQztRQUNQLFFBQVEsYUFBYSxFQUFFLENBQUM7WUFDdkIsS0FBSyxNQUFNO2dCQUNWLE9BQU8sZUFBZSxDQUFDO1lBQ3hCLEtBQUssS0FBSztnQkFDVCxPQUFPLGVBQWUsZ0RBQWdDLENBQUMsQ0FBQywrQ0FBOEIsQ0FBQyxvQ0FBd0IsQ0FBQztZQUNqSCxLQUFLLFNBQVM7Z0JBQ2IsbURBQW1DO1lBQ3BDO2dCQUNDLG1EQUFtQztRQUNyQyxDQUFDO0lBQ0YsQ0FBQztBQUNGLENBQUMifQ==