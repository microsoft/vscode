/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as cp from 'child_process';
import { Codicon } from '../../../base/common/codicons.js';
import { basename, delimiter, normalize, dirname, resolve } from '../../../base/common/path.js';
import { isLinux, isWindows } from '../../../base/common/platform.js';
import { findExecutable } from '../../../base/node/processes.js';
import { hasKey, isObject, isString } from '../../../base/common/types.js';
import * as pfs from '../../../base/node/pfs.js';
import { enumeratePowerShellInstallations } from '../../../base/node/powershell.js';
import { getWindowsBuildNumberAsync } from '../../../base/node/windowsVersion.js';
var Constants;
(function (Constants) {
    Constants["UnixShellsPath"] = "/etc/shells";
})(Constants || (Constants = {}));
let profileSources;
let logIfWslNotInstalled = true;
export function detectAvailableProfiles(profiles, defaultProfile, includeDetectedProfiles, configurationService, shellEnv = process.env, fsProvider, logService, variableResolver, testPwshSourcePaths) {
    fsProvider = fsProvider || {
        existsFile: pfs.SymlinkSupport.existsFile,
        readFile: fs.promises.readFile
    };
    if (isWindows) {
        return detectAvailableWindowsProfiles(includeDetectedProfiles, fsProvider, shellEnv, logService, configurationService.getValue("terminal.integrated.useWslProfiles" /* TerminalSettingId.UseWslProfiles */) !== false, profiles && isObject(profiles) ? { ...profiles } : configurationService.getValue("terminal.integrated.profiles.windows" /* TerminalSettingId.ProfilesWindows */), isString(defaultProfile) ? defaultProfile : configurationService.getValue("terminal.integrated.defaultProfile.windows" /* TerminalSettingId.DefaultProfileWindows */), testPwshSourcePaths, variableResolver);
    }
    return detectAvailableUnixProfiles(fsProvider, logService, includeDetectedProfiles, profiles && isObject(profiles) ? { ...profiles } : configurationService.getValue(isLinux ? "terminal.integrated.profiles.linux" /* TerminalSettingId.ProfilesLinux */ : "terminal.integrated.profiles.osx" /* TerminalSettingId.ProfilesMacOs */), isString(defaultProfile) ? defaultProfile : configurationService.getValue(isLinux ? "terminal.integrated.defaultProfile.linux" /* TerminalSettingId.DefaultProfileLinux */ : "terminal.integrated.defaultProfile.osx" /* TerminalSettingId.DefaultProfileMacOs */), testPwshSourcePaths, variableResolver, shellEnv);
}
async function detectAvailableWindowsProfiles(includeDetectedProfiles, fsProvider, shellEnv, logService, useWslProfiles, configProfiles, defaultProfileName, testPwshSourcePaths, variableResolver) {
    // Determine the correct System32 path. We want to point to Sysnative
    // when the 32-bit version of VS Code is running on a 64-bit machine.
    // The reason for this is because PowerShell's important PSReadline
    // module doesn't work if this is not the case. See #27915.
    const is32ProcessOn64Windows = process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
    const system32Path = `${process.env['windir']}\\${is32ProcessOn64Windows ? 'Sysnative' : 'System32'}`;
    // WSL 2 released in the May 2020 Update, this is where the `-d` flag was added that we depend
    // upon
    const allowWslDiscovery = await getWindowsBuildNumberAsync() >= 19041;
    await initializeWindowsProfiles(testPwshSourcePaths);
    const detectedProfiles = new Map();
    // Add auto detected profiles
    if (includeDetectedProfiles) {
        detectedProfiles.set('PowerShell', {
            source: "PowerShell" /* ProfileSource.Pwsh */,
            icon: Codicon.terminalPowershell,
            isAutoDetected: true
        });
        detectedProfiles.set('Windows PowerShell', {
            path: `${system32Path}\\WindowsPowerShell\\v1.0\\powershell.exe`,
            icon: Codicon.terminalPowershell,
            isAutoDetected: true
        });
        detectedProfiles.set('Git Bash', {
            source: "Git Bash" /* ProfileSource.GitBash */,
            icon: Codicon.terminalGitBash,
            isAutoDetected: true
        });
        detectedProfiles.set('Command Prompt', {
            path: `${system32Path}\\cmd.exe`,
            icon: Codicon.terminalCmd,
            isAutoDetected: true
        });
        detectedProfiles.set('Cygwin', {
            path: [
                { path: `${process.env['HOMEDRIVE']}\\cygwin64\\bin\\bash.exe`, isUnsafe: true },
                { path: `${process.env['HOMEDRIVE']}\\cygwin\\bin\\bash.exe`, isUnsafe: true }
            ],
            args: ['--login'],
            isAutoDetected: true
        });
        detectedProfiles.set('bash (MSYS2)', {
            path: [
                { path: `${process.env['HOMEDRIVE']}\\msys64\\usr\\bin\\bash.exe`, isUnsafe: true },
            ],
            args: ['--login', '-i'],
            // CHERE_INVOKING retains current working directory
            env: { CHERE_INVOKING: '1' },
            icon: Codicon.terminalBash,
            isAutoDetected: true
        });
        const cmderPath = `${process.env['CMDER_ROOT'] || `${process.env['HOMEDRIVE']}\\cmder`}\\vendor\\bin\\vscode_init.cmd`;
        detectedProfiles.set('Cmder', {
            path: `${system32Path}\\cmd.exe`,
            args: ['/K', cmderPath],
            // The path is safe if it was derived from CMDER_ROOT
            requiresPath: process.env['CMDER_ROOT'] ? cmderPath : { path: cmderPath, isUnsafe: true },
            isAutoDetected: true
        });
    }
    applyConfigProfilesToMap(configProfiles, detectedProfiles);
    const resultProfiles = await transformToTerminalProfiles(detectedProfiles.entries(), defaultProfileName, fsProvider, shellEnv, logService, variableResolver);
    if (includeDetectedProfiles && useWslProfiles && allowWslDiscovery) {
        try {
            const result = await getWslProfiles(`${system32Path}\\wsl.exe`, defaultProfileName);
            for (const wslProfile of result) {
                if (!configProfiles || !Object.prototype.hasOwnProperty.call(configProfiles, wslProfile.profileName)) {
                    resultProfiles.push(wslProfile);
                }
            }
        }
        catch (e) {
            if (logIfWslNotInstalled) {
                logService?.trace('WSL is not installed, so could not detect WSL profiles');
                logIfWslNotInstalled = false;
            }
        }
    }
    return resultProfiles;
}
async function transformToTerminalProfiles(entries, defaultProfileName, fsProvider, shellEnv = process.env, logService, variableResolver) {
    const promises = [];
    for (const [profileName, profile] of entries) {
        promises.push(getValidatedProfile(profileName, profile, defaultProfileName, fsProvider, shellEnv, logService, variableResolver));
    }
    return (await Promise.all(promises)).filter(e => !!e);
}
async function getValidatedProfile(profileName, profile, defaultProfileName, fsProvider, shellEnv = process.env, logService, variableResolver) {
    if (profile === null) {
        return undefined;
    }
    let originalPaths;
    let args;
    let icon = undefined;
    // use calculated values if path is not specified
    if (hasKey(profile, { source: true })) {
        const source = profileSources?.get(profile.source);
        if (!source) {
            return undefined;
        }
        originalPaths = source.paths;
        // if there are configured args, override the default ones
        args = profile.args || source.args;
        if (profile.icon) {
            icon = validateIcon(profile.icon);
        }
        else if (source.icon) {
            icon = source.icon;
        }
    }
    else {
        originalPaths = Array.isArray(profile.path) ? profile.path : [profile.path];
        args = isWindows ? profile.args : Array.isArray(profile.args) ? profile.args : undefined;
        icon = validateIcon(profile.icon);
    }
    let paths;
    if (variableResolver) {
        // Convert to string[] for resolve
        const mapped = originalPaths.map(e => isString(e) ? e : e.path);
        const resolved = await variableResolver(mapped);
        // Convert resolved back to (T | string)[]
        paths = new Array(originalPaths.length);
        for (let i = 0; i < originalPaths.length; i++) {
            if (isString(originalPaths[i])) {
                paths[i] = resolved[i];
            }
            else {
                paths[i] = {
                    path: resolved[i],
                    isUnsafe: true
                };
            }
        }
    }
    else {
        paths = originalPaths.slice();
    }
    let requiresUnsafePath;
    if (profile.requiresPath) {
        // Validate requiresPath exists
        let actualRequiredPath;
        if (isString(profile.requiresPath)) {
            actualRequiredPath = profile.requiresPath;
        }
        else {
            actualRequiredPath = profile.requiresPath.path;
            if (profile.requiresPath.isUnsafe) {
                requiresUnsafePath = actualRequiredPath;
            }
        }
        const result = await fsProvider.existsFile(actualRequiredPath);
        if (!result) {
            return;
        }
    }
    const validatedProfile = await validateProfilePaths(profileName, defaultProfileName, paths, fsProvider, shellEnv, args, profile.env, profile.overrideName, profile.isAutoDetected, requiresUnsafePath);
    if (!validatedProfile) {
        logService?.debug('Terminal profile not validated', profileName, originalPaths);
        return undefined;
    }
    validatedProfile.isAutoDetected = profile.isAutoDetected;
    validatedProfile.icon = icon;
    validatedProfile.color = profile.color;
    return validatedProfile;
}
function validateIcon(icon) {
    if (isString(icon)) {
        return { id: icon };
    }
    return icon;
}
async function initializeWindowsProfiles(testPwshSourcePaths) {
    if (profileSources && !testPwshSourcePaths) {
        return;
    }
    const [gitBashPaths, pwshPaths] = await Promise.all([getGitBashPaths(), testPwshSourcePaths || getPowershellPaths()]);
    profileSources = new Map();
    profileSources.set("Git Bash" /* ProfileSource.GitBash */, {
        profileName: 'Git Bash',
        paths: gitBashPaths,
        args: ['--login', '-i']
    });
    profileSources.set("PowerShell" /* ProfileSource.Pwsh */, {
        profileName: 'PowerShell',
        paths: pwshPaths,
        icon: Codicon.terminalPowershell
    });
}
async function getGitBashPaths() {
    const gitDirs = new Set();
    // Look for git.exe on the PATH and use that if found. git.exe is located at
    // `<installdir>/cmd/git.exe`. This is not an unsafe location because the git executable is
    // located on the PATH which is only controlled by the user/admin.
    const gitExePath = await findExecutable('git.exe');
    if (gitExePath) {
        const gitExeDir = dirname(gitExePath);
        gitDirs.add(resolve(gitExeDir, '../..'));
    }
    function addTruthy(set, value) {
        if (value) {
            set.add(value);
        }
    }
    // Add common git install locations
    addTruthy(gitDirs, process.env['ProgramW6432']);
    addTruthy(gitDirs, process.env['ProgramFiles']);
    addTruthy(gitDirs, process.env['ProgramFiles(X86)']);
    addTruthy(gitDirs, `${process.env['LocalAppData']}\\Program`);
    const gitBashPaths = [];
    for (const gitDir of gitDirs) {
        gitBashPaths.push(`${gitDir}\\Git\\bin\\bash.exe`, `${gitDir}\\Git\\usr\\bin\\bash.exe`, `${gitDir}\\usr\\bin\\bash.exe` // using Git for Windows SDK
        );
    }
    // Add special installs that don't follow the standard directory structure
    gitBashPaths.push(`${process.env['UserProfile']}\\scoop\\apps\\git\\current\\bin\\bash.exe`);
    gitBashPaths.push(`${process.env['UserProfile']}\\scoop\\apps\\git-with-openssh\\current\\bin\\bash.exe`);
    return gitBashPaths;
}
async function getPowershellPaths() {
    const paths = [];
    // Add all of the different kinds of PowerShells
    for await (const pwshExe of enumeratePowerShellInstallations()) {
        paths.push(pwshExe.exePath);
    }
    return paths;
}
async function getWslProfiles(wslPath, defaultProfileName) {
    const profiles = [];
    const distroOutput = await new Promise((resolve, reject) => {
        // wsl.exe output is encoded in utf16le (ie. A -> 0x4100) by default, force it in case the
        // user changed https://github.com/microsoft/vscode/issues/276253
        cp.exec('wsl.exe -l -q', { encoding: 'utf16le', env: { ...process.env, WSL_UTF8: '0' }, timeout: 1000 }, (err, stdout) => {
            if (err) {
                return reject('Problem occurred when getting wsl distros');
            }
            resolve(stdout);
        });
    });
    if (!distroOutput) {
        return [];
    }
    const distroNames = distroOutput.split(/\r?\n/).filter(t => t.trim().length > 0);
    for (const distroName of distroNames) {
        // Skip empty lines
        if (distroName === '') {
            continue;
        }
        // docker-desktop and docker-desktop-data are treated as implementation details of
        // Docker Desktop for Windows and therefore not exposed
        if (distroName.startsWith('docker-desktop')) {
            continue;
        }
        // Create the profile, adding the icon depending on the distro
        const profileName = `${distroName} (WSL)`;
        const profile = {
            profileName,
            path: wslPath,
            args: [`-d`, `${distroName}`],
            isDefault: profileName === defaultProfileName,
            icon: getWslIcon(distroName),
            isAutoDetected: false
        };
        // Add the profile
        profiles.push(profile);
    }
    return profiles;
}
function getWslIcon(distroName) {
    if (distroName.includes('Ubuntu')) {
        return Codicon.terminalUbuntu;
    }
    else if (distroName.includes('Debian')) {
        return Codicon.terminalDebian;
    }
    else {
        return Codicon.terminalLinux;
    }
}
async function detectAvailableUnixProfiles(fsProvider, logService, includeDetectedProfiles, configProfiles, defaultProfileName, testPaths, variableResolver, shellEnv) {
    const detectedProfiles = new Map();
    // Add non-quick launch profiles
    if (includeDetectedProfiles && await fsProvider.existsFile("/etc/shells" /* Constants.UnixShellsPath */)) {
        const contents = (await fsProvider.readFile("/etc/shells" /* Constants.UnixShellsPath */)).toString();
        const profiles = ((testPaths || contents.split('\n'))
            .map(e => {
            const index = e.indexOf('#');
            return index === -1 ? e : e.substring(0, index);
        })
            .filter(e => e.trim().length > 0));
        const counts = new Map();
        for (const profile of profiles) {
            let profileName = basename(profile);
            let count = counts.get(profileName) || 0;
            count++;
            if (count > 1) {
                profileName = `${profileName} (${count})`;
            }
            counts.set(profileName, count);
            detectedProfiles.set(profileName, { path: profile, isAutoDetected: true });
        }
    }
    applyConfigProfilesToMap(configProfiles, detectedProfiles);
    return await transformToTerminalProfiles(detectedProfiles.entries(), defaultProfileName, fsProvider, shellEnv, logService, variableResolver);
}
function applyConfigProfilesToMap(configProfiles, profilesMap) {
    if (!configProfiles) {
        return;
    }
    for (const [profileName, value] of Object.entries(configProfiles)) {
        if (value === null || !isObject(value) || (!hasKey(value, { path: true }) && !hasKey(value, { source: true }))) {
            profilesMap.delete(profileName);
        }
        else {
            value.icon = value.icon || profilesMap.get(profileName)?.icon;
            profilesMap.set(profileName, value);
        }
    }
}
async function validateProfilePaths(profileName, defaultProfileName, potentialPaths, fsProvider, shellEnv, args, env, overrideName, isAutoDetected, requiresUnsafePath) {
    if (potentialPaths.length === 0) {
        return Promise.resolve(undefined);
    }
    const path = potentialPaths.shift();
    if (path === '') {
        return validateProfilePaths(profileName, defaultProfileName, potentialPaths, fsProvider, shellEnv, args, env, overrideName, isAutoDetected);
    }
    const isUnsafePath = !isString(path) && path.isUnsafe;
    const actualPath = isString(path) ? path : path.path;
    const profile = {
        profileName,
        path: actualPath,
        args,
        env,
        overrideName,
        isAutoDetected,
        isDefault: profileName === defaultProfileName,
        isUnsafePath,
        requiresUnsafePath
    };
    // For non-absolute paths, check if it's available on $PATH
    if (basename(actualPath) === actualPath) {
        // The executable isn't an absolute path, try find it on the PATH
        const envPaths = shellEnv.PATH ? shellEnv.PATH.split(delimiter) : undefined;
        const executable = await findExecutable(actualPath, undefined, envPaths, undefined, fsProvider.existsFile);
        if (!executable) {
            return validateProfilePaths(profileName, defaultProfileName, potentialPaths, fsProvider, shellEnv, args);
        }
        profile.path = executable;
        profile.isFromPath = true;
        return profile;
    }
    const result = await fsProvider.existsFile(normalize(actualPath));
    if (result) {
        return profile;
    }
    return validateProfilePaths(profileName, defaultProfileName, potentialPaths, fsProvider, shellEnv, args, env, overrideName, isAutoDetected);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxQcm9maWxlcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3Rlcm1pbmFsL25vZGUvdGVybWluYWxQcm9maWxlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQztBQUN6QixPQUFPLEtBQUssRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUNwQyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNqRSxPQUFPLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUUzRSxPQUFPLEtBQUssR0FBRyxNQUFNLDJCQUEyQixDQUFDO0FBQ2pELE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBS3BGLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWxGLElBQVcsU0FFVjtBQUZELFdBQVcsU0FBUztJQUNuQiwyQ0FBOEIsQ0FBQTtBQUMvQixDQUFDLEVBRlUsU0FBUyxLQUFULFNBQVMsUUFFbkI7QUFFRCxJQUFJLGNBQWtFLENBQUM7QUFDdkUsSUFBSSxvQkFBb0IsR0FBWSxJQUFJLENBQUM7QUFFekMsTUFBTSxVQUFVLHVCQUF1QixDQUN0QyxRQUFpQixFQUNqQixjQUF1QixFQUN2Qix1QkFBZ0MsRUFDaEMsb0JBQTJDLEVBQzNDLFdBQStCLE9BQU8sQ0FBQyxHQUFHLEVBQzFDLFVBQXdCLEVBQ3hCLFVBQXdCLEVBQ3hCLGdCQUF3RCxFQUN4RCxtQkFBOEI7SUFFOUIsVUFBVSxHQUFHLFVBQVUsSUFBSTtRQUMxQixVQUFVLEVBQUUsR0FBRyxDQUFDLGNBQWMsQ0FBQyxVQUFVO1FBQ3pDLFFBQVEsRUFBRSxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVE7S0FDOUIsQ0FBQztJQUNGLElBQUksU0FBUyxFQUFFLENBQUM7UUFDZixPQUFPLDhCQUE4QixDQUNwQyx1QkFBdUIsRUFDdkIsVUFBVSxFQUNWLFFBQVEsRUFDUixVQUFVLEVBQ1Ysb0JBQW9CLENBQUMsUUFBUSw2RUFBa0MsS0FBSyxLQUFLLEVBQ3pFLFFBQVEsSUFBSSxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUMsb0JBQW9CLENBQUMsUUFBUSxnRkFBa0YsRUFDbEssUUFBUSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLFFBQVEsNEZBQWlELEVBQzFILG1CQUFtQixFQUNuQixnQkFBZ0IsQ0FDaEIsQ0FBQztJQUNILENBQUM7SUFDRCxPQUFPLDJCQUEyQixDQUNqQyxVQUFVLEVBQ1YsVUFBVSxFQUNWLHVCQUF1QixFQUN2QixRQUFRLElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLFFBQVEsQ0FBZ0QsT0FBTyxDQUFDLENBQUMsNEVBQWlDLENBQUMseUVBQWdDLENBQUMsRUFDNU0sUUFBUSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLFFBQVEsQ0FBUyxPQUFPLENBQUMsQ0FBQyx3RkFBdUMsQ0FBQyxxRkFBc0MsQ0FBQyxFQUMxSyxtQkFBbUIsRUFDbkIsZ0JBQWdCLEVBQ2hCLFFBQVEsQ0FDUixDQUFDO0FBQ0gsQ0FBQztBQUVELEtBQUssVUFBVSw4QkFBOEIsQ0FDNUMsdUJBQWdDLEVBQ2hDLFVBQXVCLEVBQ3ZCLFFBQTRCLEVBQzVCLFVBQXdCLEVBQ3hCLGNBQXdCLEVBQ3hCLGNBQThELEVBQzlELGtCQUEyQixFQUMzQixtQkFBOEIsRUFDOUIsZ0JBQXdEO0lBRXhELHFFQUFxRTtJQUNyRSxxRUFBcUU7SUFDckUsbUVBQW1FO0lBQ25FLDJEQUEyRDtJQUMzRCxNQUFNLHNCQUFzQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLHdCQUF3QixDQUFDLENBQUM7SUFDcEYsTUFBTSxZQUFZLEdBQUcsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxLQUFLLHNCQUFzQixDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDO0lBRXRHLDhGQUE4RjtJQUM5RixPQUFPO0lBQ1AsTUFBTSxpQkFBaUIsR0FBRyxNQUFNLDBCQUEwQixFQUFFLElBQUksS0FBSyxDQUFDO0lBRXRFLE1BQU0seUJBQXlCLENBQUMsbUJBQW1CLENBQUMsQ0FBQztJQUVyRCxNQUFNLGdCQUFnQixHQUE0QyxJQUFJLEdBQUcsRUFBRSxDQUFDO0lBRTVFLDZCQUE2QjtJQUM3QixJQUFJLHVCQUF1QixFQUFFLENBQUM7UUFDN0IsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRTtZQUNsQyxNQUFNLHVDQUFvQjtZQUMxQixJQUFJLEVBQUUsT0FBTyxDQUFDLGtCQUFrQjtZQUNoQyxjQUFjLEVBQUUsSUFBSTtTQUNwQixDQUFDLENBQUM7UUFDSCxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLEVBQUU7WUFDMUMsSUFBSSxFQUFFLEdBQUcsWUFBWSwyQ0FBMkM7WUFDaEUsSUFBSSxFQUFFLE9BQU8sQ0FBQyxrQkFBa0I7WUFDaEMsY0FBYyxFQUFFLElBQUk7U0FDcEIsQ0FBQyxDQUFDO1FBQ0gsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRTtZQUNoQyxNQUFNLHdDQUF1QjtZQUM3QixJQUFJLEVBQUUsT0FBTyxDQUFDLGVBQWU7WUFDN0IsY0FBYyxFQUFFLElBQUk7U0FDcEIsQ0FBQyxDQUFDO1FBQ0gsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLGdCQUFnQixFQUFFO1lBQ3RDLElBQUksRUFBRSxHQUFHLFlBQVksV0FBVztZQUNoQyxJQUFJLEVBQUUsT0FBTyxDQUFDLFdBQVc7WUFDekIsY0FBYyxFQUFFLElBQUk7U0FDcEIsQ0FBQyxDQUFDO1FBQ0gsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRTtZQUM5QixJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxJQUFJLEVBQUUsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQywyQkFBMkIsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFO2dCQUNoRixFQUFFLElBQUksRUFBRSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLHlCQUF5QixFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUU7YUFDOUU7WUFDRCxJQUFJLEVBQUUsQ0FBQyxTQUFTLENBQUM7WUFDakIsY0FBYyxFQUFFLElBQUk7U0FDcEIsQ0FBQyxDQUFDO1FBQ0gsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRTtZQUNwQyxJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxJQUFJLEVBQUUsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFO2FBQ25GO1lBQ0QsSUFBSSxFQUFFLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQztZQUN2QixtREFBbUQ7WUFDbkQsR0FBRyxFQUFFLEVBQUUsY0FBYyxFQUFFLEdBQUcsRUFBRTtZQUM1QixJQUFJLEVBQUUsT0FBTyxDQUFDLFlBQVk7WUFDMUIsY0FBYyxFQUFFLElBQUk7U0FDcEIsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxTQUFTLEdBQUcsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxJQUFJLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsU0FBUyxnQ0FBZ0MsQ0FBQztRQUN2SCxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFO1lBQzdCLElBQUksRUFBRSxHQUFHLFlBQVksV0FBVztZQUNoQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDO1lBQ3ZCLHFEQUFxRDtZQUNyRCxZQUFZLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRTtZQUN6RixjQUFjLEVBQUUsSUFBSTtTQUNwQixDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsd0JBQXdCLENBQUMsY0FBYyxFQUFFLGdCQUFnQixDQUFDLENBQUM7SUFFM0QsTUFBTSxjQUFjLEdBQXVCLE1BQU0sMkJBQTJCLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztJQUVqTCxJQUFJLHVCQUF1QixJQUFJLGNBQWMsSUFBSSxpQkFBaUIsRUFBRSxDQUFDO1FBQ3BFLElBQUksQ0FBQztZQUNKLE1BQU0sTUFBTSxHQUFHLE1BQU0sY0FBYyxDQUFDLEdBQUcsWUFBWSxXQUFXLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztZQUNwRixLQUFLLE1BQU0sVUFBVSxJQUFJLE1BQU0sRUFBRSxDQUFDO2dCQUNqQyxJQUFJLENBQUMsY0FBYyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxVQUFVLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQztvQkFDdEcsY0FBYyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDakMsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNaLElBQUksb0JBQW9CLEVBQUUsQ0FBQztnQkFDMUIsVUFBVSxFQUFFLEtBQUssQ0FBQyx3REFBd0QsQ0FBQyxDQUFDO2dCQUM1RSxvQkFBb0IsR0FBRyxLQUFLLENBQUM7WUFDOUIsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRUQsT0FBTyxjQUFjLENBQUM7QUFDdkIsQ0FBQztBQUVELEtBQUssVUFBVSwyQkFBMkIsQ0FDekMsT0FBK0QsRUFDL0Qsa0JBQXNDLEVBQ3RDLFVBQXVCLEVBQ3ZCLFdBQStCLE9BQU8sQ0FBQyxHQUFHLEVBQzFDLFVBQXdCLEVBQ3hCLGdCQUF3RDtJQUV4RCxNQUFNLFFBQVEsR0FBNEMsRUFBRSxDQUFDO0lBQzdELEtBQUssTUFBTSxDQUFDLFdBQVcsRUFBRSxPQUFPLENBQUMsSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUM5QyxRQUFRLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLFdBQVcsRUFBRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO0lBQ2xJLENBQUM7SUFDRCxPQUFPLENBQUMsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3ZELENBQUM7QUFFRCxLQUFLLFVBQVUsbUJBQW1CLENBQ2pDLFdBQW1CLEVBQ25CLE9BQW1DLEVBQ25DLGtCQUFzQyxFQUN0QyxVQUF1QixFQUN2QixXQUErQixPQUFPLENBQUMsR0FBRyxFQUMxQyxVQUF3QixFQUN4QixnQkFBd0Q7SUFFeEQsSUFBSSxPQUFPLEtBQUssSUFBSSxFQUFFLENBQUM7UUFDdEIsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUNELElBQUksYUFBK0MsQ0FBQztJQUNwRCxJQUFJLElBQW1DLENBQUM7SUFDeEMsSUFBSSxJQUFJLEdBQTRELFNBQVMsQ0FBQztJQUM5RSxpREFBaUQ7SUFDakQsSUFBSSxNQUFNLENBQUMsT0FBTyxFQUFFLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsQ0FBQztRQUN2QyxNQUFNLE1BQU0sR0FBRyxjQUFjLEVBQUUsR0FBRyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNuRCxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDYixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBQ0QsYUFBYSxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUM7UUFFN0IsMERBQTBEO1FBQzFELElBQUksR0FBRyxPQUFPLENBQUMsSUFBSSxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUM7UUFDbkMsSUFBSSxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDbEIsSUFBSSxHQUFHLFlBQVksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbkMsQ0FBQzthQUFNLElBQUksTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3hCLElBQUksR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDO1FBQ3BCLENBQUM7SUFDRixDQUFDO1NBQU0sQ0FBQztRQUNQLGFBQWEsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDNUUsSUFBSSxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUN6RixJQUFJLEdBQUcsWUFBWSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNuQyxDQUFDO0lBRUQsSUFBSSxLQUF1QyxDQUFDO0lBQzVDLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztRQUN0QixrQ0FBa0M7UUFDbEMsTUFBTSxNQUFNLEdBQUcsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFaEUsTUFBTSxRQUFRLEdBQUcsTUFBTSxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNoRCwwQ0FBMEM7UUFDMUMsS0FBSyxHQUFHLElBQUksS0FBSyxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN4QyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsYUFBYSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQy9DLElBQUksUUFBUSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQ2hDLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDeEIsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRztvQkFDVixJQUFJLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQztvQkFDakIsUUFBUSxFQUFFLElBQUk7aUJBQ2QsQ0FBQztZQUNILENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztTQUFNLENBQUM7UUFDUCxLQUFLLEdBQUcsYUFBYSxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQy9CLENBQUM7SUFFRCxJQUFJLGtCQUFzQyxDQUFDO0lBQzNDLElBQUksT0FBTyxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQzFCLCtCQUErQjtRQUMvQixJQUFJLGtCQUEwQixDQUFDO1FBQy9CLElBQUksUUFBUSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDO1lBQ3BDLGtCQUFrQixHQUFHLE9BQU8sQ0FBQyxZQUFZLENBQUM7UUFDM0MsQ0FBQzthQUFNLENBQUM7WUFDUCxrQkFBa0IsR0FBRyxPQUFPLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQztZQUMvQyxJQUFJLE9BQU8sQ0FBQyxZQUFZLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ25DLGtCQUFrQixHQUFHLGtCQUFrQixDQUFDO1lBQ3pDLENBQUM7UUFDRixDQUFDO1FBQ0QsTUFBTSxNQUFNLEdBQUcsTUFBTSxVQUFVLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDL0QsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2IsT0FBTztRQUNSLENBQUM7SUFDRixDQUFDO0lBRUQsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLG9CQUFvQixDQUFDLFdBQVcsRUFBRSxrQkFBa0IsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsT0FBTyxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsWUFBWSxFQUFFLE9BQU8sQ0FBQyxjQUFjLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztJQUN2TSxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUN2QixVQUFVLEVBQUUsS0FBSyxDQUFDLGdDQUFnQyxFQUFFLFdBQVcsRUFBRSxhQUFhLENBQUMsQ0FBQztRQUNoRixPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsZ0JBQWdCLENBQUMsY0FBYyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUM7SUFDekQsZ0JBQWdCLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztJQUM3QixnQkFBZ0IsQ0FBQyxLQUFLLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQztJQUN2QyxPQUFPLGdCQUFnQixDQUFDO0FBQ3pCLENBQUM7QUFFRCxTQUFTLFlBQVksQ0FBQyxJQUF1QztJQUM1RCxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1FBQ3BCLE9BQU8sRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLENBQUM7SUFDckIsQ0FBQztJQUNELE9BQU8sSUFBSSxDQUFDO0FBQ2IsQ0FBQztBQUVELEtBQUssVUFBVSx5QkFBeUIsQ0FBQyxtQkFBOEI7SUFDdEUsSUFBSSxjQUFjLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1FBQzVDLE9BQU87SUFDUixDQUFDO0lBRUQsTUFBTSxDQUFDLFlBQVksRUFBRSxTQUFTLENBQUMsR0FBRyxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxlQUFlLEVBQUUsRUFBRSxtQkFBbUIsSUFBSSxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUV0SCxjQUFjLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztJQUMzQixjQUFjLENBQUMsR0FBRyx5Q0FDTTtRQUN2QixXQUFXLEVBQUUsVUFBVTtRQUN2QixLQUFLLEVBQUUsWUFBWTtRQUNuQixJQUFJLEVBQUUsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDO0tBQ3ZCLENBQUMsQ0FBQztJQUNILGNBQWMsQ0FBQyxHQUFHLHdDQUFxQjtRQUN0QyxXQUFXLEVBQUUsWUFBWTtRQUN6QixLQUFLLEVBQUUsU0FBUztRQUNoQixJQUFJLEVBQUUsT0FBTyxDQUFDLGtCQUFrQjtLQUNoQyxDQUFDLENBQUM7QUFDSixDQUFDO0FBRUQsS0FBSyxVQUFVLGVBQWU7SUFDN0IsTUFBTSxPQUFPLEdBQWdCLElBQUksR0FBRyxFQUFFLENBQUM7SUFFdkMsNEVBQTRFO0lBQzVFLDJGQUEyRjtJQUMzRixrRUFBa0U7SUFDbEUsTUFBTSxVQUFVLEdBQUcsTUFBTSxjQUFjLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDbkQsSUFBSSxVQUFVLEVBQUUsQ0FBQztRQUNoQixNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDdEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUM7SUFDMUMsQ0FBQztJQUNELFNBQVMsU0FBUyxDQUFJLEdBQVcsRUFBRSxLQUFvQjtRQUN0RCxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ1gsR0FBRyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNoQixDQUFDO0lBQ0YsQ0FBQztJQUVELG1DQUFtQztJQUNuQyxTQUFTLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztJQUNoRCxTQUFTLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztJQUNoRCxTQUFTLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDO0lBQ3JELFNBQVMsQ0FBQyxPQUFPLEVBQUUsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUU5RCxNQUFNLFlBQVksR0FBYSxFQUFFLENBQUM7SUFDbEMsS0FBSyxNQUFNLE1BQU0sSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUM5QixZQUFZLENBQUMsSUFBSSxDQUNoQixHQUFHLE1BQU0sc0JBQXNCLEVBQy9CLEdBQUcsTUFBTSwyQkFBMkIsRUFDcEMsR0FBRyxNQUFNLHNCQUFzQixDQUFDLDRCQUE0QjtTQUM1RCxDQUFDO0lBQ0gsQ0FBQztJQUVELDBFQUEwRTtJQUMxRSxZQUFZLENBQUMsSUFBSSxDQUFDLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsNENBQTRDLENBQUMsQ0FBQztJQUM3RixZQUFZLENBQUMsSUFBSSxDQUFDLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMseURBQXlELENBQUMsQ0FBQztJQUUxRyxPQUFPLFlBQVksQ0FBQztBQUNyQixDQUFDO0FBRUQsS0FBSyxVQUFVLGtCQUFrQjtJQUNoQyxNQUFNLEtBQUssR0FBYSxFQUFFLENBQUM7SUFDM0IsZ0RBQWdEO0lBQ2hELElBQUksS0FBSyxFQUFFLE1BQU0sT0FBTyxJQUFJLGdDQUFnQyxFQUFFLEVBQUUsQ0FBQztRQUNoRSxLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUM3QixDQUFDO0lBQ0QsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDO0FBRUQsS0FBSyxVQUFVLGNBQWMsQ0FBQyxPQUFlLEVBQUUsa0JBQXNDO0lBQ3BGLE1BQU0sUUFBUSxHQUF1QixFQUFFLENBQUM7SUFDeEMsTUFBTSxZQUFZLEdBQUcsTUFBTSxJQUFJLE9BQU8sQ0FBUyxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtRQUNsRSwwRkFBMEY7UUFDMUYsaUVBQWlFO1FBQ2pFLEVBQUUsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxHQUFHLEVBQUUsRUFBRSxHQUFHLE9BQU8sQ0FBQyxHQUFHLEVBQUUsUUFBUSxFQUFFLEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDLEdBQUcsRUFBRSxNQUFNLEVBQUUsRUFBRTtZQUN4SCxJQUFJLEdBQUcsRUFBRSxDQUFDO2dCQUNULE9BQU8sTUFBTSxDQUFDLDJDQUEyQyxDQUFDLENBQUM7WUFDNUQsQ0FBQztZQUNELE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNqQixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBQ0gsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ25CLE9BQU8sRUFBRSxDQUFDO0lBQ1gsQ0FBQztJQUNELE1BQU0sV0FBVyxHQUFHLFlBQVksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztJQUNqRixLQUFLLE1BQU0sVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDO1FBQ3RDLG1CQUFtQjtRQUNuQixJQUFJLFVBQVUsS0FBSyxFQUFFLEVBQUUsQ0FBQztZQUN2QixTQUFTO1FBQ1YsQ0FBQztRQUVELGtGQUFrRjtRQUNsRix1REFBdUQ7UUFDdkQsSUFBSSxVQUFVLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLEVBQUUsQ0FBQztZQUM3QyxTQUFTO1FBQ1YsQ0FBQztRQUVELDhEQUE4RDtRQUM5RCxNQUFNLFdBQVcsR0FBRyxHQUFHLFVBQVUsUUFBUSxDQUFDO1FBQzFDLE1BQU0sT0FBTyxHQUFxQjtZQUNqQyxXQUFXO1lBQ1gsSUFBSSxFQUFFLE9BQU87WUFDYixJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsR0FBRyxVQUFVLEVBQUUsQ0FBQztZQUM3QixTQUFTLEVBQUUsV0FBVyxLQUFLLGtCQUFrQjtZQUM3QyxJQUFJLEVBQUUsVUFBVSxDQUFDLFVBQVUsQ0FBQztZQUM1QixjQUFjLEVBQUUsS0FBSztTQUNyQixDQUFDO1FBQ0Ysa0JBQWtCO1FBQ2xCLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDeEIsQ0FBQztJQUNELE9BQU8sUUFBUSxDQUFDO0FBQ2pCLENBQUM7QUFFRCxTQUFTLFVBQVUsQ0FBQyxVQUFrQjtJQUNyQyxJQUFJLFVBQVUsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztRQUNuQyxPQUFPLE9BQU8sQ0FBQyxjQUFjLENBQUM7SUFDL0IsQ0FBQztTQUFNLElBQUksVUFBVSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1FBQzFDLE9BQU8sT0FBTyxDQUFDLGNBQWMsQ0FBQztJQUMvQixDQUFDO1NBQU0sQ0FBQztRQUNQLE9BQU8sT0FBTyxDQUFDLGFBQWEsQ0FBQztJQUM5QixDQUFDO0FBQ0YsQ0FBQztBQUVELEtBQUssVUFBVSwyQkFBMkIsQ0FDekMsVUFBdUIsRUFDdkIsVUFBd0IsRUFDeEIsdUJBQWlDLEVBQ2pDLGNBQThELEVBQzlELGtCQUEyQixFQUMzQixTQUFvQixFQUNwQixnQkFBd0QsRUFDeEQsUUFBNkI7SUFFN0IsTUFBTSxnQkFBZ0IsR0FBNEMsSUFBSSxHQUFHLEVBQUUsQ0FBQztJQUU1RSxnQ0FBZ0M7SUFDaEMsSUFBSSx1QkFBdUIsSUFBSSxNQUFNLFVBQVUsQ0FBQyxVQUFVLDhDQUEwQixFQUFFLENBQUM7UUFDdEYsTUFBTSxRQUFRLEdBQUcsQ0FBQyxNQUFNLFVBQVUsQ0FBQyxRQUFRLDhDQUEwQixDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDbEYsTUFBTSxRQUFRLEdBQUcsQ0FDaEIsQ0FBQyxTQUFTLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUNqQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDUixNQUFNLEtBQUssR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzdCLE9BQU8sS0FBSyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2pELENBQUMsQ0FBQzthQUNELE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQ2xDLENBQUM7UUFDRixNQUFNLE1BQU0sR0FBd0IsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUM5QyxLQUFLLE1BQU0sT0FBTyxJQUFJLFFBQVEsRUFBRSxDQUFDO1lBQ2hDLElBQUksV0FBVyxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNwQyxJQUFJLEtBQUssR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN6QyxLQUFLLEVBQUUsQ0FBQztZQUNSLElBQUksS0FBSyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNmLFdBQVcsR0FBRyxHQUFHLFdBQVcsS0FBSyxLQUFLLEdBQUcsQ0FBQztZQUMzQyxDQUFDO1lBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDL0IsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDNUUsQ0FBQztJQUNGLENBQUM7SUFFRCx3QkFBd0IsQ0FBQyxjQUFjLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztJQUUzRCxPQUFPLE1BQU0sMkJBQTJCLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztBQUM5SSxDQUFDO0FBRUQsU0FBUyx3QkFBd0IsQ0FBQyxjQUF5RSxFQUFFLFdBQW9EO0lBQ2hLLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUNyQixPQUFPO0lBQ1IsQ0FBQztJQUNELEtBQUssTUFBTSxDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUM7UUFDbkUsSUFBSSxLQUFLLEtBQUssSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ2hILFdBQVcsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDakMsQ0FBQzthQUFNLENBQUM7WUFDUCxLQUFLLENBQUMsSUFBSSxHQUFHLEtBQUssQ0FBQyxJQUFJLElBQUksV0FBVyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsRUFBRSxJQUFJLENBQUM7WUFDOUQsV0FBVyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDckMsQ0FBQztJQUNGLENBQUM7QUFDRixDQUFDO0FBRUQsS0FBSyxVQUFVLG9CQUFvQixDQUFDLFdBQW1CLEVBQUUsa0JBQXNDLEVBQUUsY0FBZ0QsRUFBRSxVQUF1QixFQUFFLFFBQTRCLEVBQUUsSUFBd0IsRUFBRSxHQUEwQixFQUFFLFlBQXNCLEVBQUUsY0FBd0IsRUFBRSxrQkFBMkI7SUFDNVUsSUFBSSxjQUFjLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQ2pDLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUNuQyxDQUFDO0lBQ0QsTUFBTSxJQUFJLEdBQUcsY0FBYyxDQUFDLEtBQUssRUFBRyxDQUFDO0lBQ3JDLElBQUksSUFBSSxLQUFLLEVBQUUsRUFBRSxDQUFDO1FBQ2pCLE9BQU8sb0JBQW9CLENBQUMsV0FBVyxFQUFFLGtCQUFrQixFQUFFLGNBQWMsRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsWUFBWSxFQUFFLGNBQWMsQ0FBQyxDQUFDO0lBQzdJLENBQUM7SUFDRCxNQUFNLFlBQVksR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDO0lBQ3RELE1BQU0sVUFBVSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO0lBRXJELE1BQU0sT0FBTyxHQUFxQjtRQUNqQyxXQUFXO1FBQ1gsSUFBSSxFQUFFLFVBQVU7UUFDaEIsSUFBSTtRQUNKLEdBQUc7UUFDSCxZQUFZO1FBQ1osY0FBYztRQUNkLFNBQVMsRUFBRSxXQUFXLEtBQUssa0JBQWtCO1FBQzdDLFlBQVk7UUFDWixrQkFBa0I7S0FDbEIsQ0FBQztJQUVGLDJEQUEyRDtJQUMzRCxJQUFJLFFBQVEsQ0FBQyxVQUFVLENBQUMsS0FBSyxVQUFVLEVBQUUsQ0FBQztRQUN6QyxpRUFBaUU7UUFDakUsTUFBTSxRQUFRLEdBQXlCLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDbEcsTUFBTSxVQUFVLEdBQUcsTUFBTSxjQUFjLENBQUMsVUFBVSxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLFVBQVUsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMzRyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDakIsT0FBTyxvQkFBb0IsQ0FBQyxXQUFXLEVBQUUsa0JBQWtCLEVBQUUsY0FBYyxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDMUcsQ0FBQztRQUNELE9BQU8sQ0FBQyxJQUFJLEdBQUcsVUFBVSxDQUFDO1FBQzFCLE9BQU8sQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDO1FBQzFCLE9BQU8sT0FBTyxDQUFDO0lBQ2hCLENBQUM7SUFFRCxNQUFNLE1BQU0sR0FBRyxNQUFNLFVBQVUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7SUFDbEUsSUFBSSxNQUFNLEVBQUUsQ0FBQztRQUNaLE9BQU8sT0FBTyxDQUFDO0lBQ2hCLENBQUM7SUFFRCxPQUFPLG9CQUFvQixDQUFDLFdBQVcsRUFBRSxrQkFBa0IsRUFBRSxjQUFjLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLFlBQVksRUFBRSxjQUFjLENBQUMsQ0FBQztBQUM3SSxDQUFDIn0=