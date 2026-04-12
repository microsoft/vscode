/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isMacintosh, isWindows } from './platform.js';
let safeProcess;
// Native sandbox environment
const vscodeGlobal = globalThis.vscode;
if (typeof vscodeGlobal !== 'undefined' && typeof vscodeGlobal.process !== 'undefined') {
    const sandboxProcess = vscodeGlobal.process;
    safeProcess = {
        get platform() { return sandboxProcess.platform; },
        get arch() { return sandboxProcess.arch; },
        get env() { return sandboxProcess.env; },
        cwd() { return sandboxProcess.cwd(); }
    };
}
// Native node.js environment
else if (typeof process !== 'undefined' && typeof process?.versions?.node === 'string') {
    safeProcess = {
        get platform() { return process.platform; },
        get arch() { return process.arch; },
        get env() { return process.env; },
        cwd() { return process.env['VSCODE_CWD'] || process.cwd(); }
    };
}
// Web environment
else {
    safeProcess = {
        // Supported
        get platform() { return isWindows ? 'win32' : isMacintosh ? 'darwin' : 'linux'; },
        get arch() { return undefined; /* arch is undefined in web */ },
        // Unsupported
        get env() { return {}; },
        cwd() { return '/'; }
    };
}
/**
 * Provides safe access to the `cwd` property in node.js, sandboxed or web
 * environments.
 *
 * Note: in web, this property is hardcoded to be `/`.
 *
 * @skipMangle
 */
export const cwd = safeProcess.cwd;
/**
 * Provides safe access to the `env` property in node.js, sandboxed or web
 * environments.
 *
 * Note: in web, this property is hardcoded to be `{}`.
 */
export const env = safeProcess.env;
/**
 * Provides safe access to the `platform` property in node.js, sandboxed or web
 * environments.
 */
export const platform = safeProcess.platform;
/**
 * Provides safe access to the `arch` method in node.js, sandboxed or web
 * environments.
 * Note: `arch` is `undefined` in web
 */
export const arch = safeProcess.arch;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL3Byb2Nlc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFnQixXQUFXLEVBQUUsU0FBUyxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBRXJFLElBQUksV0FBc0UsQ0FBQztBQUczRSw2QkFBNkI7QUFDN0IsTUFBTSxZQUFZLEdBQUksVUFBc0QsQ0FBQyxNQUFNLENBQUM7QUFDcEYsSUFBSSxPQUFPLFlBQVksS0FBSyxXQUFXLElBQUksT0FBTyxZQUFZLENBQUMsT0FBTyxLQUFLLFdBQVcsRUFBRSxDQUFDO0lBQ3hGLE1BQU0sY0FBYyxHQUFpQixZQUFZLENBQUMsT0FBTyxDQUFDO0lBQzFELFdBQVcsR0FBRztRQUNiLElBQUksUUFBUSxLQUFLLE9BQU8sY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDbEQsSUFBSSxJQUFJLEtBQUssT0FBTyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUMxQyxJQUFJLEdBQUcsS0FBSyxPQUFPLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3hDLEdBQUcsS0FBSyxPQUFPLGNBQWMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUM7S0FDdEMsQ0FBQztBQUNILENBQUM7QUFFRCw2QkFBNkI7S0FDeEIsSUFBSSxPQUFPLE9BQU8sS0FBSyxXQUFXLElBQUksT0FBTyxPQUFPLEVBQUUsUUFBUSxFQUFFLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztJQUN4RixXQUFXLEdBQUc7UUFDYixJQUFJLFFBQVEsS0FBSyxPQUFPLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQzNDLElBQUksSUFBSSxLQUFLLE9BQU8sT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDbkMsSUFBSSxHQUFHLEtBQUssT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNqQyxHQUFHLEtBQUssT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxJQUFJLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUM7S0FDNUQsQ0FBQztBQUNILENBQUM7QUFFRCxrQkFBa0I7S0FDYixDQUFDO0lBQ0wsV0FBVyxHQUFHO1FBRWIsWUFBWTtRQUNaLElBQUksUUFBUSxLQUFLLE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQ2pGLElBQUksSUFBSSxLQUFLLE9BQU8sU0FBUyxDQUFDLENBQUMsOEJBQThCLENBQUMsQ0FBQztRQUUvRCxjQUFjO1FBQ2QsSUFBSSxHQUFHLEtBQUssT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3hCLEdBQUcsS0FBSyxPQUFPLEdBQUcsQ0FBQyxDQUFDLENBQUM7S0FDckIsQ0FBQztBQUNILENBQUM7QUFFRDs7Ozs7OztHQU9HO0FBQ0gsTUFBTSxDQUFDLE1BQU0sR0FBRyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUM7QUFFbkM7Ozs7O0dBS0c7QUFDSCxNQUFNLENBQUMsTUFBTSxHQUFHLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQztBQUVuQzs7O0dBR0c7QUFDSCxNQUFNLENBQUMsTUFBTSxRQUFRLEdBQUcsV0FBVyxDQUFDLFFBQVEsQ0FBQztBQUU3Qzs7OztHQUlHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sSUFBSSxHQUFHLFdBQVcsQ0FBQyxJQUFJLENBQUMifQ==