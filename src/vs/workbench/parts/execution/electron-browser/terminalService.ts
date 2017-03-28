/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import cp = require('child_process');
import path = require('path');
import processes = require('vs/base/node/processes');
import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import { assign } from 'vs/base/common/objects';
import { TPromise } from 'vs/base/common/winjs.base';
import { ITerminalService } from 'vs/workbench/parts/execution/common/execution';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITerminalConfiguration, DEFAULT_TERMINAL_WINDOWS, DEFAULT_TERMINAL_LINUX_READY, DEFAULT_TERMINAL_OSX } from 'vs/workbench/parts/execution/electron-browser/terminal';
import uri from 'vs/base/common/uri';
import { IProcessEnvironment } from 'vs/base/common/platform';

const TERMINAL_TITLE = nls.localize('console.title', "VS Code Console");

enum WinSpawnType {
	CMD,
	CMDER
}

export class WinTerminalService implements ITerminalService {
	public _serviceBrand: any;

	private static CMD = 'cmd.exe';

	constructor(
		@IConfigurationService private _configurationService: IConfigurationService
	) {
	}

	public openTerminal(cwd?: string): void {
		const configuration = this._configurationService.getConfiguration<ITerminalConfiguration>();

		this.spawnTerminal(cp, configuration, processes.getWindowsShell(), cwd)
			.done(null, errors.onUnexpectedError);
	}

	public runInTerminal(title: string, dir: string, args: string[], envVars: IProcessEnvironment): TPromise<void> {

		const configuration = this._configurationService.getConfiguration<ITerminalConfiguration>();
		const terminalConfig = configuration.terminal.external;
		const exec = terminalConfig.windowsExec || DEFAULT_TERMINAL_WINDOWS;

		return new TPromise<void>((c, e) => {

			const title = `"${dir} - ${TERMINAL_TITLE}"`;
			const command = `""${args.join('" "')}" & pause"`; // use '|' to only pause on non-zero exit code

			const cmdArgs = [
				'/c', 'start', title, '/wait', exec, '/c', command
			];

			// merge environment variables into a copy of the process.env
			const env = assign({}, process.env, envVars);

			const options: any = {
				cwd: dir,
				env: env,
				windowsVerbatimArguments: true
			};

			const cmd = cp.spawn(WinTerminalService.CMD, cmdArgs, options);
			cmd.on('error', e);

			c(null);
		});
	}

	private spawnTerminal(spawner, configuration: ITerminalConfiguration, command: string, cwd?: string): TPromise<void> {
		const terminalConfig = configuration.terminal.external;
		const exec = terminalConfig.windowsExec || DEFAULT_TERMINAL_WINDOWS;
		const spawnType = this.getSpawnType(exec);

		// Make the drive letter uppercase on Windows (see #9448)
		if (cwd && cwd[1] === ':') {
			cwd = cwd[0].toUpperCase() + cwd.substr(1);
		}

		// cmder ignores the environment cwd and instead opts to always open in %USERPROFILE%
		// unless otherwise specified
		if (spawnType === WinSpawnType.CMDER) {
			spawner.spawn(exec, [cwd]);
			return TPromise.as(void 0);
		}

		// The '""' argument is the window title. Without this, exec doesn't work when the path
		// contains spaces
		const cmdArgs = ['/c', 'start', '/wait', '""', exec];

		return new TPromise<void>((c, e) => {
			const env = cwd ? { cwd: cwd } : void 0;
			const child = spawner.spawn(command, cmdArgs, env);
			child.on('error', e);
			child.on('exit', () => c(null));
		});
	}

	private getSpawnType(exec: string): WinSpawnType {
		const basename = path.basename(exec).toLowerCase();
		if (basename === 'cmder' || basename === 'cmder.exe') {
			return WinSpawnType.CMDER;
		}
		return WinSpawnType.CMD;
	}
}

export class MacTerminalService implements ITerminalService {
	public _serviceBrand: any;

	private static OSASCRIPT = '/usr/bin/osascript';	// osascript is the AppleScript interpreter on OS X

	constructor(
		@IConfigurationService private _configurationService: IConfigurationService
	) { }

	public openTerminal(cwd?: string): void {
		const configuration = this._configurationService.getConfiguration<ITerminalConfiguration>();

		this.spawnTerminal(cp, configuration, cwd).done(null, errors.onUnexpectedError);
	}

	public runInTerminal(title: string, dir: string, args: string[], envVars: IProcessEnvironment): TPromise<void> {

		const configuration = this._configurationService.getConfiguration<ITerminalConfiguration>();
		const terminalConfig = configuration.terminal.external;
		const terminalApp = terminalConfig.osxExec || DEFAULT_TERMINAL_OSX;

		return new TPromise<void>((c, e) => {

			if (terminalApp === DEFAULT_TERMINAL_OSX || terminalApp === 'iTerm.app') {

				// On OS X we launch an AppleScript that creates (or reuses) a Terminal window
				// and then launches the program inside that window.

				const script = terminalApp === DEFAULT_TERMINAL_OSX ? 'TerminalHelper' : 'iTermHelper';
				const scriptpath = uri.parse(require.toUrl(`vs/workbench/parts/execution/electron-browser/${script}.scpt`)).fsPath;

				const osaArgs = [
					scriptpath,
					'-t', title || TERMINAL_TITLE,
					'-w', dir,
				];

				for (let a of args) {
					osaArgs.push('-a');
					osaArgs.push(a);
				}

				if (envVars) {
					for (let key in envVars) {
						osaArgs.push('-e');
						osaArgs.push(key + '=' + envVars[key]);
					}
				}

				let stderr = '';
				const osa = cp.spawn(MacTerminalService.OSASCRIPT, osaArgs);
				osa.on('error', e);
				osa.stderr.on('data', (data) => {
					stderr += data.toString();
				});
				osa.on('exit', (code: number) => {
					if (code === 0) {	// OK
						c(null);
					} else {
						if (stderr) {
							const lines = stderr.split('\n', 1);
							e(new Error(lines[0]));
						} else {
							e(new Error(nls.localize('mac.terminal.script.failed', "Script '{0}' failed with exit code {1}", script, code)));
						}
					}
				});
			} else {
				e(new Error(nls.localize('mac.terminal.type.not.supported', "'{0}' not supported", terminalApp)));
			}
		});
	}

	private spawnTerminal(spawner, configuration: ITerminalConfiguration, cwd?: string): TPromise<void> {
		const terminalConfig = configuration.terminal.external;
		const terminalApp = terminalConfig.osxExec || DEFAULT_TERMINAL_OSX;

		return new TPromise<void>((c, e) => {
			const child = spawner.spawn('/usr/bin/open', ['-a', terminalApp, cwd]);
			child.on('error', e);
			child.on('exit', () => c(null));
		});
	}
}

export class LinuxTerminalService implements ITerminalService {
	public _serviceBrand: any;

	private static WAIT_MESSAGE = nls.localize('press.any.key', "Press any key to continue...");

	constructor(
		@IConfigurationService private _configurationService: IConfigurationService
	) { }


	public openTerminal(cwd?: string): void {
		const configuration = this._configurationService.getConfiguration<ITerminalConfiguration>();

		this.spawnTerminal(cp, configuration, cwd)
			.done(null, errors.onUnexpectedError);
	}

	public runInTerminal(title: string, dir: string, args: string[], envVars: IProcessEnvironment): TPromise<void> {

		const configuration = this._configurationService.getConfiguration<ITerminalConfiguration>();
		const terminalConfig = configuration.terminal.external;
		const execPromise = terminalConfig.linuxExec ? TPromise.as(terminalConfig.linuxExec) : DEFAULT_TERMINAL_LINUX_READY;

		return new TPromise<void>((c, e) => {

			let termArgs: string[] = [];
			//termArgs.push('--title');
			//termArgs.push(`"${TERMINAL_TITLE}"`);
			execPromise.then(exec => {
				if (exec.indexOf('gnome-terminal') >= 0) {
					termArgs.push('-x');
				} else {
					termArgs.push('-e');
				}
				termArgs.push('bash');
				termArgs.push('-c');

				const bashCommand = `${quote(args)}; echo; read -p "${LinuxTerminalService.WAIT_MESSAGE}" -n1;`;
				termArgs.push(`''${bashCommand}''`);	// wrapping argument in two sets of ' because node is so "friendly" that it removes one set...

				// merge environment variables into a copy of the process.env
				const env = assign({}, process.env, envVars);

				const options: any = {
					cwd: dir,
					env: env
				};

				let stderr = '';
				const cmd = cp.spawn(exec, termArgs, options);
				cmd.on('error', e);
				cmd.stderr.on('data', (data) => {
					stderr += data.toString();
				});
				cmd.on('exit', (code: number) => {
					if (code === 0) {	// OK
						c(null);
					} else {
						if (stderr) {
							const lines = stderr.split('\n', 1);
							e(new Error(lines[0]));
						} else {
							e(new Error(nls.localize('linux.term.failed', "'{0}' failed with exit code {1}", exec, code)));
						}
					}
				});
			});
		});
	}

	private spawnTerminal(spawner, configuration: ITerminalConfiguration, cwd?: string): TPromise<void> {
		const terminalConfig = configuration.terminal.external;
		const execPromise = terminalConfig.linuxExec ? TPromise.as(terminalConfig.linuxExec) : DEFAULT_TERMINAL_LINUX_READY;
		const env = cwd ? { cwd: cwd } : void 0;

		return new TPromise<void>((c, e) => {
			execPromise.then(exec => {
				const child = spawner.spawn(exec, [], env);
				child.on('error', e);
				child.on('exit', () => c(null));
			});
		});
	}
}

/**
 * Quote args if necessary and combine into a space separated string.
 */
function quote(args: string[]): string {
	let r = '';
	for (let a of args) {
		if (a.indexOf(' ') >= 0) {
			r += '"' + a + '"';
		} else {
			r += a;
		}
		r += ' ';
	}
	return r;
}
