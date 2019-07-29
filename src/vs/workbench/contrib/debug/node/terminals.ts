/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as env from 'vs/base/common/platform';
import { getSystemShell } from 'vs/workbench/contrib/terminal/node/terminal';
import { WindowsExternalTerminalService, MacExternalTerminalService, LinuxExternalTerminalService } from 'vs/workbench/contrib/externalTerminal/node/externalTerminalService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IExternalTerminalService } from 'vs/workbench/contrib/externalTerminal/common/externalTerminal';
import { ExtHostConfigProvider } from 'vs/workbench/api/common/extHostConfiguration';

let externalTerminalService: IExternalTerminalService | undefined = undefined;

export function runInExternalTerminal(args: DebugProtocol.RunInTerminalRequestArguments, configProvider: ExtHostConfigProvider): void {
	if (!externalTerminalService) {
		if (env.isWindows) {
			externalTerminalService = new WindowsExternalTerminalService(<IConfigurationService><unknown>undefined);
		} else if (env.isMacintosh) {
			externalTerminalService = new MacExternalTerminalService(<IConfigurationService><unknown>undefined);
		} else if (env.isLinux) {
			externalTerminalService = new LinuxExternalTerminalService(<IConfigurationService><unknown>undefined);
		}
	}
	if (externalTerminalService) {
		const config = configProvider.getConfiguration('terminal');
		externalTerminalService.runInTerminal(args.title!, args.cwd, args.args, args.env || {}, config.external || {});
	}
}

export function hasChildProcesses(processId: number): boolean {
	if (processId) {
		try {
			// if shell has at least one child process, assume that shell is busy
			if (env.isWindows) {
				const result = cp.spawnSync('wmic', ['process', 'get', 'ParentProcessId']);
				if (result.stdout) {
					const pids = result.stdout.toString().split('\r\n');
					if (!pids.some(p => parseInt(p) === processId)) {
						return false;
					}
				}
			} else {
				const result = cp.spawnSync('/usr/bin/pgrep', ['-lP', String(processId)]);
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

const enum ShellType { cmd, powershell, bash }

export function prepareCommand(args: DebugProtocol.RunInTerminalRequestArguments, shell: string, configProvider: ExtHostConfigProvider): string {

	let shellType = env.isWindows ? ShellType.cmd : ShellType.bash;	// pick a good default

	if (shell) {

		const config = configProvider.getConfiguration('terminal');

		// get the shell configuration for the current platform
		const shell_config = config.integrated.shell;
		if (env.isWindows) {
			shell = shell_config.windows || getSystemShell(env.Platform.Windows);
		} else if (env.isLinux) {
			shell = shell_config.linux || getSystemShell(env.Platform.Linux);
		} else if (env.isMacintosh) {
			shell = shell_config.osx || getSystemShell(env.Platform.Mac);
		} else {
			throw new Error('Unknown platform');
		}
	}

	// try to determine the shell type
	shell = shell.trim().toLowerCase();
	if (shell.indexOf('powershell') >= 0 || shell.indexOf('pwsh') >= 0) {
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
				if (s.length > 0 && s.charAt(s.length - 1) === '\\') {
					return `'${s}\\'`;
				}
				return `'${s}'`;
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
				const cmd = quote(args.args.shift()!);
				command += (cmd[0] === '\'') ? `& ${cmd} ` : `${cmd} `;
				for (let a of args.args) {
					command += `${quote(a)} `;
				}
			}
			break;

		case ShellType.cmd:

			quote = (s: string) => {
				s = s.replace(/\"/g, '""');
				return (s.indexOf(' ') >= 0 || s.indexOf('"') >= 0 || s.length === 0) ? `"${s}"` : s;
			};

			if (args.cwd) {
				command += `cd ${quote(args.cwd)} && `;
			}
			if (args.env) {
				command += 'cmd /C "';
				for (let key in args.env) {
					let value = args.env[key];
					if (value === null) {
						command += `set "${key}=" && `;
					} else {
						value = value.replace(/[\^\&]/g, s => `^${s}`);
						command += `set "${key}=${value}" && `;
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
				s = s.replace(/([\"\\])/g, '\\$1');
				return (s.indexOf(' ') >= 0 || s.length === 0) ? `"${s}"` : s;
			};

			const hardQuote = (s: string) => {
				return /[^\w@%\/+=,.:^-]/.test(s) ? `'${s.replace(/'/g, '\'\\\'\'')}'` : s;
			};

			if (args.cwd) {
				command += `cd ${quote(args.cwd)} ; `;
			}
			if (args.env) {
				command += 'env';
				for (let key in args.env) {
					const value = args.env[key];
					if (value === null) {
						command += ` -u ${hardQuote(key)}`;
					} else {
						command += ` ${hardQuote(`${key}=${value}`)}`;
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
