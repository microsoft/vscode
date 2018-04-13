/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as cp from 'child_process';
import * as nls from 'vs/nls';
import * as env from 'vs/base/common/platform';
import * as pfs from 'vs/base/node/pfs';
import { assign } from 'vs/base/common/objects';
import { TPromise } from 'vs/base/common/winjs.base';
import uri from 'vs/base/common/uri';
import { ITerminalLauncher, ITerminalSettings } from 'vs/workbench/parts/debug/common/debug';

const TERMINAL_TITLE = nls.localize('console.title', "VS Code Console");

let terminalLauncher: ITerminalLauncher = undefined;

export function getTerminalLauncher() {
	if (!terminalLauncher) {
		if (env.isWindows) {
			terminalLauncher = new WinTerminalService();
		} else if (env.isMacintosh) {
			terminalLauncher = new MacTerminalService();
		} else if (env.isLinux) {
			terminalLauncher = new LinuxTerminalService();
		}
	}
	return terminalLauncher;
}

let _DEFAULT_TERMINAL_LINUX_READY: TPromise<string> = null;
export function getDefaultTerminalLinuxReady(): TPromise<string> {
	if (!_DEFAULT_TERMINAL_LINUX_READY) {
		_DEFAULT_TERMINAL_LINUX_READY = new TPromise<string>(c => {
			if (env.isLinux) {
				TPromise.join([pfs.exists('/etc/debian_version'), process.lazyEnv]).then(([isDebian]) => {
					if (isDebian) {
						c('x-terminal-emulator');
					} else if (process.env.DESKTOP_SESSION === 'gnome' || process.env.DESKTOP_SESSION === 'gnome-classic') {
						c('gnome-terminal');
					} else if (process.env.DESKTOP_SESSION === 'kde-plasma') {
						c('konsole');
					} else if (process.env.COLORTERM) {
						c(process.env.COLORTERM);
					} else if (process.env.TERM) {
						c(process.env.TERM);
					} else {
						c('xterm');
					}
				});
				return;
			}

			c('xterm');
		}, () => { });
	}
	return _DEFAULT_TERMINAL_LINUX_READY;
}

let _DEFAULT_TERMINAL_WINDOWS: string = null;
export function getDefaultTerminalWindows(): string {
	if (!_DEFAULT_TERMINAL_WINDOWS) {
		const isWoW64 = !!process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
		_DEFAULT_TERMINAL_WINDOWS = `${process.env.windir ? process.env.windir : 'C:'}\\${isWoW64 ? 'Sysnative' : 'System32'}\\cmd.exe`;
	}
	return _DEFAULT_TERMINAL_WINDOWS;
}

abstract class TerminalLauncher implements ITerminalLauncher {
	public runInTerminal(args: DebugProtocol.RunInTerminalRequestArguments, config: ITerminalSettings): TPromise<void> {
		return this.runInTerminal0(args.title, args.cwd, args.args, args.env, config);
	}
	runInTerminal0(title: string, dir: string, args: string[], envVars: env.IProcessEnvironment, config): TPromise<void> {
		return void 0;
	}
}

class WinTerminalService extends TerminalLauncher {

	private static readonly CMD = 'cmd.exe';

	public runInTerminal0(title: string, dir: string, args: string[], envVars: env.IProcessEnvironment, configuration: ITerminalSettings): TPromise<void> {

		const exec = configuration.external.windowsExec || getDefaultTerminalWindows();

		return new TPromise<void>((c, e) => {

			const title = `"${dir} - ${TERMINAL_TITLE}"`;
			const command = `""${args.join('" "')}" & pause"`; // use '|' to only pause on non-zero exit code

			const cmdArgs = [
				'/c', 'start', title, '/wait', exec, '/c', command
			];

			// merge environment variables into a copy of the process.env
			const env = assign({}, process.env, envVars);

			// delete environment variables that have a null value
			Object.keys(env).filter(v => env[v] === null).forEach(key => delete env[key]);

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
}

class MacTerminalService extends TerminalLauncher {

	private static readonly DEFAULT_TERMINAL_OSX = 'Terminal.app';
	private static readonly OSASCRIPT = '/usr/bin/osascript';	// osascript is the AppleScript interpreter on OS X

	public runInTerminal0(title: string, dir: string, args: string[], envVars: env.IProcessEnvironment, configuration: ITerminalSettings): TPromise<void> {

		const terminalApp = configuration.external.osxExec || MacTerminalService.DEFAULT_TERMINAL_OSX;

		return new TPromise<void>((c, e) => {

			if (terminalApp === MacTerminalService.DEFAULT_TERMINAL_OSX || terminalApp === 'iTerm.app') {

				// On OS X we launch an AppleScript that creates (or reuses) a Terminal window
				// and then launches the program inside that window.

				const script = terminalApp === MacTerminalService.DEFAULT_TERMINAL_OSX ? 'TerminalHelper' : 'iTermHelper';
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
						const value = envVars[key];
						if (value === null) {
							osaArgs.push('-u');
							osaArgs.push(key);
						} else {
							osaArgs.push('-e');
							osaArgs.push(`${key}=${value}`);
						}
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
}

class LinuxTerminalService extends TerminalLauncher {

	private static readonly WAIT_MESSAGE = nls.localize('press.any.key', "Press any key to continue...");

	public runInTerminal0(title: string, dir: string, args: string[], envVars: env.IProcessEnvironment, configuration: ITerminalSettings): TPromise<void> {

		const terminalConfig = configuration.external;
		const execPromise = terminalConfig.linuxExec ? TPromise.as(terminalConfig.linuxExec) : getDefaultTerminalLinuxReady();

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

				// delete environment variables that have a null value
				Object.keys(env).filter(v => env[v] === null).forEach(key => delete env[key]);

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
