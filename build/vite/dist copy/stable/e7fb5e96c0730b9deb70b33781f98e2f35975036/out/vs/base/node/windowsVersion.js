/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as os from 'os';
import { isWindows } from '../common/platform.js';
let versionInfo;
/**
 * Initializes the Windows version cache by reading from the registry.
 *
 * On Windows 8.1+, the `os.release()` function may return incorrect version numbers
 * due to the deprecated GetVersionEx API returning compatibility-shimmed values
 * when the application doesn't have a proper manifest. Reading from the registry
 * gives us the real version.
 *
 * See: https://github.com/microsoft/vscode/issues/197444
 */
export async function initWindowsVersionInfo() {
    if (versionInfo) {
        return;
    }
    if (!isWindows) {
        versionInfo = { release: os.release(), buildNumber: 0 };
        return;
    }
    let buildNumber;
    let release;
    try {
        const Registry = await import('@vscode/windows-registry');
        const versionKey = 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion';
        const build = Registry.GetStringRegKey('HKEY_LOCAL_MACHINE', versionKey, 'CurrentBuild');
        if (build !== undefined) {
            buildNumber = parseInt(build, 10);
            if (isNaN(buildNumber)) {
                buildNumber = undefined;
            }
        }
        const major = Registry.GetDWORDRegKey('HKEY_LOCAL_MACHINE', versionKey, 'CurrentMajorVersionNumber');
        const minor = Registry.GetDWORDRegKey('HKEY_LOCAL_MACHINE', versionKey, 'CurrentMinorVersionNumber');
        if (major !== undefined && minor !== undefined && build !== undefined) {
            release = `${major}.${minor}.${build}`;
        }
    }
    catch {
        // ignore
    }
    finally {
        versionInfo = {
            release: release || os.release(),
            buildNumber: buildNumber || getWindowsBuildNumberFromOsRelease()
        };
    }
}
/**
 * Gets Windows version information from the registry.
 * @returns The Windows version in Major.Minor.Build format (e.g., "10.0.19041")
 */
export async function getWindowsRelease() {
    if (!versionInfo) {
        await initWindowsVersionInfo();
    }
    return versionInfo.release;
}
/**
 * Gets the Windows build number from the registry.
 * @returns The Windows build number (e.g., 19041 for Windows 10 2004)
 */
export async function getWindowsBuildNumberAsync() {
    if (!versionInfo) {
        await initWindowsVersionInfo();
    }
    return versionInfo.buildNumber;
}
/**
 * Synchronous version of getWindowsBuildNumberAsync().
 * @returns The Windows build number (e.g., 19041 for Windows 10 2004)
 */
export function getWindowsBuildNumberSync() {
    if (versionInfo) {
        return versionInfo.buildNumber;
    }
    else {
        return isWindows ? getWindowsBuildNumberFromOsRelease() : 0;
    }
}
/**
 * Gets the cached Windows release string synchronously.
 * Falls back to os.release() if the cache hasn't been initialized yet.
 * @returns The Windows version in Major.Minor.Build format (e.g., "10.0.19041")
 */
export function getWindowsReleaseSync() {
    return versionInfo?.release ?? os.release();
}
/**
 * Parses the Windows build number from os.release().
 * This is used as a fallback when registry reading is not available.
 */
function getWindowsBuildNumberFromOsRelease() {
    const osVersion = (/(\d+)\.(\d+)\.(\d+)/g).exec(os.release());
    if (osVersion && osVersion.length === 4) {
        return parseInt(osVersion[3], 10);
    }
    return 0;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2luZG93c1ZlcnNpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL25vZGUvd2luZG93c1ZlcnNpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDekIsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBRWxELElBQUksV0FBaUUsQ0FBQztBQUV0RTs7Ozs7Ozs7O0dBU0c7QUFDSCxNQUFNLENBQUMsS0FBSyxVQUFVLHNCQUFzQjtJQUMzQyxJQUFJLFdBQVcsRUFBRSxDQUFDO1FBQ2pCLE9BQU87SUFDUixDQUFDO0lBRUQsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ2hCLFdBQVcsR0FBRyxFQUFFLE9BQU8sRUFBRSxFQUFFLENBQUMsT0FBTyxFQUFFLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxDQUFDO1FBQ3hELE9BQU87SUFDUixDQUFDO0lBRUQsSUFBSSxXQUErQixDQUFDO0lBQ3BDLElBQUksT0FBMkIsQ0FBQztJQUNoQyxJQUFJLENBQUM7UUFDSixNQUFNLFFBQVEsR0FBRyxNQUFNLE1BQU0sQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBQzFELE1BQU0sVUFBVSxHQUFHLGlEQUFpRCxDQUFDO1FBRXJFLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxlQUFlLENBQUMsb0JBQW9CLEVBQUUsVUFBVSxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBQ3pGLElBQUksS0FBSyxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ3pCLFdBQVcsR0FBRyxRQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ2xDLElBQUksS0FBSyxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3hCLFdBQVcsR0FBRyxTQUFTLENBQUM7WUFDekIsQ0FBQztRQUNGLENBQUM7UUFFRCxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsY0FBYyxDQUFDLG9CQUFvQixFQUFFLFVBQVUsRUFBRSwyQkFBMkIsQ0FBQyxDQUFDO1FBQ3JHLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxjQUFjLENBQUMsb0JBQW9CLEVBQUUsVUFBVSxFQUFFLDJCQUEyQixDQUFDLENBQUM7UUFDckcsSUFBSSxLQUFLLEtBQUssU0FBUyxJQUFJLEtBQUssS0FBSyxTQUFTLElBQUksS0FBSyxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ3ZFLE9BQU8sR0FBRyxHQUFHLEtBQUssSUFBSSxLQUFLLElBQUksS0FBSyxFQUFFLENBQUM7UUFDeEMsQ0FBQztJQUNGLENBQUM7SUFBQyxNQUFNLENBQUM7UUFDUixTQUFTO0lBQ1YsQ0FBQztZQUFTLENBQUM7UUFDVixXQUFXLEdBQUc7WUFDYixPQUFPLEVBQUUsT0FBTyxJQUFJLEVBQUUsQ0FBQyxPQUFPLEVBQUU7WUFDaEMsV0FBVyxFQUFFLFdBQVcsSUFBSSxrQ0FBa0MsRUFBRTtTQUNoRSxDQUFDO0lBQ0gsQ0FBQztBQUNGLENBQUM7QUFFRDs7O0dBR0c7QUFDSCxNQUFNLENBQUMsS0FBSyxVQUFVLGlCQUFpQjtJQUN0QyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDbEIsTUFBTSxzQkFBc0IsRUFBRSxDQUFDO0lBQ2hDLENBQUM7SUFDRCxPQUFPLFdBQVksQ0FBQyxPQUFPLENBQUM7QUFDN0IsQ0FBQztBQUVEOzs7R0FHRztBQUNILE1BQU0sQ0FBQyxLQUFLLFVBQVUsMEJBQTBCO0lBQy9DLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUNsQixNQUFNLHNCQUFzQixFQUFFLENBQUM7SUFDaEMsQ0FBQztJQUNELE9BQU8sV0FBWSxDQUFDLFdBQVcsQ0FBQztBQUNqQyxDQUFDO0FBRUQ7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLHlCQUF5QjtJQUN4QyxJQUFJLFdBQVcsRUFBRSxDQUFDO1FBQ2pCLE9BQU8sV0FBVyxDQUFDLFdBQVcsQ0FBQztJQUNoQyxDQUFDO1NBQU0sQ0FBQztRQUNQLE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQyxrQ0FBa0MsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDN0QsQ0FBQztBQUNGLENBQUM7QUFFRDs7OztHQUlHO0FBQ0gsTUFBTSxVQUFVLHFCQUFxQjtJQUNwQyxPQUFPLFdBQVcsRUFBRSxPQUFPLElBQUksRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBQzdDLENBQUM7QUFFRDs7O0dBR0c7QUFDSCxTQUFTLGtDQUFrQztJQUMxQyxNQUFNLFNBQVMsR0FBRyxDQUFDLHNCQUFzQixDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO0lBQzlELElBQUksU0FBUyxJQUFJLFNBQVMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDekMsT0FBTyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFDRCxPQUFPLENBQUMsQ0FBQztBQUNWLENBQUMifQ==