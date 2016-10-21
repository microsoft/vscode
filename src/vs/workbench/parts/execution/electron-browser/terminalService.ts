/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import cp = require('child_process');
import processes = require('vs/base/node/processes');
import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import { TPromise } from 'vs/base/common/winjs.base';
import { ITerminalService } from 'vs/workbench/parts/execution/common/execution';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITerminalConfiguration, DEFAULT_TERMINAL_WINDOWS, DEFAULT_TERMINAL_LINUX, DEFAULT_TERMINAL_OSX } from 'vs/workbench/parts/execution/electron-browser/terminal';
import uri from 'vs/base/common/uri';
import { IProcessEnvironment } from 'vs/base/common/platform';

const TERMINAL_TITLE = nls.localize('console.title', "VS Code Console");

export class WinTerminalService implements ITerminalService {
	public _serviceBrand: any;

	private static CMD = 'cmd.exe';

	constructor(
		@IConfigurationService private _configurationService: IConfigurationService
	) {
	}

	public openTerminal(path?: string): void {
		const configuration = this._configurationService.getConfiguration<ITerminalConfiguration>();

		this.spawnTerminal(cp, configuration, processes.getWindowsShell(), path)
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
			const env = extendObject(extendObject({}, process.env), envVars);

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

	private spawnTerminal(spawner, configuration: ITerminalConfiguration, command: string, path?: string): TPromise<void> {
		let terminalConfig = configuration.terminal.external;
		let exec = terminalConfig.windowsExec || DEFAULT_TERMINAL_WINDOWS;
		// The '""' argument is the window title. Without this, exec doesn't work when the path
		// contains spaces
		let cmdArgs = ['/c', 'start', '/wait', '""', exec];

		// Make the drive letter uppercase on Windows (see #9448)
		if (path && path[1] === ':') {
			path = path[0].toUpperCase() + path.substr(1);
		}

		return new TPromise<void>((c, e) => {
			let env = path ? { cwd: path } : void 0;
			let child = spawner.spawn(command, cmdArgs, env);
			child.on('error', e);
			child.on('exit', () => c(null));
		});
	}
}

export class MacTerminalService implements ITerminalService {
	public _serviceBrand: any;

	private static OSASCRIPT = '/usr/bin/osascript';	// osascript is the AppleScript interpreter on OS X

	constructor(
		@IConfigurationService private _configurationService: IConfigurationService
	) { }

	public openTerminal(path?: string): void {
		const configuration = this._configurationService.getConfiguration<ITerminalConfiguration>();

		this.spawnTerminal(cp, configuration, path).done(null, errors.onUnexpectedError);
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

	private spawnTerminal(spawner, configuration: ITerminalConfiguration, path?: string): TPromise<void> {
		let terminalConfig = configuration.terminal.external;
		let terminalApp = terminalConfig.osxExec || DEFAULT_TERMINAL_OSX;

		return new TPromise<void>((c, e) => {
			let child = spawner.spawn('/usr/bin/open', ['-a', terminalApp, path]);
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


	public openTerminal(path?: string): void {
		const configuration = this._configurationService.getConfiguration<ITerminalConfiguration>();

		this.spawnTerminal(cp, configuration, path)
			.done(null, errors.onUnexpectedError);
	}

	public runInTerminal(title: string, dir: string, args: string[], envVars: IProcessEnvironment): TPromise<void> {

		const configuration = this._configurationService.getConfiguration<ITerminalConfiguration>();
		const terminalConfig = configuration.terminal.external;
		const exec = terminalConfig.linuxExec || DEFAULT_TERMINAL_LINUX;

		return new TPromise<void>((c, e) => {

			let termArgs: string[] = [];
			//termArgs.push('--title');
			//termArgs.push(`"${TERMINAL_TITLE}"`);
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
			const env = extendObject(extendObject({}, process.env), envVars);

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
	}

	private spawnTerminal(spawner, configuration: ITerminalConfiguration, path?: string): TPromise<void> {
		let terminalConfig = configuration.terminal.external;
		let exec = terminalConfig.linuxExec || DEFAULT_TERMINAL_LINUX;
		let env = path ? { cwd: path } : void 0;

		return new TPromise<void>((c, e) => {
			const child = spawner.spawn(exec, [], env);
			child.on('error', e);
			child.on('exit', () => c(null));
		});
	}
}

function extendObject<T>(objectCopy: T, object: T): T {

	for (let key in object) {
		if (object.hasOwnProperty(key)) {
			objectCopy[key] = object[key];
		}
	}

	return objectCopy;
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
