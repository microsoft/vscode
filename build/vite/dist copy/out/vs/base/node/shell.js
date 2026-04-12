/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { userInfo } from 'os';
import * as platform from '../common/platform.js';
import { getFirstAvailablePowerShellInstallation } from './powershell.js';
import * as processes from './processes.js';
/**
 * Gets the detected default shell for the _system_, not to be confused with VS Code's _default_
 * shell that the terminal uses by default.
 * @param os The platform to detect the shell of.
 */
export async function getSystemShell(os, env) {
    if (os === 1 /* platform.OperatingSystem.Windows */) {
        if (platform.isWindows) {
            return getSystemShellWindows();
        }
        // Don't detect Windows shell when not on Windows
        return processes.getWindowsShell(env);
    }
    return getSystemShellUnixLike(os, env);
}
let _TERMINAL_DEFAULT_SHELL_UNIX_LIKE = null;
function getSystemShellUnixLike(os, env) {
    // Only use $SHELL for the current OS
    if (platform.isLinux && os === 2 /* platform.OperatingSystem.Macintosh */ || platform.isMacintosh && os === 3 /* platform.OperatingSystem.Linux */) {
        return '/bin/bash';
    }
    if (!_TERMINAL_DEFAULT_SHELL_UNIX_LIKE) {
        let unixLikeTerminal;
        if (platform.isWindows) {
            unixLikeTerminal = '/bin/bash'; // for WSL
        }
        else {
            unixLikeTerminal = env['SHELL'];
            if (!unixLikeTerminal) {
                try {
                    // It's possible for $SHELL to be unset, this API reads /etc/passwd. See https://github.com/github/codespaces/issues/1639
                    // Node docs: "Throws a SystemError if a user has no username or homedir."
                    unixLikeTerminal = userInfo().shell;
                }
                catch (err) { }
            }
            if (!unixLikeTerminal) {
                unixLikeTerminal = 'sh';
            }
            // Some systems have $SHELL set to /bin/false which breaks the terminal
            if (unixLikeTerminal === '/bin/false') {
                unixLikeTerminal = '/bin/bash';
            }
        }
        _TERMINAL_DEFAULT_SHELL_UNIX_LIKE = unixLikeTerminal;
    }
    return _TERMINAL_DEFAULT_SHELL_UNIX_LIKE;
}
let _TERMINAL_DEFAULT_SHELL_WINDOWS = null;
async function getSystemShellWindows() {
    if (!_TERMINAL_DEFAULT_SHELL_WINDOWS) {
        _TERMINAL_DEFAULT_SHELL_WINDOWS = (await getFirstAvailablePowerShellInstallation()).exePath;
    }
    return _TERMINAL_DEFAULT_SHELL_WINDOWS;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hlbGwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL25vZGUvc2hlbGwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLElBQUksQ0FBQztBQUM5QixPQUFPLEtBQUssUUFBUSxNQUFNLHVCQUF1QixDQUFDO0FBQ2xELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzFFLE9BQU8sS0FBSyxTQUFTLE1BQU0sZ0JBQWdCLENBQUM7QUFFNUM7Ozs7R0FJRztBQUNILE1BQU0sQ0FBQyxLQUFLLFVBQVUsY0FBYyxDQUFDLEVBQTRCLEVBQUUsR0FBaUM7SUFDbkcsSUFBSSxFQUFFLDZDQUFxQyxFQUFFLENBQUM7UUFDN0MsSUFBSSxRQUFRLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDeEIsT0FBTyxxQkFBcUIsRUFBRSxDQUFDO1FBQ2hDLENBQUM7UUFDRCxpREFBaUQ7UUFDakQsT0FBTyxTQUFTLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7SUFFRCxPQUFPLHNCQUFzQixDQUFDLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQztBQUN4QyxDQUFDO0FBRUQsSUFBSSxpQ0FBaUMsR0FBa0IsSUFBSSxDQUFDO0FBQzVELFNBQVMsc0JBQXNCLENBQUMsRUFBNEIsRUFBRSxHQUFpQztJQUM5RixxQ0FBcUM7SUFDckMsSUFBSSxRQUFRLENBQUMsT0FBTyxJQUFJLEVBQUUsK0NBQXVDLElBQUksUUFBUSxDQUFDLFdBQVcsSUFBSSxFQUFFLDJDQUFtQyxFQUFFLENBQUM7UUFDcEksT0FBTyxXQUFXLENBQUM7SUFDcEIsQ0FBQztJQUVELElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxDQUFDO1FBQ3hDLElBQUksZ0JBQTJDLENBQUM7UUFDaEQsSUFBSSxRQUFRLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDeEIsZ0JBQWdCLEdBQUcsV0FBVyxDQUFDLENBQUMsVUFBVTtRQUMzQyxDQUFDO2FBQU0sQ0FBQztZQUNQLGdCQUFnQixHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUVoQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztnQkFDdkIsSUFBSSxDQUFDO29CQUNKLHlIQUF5SDtvQkFDekgsMEVBQTBFO29CQUMxRSxnQkFBZ0IsR0FBRyxRQUFRLEVBQUUsQ0FBQyxLQUFLLENBQUM7Z0JBQ3JDLENBQUM7Z0JBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDbEIsQ0FBQztZQUVELElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO2dCQUN2QixnQkFBZ0IsR0FBRyxJQUFJLENBQUM7WUFDekIsQ0FBQztZQUVELHVFQUF1RTtZQUN2RSxJQUFJLGdCQUFnQixLQUFLLFlBQVksRUFBRSxDQUFDO2dCQUN2QyxnQkFBZ0IsR0FBRyxXQUFXLENBQUM7WUFDaEMsQ0FBQztRQUNGLENBQUM7UUFDRCxpQ0FBaUMsR0FBRyxnQkFBZ0IsQ0FBQztJQUN0RCxDQUFDO0lBQ0QsT0FBTyxpQ0FBaUMsQ0FBQztBQUMxQyxDQUFDO0FBRUQsSUFBSSwrQkFBK0IsR0FBa0IsSUFBSSxDQUFDO0FBQzFELEtBQUssVUFBVSxxQkFBcUI7SUFDbkMsSUFBSSxDQUFDLCtCQUErQixFQUFFLENBQUM7UUFDdEMsK0JBQStCLEdBQUcsQ0FBQyxNQUFNLHVDQUF1QyxFQUFFLENBQUUsQ0FBQyxPQUFPLENBQUM7SUFDOUYsQ0FBQztJQUNELE9BQU8sK0JBQStCLENBQUM7QUFDeEMsQ0FBQyJ9