/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isLinux } from './platform.js';
export var Source;
(function (Source) {
    Source[Source["stdout"] = 0] = "stdout";
    Source[Source["stderr"] = 1] = "stderr";
})(Source || (Source = {}));
export var TerminateResponseCode;
(function (TerminateResponseCode) {
    TerminateResponseCode[TerminateResponseCode["Success"] = 0] = "Success";
    TerminateResponseCode[TerminateResponseCode["Unknown"] = 1] = "Unknown";
    TerminateResponseCode[TerminateResponseCode["AccessDenied"] = 2] = "AccessDenied";
    TerminateResponseCode[TerminateResponseCode["ProcessNotFound"] = 3] = "ProcessNotFound";
})(TerminateResponseCode || (TerminateResponseCode = {}));
/**
 * Sanitizes a VS Code process environment by removing all Electron/VS Code-related values.
 */
export function sanitizeProcessEnvironment(env, ...preserve) {
    const set = preserve.reduce((set, key) => {
        set[key] = true;
        return set;
    }, {});
    const keysToRemove = [
        /^ELECTRON_.+$/,
        /^VSCODE_(?!(PORTABLE|SHELL_LOGIN|ENV_REPLACE|ENV_APPEND|ENV_PREPEND)).+$/,
        /^SNAP(|_.*)$/,
        /^GDK_PIXBUF_.+$/,
    ];
    const envKeys = Object.keys(env);
    envKeys
        .filter(key => !set[key])
        .forEach(envKey => {
        for (let i = 0; i < keysToRemove.length; i++) {
            if (envKey.search(keysToRemove[i]) !== -1) {
                delete env[envKey];
                break;
            }
        }
    });
}
/**
 * Remove dangerous environment variables that have caused crashes
 * in forked processes (i.e. in ELECTRON_RUN_AS_NODE processes)
 *
 * @param env The env object to change
 */
export function removeDangerousEnvVariables(env) {
    if (!env) {
        return;
    }
    // Unset `DEBUG`, as an invalid value might lead to process crashes
    // See https://github.com/microsoft/vscode/issues/130072
    delete env['DEBUG'];
    if (isLinux) {
        // Unset `LD_PRELOAD`, as it might lead to process crashes
        // See https://github.com/microsoft/vscode/issues/134177
        delete env['LD_PRELOAD'];
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc2VzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vcHJvY2Vzc2VzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBdUIsT0FBTyxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBK0M3RCxNQUFNLENBQU4sSUFBa0IsTUFHakI7QUFIRCxXQUFrQixNQUFNO0lBQ3ZCLHVDQUFNLENBQUE7SUFDTix1Q0FBTSxDQUFBO0FBQ1AsQ0FBQyxFQUhpQixNQUFNLEtBQU4sTUFBTSxRQUd2QjtBQTJCRCxNQUFNLENBQU4sSUFBa0IscUJBS2pCO0FBTEQsV0FBa0IscUJBQXFCO0lBQ3RDLHVFQUFXLENBQUE7SUFDWCx1RUFBVyxDQUFBO0lBQ1gsaUZBQWdCLENBQUE7SUFDaEIsdUZBQW1CLENBQUE7QUFDcEIsQ0FBQyxFQUxpQixxQkFBcUIsS0FBckIscUJBQXFCLFFBS3RDO0FBYUQ7O0dBRUc7QUFDSCxNQUFNLFVBQVUsMEJBQTBCLENBQUMsR0FBd0IsRUFBRSxHQUFHLFFBQWtCO0lBQ3pGLE1BQU0sR0FBRyxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQTBCLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUFFO1FBQ2pFLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUM7UUFDaEIsT0FBTyxHQUFHLENBQUM7SUFDWixDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDUCxNQUFNLFlBQVksR0FBRztRQUNwQixlQUFlO1FBQ2YsMEVBQTBFO1FBQzFFLGNBQWM7UUFDZCxpQkFBaUI7S0FDakIsQ0FBQztJQUNGLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDakMsT0FBTztTQUNMLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1NBQ3hCLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtRQUNqQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsWUFBWSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQzlDLElBQUksTUFBTSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUMzQyxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDbkIsTUFBTTtZQUNQLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBRUQ7Ozs7O0dBS0c7QUFDSCxNQUFNLFVBQVUsMkJBQTJCLENBQUMsR0FBb0M7SUFDL0UsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ1YsT0FBTztJQUNSLENBQUM7SUFFRCxtRUFBbUU7SUFDbkUsd0RBQXdEO0lBQ3hELE9BQU8sR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBRXBCLElBQUksT0FBTyxFQUFFLENBQUM7UUFDYiwwREFBMEQ7UUFDMUQsd0RBQXdEO1FBQ3hELE9BQU8sR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQzFCLENBQUM7QUFDRixDQUFDIn0=