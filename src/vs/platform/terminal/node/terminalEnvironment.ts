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
import { IShellLaunchConfig, ITerminalEnvironment, ITerminalProcessOptions, ShellIntegrationInjectionFailureReason } from '../common/terminal.js';
import { EnvironmentVariableMutatorType } from '../common/environmentVariable.js';
import { deserializeEnvironmentVariableCollections } from '../common/environmentVariableShared.js';
import { MergedEnvironmentVariableCollection } from '../common/environmentVariableCollection.js';
import { chmod, realpathSync, mkdirSync } from 'fs';
import { promisify } from 'util';
import type { SingleOrMany } from '../../../base/common/types.js';

export function getWindowsBuildNumber(): number {
	const osVersion = (/(\d+)\.(\d+)\.(\d+)/g).exec(os.release());
	let buildNumber: number = 0;
	if (osVersion && osVersion.length === 4) {
		buildNumber = parseInt(osVersion[3]);
	}
	return buildNumber;
}

export interface IShellIntegrationConfigInjection {
	readonly type: 'injection';
	/**
	 * A new set of arguments to use.
	 */
	readonly newArgs: string[] | undefined;
	/**
	 * An optional environment to mixing to the real environment.
	 */
	readonly envMixin?: IProcessEnvironment;
	/**
	 * An optional array of files to copy from `source` to `dest`.
	 */
	readonly filesToCopy?: {
		source: string;
		dest: string;
	}[];
}

export interface IShellIntegrationInjectionFailure {
	readonly type: 'failure';
	readonly reason: ShellIntegrationInjectionFailureReason;
}

/**
 * For a given shell launch config, returns arguments to replace and an optional environment to
 * mixin to the SLC's environment to enable shell integration. This must be run within the context
 * that creates the process to ensure accuracy. Returns undefined if shell integration cannot be
 * enabled.
 */
export async function getShellIntegrationInjection(
	shellLaunchConfig: IShellLaunchConfig,
	options: ITerminalProcessOptions,
	env: ITerminalEnvironment | undefined,
	logService: ILogService,
	productService: IProductService,
	skipStickyBit: boolean = false
): Promise<IShellIntegrationConfigInjection | IShellIntegrationInjectionFailure> {
	// The global setting is disabled
	if (!options.shellIntegration.enabled) {
		return { type: 'failure', reason: ShellIntegrationInjectionFailureReason.InjectionSettingDisabled };
	}
	// There is no executable (so there's no way to determine how to inject)
	if (!shellLaunchConfig.executable) {
		return { type: 'failure', reason: ShellIntegrationInjectionFailureReason.NoExecutable };
	}
	// It's a feature terminal (tasks, debug), unless it's explicitly being forced
	if (shellLaunchConfig.isFeatureTerminal && !shellLaunchConfig.forceShellIntegration) {
		return { type: 'failure', reason: ShellIntegrationInjectionFailureReason.FeatureTerminal };
	}
	// The ignoreShellIntegration flag is passed (eg. relaunching without shell integration)
	if (shellLaunchConfig.ignoreShellIntegration) {
		return { type: 'failure', reason: ShellIntegrationInjectionFailureReason.IgnoreShellIntegrationFlag };
	}
	// Shell integration doesn't work with winpty
	if (isWindows && (!options.windowsEnableConpty || getWindowsBuildNumber() < 18309)) {
		return { type: 'failure', reason: ShellIntegrationInjectionFailureReason.Winpty };
	}

	const originalArgs = shellLaunchConfig.args;
	const shell = process.platform === 'win32' ? path.basename(shellLaunchConfig.executable).toLowerCase() : path.basename(shellLaunchConfig.executable);
	const appRoot = path.dirname(FileAccess.asFileUri('').fsPath);
	const type = 'injection';
	let newArgs: string[] | undefined;
	const envMixin: IProcessEnvironment = {
		'VSCODE_INJECTION': '1'
	};

	if (options.shellIntegration.nonce) {
		envMixin['VSCODE_NONCE'] = options.shellIntegration.nonce;
	}
	// Temporarily pass list of hardcoded env vars for shell env api
	const scopedDownShellEnvs = ['PATH', 'VIRTUAL_ENV', 'HOME', 'SHELL', 'PWD'];
	if (shellLaunchConfig.shellIntegrationEnvironmentReporting) {
		if (isWindows) {
			const enableWindowsEnvReporting = options.windowsUseConptyDll || options.windowsEnableConpty && getWindowsBuildNumber() >= 22631 && shell !== 'bash.exe';
			if (enableWindowsEnvReporting) {
				envMixin['VSCODE_SHELL_ENV_REPORTING'] = scopedDownShellEnvs.join(',');
			}
		} else {
			envMixin['VSCODE_SHELL_ENV_REPORTING'] = scopedDownShellEnvs.join(',');
		}
	}

	// Windows
	if (isWindows) {
		if (shell === 'pwsh.exe' || shell === 'powershell.exe') {
			envMixin['VSCODE_A11Y_MODE'] = options.isScreenReaderOptimized ? '1' : '0';

			if (!originalArgs || arePwshImpliedArgs(originalArgs)) {
				newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.WindowsPwsh);
			} else if (arePwshLoginArgs(originalArgs)) {
				newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.WindowsPwshLogin);
			}
			if (!newArgs) {
				return { type: 'failure', reason: ShellIntegrationInjectionFailureReason.UnsupportedArgs };
			}
			newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], appRoot, '');
			envMixin['VSCODE_STABLE'] = productService.quality === 'stable' ? '1' : '0';
			return { type, newArgs, envMixin };
		} else if (shell === 'bash.exe') {
			if (!originalArgs || originalArgs.length === 0) {
				newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.Bash);
			} else if (areZshBashFishLoginArgs(originalArgs)) {
				envMixin['VSCODE_SHELL_LOGIN'] = '1';
				addEnvMixinPathPrefix(options, envMixin, shell);
				newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.Bash);
			}
			if (!newArgs) {
				return { type: 'failure', reason: ShellIntegrationInjectionFailureReason.UnsupportedArgs };
			}
			newArgs = [...newArgs]; // Shallow clone the array to avoid setting the default array
			newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], appRoot);
			envMixin['VSCODE_STABLE'] = productService.quality === 'stable' ? '1' : '0';
			return { type, newArgs, envMixin };
		}
		logService.warn(`Shell integration cannot be enabled for executable "${shellLaunchConfig.executable}" and args`, shellLaunchConfig.args);
		return { type: 'failure', reason: ShellIntegrationInjectionFailureReason.UnsupportedShell };
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
				return { type: 'failure', reason: ShellIntegrationInjectionFailureReason.UnsupportedArgs };
			}
			newArgs = [...newArgs]; // Shallow clone the array to avoid setting the default array
			newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], appRoot);
			envMixin['VSCODE_STABLE'] = productService.quality === 'stable' ? '1' : '0';
			return { type, newArgs, envMixin };
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
				return { type: 'failure', reason: ShellIntegrationInjectionFailureReason.UnsupportedArgs };
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
			} else if (arePwshLoginArgs(originalArgs)) {
				newArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.PwshLogin);
			}
			if (!newArgs) {
				return { type: 'failure', reason: ShellIntegrationInjectionFailureReason.UnsupportedArgs };
			}
			newArgs = [...newArgs]; // Shallow clone the array to avoid setting the default array
			newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], appRoot, '');
			envMixin['VSCODE_STABLE'] = productService.quality === 'stable' ? '1' : '0';
			return { type, newArgs, envMixin };
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
				return { type: 'failure', reason: ShellIntegrationInjectionFailureReason.UnsupportedArgs };
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
				} catch (err) {
					if (err.message.includes('ENOENT')) {
						try {
							mkdirSync(zdotdir);
						} catch (err) {
							logService.error(`Failed to create zdotdir at ${zdotdir}: ${err}`);
							return { type: 'failure', reason: ShellIntegrationInjectionFailureReason.FailedToCreateTmpDir };
						}
						try {
							const chmodAsync = promisify(chmod);
							await chmodAsync(zdotdir, 0o1700);
						} catch {
							logService.error(`Failed to set sticky bit on ${zdotdir}: ${err}`);
							return { type: 'failure', reason: ShellIntegrationInjectionFailureReason.FailedToSetStickyBit };
						}
					}
					logService.error(`Failed to set sticky bit on ${zdotdir}: ${err}`);
					return { type: 'failure', reason: ShellIntegrationInjectionFailureReason.FailedToSetStickyBit };
				}
			}
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
			return { type, newArgs, envMixin, filesToCopy };
		}
	}
	logService.warn(`Shell integration cannot be enabled for executable "${shellLaunchConfig.executable}" and args`, shellLaunchConfig.args);
	return { type: 'failure', reason: ShellIntegrationInjectionFailureReason.UnsupportedShell };
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

function arePwshLoginArgs(originalArgs: SingleOrMany<string>): boolean {
	if (typeof originalArgs === 'string') {
		return pwshLoginArgs.includes(originalArgs.toLowerCase());
	} else {
		return originalArgs.length === 1 && pwshLoginArgs.includes(originalArgs[0].toLowerCase()) ||
			(originalArgs.length === 2 &&
				(((pwshLoginArgs.includes(originalArgs[0].toLowerCase())) || pwshLoginArgs.includes(originalArgs[1].toLowerCase())))
				&& ((pwshImpliedArgs.includes(originalArgs[0].toLowerCase())) || pwshImpliedArgs.includes(originalArgs[1].toLowerCase())));
	}
}

function arePwshImpliedArgs(originalArgs: SingleOrMany<string>): boolean {
	if (typeof originalArgs === 'string') {
		return pwshImpliedArgs.includes(originalArgs.toLowerCase());
	} else {
		return originalArgs.length === 0 || originalArgs?.length === 1 && pwshImpliedArgs.includes(originalArgs[0].toLowerCase());
	}
}

function areZshBashFishLoginArgs(originalArgs: SingleOrMany<string>): boolean {
	if (typeof originalArgs !== 'string') {
		originalArgs = originalArgs.filter(arg => !shInteractiveArgs.includes(arg.toLowerCase()));
	}
	return originalArgs === 'string' && shLoginArgs.includes(originalArgs.toLowerCase())
		|| typeof originalArgs !== 'string' && originalArgs.length === 1 && shLoginArgs.includes(originalArgs[0].toLowerCase());
}
