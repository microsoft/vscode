/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as os from 'os';
import { FileAccess } from '../../../base/common/network.js';
import * as path from '../../../base/common/path.js';
import { isMacintosh, isWindows } from '../../../base/common/platform.js';
import * as process from '../../../base/common/process.js';
import { format } from '../../../base/common/strings.js';
import { EnvironmentVariableMutatorType } from '../common/environmentVariable.js';
import { deserializeEnvironmentVariableCollections } from '../common/environmentVariableShared.js';
import { MergedEnvironmentVariableCollection } from '../common/environmentVariableCollection.js';
import { chmod, realpathSync, mkdirSync } from 'fs';
import { promisify } from 'util';
import { isString } from '../../../base/common/types.js';
import { getWindowsBuildNumberAsync } from '../../../base/node/windowsVersion.js';
/**
 * For a given shell launch config, returns arguments to replace and an optional environment to
 * mixin to the SLC's environment to enable shell integration. This must be run within the context
 * that creates the process to ensure accuracy. Returns undefined if shell integration cannot be
 * enabled.
 */
export async function getShellIntegrationInjection(shellLaunchConfig, options, env, logService, productService, skipStickyBit = false) {
    // The global setting is disabled
    if (!options.shellIntegration.enabled) {
        return { type: 'failure', reason: "injectionSettingDisabled" /* ShellIntegrationInjectionFailureReason.InjectionSettingDisabled */ };
    }
    // There is no executable (so there's no way to determine how to inject)
    if (!shellLaunchConfig.executable) {
        return { type: 'failure', reason: "noExecutable" /* ShellIntegrationInjectionFailureReason.NoExecutable */ };
    }
    // It's a feature terminal (tasks, debug), unless it's explicitly being forced
    if (shellLaunchConfig.isFeatureTerminal && !shellLaunchConfig.forceShellIntegration) {
        return { type: 'failure', reason: "featureTerminal" /* ShellIntegrationInjectionFailureReason.FeatureTerminal */ };
    }
    // The ignoreShellIntegration flag is passed (eg. relaunching without shell integration)
    if (shellLaunchConfig.ignoreShellIntegration) {
        return { type: 'failure', reason: "ignoreShellIntegrationFlag" /* ShellIntegrationInjectionFailureReason.IgnoreShellIntegrationFlag */ };
    }
    // Shell integration requires Windows 10 build 18309+ (ConPTY support)
    const windowsBuildNumber = isWindows ? await getWindowsBuildNumberAsync() : 0;
    if (isWindows && windowsBuildNumber < 18309) {
        return { type: 'failure', reason: "unsupportedWindowsBuild" /* ShellIntegrationInjectionFailureReason.UnsupportedWindowsBuild */ };
    }
    const originalArgs = shellLaunchConfig.args;
    const shell = process.platform === 'win32' ? path.basename(shellLaunchConfig.executable).toLowerCase() : path.basename(shellLaunchConfig.executable);
    const appRoot = path.dirname(FileAccess.asFileUri('').fsPath);
    const type = 'injection';
    let newArgs;
    const envMixin = {
        'VSCODE_INJECTION': '1'
    };
    if (options.shellIntegration.nonce) {
        envMixin['VSCODE_NONCE'] = options.shellIntegration.nonce;
    }
    // Temporarily pass list of hardcoded env vars for shell env api
    const scopedDownShellEnvs = ['PATH', 'VIRTUAL_ENV', 'HOME', 'SHELL', 'PWD'];
    if (shellLaunchConfig.shellIntegrationEnvironmentReporting) {
        if (isWindows) {
            const enableWindowsEnvReporting = options.windowsUseConptyDll || windowsBuildNumber >= 22631 && shell !== 'bash.exe';
            if (enableWindowsEnvReporting) {
                envMixin['VSCODE_SHELL_ENV_REPORTING'] = scopedDownShellEnvs.join(',');
            }
        }
        else {
            envMixin['VSCODE_SHELL_ENV_REPORTING'] = scopedDownShellEnvs.join(',');
        }
    }
    // Windows
    if (isWindows) {
        if (shell === 'pwsh.exe' || shell === 'powershell.exe') {
            envMixin['VSCODE_A11Y_MODE'] = options.isScreenReaderOptimized ? '1' : '0';
            if (!originalArgs || arePwshImpliedArgs(originalArgs)) {
                newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.WindowsPwsh);
            }
            else if (arePwshLoginArgs(originalArgs)) {
                newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.WindowsPwshLogin);
            }
            if (!newArgs) {
                return { type: 'failure', reason: "unsupportedArgs" /* ShellIntegrationInjectionFailureReason.UnsupportedArgs */ };
            }
            newArgs = [...newArgs];
            newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], appRoot, '');
            envMixin['VSCODE_STABLE'] = productService.quality === 'stable' ? '1' : '0';
            return { type, newArgs, envMixin };
        }
        else if (shell === 'bash.exe') {
            if (!originalArgs || originalArgs.length === 0) {
                newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.Bash);
            }
            else if (areZshBashFishLoginArgs(originalArgs)) {
                envMixin['VSCODE_SHELL_LOGIN'] = '1';
                addEnvMixinPathPrefix(options, envMixin, shell);
                newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.Bash);
            }
            if (!newArgs) {
                return { type: 'failure', reason: "unsupportedArgs" /* ShellIntegrationInjectionFailureReason.UnsupportedArgs */ };
            }
            newArgs = [...newArgs]; // Shallow clone the array to avoid setting the default array
            newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], appRoot);
            envMixin['VSCODE_STABLE'] = productService.quality === 'stable' ? '1' : '0';
            return { type, newArgs, envMixin };
        }
        logService.warn(`Shell integration cannot be enabled for executable "${shellLaunchConfig.executable}" and args`, shellLaunchConfig.args);
        return { type: 'failure', reason: "unsupportedShell" /* ShellIntegrationInjectionFailureReason.UnsupportedShell */ };
    }
    // Linux & macOS
    switch (shell) {
        case 'bash': {
            if (!originalArgs || originalArgs.length === 0) {
                newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.Bash);
            }
            else if (areZshBashFishLoginArgs(originalArgs)) {
                envMixin['VSCODE_SHELL_LOGIN'] = '1';
                addEnvMixinPathPrefix(options, envMixin, shell);
                newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.Bash);
            }
            if (!newArgs) {
                return { type: 'failure', reason: "unsupportedArgs" /* ShellIntegrationInjectionFailureReason.UnsupportedArgs */ };
            }
            newArgs = [...newArgs]; // Shallow clone the array to avoid setting the default array
            newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], appRoot);
            envMixin['VSCODE_STABLE'] = productService.quality === 'stable' ? '1' : '0';
            return { type, newArgs, envMixin };
        }
        case 'fish': {
            if (!originalArgs || originalArgs.length === 0) {
                newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.Fish);
            }
            else if (areZshBashFishLoginArgs(originalArgs)) {
                newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.FishLogin);
            }
            else if (originalArgs === shellIntegrationArgs.get(ShellIntegrationExecutable.Fish) || originalArgs === shellIntegrationArgs.get(ShellIntegrationExecutable.FishLogin)) {
                newArgs = originalArgs;
            }
            if (!newArgs) {
                return { type: 'failure', reason: "unsupportedArgs" /* ShellIntegrationInjectionFailureReason.UnsupportedArgs */ };
            }
            // On fish, '$fish_user_paths' is always prepended to the PATH, for both login and non-login shells, so we need
            // to apply the path prefix fix always, not only for login shells (see #232291)
            addEnvMixinPathPrefix(options, envMixin, shell);
            newArgs = [...newArgs]; // Shallow clone the array to avoid setting the default array
            newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], appRoot);
            return { type, newArgs, envMixin };
        }
        case 'pwsh': {
            if (!originalArgs || arePwshImpliedArgs(originalArgs)) {
                newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.Pwsh);
            }
            else if (arePwshLoginArgs(originalArgs)) {
                newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.PwshLogin);
            }
            if (!newArgs) {
                return { type: 'failure', reason: "unsupportedArgs" /* ShellIntegrationInjectionFailureReason.UnsupportedArgs */ };
            }
            newArgs = [...newArgs]; // Shallow clone the array to avoid setting the default array
            newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], appRoot, '');
            envMixin['VSCODE_STABLE'] = productService.quality === 'stable' ? '1' : '0';
            return { type, newArgs, envMixin };
        }
        case 'zsh': {
            if (!originalArgs || originalArgs.length === 0) {
                newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.Zsh);
            }
            else if (areZshBashFishLoginArgs(originalArgs)) {
                newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.ZshLogin);
                addEnvMixinPathPrefix(options, envMixin, shell);
            }
            else if (originalArgs === shellIntegrationArgs.get(ShellIntegrationExecutable.Zsh) || originalArgs === shellIntegrationArgs.get(ShellIntegrationExecutable.ZshLogin)) {
                newArgs = originalArgs;
            }
            if (!newArgs) {
                return { type: 'failure', reason: "unsupportedArgs" /* ShellIntegrationInjectionFailureReason.UnsupportedArgs */ };
            }
            newArgs = [...newArgs]; // Shallow clone the array to avoid setting the default array
            newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], appRoot);
            // Move .zshrc into $ZDOTDIR as the way to activate the script
            let username;
            try {
                username = os.userInfo().username;
            }
            catch {
                username = 'unknown';
            }
            // Resolve the actual tmp directory so we can set the sticky bit
            const realTmpDir = realpathSync(os.tmpdir());
            const zdotdir = path.join(realTmpDir, `${username}-${productService.applicationName}-zsh`);
            // Set directory permissions using octal notation:
            // - 0o1700:
            // - Sticky bit is set, preventing non-owners from deleting or renaming files within this directory (1)
            // - Owner has full read (4), write (2), execute (1) permissions
            // - Group has no permissions (0)
            // - Others have no permissions (0)
            if (!skipStickyBit) {
                // skip for tests
                try {
                    const chmodAsync = promisify(chmod);
                    await chmodAsync(zdotdir, 0o1700);
                }
                catch (err) {
                    if (err.message.includes('ENOENT')) {
                        try {
                            mkdirSync(zdotdir);
                        }
                        catch (err) {
                            logService.error(`Failed to create zdotdir at ${zdotdir}: ${err}`);
                            return { type: 'failure', reason: "failedToCreateTmpDir" /* ShellIntegrationInjectionFailureReason.FailedToCreateTmpDir */ };
                        }
                        try {
                            const chmodAsync = promisify(chmod);
                            await chmodAsync(zdotdir, 0o1700);
                        }
                        catch {
                            logService.error(`Failed to set sticky bit on ${zdotdir}: ${err}`);
                            return { type: 'failure', reason: "failedToSetStickyBit" /* ShellIntegrationInjectionFailureReason.FailedToSetStickyBit */ };
                        }
                    }
                    logService.error(`Failed to set sticky bit on ${zdotdir}: ${err}`);
                    return { type: 'failure', reason: "failedToSetStickyBit" /* ShellIntegrationInjectionFailureReason.FailedToSetStickyBit */ };
                }
            }
            envMixin['ZDOTDIR'] = zdotdir;
            const userZdotdir = env?.ZDOTDIR ?? os.homedir() ?? `~`;
            envMixin['USER_ZDOTDIR'] = userZdotdir;
            const filesToCopy = [];
            filesToCopy.push({
                source: path.join(appRoot, 'out/vs/workbench/contrib/terminal/common/scripts/shellIntegration-rc.zsh'),
                dest: path.join(zdotdir, '.zshrc')
            });
            filesToCopy.push({
                source: path.join(appRoot, 'out/vs/workbench/contrib/terminal/common/scripts/shellIntegration-profile.zsh'),
                dest: path.join(zdotdir, '.zprofile')
            });
            filesToCopy.push({
                source: path.join(appRoot, 'out/vs/workbench/contrib/terminal/common/scripts/shellIntegration-env.zsh'),
                dest: path.join(zdotdir, '.zshenv')
            });
            filesToCopy.push({
                source: path.join(appRoot, 'out/vs/workbench/contrib/terminal/common/scripts/shellIntegration-login.zsh'),
                dest: path.join(zdotdir, '.zlogin')
            });
            return { type, newArgs, envMixin, filesToCopy };
        }
    }
    logService.warn(`Shell integration cannot be enabled for executable "${shellLaunchConfig.executable}" and args`, shellLaunchConfig.args);
    return { type: 'failure', reason: "unsupportedShell" /* ShellIntegrationInjectionFailureReason.UnsupportedShell */ };
}
/**
 * There are a few situations where some directories are added to the beginning of the PATH.
 * 1. On macOS when the profile calls path_helper.
 * 2. For fish terminals, which always prepend "$fish_user_paths" to the PATH.
 *
 * This causes significant problems for the environment variable
 * collection API as the custom paths added to the end will now be somewhere in the middle of
 * the PATH. To combat this, VSCODE_PATH_PREFIX is used to re-apply any prefix after the profile
 * has run. This will cause duplication in the PATH but should fix the issue.
 *
 * See #99878 for more information.
 */
function addEnvMixinPathPrefix(options, envMixin, shell) {
    if ((isMacintosh || shell === 'fish') && options.environmentVariableCollections) {
        // Deserialize and merge
        const deserialized = deserializeEnvironmentVariableCollections(options.environmentVariableCollections);
        const merged = new MergedEnvironmentVariableCollection(deserialized);
        // Get all prepend PATH entries
        const pathEntry = merged.getVariableMap({ workspaceFolder: options.workspaceFolder }).get('PATH');
        const prependToPath = [];
        if (pathEntry) {
            for (const mutator of pathEntry) {
                if (mutator.type === EnvironmentVariableMutatorType.Prepend) {
                    prependToPath.push(mutator.value);
                }
            }
        }
        // Add to the environment mixin to be applied in the shell integration script
        if (prependToPath.length > 0) {
            envMixin['VSCODE_PATH_PREFIX'] = prependToPath.join('');
        }
    }
}
var ShellIntegrationExecutable;
(function (ShellIntegrationExecutable) {
    ShellIntegrationExecutable["WindowsPwsh"] = "windows-pwsh";
    ShellIntegrationExecutable["WindowsPwshLogin"] = "windows-pwsh-login";
    ShellIntegrationExecutable["Pwsh"] = "pwsh";
    ShellIntegrationExecutable["PwshLogin"] = "pwsh-login";
    ShellIntegrationExecutable["Zsh"] = "zsh";
    ShellIntegrationExecutable["ZshLogin"] = "zsh-login";
    ShellIntegrationExecutable["Bash"] = "bash";
    ShellIntegrationExecutable["Fish"] = "fish";
    ShellIntegrationExecutable["FishLogin"] = "fish-login";
})(ShellIntegrationExecutable || (ShellIntegrationExecutable = {}));
const shellIntegrationArgs = new Map();
// The try catch swallows execution policy errors in the case of the archive distributable
shellIntegrationArgs.set(ShellIntegrationExecutable.WindowsPwsh, ['-noexit', '-command', 'try { . \"{0}\\out\\vs\\workbench\\contrib\\terminal\\common\\scripts\\shellIntegration.ps1\" } catch {}{1}']);
shellIntegrationArgs.set(ShellIntegrationExecutable.WindowsPwshLogin, ['-l', '-noexit', '-command', 'try { . \"{0}\\out\\vs\\workbench\\contrib\\terminal\\common\\scripts\\shellIntegration.ps1\" } catch {}{1}']);
shellIntegrationArgs.set(ShellIntegrationExecutable.Pwsh, ['-noexit', '-command', '. "{0}/out/vs/workbench/contrib/terminal/common/scripts/shellIntegration.ps1"{1}']);
shellIntegrationArgs.set(ShellIntegrationExecutable.PwshLogin, ['-l', '-noexit', '-command', '. "{0}/out/vs/workbench/contrib/terminal/common/scripts/shellIntegration.ps1"']);
shellIntegrationArgs.set(ShellIntegrationExecutable.Zsh, ['-i']);
shellIntegrationArgs.set(ShellIntegrationExecutable.ZshLogin, ['-il']);
shellIntegrationArgs.set(ShellIntegrationExecutable.Bash, ['--init-file', '{0}/out/vs/workbench/contrib/terminal/common/scripts/shellIntegration-bash.sh']);
shellIntegrationArgs.set(ShellIntegrationExecutable.Fish, ['--init-command', 'source "{0}/out/vs/workbench/contrib/terminal/common/scripts/shellIntegration.fish"']);
shellIntegrationArgs.set(ShellIntegrationExecutable.FishLogin, ['-l', '--init-command', 'source "{0}/out/vs/workbench/contrib/terminal/common/scripts/shellIntegration.fish"']);
const pwshLoginArgs = ['-login', '-l'];
const shLoginArgs = ['--login', '-l'];
const shInteractiveArgs = ['-i', '--interactive'];
const pwshImpliedArgs = ['-nol', '-nologo'];
function arePwshLoginArgs(originalArgs) {
    if (isString(originalArgs)) {
        return pwshLoginArgs.includes(originalArgs.toLowerCase());
    }
    else {
        return originalArgs.length === 1 && pwshLoginArgs.includes(originalArgs[0].toLowerCase()) ||
            (originalArgs.length === 2 &&
                (((pwshLoginArgs.includes(originalArgs[0].toLowerCase())) || pwshLoginArgs.includes(originalArgs[1].toLowerCase())))
                && ((pwshImpliedArgs.includes(originalArgs[0].toLowerCase())) || pwshImpliedArgs.includes(originalArgs[1].toLowerCase())));
    }
}
function arePwshImpliedArgs(originalArgs) {
    if (isString(originalArgs)) {
        return pwshImpliedArgs.includes(originalArgs.toLowerCase());
    }
    else {
        return originalArgs.length === 0 || originalArgs?.length === 1 && pwshImpliedArgs.includes(originalArgs[0].toLowerCase());
    }
}
function areZshBashFishLoginArgs(originalArgs) {
    if (!isString(originalArgs)) {
        originalArgs = originalArgs.filter(arg => !shInteractiveArgs.includes(arg.toLowerCase()));
    }
    return isString(originalArgs) && shLoginArgs.includes(originalArgs.toLowerCase())
        || !isString(originalArgs) && originalArgs.length === 1 && shLoginArgs.includes(originalArgs[0].toLowerCase());
}
/**
 * Patterns that indicate sensitive environment variable names.
 */
const sensitiveEnvVarNames = /^(?:.*_)?(?:API_?KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIAL|AUTH|PRIVATE_?KEY|ACCESS_?KEY|CLIENT_?SECRET|APIKEY)(?:_.*)?$/i;
/**
 * Patterns for detecting secret values in environment variables.
 */
const secretValuePatterns = [
    // JWT tokens
    /^eyJ[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+$/,
    // GitHub tokens
    /^gh[psuro]_[a-zA-Z0-9]{36}$/,
    /^github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}$/,
    // Google API keys
    /^AIza[A-Za-z0-9_\-]{35}$/,
    // Slack tokens
    /^xox[pbar]\-[A-Za-z0-9\-]+$/,
    // Azure/MS tokens (common patterns)
    /^[a-zA-Z0-9]{32,}$/,
];
/**
 * Sanitizes environment variables for logging by redacting sensitive values.
 */
export function sanitizeEnvForLogging(env) {
    if (!env) {
        return env;
    }
    const sanitized = {};
    for (const key of Object.keys(env)) {
        const value = env[key];
        if (value === undefined) {
            continue;
        }
        // Check if the key name suggests a sensitive value
        if (sensitiveEnvVarNames.test(key)) {
            sanitized[key] = '<REDACTED>';
            continue;
        }
        // Check if the value matches known secret patterns
        let isSecret = false;
        for (const pattern of secretValuePatterns) {
            if (pattern.test(value)) {
                isSecret = true;
                break;
            }
        }
        sanitized[key] = isSecret ? '<REDACTED>' : value;
    }
    return sanitized;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxFbnZpcm9ubWVudC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3Rlcm1pbmFsL25vZGUvdGVybWluYWxFbnZpcm9ubWVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQztBQUN6QixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDN0QsT0FBTyxLQUFLLElBQUksTUFBTSw4QkFBOEIsQ0FBQztBQUNyRCxPQUFPLEVBQXVCLFdBQVcsRUFBRSxTQUFTLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMvRixPQUFPLEtBQUssT0FBTyxNQUFNLGlDQUFpQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUl6RCxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRixPQUFPLEVBQUUseUNBQXlDLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNuRyxPQUFPLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNqRyxPQUFPLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRSxTQUFTLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDcEQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLE1BQU0sQ0FBQztBQUNqQyxPQUFPLEVBQUUsUUFBUSxFQUFnQixNQUFNLCtCQUErQixDQUFDO0FBQ3ZFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBMEJsRjs7Ozs7R0FLRztBQUNILE1BQU0sQ0FBQyxLQUFLLFVBQVUsNEJBQTRCLENBQ2pELGlCQUFxQyxFQUNyQyxPQUFnQyxFQUNoQyxHQUFxQyxFQUNyQyxVQUF1QixFQUN2QixjQUErQixFQUMvQixnQkFBeUIs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