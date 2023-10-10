/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { FileAccess } from 'vs/base/common/network';
import * as path from 'vs/base/common/path';
import * as env from 'vs/base/common/platform';
import { sanitizeProcessEnvironment } from 'vs/base/common/processes';
import * as pfs from 'vs/base/node/pfs';
import * as processes from 'vs/base/node/processes';
import * as nls from 'vs/nls';
import { DEFAULT_TERMINAL_OSX, IExternalTerminalService, IExternalTerminalSettings, ITerminalForPlatform } from 'vs/platform/externalTerminal/common/externalTerminal';
import { ITerminalEnvironment } from 'vs/platform/terminal/common/terminal';

const TERMINAL_TITLE = nls.localize('console.title', "VS Code Console");

abstract class ExternalTerminalService {
	public _serviceBrand: undefined;

	async getDefaultTerminalForPlatforms(): Promise<ITerminalForPlatform> {
		return {
			windows: WindowsExternalTerminalService.getDefaultTerminalWindows(),
			linux: await LinuxExternalTerminalService.getDefaultTerminalLinuxReady(),
			osx: 'xterm'
		};
	}
}

export class WindowsExternalTerminalService extends ExternalTerminalService implements IExternalTerminalService {
	private static readonly CMD = 'cmd.exe';
	private static _DEFAULT_TERMINAL_WINDOWS: string;

	public openTerminal(configuration: IExternalTerminalSettings, cwd?: string): Promise<void> {
		return this.spawnTerminal(cp, configuration, processes.getWindowsShell(), cwd);
	}

	public spawnTerminal(spawner: typeof cp, configuration: IExternalTerminalSettings, command: string, cwd?: string): Promise<void> {
		const exec = configuration.windowsExec || WindowsExternalTerminalService.getDefaultTerminalWindows();

		// Make the drive letter uppercase on Windows (see #9448)
		if (cwd && cwd[1] === ':') {
			cwd = cwd[0].toUpperCase() + cwd.substr(1);
		}

		// cmder ignores the environment cwd and instead opts to always open in %USERPROFILE%
		// unless otherwise specified
		const basename = path.basename(exec, '.exe').toLowerCase();
		if (basename === 'cmder') {
			spawner.spawn(exec, cwd ? [cwd] : undefined);
			return Promise.resolve(undefined);
		}

		const cmdArgs = ['/c', 'start', '/wait'];
		if (exec.indexOf(' ') >= 0) {
			// The "" argument is the window title. Without this, exec doesn't work when the path
			// contains spaces
			cmdArgs.push('""');
		}
		cmdArgs.push(exec);
		// Add starting directory parameter for Windows Terminal (see #90734)
		if (basename === 'wt') {
			cmdArgs.push('-d .');
		}

		return new Promise<void>((c, e) => {
			const env = getSanitizedEnvironment(process);
			const child = spawner.spawn(command, cmdArgs, { cwd, env });
			child.on('error', e);
			child.on('exit', () => c());
		});
	}

	public runInTerminal(title: string, dir: string, args: string[], envVars: ITerminalEnvironment, settings: IExternalTerminalSettings): Promise<number | undefined> {
		const exec = 'windowsExec' in settings && settings.windowsExec ? settings.windowsExec : WindowsExternalTerminalService.getDefaultTerminalWindows();

		return new Promise<number | undefined>((resolve, reject) => {

			const title = `"${dir} - ${TERMINAL_TITLE}"`;
			const command = `""${args.join('" "')}" & pause"`; // use '|' to only pause on non-zero exit code


			// merge environment variables into a copy of the process.env
			const env = Object.assign({}, getSanitizedEnvironment(process), envVars);

			// delete environment variables that have a null value
			Object.keys(env).filter(v => env[v] === null).forEach(key => delete env[key]);

			const options: any = {
				cwd: dir,
				env: env,
				windowsVerbatimArguments: true
			};

			let spawnExec: string;
			let cmdArgs: string[];

			if (path.basename(exec, '.exe') === 'wt') {
				// Handle Windows Terminal specially; -d to set the cwd and run a cmd.exe instance
				// inside it
				spawnExec = exec;
				cmdArgs = ['-d', '.', WindowsExternalTerminalService.CMD, '/c', command];
			} else {
				spawnExec = WindowsExternalTerminalService.CMD;
				cmdArgs = ['/c', 'start', title, '/wait', exec, '/c', command];
			}

			const cmd = cp.spawn(spawnExec, cmdArgs, options);

			cmd.on('error', err => {
				reject(improveError(err));
			});

			resolve(undefined);
		});
	}

	public static getDefaultTerminalWindows(): string {
		if (!WindowsExternalTerminalService._DEFAULT_TERMINAL_WINDOWS) {
			const isWoW64 = !!process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
			WindowsExternalTerminalService._DEFAULT_TERMINAL_WINDOWS = `${process.env.windir ? process.env.windir : 'C:\\Windows'}\\${isWoW64 ? 'Sysnative' : 'System32'}\\cmd.exe`;
		}
		return WindowsExternalTerminalService._DEFAULT_TERMINAL_WINDOWS;
	}
}

export class MacExternalTerminalService extends ExternalTerminalService implements IExternalTerminalService {
	private static readonly OSASCRIPT = '/usr/bin/osascript';	// osascript is the AppleScript interpreter on OS X

	public openTerminal(configuration: IExternalTerminalSettings, cwd?: string): Promise<void> {
		return this.spawnTerminal(cp, configuration, cwd);
	}

	public runInTerminal(title: string, dir: string, args: string[], envVars: ITerminalEnvironment, settings: IExternalTerminalSettings): Promise<number | undefined> {

		const terminalApp = settings.osxExec || DEFAULT_TERMINAL_OSX;

		return new Promise<number | undefined>((resolve, reject) => {

			if (terminalApp === DEFAULT_TERMINAL_OSX || terminalApp === 'iTerm.app') {

				// On OS X we launch an AppleScript that creates (or reuses) a Terminal window
				// and then launches the program inside that window.

				const script = terminalApp === DEFAULT_TERMINAL_OSX ? 'TerminalHelper' : 'iTermHelper';
				const scriptpath = FileAccess.asFileUri(`vs/workbench/contrib/externalTerminal/node/${script}.scpt`).fsPath;

				const osaArgs = [
					scriptpath,
					'-t', title || TERMINAL_TITLE,
					'-w', dir,
				];

				for (const a of args) {
					osaArgs.push('-a');
					osaArgs.push(a);
				}

				if (envVars) {
					// merge environment variables into a copy of the process.env
					const env = Object.assign({}, getSanitizedEnvironment(process), envVars);

					for (const key in env) {
						const value = env[key];
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
				const osa = cp.spawn(MacExternalTerminalService.OSASCRIPT, osaArgs);
				osa.on('error', err => {
					reject(improveError(err));
				});
				osa.stderr.on('data', (data) => {
					stderr += data.toString();
				});
				osa.on('exit', (code: number) => {
					if (code === 0) {	// OK
						resolve(undefined);
					} else {
						if (stderr) {
							const lines = stderr.split('\n', 1);
							reject(new Error(lines[0]));
						} else {
							reject(new Error(nls.localize('mac.terminal.script.failed', "Script '{0}' failed with exit code {1}", script, code)));
						}
					}
				});
			} else {
				reject(new Error(nls.localize('mac.terminal.type.not.supported', "'{0}' not supported", terminalApp)));
			}
		});
	}

	spawnTerminal(spawner: typeof cp, configuration: IExternalTerminalSettings, cwd?: string): Promise<void> {
		const terminalApp = configuration.osxExec || DEFAULT_TERMINAL_OSX;

		return new Promise<void>((c, e) => {
			const args = ['-a', terminalApp];
			if (cwd) {
				args.push(cwd);
			}
			const env = getSanitizedEnvironment(process);
			const child = spawner.spawn('/usr/bin/open', args, { cwd, env });
			child.on('error', e);
			child.on('exit', () => c());
		});
	}
}

export class LinuxExternalTerminalService extends ExternalTerminalService implements IExternalTerminalService {

	private static readonly WAIT_MESSAGE = nls.localize('press.any.key', "Press any key to continue...");

	public openTerminal(configuration: IExternalTerminalSettings, cwd?: string): Promise<void> {
		return this.spawnTerminal(cp, configuration, cwd);
	}

	public runInTerminal(title: string, dir: string, args: string[], envVars: ITerminalEnvironment, settings: IExternalTerminalSettings): Promise<number | undefined> {

		const execPromise = settings.linuxExec ? Promise.resolve(settings.linuxExec) : LinuxExternalTerminalService.getDefaultTerminalLinuxReady();

		return new Promise<number | undefined>((resolve, reject) => {

			const termArgs: string[] = [];
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

				const bashCommand = `${quote(args)}; echo; read -p "${LinuxExternalTerminalService.WAIT_MESSAGE}" -n1;`;
				termArgs.push(`''${bashCommand}''`);	// wrapping argument in two sets of ' because node is so "friendly" that it removes one set...


				// merge environment variables into a copy of the process.env
				const env = Object.assign({}, getSanitizedEnvironment(process), envVars);

				// delete environment variables that have a null value
				Object.keys(env).filter(v => env[v] === null).forEach(key => delete env[key]);

				const options: any = {
					cwd: dir,
					env: env
				};

				let stderr = '';
				const cmd = cp.spawn(exec, termArgs, options);
				cmd.on('error', err => {
					reject(improveError(err));
				});
				cmd.stderr.on('data', (data) => {
					stderr += data.toString();
				});
				cmd.on('exit', (code: number) => {
					if (code === 0) {	// OK
						resolve(undefined);
					} else {
						if (stderr) {
							const lines = stderr.split('\n', 1);
							reject(new Error(lines[0]));
						} else {
							reject(new Error(nls.localize('linux.term.failed', "'{0}' failed with exit code {1}", exec, code)));
						}
					}
				});
			});
		});
	}

	private static _DEFAULT_TERMINAL_LINUX_READY: Promise<string>;

	public static async getDefaultTerminalLinuxReady(): Promise<string> {
		if (!LinuxExternalTerminalService._DEFAULT_TERMINAL_LINUX_READY) {
			if (!env.isLinux) {
				LinuxExternalTerminalService._DEFAULT_TERMINAL_LINUX_READY = Promise.resolve('xterm');
			} else {
				const isDebian = await pfs.Promises.exists('/etc/debian_version');
				LinuxExternalTerminalService._DEFAULT_TERMINAL_LINUX_READY = new Promise<string>(r => {
					if (isDebian) {
						r('x-terminal-emulator');
					} else if (process.env.DESKTOP_SESSION === 'gnome' || process.env.DESKTOP_SESSION === 'gnome-classic') {
						r('gnome-terminal');
					} else if (process.env.DESKTOP_SESSION === 'kde-plasma') {
						r('konsole');
					} else if (process.env.COLORTERM) {
						r(process.env.COLORTERM);
					} else if (process.env.TERM) {
						r(process.env.TERM);
					} else {
						r('xterm');
					}
				});
			}
		}
		return LinuxExternalTerminalService._DEFAULT_TERMINAL_LINUX_READY;
	}

	spawnTerminal(spawner: typeof cp, configuration: IExternalTerminalSettings, cwd?: string): Promise<void> {
		const execPromise = configuration.linuxExec ? Promise.resolve(configuration.linuxExec) : LinuxExternalTerminalService.getDefaultTerminalLinuxReady();

		return new Promise<void>((c, e) => {
			execPromise.then(exec => {
				const env = getSanitizedEnvironment(process);
				const child = spawner.spawn(exec, [], { cwd, env });
				child.on('error', e);
				child.on('exit', () => c());
			});
		});
	}
}

function getSanitizedEnvironment(process: NodeJS.Process) {
	const env = { ...process.env };
	sanitizeProcessEnvironment(env);
	return env;
}

/**
 * tries to turn OS errors into more meaningful error messages
 */
function improveError(err: Error & { errno?: string; path?: string }): Error {
	if ('errno' in err && err['errno'] === 'ENOENT' && 'path' in err && typeof err['path'] === 'string') {
		return new Error(nls.localize('ext.term.app.not.found', "can't find terminal application '{0}'", err['path']));
	}
	return err;
}

/**
 * Quote args if necessary and combine into a space separated string.
 */
function quote(args: string[]): string {
	let r = '';
	for (const a of args) {
		if (a.indexOf(' ') >= 0) {
			r += '"' + a + '"';
		} else {
			r += a;
		}
		r += ' ';
	}
	return r;
}
