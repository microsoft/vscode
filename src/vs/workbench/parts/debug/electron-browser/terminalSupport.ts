/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as platform from 'vs/base/common/platform';
import * as cp from 'child_process';
import { IDisposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { ITerminalService, ITerminalInstance } from 'vs/workbench/parts/terminal/common/terminal';
import { ITerminalService as IExternalTerminalService } from 'vs/workbench/parts/execution/common/execution';
import { ITerminalLauncher, ITerminalSettings } from 'vs/workbench/parts/debug/common/debug';

const enum ShellType { cmd, powershell, bash }

export class TerminalLauncher implements ITerminalLauncher {

	private integratedTerminalInstance: ITerminalInstance;
	private terminalDisposedListener: IDisposable;

	constructor(
		@ITerminalService private terminalService: ITerminalService,
		@IExternalTerminalService private nativeTerminalService: IExternalTerminalService
	) {
	}

	runInTerminal(args: DebugProtocol.RunInTerminalRequestArguments, config: ITerminalSettings): TPromise<void> {

		if (args.kind === 'external') {
			return this.nativeTerminalService.runInTerminal(args.title, args.cwd, args.args, args.env || {});
		}

		if (!this.terminalDisposedListener) {
			// React on terminal disposed and check if that is the debug terminal #12956
			this.terminalDisposedListener = this.terminalService.onInstanceDisposed(terminal => {
				if (this.integratedTerminalInstance && this.integratedTerminalInstance.id === terminal.id) {
					this.integratedTerminalInstance = null;
				}
			});
		}

		let t = this.integratedTerminalInstance;
		if ((t && this.isBusy(t)) || !t) {
			t = this.terminalService.createInstance({ name: args.title || nls.localize('debug.terminal.title', "debuggee") });
			this.integratedTerminalInstance = t;
		}
		this.terminalService.setActiveInstance(t);
		this.terminalService.showPanel(true);

		const command = this.prepareCommand(args, config);

		return new TPromise((resolve, error) => {
			setTimeout(_ => {
				t.sendText(command, true);
				resolve(void 0);
			}, 500);
		});
	}

	private isBusy(t: ITerminalInstance): boolean {
		if (t.processId) {
			try {
				// if shell has at least one child process, assume that shell is busy
				if (platform.isWindows) {
					const result = cp.spawnSync('wmic', ['process', 'get', 'ParentProcessId']);
					if (result.stdout) {
						const pids = result.stdout.toString().split('\r\n');
						if (!pids.some(p => parseInt(p) === t.processId)) {
							return false;
						}
					}
				} else {
					const result = cp.spawnSync('/usr/bin/pgrep', ['-lP', String(t.processId)]);
					if (result.stdout) {
						const r = result.stdout.toString().trim();
						if (r.length === 0 || r.indexOf(' tmux') >= 0) { // ignore 'tmux'; see #43683
							return false;
						}
					}
				}
			}
			catch (e) {
				// silently ignore
			}
		}
		// fall back to safe side
		return true;
	}

	private prepareCommand(args: DebugProtocol.RunInTerminalRequestArguments, config: ITerminalSettings): string {

		let shellType: ShellType;

		// get the shell configuration for the current platform
		let shell: string;
		const shell_config = config.integrated.shell;
		if (platform.isWindows) {
			shell = shell_config.windows;
			shellType = ShellType.cmd;
		} else if (platform.isLinux) {
			shell = shell_config.linux;
			shellType = ShellType.bash;
		} else if (platform.isMacintosh) {
			shell = shell_config.osx;
			shellType = ShellType.bash;
		}

		// try to determine the shell type
		shell = shell.trim().toLowerCase();
		if (shell.indexOf('powershell') >= 0) {
			shellType = ShellType.powershell;
		} else if (shell.indexOf('cmd.exe') >= 0) {
			shellType = ShellType.cmd;
		} else if (shell.indexOf('bash') >= 0) {
			shellType = ShellType.bash;
		} else if (shell.indexOf('git\\bin\\bash.exe') >= 0) {
			shellType = ShellType.bash;
		}

		let quote: (s: string) => string;
		let command = '';

		switch (shellType) {

			case ShellType.powershell:

				quote = (s: string) => {
					s = s.replace(/\'/g, '\'\'');
					return `'${s}'`;
					//return s.indexOf(' ') >= 0 || s.indexOf('\'') >= 0 || s.indexOf('"') >= 0 ? `'${s}'` : s;
				};

				if (args.cwd) {
					command += `cd '${args.cwd}'; `;
				}
				if (args.env) {
					for (let key in args.env) {
						const value = args.env[key];
						if (value === null) {
							command += `Remove-Item env:${key}; `;
						} else {
							command += `\${env:${key}}='${value}'; `;
						}
					}
				}
				if (args.args && args.args.length > 0) {
					const cmd = quote(args.args.shift());
					command += (cmd[0] === '\'') ? `& ${cmd} ` : `${cmd} `;
					for (let a of args.args) {
						command += `${quote(a)} `;
					}
				}
				break;

			case ShellType.cmd:

				quote = (s: string) => {
					s = s.replace(/\"/g, '""');
					return (s.indexOf(' ') >= 0 || s.indexOf('"') >= 0) ? `"${s}"` : s;
				};

				if (args.cwd) {
					command += `cd ${quote(args.cwd)} && `;
				}
				if (args.env) {
					command += 'cmd /C "';
					for (let key in args.env) {
						const value = args.env[key];
						if (value === null) {
							command += `set "${key}=" && `;
						} else {
							command += `set "${key}=${args.env[key]}" && `;
						}
					}
				}
				for (let a of args.args) {
					command += `${quote(a)} `;
				}
				if (args.env) {
					command += '"';
				}
				break;

			case ShellType.bash:

				quote = (s: string) => {
					s = s.replace(/\"/g, '\\"');
					return (s.indexOf(' ') >= 0 || s.indexOf('\\') >= 0) ? `"${s}"` : s;
				};

				if (args.cwd) {
					command += `cd ${quote(args.cwd)} ; `;
				}
				if (args.env) {
					command += 'env';
					for (let key in args.env) {
						const value = args.env[key];
						if (value === null) {
							command += ` -u "${key}"`;
						} else {
							command += ` "${key}=${value}"`;
						}
					}
					command += ' ';
				}
				for (let a of args.args) {
					command += `${quote(a)} `;
				}
				break;
		}

		return command;
	}
}
