/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as platform from 'vs/base/common/platform';
import Uri from 'vs/base/common/uri';
import pkg from 'vs/platform/node/package';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ProcessState, ITerminalProcessManager, ITerminalProcessMessage, IShellLaunchConfig, ITerminalConfigHelper } from 'vs/workbench/parts/terminal/common/terminal';
import { TPromise } from 'vs/base/common/winjs.base';
import { ILogService } from 'vs/platform/log/common/log';
import { Emitter, Event } from 'vs/base/common/event';
import { IStringDictionary } from 'vs/base/common/collections';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { IWorkspaceFolder, IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IHistoryService } from 'vs/workbench/services/history/common/history';

/** The amount of time to consider terminal errors to be related to the launch */
const LAUNCHING_DURATION = 500;

/**
 * Holds all state related to the creation and management of terminal processes.
 *
 * Definitions:
 * - Process: The process launched with the terminalProcess.ts file
 * - Pty Process: The pseudoterminal master process (or the winpty agent process)
 * - Shell Process: The pseudoterminal slave process (ie. the shell)
 */
export class TerminalProcessManager implements ITerminalProcessManager {
	public processState: ProcessState = ProcessState.UNINITIALIZED;
	public process: cp.ChildProcess;
	public ptyProcessReady: TPromise<void>;
	public shellProcessId: number;
	public initialCwd: string;

	private _preLaunchInputQueue: string[] = [];
	private _disposables: IDisposable[] = [];

	private readonly _onShellProcessIdReady: Emitter<number> = new Emitter<number>();
	public get onShellProcessIdReady(): Event<number> { return this._onShellProcessIdReady.event; }

	constructor(
		private _configHelper: ITerminalConfigHelper,
		private _cols: number,
		private _rows: number,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IHistoryService private readonly _historyService: IHistoryService,
		@IConfigurationResolverService private readonly _configurationResolverService: IConfigurationResolverService,
		@ILogService private _logService: ILogService
	) {
	}

	public dispose(): void {
		this._disposables.forEach(d => d.dispose());
		this._disposables.length = 0;
	}

	public addDisposable(disposable: IDisposable) {
		this._disposables.push(disposable);
	}

	public createProcess(shellLaunchConfig: IShellLaunchConfig): void {
		this.ptyProcessReady = new TPromise<void>(c => {
			this.onShellProcessIdReady(() => {
				this._logService.debug(`Terminal process ready (shellProcessId: ${this.shellProcessId})`);
				c(void 0);
			});
		});

		const locale = this._configHelper.config.setLocaleVariables ? platform.locale : undefined;
		if (!shellLaunchConfig.executable) {
			this._configHelper.mergeDefaultShellPathAndArgs(shellLaunchConfig);
		}

		const lastActiveWorkspaceRootUri = this._historyService.getLastActiveWorkspaceRoot('file');
		this.initialCwd = this._getCwd(shellLaunchConfig, lastActiveWorkspaceRootUri);

		// Resolve env vars from config and shell
		const lastActiveWorkspaceRoot = this._workspaceContextService.getWorkspaceFolder(lastActiveWorkspaceRootUri);
		const platformKey = platform.isWindows ? 'windows' : (platform.isMacintosh ? 'osx' : 'linux');
		const envFromConfig = TerminalProcessManager.resolveConfigurationVariables(this._configurationResolverService, { ...this._configHelper.config.env[platformKey] }, lastActiveWorkspaceRoot);
		const envFromShell = TerminalProcessManager.resolveConfigurationVariables(this._configurationResolverService, { ...shellLaunchConfig.env }, lastActiveWorkspaceRoot);
		shellLaunchConfig.env = envFromShell;

		// Merge process env with the env from config
		const parentEnv = { ...process.env };
		TerminalProcessManager.mergeEnvironments(parentEnv, envFromConfig);

		// Continue env initialization, merging in the env from the launch
		// config and adding keys that are needed to create the process
		const env = TerminalProcessManager.createTerminalEnv(parentEnv, shellLaunchConfig, this.initialCwd, locale, this._cols, this._rows);
		const cwd = Uri.parse(path.dirname(require.toUrl('../node/terminalProcess'))).fsPath;
		const options = { env, cwd };
		this._logService.debug(`Terminal process launching`, options);
		this.process = cp.fork(Uri.parse(require.toUrl('bootstrap')).fsPath, ['--type=terminal'], options);
		this.processState = ProcessState.LAUNCHING;

		// TODO: Hide message communication details inside terminal process manager
		this.process.on('message', message => this.acceptProcessMessage(message));

		setTimeout(() => {
			if (this.processState === ProcessState.LAUNCHING) {
				this.processState = ProcessState.RUNNING;
			}
		}, LAUNCHING_DURATION);
	}

	protected _getCwd(shell: IShellLaunchConfig, root: Uri): string {
		if (shell.cwd) {
			return shell.cwd;
		}

		let cwd: string;

		// TODO: Handle non-existent customCwd
		if (!shell.ignoreConfigurationCwd) {
			// Evaluate custom cwd first
			const customCwd = this._configHelper.config.cwd;
			if (customCwd) {
				if (path.isAbsolute(customCwd)) {
					cwd = customCwd;
				} else if (root) {
					cwd = path.normalize(path.join(root.fsPath, customCwd));
				}
			}
		}

		// If there was no custom cwd or it was relative with no workspace
		if (!cwd) {
			cwd = root ? root.fsPath : os.homedir();
		}

		return TerminalProcessManager._sanitizeCwd(cwd);
	}

	public write(data: string): void {
		if (this.shellProcessId) {
			// Send data if the pty is ready
			this.process.send({
				event: 'input',
				data
			});
		} else {
			// If the pty is not ready, queue the data received to send later
			this._preLaunchInputQueue.push(data);
		}
	}

	public acceptProcessMessage(message: ITerminalProcessMessage): void {
		if (message.type === 'pid') {
			this.shellProcessId = <number>message.content;
			this._onShellProcessIdReady.fire(this.shellProcessId);

			// Send any queued data that's waiting
			if (this._preLaunchInputQueue.length > 0) {
				this.process.send({
					event: 'input',
					data: this._preLaunchInputQueue.join('')
				});
				this._preLaunchInputQueue.length = 0;
			}
		}
	}

	public static mergeEnvironments(parent: IStringDictionary<string>, other: IStringDictionary<string>) {
		if (!other) {
			return;
		}

		// On Windows apply the new values ignoring case, while still retaining
		// the case of the original key.
		if (platform.isWindows) {
			for (let configKey in other) {
				let actualKey = configKey;
				for (let envKey in parent) {
					if (configKey.toLowerCase() === envKey.toLowerCase()) {
						actualKey = envKey;
						break;
					}
				}
				const value = other[configKey];
				TerminalProcessManager._mergeEnvironmentValue(parent, actualKey, value);
			}
		} else {
			Object.keys(other).forEach((key) => {
				const value = other[key];
				TerminalProcessManager._mergeEnvironmentValue(parent, key, value);
			});
		}
	}

	private static _mergeEnvironmentValue(env: IStringDictionary<string>, key: string, value: string | null) {
		if (typeof value === 'string') {
			env[key] = value;
		} else {
			delete env[key];
		}
	}

	// TODO: This should be private/protected
	public static createTerminalEnv(parentEnv: IStringDictionary<string>, shell: IShellLaunchConfig, cwd: string, locale: string, cols?: number, rows?: number): IStringDictionary<string> {
		const env = { ...parentEnv };
		if (shell.env) {
			TerminalProcessManager.mergeEnvironments(env, shell.env);
		}

		env['PTYPID'] = process.pid.toString();
		env['PTYSHELL'] = shell.executable;
		env['TERM_PROGRAM'] = 'vscode';
		env['TERM_PROGRAM_VERSION'] = pkg.version;
		if (shell.args) {
			if (typeof shell.args === 'string') {
				env[`PTYSHELLCMDLINE`] = shell.args;
			} else {
				shell.args.forEach((arg, i) => env[`PTYSHELLARG${i}`] = arg);
			}
		}
		env['PTYCWD'] = cwd;
		env['LANG'] = TerminalProcessManager._getLangEnvVariable(locale);
		if (cols && rows) {
			env['PTYCOLS'] = cols.toString();
			env['PTYROWS'] = rows.toString();
		}
		env['AMD_ENTRYPOINT'] = 'vs/workbench/parts/terminal/node/terminalProcess';
		return env;
	}

	// TODO:should be protected/non-static
	private static resolveConfigurationVariables(configurationResolverService: IConfigurationResolverService, env: IStringDictionary<string>, lastActiveWorkspaceRoot: IWorkspaceFolder): IStringDictionary<string> {
		Object.keys(env).forEach((key) => {
			if (typeof env[key] === 'string') {
				env[key] = configurationResolverService.resolve(lastActiveWorkspaceRoot, env[key]);
			}
		});
		return env;
	}

	private static _sanitizeCwd(cwd: string) {
		// Make the drive letter uppercase on Windows (see #9448)
		if (platform.platform === platform.Platform.Windows && cwd && cwd[1] === ':') {
			return cwd[0].toUpperCase() + cwd.substr(1);
		}
		return cwd;
	}

	private static _getLangEnvVariable(locale?: string) {
		const parts = locale ? locale.split('-') : [];
		const n = parts.length;
		if (n === 0) {
			// Fallback to en_US to prevent possible encoding issues.
			return 'en_US.UTF-8';
		}
		if (n === 1) {
			// app.getLocale can return just a language without a variant, fill in the variant for
			// supported languages as many shells expect a 2-part locale.
			const languageVariants = {
				de: 'DE',
				en: 'US',
				es: 'ES',
				fi: 'FI',
				fr: 'FR',
				it: 'IT',
				ja: 'JP',
				ko: 'KR',
				pl: 'PL',
				ru: 'RU',
				zh: 'CN'
			};
			if (parts[0] in languageVariants) {
				parts.push(languageVariants[parts[0]]);
			}
		} else {
			// Ensure the variant is uppercase
			parts[1] = parts[1].toUpperCase();
		}
		return parts.join('_') + '.UTF-8';
	}


	// Should this be here or in instance?
	// private _isExiting: boolean;

}