/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as os from 'os';
import * as path from '../common/path.js';
import * as pfs from './pfs.js';
// This is required, since parseInt("7-preview") will return 7.
const IntRegex = /^\d+$/;
const PwshMsixRegex = /^Microsoft.PowerShell_.*/;
const PwshPreviewMsixRegex = /^Microsoft.PowerShellPreview_.*/;
var Arch;
(function (Arch) {
    Arch[Arch["x64"] = 0] = "x64";
    Arch[Arch["x86"] = 1] = "x86";
    Arch[Arch["ARM"] = 2] = "ARM";
})(Arch || (Arch = {}));
let processArch;
switch (process.arch) {
    case 'ia32':
        processArch = 1 /* Arch.x86 */;
        break;
    case 'arm':
    case 'arm64':
        processArch = 2 /* Arch.ARM */;
        break;
    default:
        processArch = 0 /* Arch.x64 */;
        break;
}
/*
Currently, here are the values for these environment variables on their respective archs:

On x86 process on x86:
PROCESSOR_ARCHITECTURE is X86
PROCESSOR_ARCHITEW6432 is undefined

On x86 process on x64:
PROCESSOR_ARCHITECTURE is X86
PROCESSOR_ARCHITEW6432 is AMD64

On x64 process on x64:
PROCESSOR_ARCHITECTURE is AMD64
PROCESSOR_ARCHITEW6432 is undefined

On ARM process on ARM:
PROCESSOR_ARCHITECTURE is ARM64
PROCESSOR_ARCHITEW6432 is undefined

On x86 process on ARM:
PROCESSOR_ARCHITECTURE is X86
PROCESSOR_ARCHITEW6432 is ARM64

On x64 process on ARM:
PROCESSOR_ARCHITECTURE is ARM64
PROCESSOR_ARCHITEW6432 is undefined
*/
let osArch;
if (process.env['PROCESSOR_ARCHITEW6432']) {
    osArch = process.env['PROCESSOR_ARCHITEW6432'] === 'ARM64'
        ? 2 /* Arch.ARM */
        : 0 /* Arch.x64 */;
}
else if (process.env['PROCESSOR_ARCHITECTURE'] === 'ARM64') {
    osArch = 2 /* Arch.ARM */;
}
else if (process.env['PROCESSOR_ARCHITECTURE'] === 'X86') {
    osArch = 1 /* Arch.x86 */;
}
else {
    osArch = 0 /* Arch.x64 */;
}
class PossiblePowerShellExe {
    constructor(exePath, displayName, knownToExist) {
        this.exePath = exePath;
        this.displayName = displayName;
        this.knownToExist = knownToExist;
    }
    async exists() {
        if (this.knownToExist === undefined) {
            this.knownToExist = await pfs.SymlinkSupport.existsFile(this.exePath);
        }
        return this.knownToExist;
    }
}
function getProgramFilesPath({ useAlternateBitness = false } = {}) {
    if (!useAlternateBitness) {
        // Just use the native system bitness
        return process.env.ProgramFiles || null;
    }
    // We might be a 64-bit process looking for 32-bit program files
    if (processArch === 0 /* Arch.x64 */) {
        return process.env['ProgramFiles(x86)'] || null;
    }
    // We might be a 32-bit process looking for 64-bit program files
    if (osArch === 0 /* Arch.x64 */) {
        return process.env.ProgramW6432 || null;
    }
    // We're a 32-bit process on 32-bit Windows, there is no other Program Files dir
    return null;
}
async function findPSCoreWindowsInstallation({ useAlternateBitness = false, findPreview = false } = {}) {
    const programFilesPath = getProgramFilesPath({ useAlternateBitness });
    if (!programFilesPath) {
        return null;
    }
    const powerShellInstallBaseDir = path.join(programFilesPath, 'PowerShell');
    // Ensure the base directory exists
    if (!await pfs.SymlinkSupport.existsDirectory(powerShellInstallBaseDir)) {
        return null;
    }
    let highestSeenVersion = -1;
    let pwshExePath = null;
    for (const item of await pfs.Promises.readdir(powerShellInstallBaseDir)) {
        let currentVersion = -1;
        if (findPreview) {
            // We are looking for something like "7-preview"
            // Preview dirs all have dashes in them
            const dashIndex = item.indexOf('-');
            if (dashIndex < 0) {
                continue;
            }
            // Verify that the part before the dash is an integer
            // and that the part after the dash is "preview"
            const intPart = item.substring(0, dashIndex);
            if (!IntRegex.test(intPart) || item.substring(dashIndex + 1) !== 'preview') {
                continue;
            }
            currentVersion = parseInt(intPart, 10);
        }
        else {
            // Search for a directory like "6" or "7"
            if (!IntRegex.test(item)) {
                continue;
            }
            currentVersion = parseInt(item, 10);
        }
        // Ensure we haven't already seen a higher version
        if (currentVersion <= highestSeenVersion) {
            continue;
        }
        // Now look for the file
        const exePath = path.join(powerShellInstallBaseDir, item, 'pwsh.exe');
        if (!await pfs.SymlinkSupport.existsFile(exePath)) {
            continue;
        }
        pwshExePath = exePath;
        highestSeenVersion = currentVersion;
    }
    if (!pwshExePath) {
        return null;
    }
    const bitness = programFilesPath.includes('x86') ? ' (x86)' : '';
    const preview = findPreview ? ' Preview' : '';
    return new PossiblePowerShellExe(pwshExePath, `PowerShell${preview}${bitness}`, true);
}
async function findPSCoreMsix({ findPreview } = {}) {
    // We can't proceed if there's no LOCALAPPDATA path
    if (!process.env.LOCALAPPDATA) {
        return null;
    }
    // Find the base directory for MSIX application exe shortcuts
    const msixAppDir = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps');
    if (!await pfs.SymlinkSupport.existsDirectory(msixAppDir)) {
        return null;
    }
    // Define whether we're looking for the preview or the stable
    const { pwshMsixDirRegex, pwshMsixName } = findPreview
        ? { pwshMsixDirRegex: PwshPreviewMsixRegex, pwshMsixName: 'PowerShell Preview (Store)' }
        : { pwshMsixDirRegex: PwshMsixRegex, pwshMsixName: 'PowerShell (Store)' };
    // We should find only one such application, so return on the first one
    for (const subdir of await pfs.Promises.readdir(msixAppDir)) {
        if (pwshMsixDirRegex.test(subdir)) {
            const pwshMsixPath = path.join(msixAppDir, subdir, 'pwsh.exe');
            return new PossiblePowerShellExe(pwshMsixPath, pwshMsixName);
        }
    }
    // If we find nothing, return null
    return null;
}
function findPSCoreDotnetGlobalTool() {
    const dotnetGlobalToolExePath = path.join(os.homedir(), '.dotnet', 'tools', 'pwsh.exe');
    return new PossiblePowerShellExe(dotnetGlobalToolExePath, '.NET Core PowerShell Global Tool');
}
function findPSCoreScoopInstallation() {
    const scoopAppsDir = path.join(os.homedir(), 'scoop', 'apps');
    const scoopPwsh = path.join(scoopAppsDir, 'pwsh', 'current', 'pwsh.exe');
    return new PossiblePowerShellExe(scoopPwsh, 'PowerShell (Scoop)');
}
function findWinPS() {
    const winPSPath = path.join(process.env.windir, processArch === 1 /* Arch.x86 */ && osArch !== 1 /* Arch.x86 */ ? 'SysNative' : 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    return new PossiblePowerShellExe(winPSPath, 'Windows PowerShell', true);
}
/**
 * Iterates through all the possible well-known PowerShell installations on a machine.
 * Returned values may not exist, but come with an .exists property
 * which will check whether the executable exists.
 */
async function* enumerateDefaultPowerShellInstallations() {
    // Find PSCore stable first
    let pwshExe = await findPSCoreWindowsInstallation();
    if (pwshExe) {
        yield pwshExe;
    }
    // Windows may have a 32-bit pwsh.exe
    pwshExe = await findPSCoreWindowsInstallation({ useAlternateBitness: true });
    if (pwshExe) {
        yield pwshExe;
    }
    // Also look for the MSIX/UWP installation
    pwshExe = await findPSCoreMsix();
    if (pwshExe) {
        yield pwshExe;
    }
    // Look for the .NET global tool
    // Some older versions of PowerShell have a bug in this where startup will fail,
    // but this is fixed in newer versions
    pwshExe = findPSCoreDotnetGlobalTool();
    if (pwshExe) {
        yield pwshExe;
    }
    // Look for PSCore preview
    pwshExe = await findPSCoreWindowsInstallation({ findPreview: true });
    if (pwshExe) {
        yield pwshExe;
    }
    // Find a preview MSIX
    pwshExe = await findPSCoreMsix({ findPreview: true });
    if (pwshExe) {
        yield pwshExe;
    }
    // Look for pwsh-preview with the opposite bitness
    pwshExe = await findPSCoreWindowsInstallation({ useAlternateBitness: true, findPreview: true });
    if (pwshExe) {
        yield pwshExe;
    }
    pwshExe = await findPSCoreScoopInstallation();
    if (pwshExe) {
        yield pwshExe;
    }
    // Finally, get Windows PowerShell
    pwshExe = findWinPS();
    if (pwshExe) {
        yield pwshExe;
    }
}
/**
 * Iterates through PowerShell installations on the machine according
 * to configuration passed in through the constructor.
 * PowerShell items returned by this object are verified
 * to exist on the filesystem.
 */
export async function* enumeratePowerShellInstallations() {
    // Get the default PowerShell installations first
    for await (const defaultPwsh of enumerateDefaultPowerShellInstallations()) {
        if (await defaultPwsh.exists()) {
            yield defaultPwsh;
        }
    }
}
/**
* Returns the first available PowerShell executable found in the search order.
*/
export async function getFirstAvailablePowerShellInstallation() {
    for await (const pwsh of enumeratePowerShellInstallations()) {
        return pwsh;
    }
    return null;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG93ZXJzaGVsbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2Uvbm9kZS9wb3dlcnNoZWxsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3pCLE9BQU8sS0FBSyxJQUFJLE1BQU0sbUJBQW1CLENBQUM7QUFDMUMsT0FBTyxLQUFLLEdBQUcsTUFBTSxVQUFVLENBQUM7QUFFaEMsK0RBQStEO0FBQy9ELE1BQU0sUUFBUSxHQUFXLE9BQU8sQ0FBQztBQUVqQyxNQUFNLGFBQWEsR0FBVywwQkFBMEIsQ0FBQztBQUN6RCxNQUFNLG9CQUFvQixHQUFXLGlDQUFpQyxDQUFDO0FBRXZFLElBQVcsSUFJVjtBQUpELFdBQVcsSUFBSTtJQUNkLDZCQUFHLENBQUE7SUFDSCw2QkFBRyxDQUFBO0lBQ0gsNkJBQUcsQ0FBQTtBQUNKLENBQUMsRUFKVSxJQUFJLEtBQUosSUFBSSxRQUlkO0FBRUQsSUFBSSxXQUFpQixDQUFDO0FBQ3RCLFFBQVEsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ3RCLEtBQUssTUFBTTtRQUNWLFdBQVcsbUJBQVcsQ0FBQztRQUN2QixNQUFNO0lBQ1AsS0FBSyxLQUFLLENBQUM7SUFDWCxLQUFLLE9BQU87UUFDWCxXQUFXLG1CQUFXLENBQUM7UUFDdkIsTUFBTTtJQUNQO1FBQ0MsV0FBVyxtQkFBVyxDQUFDO1FBQ3ZCLE1BQU07QUFDUixDQUFDO0FBRUQ7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBMEJFO0FBQ0YsSUFBSSxNQUFZLENBQUM7QUFDakIsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLHdCQUF3QixDQUFDLEVBQUUsQ0FBQztJQUMzQyxNQUFNLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyx3QkFBd0IsQ0FBQyxLQUFLLE9BQU87UUFDekQsQ0FB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