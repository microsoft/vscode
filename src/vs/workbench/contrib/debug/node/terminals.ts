/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { getDriveLetter } from 'vs/base/common/extpath';
import * as platform from 'vs/base/common/platform';

function spawnAsPromised(command: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		let stdout = '';
		const child = cp.spawn(command, args);
		if (child.pid) {
			child.stdout.on('data', (data: Buffer) => {
				stdout += data.toString();
			});
		}
		child.on('error', err => {
			reject(err);
		});
		child.on('close', code => {
			resolve(stdout);
		});
	});
}

export async function hasChildProcesses(processId: number | undefined): Promise<boolean> {
	if (processId) {

		// if shell has at least one child process, assume that shell is busy
		if (platform.isWindows) {
			const windowsProcessTree = await import('@vscode/windows-process-tree');
			return new Promise<boolean>(resolve => {
				windowsProcessTree.getProcessTree(processId, processTree => {
					resolve(!!processTree && processTree.children.length > 0);
				});
			});
		} else {
			return spawnAsPromised('/usr/bin/pgrep', ['-lP', String(processId)]).then(stdout => {
				const r = stdout.trim();
				if (r.length === 0 || r.indexOf(' tmux') >= 0) { // ignore 'tmux'; see #43683
					return false;
				} else {
					return true;
				}
			}, error => {
				return true;
			});
		}
	}
	// fall back to safe side
	return Promise.resolve(true);
}

const enum ShellType { cmd, powershell, bash }


export function prepareCommand(shell: string, args: string[], argsCanBeInterpretedByShell: boolean, cwd?: string, env?: { [key: string]: string | null }): string {

	shell = shell.trim().toLowerCase();

	// try to determine the shell type
	let shellType;
	if (shell.indexOf('powershell') >= 0 || shell.indexOf('pwsh') >= 0) {
		shellType = ShellType.powershell;
	} else if (shell.indexOf('cmd.exe') >= 0) {
		shellType = ShellType.cmd;
	} else if (shell.indexOf('bash') >= 0) {
		shellType = ShellType.bash;
	} else if (platform.isWindows) {
		shellType = ShellType.cmd; // pick a good default for Windows
	} else {
		shellType = ShellType.bash;	// pick a good default for anything else
	}

	let quote: (s: string) => string;
	// begin command with a space to avoid polluting shell history
	let command = ' ';

	switch (shellType) {

		case ShellType.powershell:

			quote = (s: string) => {
				s = s.replace(/\'/g, '\'\'');
				if (s.length > 0 && s.charAt(s.length - 1) === '\\') {
					return `'${s}\\'`;
				}
				return `'${s}'`;
			};

			if (cwd) {
				const driveLetter = getDriveLetter(cwd);
				if (driveLetter) {
					command += `${driveLetter}:; `;
				}
				command += `cd ${quote(cwd)}; `;
			}
			if (env) {
				for (const key in env) {
					const value = env[key];
					if (value === null) {
						command += `Remove-Item env:${key}; `;
					} else {
						command += `\${env:${key}}='${value}'; `;
					}
				}
			}
			if (args.length > 0) {
				const arg = args.shift()!;
				const cmd = argsCanBeInterpretedByShell ? arg : quote(arg);
				command += (cmd[0] === '\'') ? `& ${cmd} ` : `${cmd} `;
				for (const a of args) {
					command += (a === '<' || a === '>' || argsCanBeInterpretedByShell) ? a : quote(a);
					command += ' ';
				}
			}
			break;

		case ShellType.cmd:

			quote = (s: string) => {
				// Note: Wrapping in cmd /C "..." complicates the escaping.
				// cmd /C "node -e "console.log(process.argv)" """A^>0"""" # prints "A>0"
				// cmd /C "node -e "console.log(process.argv)" "foo^> bar"" # prints foo> bar
				// Outside of the cmd /C, it could be a simple quoting, but here, the ^ is needed too
				s = s.replace(/\"/g, '""');
				s = s.replace(/([><!^&|])/g, '^$1');
				return (' "'.split('').some(char => s.includes(char)) || s.length === 0) ? `"${s}"` : s;
			};

			if (cwd) {
				const driveLetter = getDriveLetter(cwd);
				if (driveLetter) {
					command += `${driveLetter}: && `;
				}
				command += `cd ${quote(cwd)} && `;
			}
			if (env) {
				command += 'cmd /C "';
				for (const key in env) {
					let value = env[key];
					if (value === null) {
						command += `set "${key}=" && `;
					} else {
						value = value.replace(/[&^|<>]/g, s => `^${s}`);
						command += `set "${key}=${value}" && `;
					}
				}
			}
			for (const a of args) {
				command += (a === '<' || a === '>' || argsCanBeInterpretedByShell) ? a : quote(a);
				command += ' ';
			}
			if (env) {
				command += '"';
			}
			break;

		case ShellType.bash: {

			quote = (s: string) => {
				s = s.replace(/(["'\\\$!><#()\[\]*&^| ;{}?`])/g, '\\$1');
				return s.length === 0 ? `""` : s;
			};

			const hardQuote = (s: string) => {
				return /[^\w@%\/+=,.:^-]/.test(s) ? `'${s.replace(/'/g, '\'\\\'\'')}'` : s;
			};

			if (cwd) {
				command += `cd ${quote(cwd)} ; `;
			}
			if (env) {
				command += '/usr/bin/env';
				for (const key in env) {
					const value = env[key];
					if (value === null) {
						command += ` -u ${hardQuote(key)}`;
					} else {
						command += ` ${hardQuote(`${key}=${value}`)}`;
					}
				}
				command += ' ';
			}
			for (const a of args) {
				command += (a === '<' || a === '>' || argsCanBeInterpretedByShell) ? a : quote(a);
				command += ' ';
			}
			break;
		}
	}

	return command;
}
