/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import { FileAccess } from '../../../base/common/network.js';
import * as path from '../../../base/common/path.js';
import { IProcessEnvironment, isMacintosh, isWindows } from '../../../base/common/platform.js';
import * as process from '../../../base/common/process.js';
import { format } from '../../../base/common/strings.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IShellLaunchConfig, ITerminalEnvironment, ITerminalProcessOptions } from '../common/terminal.js';
import { EnvironmentVariableMutatorType } from '../common/environmentVariable.js';
import { deserializeEnvironmentVariableCollections } from '../common/environmentVariableShared.js';
import { MergedEnvironmentVariableCollection } from '../common/environmentVariableCollection.js';

export function getWindowsBuildNumber(): number {
	const osVersion = (/(\d+)\.(\d+)\.(\d+)/g).exec(os.release());
	let buildNumber: number = 0;
	if (osVersion && osVersion.length === 4) {
		buildNumber = parseInt(osVersion[3]);
	}
	return buildNumber;
}

export interface IShellIntegrationConfigInjection {
	/**
	 * A new set of arguments to use.
	 */
	newArgs: string[] | undefined;
	/**
	 * An optional environment to mixing to the real environment.
	 */
	envMixin?: IProcessEnvironment;
	/**
	 * An optional array of files to copy from `source` to `dest`.
	 */
	filesToCopy?: {
		source: string;
		dest: string;
	}[];
}

/**
 * For a given shell launch config, returns arguments to replace and an optional environment to
 * mixin to the SLC's environment to enable shell integration. This must be run within the context
 * that creates the process to ensure accuracy. Returns undefined if shell integration cannot be
 * enabled.
 */
export function getShellIntegrationInjection(
	shellLaunchConfig: IShellLaunchConfig,
	options: ITerminalProcessOptions,
	env: ITerminalEnvironment | undefined,
	logService: ILogService,
	productService: IProductService
): IShellIntegrationConfigInjection | undefined {
	// Conditionally disable shell integration arg injection
	// - The global setting is disabled
	// - There is no executable (not sure what script to run)
	// - The terminal is used by a feature like tasks or debugging
	const useWinpty = isWindows && (!options.windowsEnableConpty || getWindowsBuildNumber() < 18309);
	if (
		// The global setting is disabled
		!options.shellIntegration.enabled ||
		// There is no executable (so there's no way to determine how to inject)
		!shellLaunchConfig.executable ||
		// It's a feature terminal (tasks, debug), unless it's explicitly being forced
		(shellLaunchConfig.isFeatureTerminal && !shellLaunchConfig.forceShellIntegration) ||
		// The ignoreShellIntegration flag is passed (eg. relaunching without shell integration)
		shellLaunchConfig.ignoreShellIntegration ||
		// Winpty is unsupported
		useWinpty
	) {
		return undefined;
	}

	const originalArgs = shellLaunchConfig.args;
	const shell = process.platform === 'win32' ? path.basename(shellLaunchConfig.executable).toLowerCase() : path.basename(shellLaunchConfig.executable);
	const appRoot = path.dirname(FileAccess.asFileUri('').fsPath);
	let newArgs: string[] | undefined;
	const envMixin: IProcessEnvironment = {
		'VSCODE_INJECTION': '1'
	};

	if (options.shellIntegration.nonce) {
		envMixin['VSCODE_NONCE'] = options.shellIntegration.nonce;
	}
	if (shellLaunchConfig.shellIntegrationEnvironmentReporting) {
		if (isWindows) {
			const enableWindowsEnvReporting = options.windowsUseConptyDll || options.windowsEnableConpty && getWindowsBuildNumber() >= 22631;
			if (enableWindowsEnvReporting) {
				envMixin['VSCODE_SHELL_ENV_REPORTING'] = '1';
			}
		} else {
			envMixin['VSCODE_SHELL_ENV_REPORTING'] = '1';
		}
	}
	// Windows
	if (isWindows) {
		if (shell === 'pwsh.exe' || shell === 'powershell.exe') {
			if (!originalArgs || arePwshImpliedArgs(originalArgs)) {
				newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.WindowsPwsh);
			} else if (arePwshLoginArgs(originalArgs)) {
				newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.WindowsPwshLogin);
			}
			if (!newArgs) {
				return undefined;
			}
			newArgs = [...newArgs]; // Shallow clone the array to avoid setting the default array
			newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], appRoot, '');
			envMixin['VSCODE_STABLE'] = productService.quality === 'stable' ? '1' : '0';
			if (options.shellIntegration.suggestEnabled) {
				envMixin['VSCODE_SUGGEST'] = '1';
			}
			return { newArgs, envMixin };
		} else if (shell === 'bash.exe') {
			if (!originalArgs || originalArgs.length === 0) {
				newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.Bash);
			} else if (areZshBashFishLoginArgs(originalArgs)) {
				envMixin['VSCODE_SHELL_LOGIN'] = '1';
				addEnvMixinPathPrefix(options, envMixin, shell);
				newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.Bash);
			}
			if (!newArgs) {
				return undefined;
			}
			newArgs = [...newArgs]; // Shallow clone the array to avoid setting the default array
			newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], appRoot);
			envMixin['VSCODE_STABLE'] = productService.quality === 'stable' ? '1' : '0';
			return { newArgs, envMixin };
		}
		logService.warn(`Shell integration cannot be enabled for executable "${shellLaunchConfig.executable}" and args`, shellLaunchConfig.args);
		return undefined;
	}

	// Linux & macOS
	switch (shell) {
		case 'bash': {
			if (!originalArgs || originalArgs.length === 0) {
				newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.Bash);
			} else if (areZshBashFishLoginArgs(originalArgs)) {
				envMixin['VSCODE_SHELL_LOGIN'] = '1';
				addEnvMixinPathPrefix(options, envMixin, shell);
				newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.Bash);
			}
			if (!newArgs) {
				return undefined;
			}
			newArgs = [...newArgs]; // Shallow clone the array to avoid setting the default array
			newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], appRoot);
			envMixin['VSCODE_STABLE'] = productService.quality === 'stable' ? '1' : '0';
			return { newArgs, envMixin };
		}
		case 'fish': {
			if (!originalArgs || originalArgs.length === 0) {
				newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.Fish);
			} else if (areZshBashFishLoginArgs(originalArgs)) {
				newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.FishLogin);
			} else if (originalArgs === shellIntegrationArgs.get(ShellIntegrationExecutable.Fish) || originalArgs === shellIntegrationArgs.get(ShellIntegrationExecutable.FishLogin)) {
				newArgs = originalArgs;
			}
			if (!newArgs) {
				return undefined;
			}

			// On fish, '$fish_user_paths' is always prepended to the PATH, for both login and non-login shells, so we need
			// to apply the path prefix fix always, not only for login shells (see #232291)
			addEnvMixinPathPrefix(options, envMixin, shell);

			newArgs = [...newArgs]; // Shallow clone the array to avoid setting the default array
			newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], appRoot);
			return { newArgs, envMixin };
		}
		case 'pwsh': {
			if (!originalArgs || arePwshImpliedArgs(originalArgs)) {
				newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.Pwsh);
			} else if (arePwshLoginArgs(originalArgs)) {
				newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.PwshLogin);
			}
			if (!newArgs) {
				return undefined;
			}
			if (options.shellIntegration.suggestEnabled) {
				envMixin['VSCODE_SUGGEST'] = '1';
			}
			newArgs = [...newArgs]; // Shallow clone the array to avoid setting the default array
			newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], appRoot, '');
			envMixin['VSCODE_STABLE'] = productService.quality === 'stable' ? '1' : '0';
			return { newArgs, envMixin };
		}
		case 'zsh': {
			if (!originalArgs || originalArgs.length === 0) {
				newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.Zsh);
			} else if (areZshBashFishLoginArgs(originalArgs)) {
				newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.ZshLogin);
				addEnvMixinPathPrefix(options, envMixin, shell);
			} else if (originalArgs === shellIntegrationArgs.get(ShellIntegrationExecutable.Zsh) || originalArgs === shellIntegrationArgs.get(ShellIntegrationExecutable.ZshLogin)) {
				newArgs = originalArgs;
			}
			if (!newArgs) {
				return undefined;
			}
			newArgs = [...newArgs]; // Shallow clone the array to avoid setting the default array
			newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], appRoot);

			// Move .zshrc into $ZDOTDIR as the way to activate the script
			let username: string;
			try {
				username = os.userInfo().username;
			} catch {
				username = 'unknown';
			}
			const zdotdir = path.join(os.tmpdir(), `${username}-${productService.applicationName}-zsh`);
			envMixin['ZDOTDIR'] = zdotdir;
			const userZdotdir = env?.ZDOTDIR ?? os.homedir() ?? `~`;
			envMixin['USER_ZDOTDIR'] = userZdotdir;
			const filesToCopy: IShellIntegrationConfigInjection['filesToCopy'] = [];
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
			return { newArgs, envMixin, filesToCopy };
		}
	}
	logService.warn(`Shell integration cannot be enabled for executable "${shellLaunchConfig.executable}" and args`, shellLaunchConfig.args);
	return undefined;
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
function addEnvMixinPathPrefix(options: ITerminalProcessOptions, envMixin: IProcessEnvironment, shell: string): void {
	if ((isMacintosh || shell === 'fish') && options.environmentVariableCollections) {
		// Deserialize and merge
		const deserialized = deserializeEnvironmentVariableCollections(options.environmentVariableCollections);
		const merged = new MergedEnvironmentVariableCollection(deserialized);

		// Get all prepend PATH entries
		const pathEntry = merged.getVariableMap({ workspaceFolder: options.workspaceFolder }).get('PATH');
		const prependToPath: string[] = [];
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

enum ShellIntegrationExecutable {
	WindowsPwsh = 'windows-pwsh',
	WindowsPwshLogin = 'windows-pwsh-login',
	Pwsh = 'pwsh',
	PwshLogin = 'pwsh-login',
	Zsh = 'zsh',
	ZshLogin = 'zsh-login',
	Bash = 'bash',
	Fish = 'fish',
	FishLogin = 'fish-login',
}

const shellIntegrationArgs: Map<ShellIntegrationExecutable, string[]> = new Map();
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

function arePwshLoginArgs(originalArgs: string | string[]): boolean {
	if (typeof originalArgs === 'string') {
		return pwshLoginArgs.includes(originalArgs.toLowerCase());
	} else {
		return originalArgs.length === 1 && pwshLoginArgs.includes(originalArgs[0].toLowerCase()) ||
			(originalArgs.length === 2 &&
				(((pwshLoginArgs.includes(originalArgs[0].toLowerCase())) || pwshLoginArgs.includes(originalArgs[1].toLowerCase())))
				&& ((pwshImpliedArgs.includes(originalArgs[0].toLowerCase())) || pwshImpliedArgs.includes(originalArgs[1].toLowerCase())));
	}
}

function arePwshImpliedArgs(originalArgs: string | string[]): boolean {
	if (typeof originalArgs === 'string') {
		return pwshImpliedArgs.includes(originalArgs.toLowerCase());
	} else {
		return originalArgs.length === 0 || originalArgs?.length === 1 && pwshImpliedArgs.includes(originalArgs[0].toLowerCase());
	}
}

function areZshBashFishLoginArgs(originalArgs: string | string[]): boolean {
	if (typeof originalArgs !== 'string') {
		originalArgs = originalArgs.filter(arg => !shInteractiveArgs.includes(arg.toLowerCase()));
	}
	return originalArgs === 'string' && shLoginArgs.includes(originalArgs.toLowerCase())
		|| typeof originalArgs !== 'string' && originalArgs.length === 1 && shLoginArgs.includes(originalArgs[0].toLowerCase());
}
