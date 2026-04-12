/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { homedir } from 'os';
// This file used to be a pure JS file and was always
// importing `path` from node.js even though we ship
// our own version of the library and prefer to use
// that.
// However, resolution of user-data-path is critical
// and while our version of `path` is a copy of node.js
// one, you never know. As such, preserve the use of
// the built-in `path` lib for the time being.
// eslint-disable-next-line local/code-import-patterns
import { resolve, isAbsolute, join } from 'path';
const cwd = process.env['VSCODE_CWD'] || process.cwd();
/**
 * Returns the user data path to use with some rules:
 * - respect portable mode
 * - respect VSCODE_APPDATA environment variable
 * - respect --user-data-dir CLI argument
 */
export function getUserDataPath(cliArgs, productName) {
    const userDataPath = doGetUserDataPath(cliArgs, productName);
    const pathsToResolve = [userDataPath];
    // If the user-data-path is not absolute, make
    // sure to resolve it against the passed in
    // current working directory. We cannot use the
    // node.js `path.resolve()` logic because it will
    // not pick up our `VSCODE_CWD` environment variable
    // (https://github.com/microsoft/vscode/issues/120269)
    if (!isAbsolute(userDataPath)) {
        pathsToResolve.unshift(cwd);
    }
    return resolve(...pathsToResolve);
}
function doGetUserDataPath(cliArgs, productName) {
    // 0. Running out of sources has a fixed productName
    if (process.env['VSCODE_DEV']) {
        if (process.isEmbeddedApp) {
            productName = 'sessions-oss-dev';
        }
        else {
            productName = 'code-oss-dev';
        }
    }
    // 1. Support portable mode
    const portablePath = process.env['VSCODE_PORTABLE'];
    if (portablePath) {
        return join(portablePath, 'user-data');
    }
    // 2. Support global VSCODE_APPDATA environment variable
    let appDataPath = process.env['VSCODE_APPDATA'];
    if (appDataPath) {
        return join(appDataPath, productName);
    }
    // With Electron>=13 --user-data-dir switch will be propagated to
    // all processes https://github.com/electron/electron/blob/1897b14af36a02e9aa7e4d814159303441548251/shell/browser/electron_browser_client.cc#L546-L553
    // Check VSCODE_PORTABLE and VSCODE_APPDATA before this case to get correct values.
    // 3. Support explicit --user-data-dir
    const cliPath = cliArgs['user-data-dir'];
    if (cliPath) {
        return cliPath;
    }
    // 4. Otherwise check per platform
    switch (process.platform) {
        case 'win32':
            appDataPath = process.env['APPDATA'];
            if (!appDataPath) {
                const userProfile = process.env['USERPROFILE'];
                if (typeof userProfile !== 'string') {
                    throw new Error('Windows: Unexpected undefined %USERPROFILE% environment variable');
                }
                appDataPath = join(userProfile, 'AppData', 'Roaming');
            }
            break;
        case 'darwin':
            appDataPath = join(homedir(), 'Library', 'Application Support');
            break;
        case 'linux':
            appDataPath = process.env['XDG_CONFIG_HOME'] || join(homedir(), '.config');
            break;
        default:
            throw new Error('Platform not supported');
    }
    return join(appDataPath, productName);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFQYXRoLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZW52aXJvbm1lbnQvbm9kZS91c2VyRGF0YVBhdGgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLElBQUksQ0FBQztBQUc3QixxREFBcUQ7QUFDckQsb0RBQW9EO0FBQ3BELG1EQUFtRDtBQUNuRCxRQUFRO0FBQ1Isb0RBQW9EO0FBQ3BELHVEQUF1RDtBQUN2RCxvREFBb0Q7QUFDcEQsOENBQThDO0FBQzlDLHNEQUFzRDtBQUN0RCxPQUFPLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsTUFBTSxNQUFNLENBQUM7QUFFakQsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsSUFBSSxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUM7QUFFdkQ7Ozs7O0dBS0c7QUFDSCxNQUFNLFVBQVUsZUFBZSxDQUFDLE9BQXlCLEVBQUUsV0FBbUI7SUFDN0UsTUFBTSxZQUFZLEdBQUcsaUJBQWlCLENBQUMsT0FBTyxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQzdELE1BQU0sY0FBYyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7SUFFdEMsOENBQThDO0lBQzlDLDJDQUEyQztJQUMzQywrQ0FBK0M7SUFDL0MsaURBQWlEO0lBQ2pELG9EQUFvRDtJQUNwRCxzREFBc0Q7SUFDdEQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDO1FBQy9CLGNBQWMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDN0IsQ0FBQztJQUVELE9BQU8sT0FBTyxDQUFDLEdBQUcsY0FBYyxDQUFDLENBQUM7QUFDbkMsQ0FBQztBQUVELFNBQVMsaUJBQWlCLENBQUMsT0FBeUIsRUFBRSxXQUFtQjtJQUV4RSxvREFBb0Q7SUFDcEQsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUM7UUFDL0IsSUFBSyxPQUF3QixDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQzdDLFdBQVcsR0FBRyxrQkFBa0IsQ0FBQztRQUNsQyxDQUFDO2FBQU0sQ0FBQztZQUNQLFdBQVcsR0FBRyxjQUFjLENBQUM7UUFDOUIsQ0FBQztJQUNGLENBQUM7SUFFRCwyQkFBMkI7SUFDM0IsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0lBQ3BELElBQUksWUFBWSxFQUFFLENBQUM7UUFDbEIsT0FBTyxJQUFJLENBQUMsWUFBWSxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQ3hDLENBQUM7SUFFRCx3REFBd0Q7SUFDeEQsSUFBSSxXQUFXLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBQ2hELElBQUksV0FBVyxFQUFFLENBQUM7UUFDakIsT0FBTyxJQUFJLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7SUFFRCxpRUFBaUU7SUFDakUsc0pBQXNKO0lBQ3RKLG1GQUFtRjtJQUNuRixzQ0FBc0M7SUFDdEMsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQ3pDLElBQUksT0FBTyxFQUFFLENBQUM7UUFDYixPQUFPLE9BQU8sQ0FBQztJQUNoQixDQUFDO0lBRUQsa0NBQWtDO0lBQ2xDLFFBQVEsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQzFCLEtBQUssT0FBTztZQUNYLFdBQVcsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3JDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDbEIsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQztnQkFDL0MsSUFBSSxPQUFPLFdBQVcsS0FBSyxRQUFRLEVBQUUsQ0FBQztvQkFDckMsTUFBTSxJQUFJLEtBQUssQ0FBQyxrRUFBa0UsQ0FBQyxDQUFDO2dCQUNyRixDQUFDO2dCQUVELFdBQVcsR0FBRyxJQUFJLENBQUMsV0FBVyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUN2RCxDQUFDO1lBQ0QsTUFBTTtRQUNQLEtBQUssUUFBUTtZQUNaLFdBQVcsR0FBRyxJQUFJLENBQUMsT0FBTyxFQUFFLEVBQUUsU0FBUyxFQUFFLHFCQUFxQixDQUFDLENBQUM7WUFDaEUsTUFBTTtRQUNQLEtBQUssT0FBTztZQUNYLFdBQVcsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQzNFLE1BQU07UUFDUDtZQUNDLE1BQU0sSUFBSSxLQUFLLENBQUMsd0JBQXdCLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBRUQsT0FBTyxJQUFJLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxDQUFDO0FBQ3ZDLENBQUMifQ==