/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { exec } from 'child_process';
import { FileAccess } from 'vs/base/common/network';
import { ProcessItem } from 'vs/base/common/processes';

export function listProcesses(rootPid: number): Promise<ProcessItem> {

	return new Promise((resolve, reject) => {

		let rootItem: ProcessItem | undefined;
		const map = new Map<number, ProcessItem>();


		function addToTree(pid: number, ppid: number, cmd: string, load: number, mem: number) {

			const parent = map.get(ppid);
			if (pid === rootPid || parent) {

				const item: ProcessItem = {
					name: findName(cmd),
					cmd,
					pid,
					ppid,
					load,
					mem
				};
				map.set(pid, item);

				if (pid === rootPid) {
					rootItem = item;
				}

				if (parent) {
					if (!parent.children) {
						parent.children = [];
					}
					parent.children.push(item);
					if (parent.children.length > 1) {
						parent.children = parent.children.sort((a, b) => a.pid - b.pid);
					}
				}
			}
		}

		function findName(cmd: string): string {

			const UTILITY_NETWORK_HINT = /--utility-sub-type=network/i;
			const NODEJS_PROCESS_HINT = /--ms-enable-electron-run-as-node/i;
			const WINDOWS_CRASH_REPORTER = /--crashes-directory/i;
			const WINPTY = /\\pipe\\winpty-control/i;
			const CONPTY = /conhost\.exe.+--headless/i;
			const TYPE = /--type=([a-zA-Z-]+)/;

			// find windows crash reporter
			if (WINDOWS_CRASH_REPORTER.exec(cmd)) {
				return 'electron-crash-reporter';
			}

			// find winpty process
			if (WINPTY.exec(cmd)) {
				return 'winpty-agent';
			}

			// find conpty process
			if (CONPTY.exec(cmd)) {
				return 'conpty-agent';
			}

			// find "--type=xxxx"
			let matches = TYPE.exec(cmd);
			if (matches && matches.length === 2) {
				if (matches[1] === 'renderer') {
					return `window`;
				} else if (matches[1] === 'utility') {
					if (UTILITY_NETWORK_HINT.exec(cmd)) {
						return 'utility-network-service';
					}

					return 'utility-process';
				} else if (matches[1] === 'extensionHost') {
					return 'extension-host'; // normalize remote extension host type
				}
				return matches[1];
			}

			// find all xxxx.js
			const JS = /[a-zA-Z-]+\.js/g;
			let result = '';
			do {
				matches = JS.exec(cmd);
				if (matches) {
					result += matches + ' ';
				}
			} while (matches);

			if (result) {
				if (cmd.indexOf('node ') < 0 && cmd.indexOf('node.exe') < 0) {
					return `electron-nodejs (${result})`;
				}
			}

			// find Electron node.js processes
			if (NODEJS_PROCESS_HINT.exec(cmd)) {
				return `electron-nodejs (${cmd})`;
			}

			return cmd;
		}

		if (process.platform === 'win32') {

			const cleanUNCPrefix = (value: string): string => {
				if (value.indexOf('\\\\?\\') === 0) {
					return value.substring(4);
				} else if (value.indexOf('\\??\\') === 0) {
					return value.substring(4);
				} else if (value.indexOf('"\\\\?\\') === 0) {
					return '"' + value.substring(5);
				} else if (value.indexOf('"\\??\\') === 0) {
					return '"' + value.substring(5);
				} else {
					return value;
				}
			};

			(import('@vscode/windows-process-tree')).then(windowsProcessTree => {
				windowsProcessTree.getProcessList(rootPid, (processList) => {
					if (!processList) {
						reject(new Error(`Root process ${rootPid} not found`));
						return;
					}
					windowsProcessTree.getProcessCpuUsage(processList, (completeProcessList) => {
						const processItems: Map<number, ProcessItem> = new Map();
						completeProcessList.forEach(process => {
							const commandLine = cleanUNCPrefix(process.commandLine || '');
							processItems.set(process.pid, {
								name: findName(commandLine),
								cmd: commandLine,
								pid: process.pid,
								ppid: process.ppid,
								load: process.cpu || 0,
								mem: process.memory || 0
							});
						});

						rootItem = processItems.get(rootPid);
						if (rootItem) {
							processItems.forEach(item => {
								const parent = processItems.get(item.ppid);
								if (parent) {
									if (!parent.children) {
										parent.children = [];
									}
									parent.children.push(item);
								}
							});

							processItems.forEach(item => {
								if (item.children) {
									item.children = item.children.sort((a, b) => a.pid - b.pid);
								}
							});
							resolve(rootItem);
						} else {
							reject(new Error(`Root process ${rootPid} not found`));
						}
					});
				}, windowsProcessTree.ProcessDataFlag.CommandLine | windowsProcessTree.ProcessDataFlag.Memory);
			});
		} else {	// OS X & Linux
			function calculateLinuxCpuUsage() {
				// Flatten rootItem to get a list of all VSCode processes
				let processes = [rootItem];
				const pids: number[] = [];
				while (processes.length) {
					const process = processes.shift();
					if (process) {
						pids.push(process.pid);
						if (process.children) {
							processes = processes.concat(process.children);
						}
					}
				}

				// The cpu usage value reported on Linux is the average over the process lifetime,
				// recalculate the usage over a one second interval
				// JSON.stringify is needed to escape spaces, https://github.com/nodejs/node/issues/6803
				let cmd = JSON.stringify(FileAccess.asFileUri('vs/base/node/cpuUsage.sh').fsPath);
				cmd += ' ' + pids.join(' ');

				exec(cmd, {}, (err, stdout, stderr) => {
					if (err || stderr) {
						reject(err || new Error(stderr.toString()));
					} else {
						const cpuUsage = stdout.toString().split('\n');
						for (let i = 0; i < pids.length; i++) {
							const processInfo = map.get(pids[i])!;
							processInfo.load = parseFloat(cpuUsage[i]);
						}

						if (!rootItem) {
							reject(new Error(`Root process ${rootPid} not found`));
							return;
						}

						resolve(rootItem);
					}
				});
			}

			exec('which ps', {}, (err, stdout, stderr) => {
				if (err || stderr) {
					if (process.platform !== 'linux') {
						reject(err || new Error(stderr.toString()));
					} else {
						const cmd = JSON.stringify(FileAccess.asFileUri('vs/base/node/ps.sh').fsPath);
						exec(cmd, {}, (err, stdout, stderr) => {
							if (err || stderr) {
								reject(err || new Error(stderr.toString()));
							} else {
								parsePsOutput(stdout, addToTree);
								calculateLinuxCpuUsage();
							}
						});
					}
				} else {
					const ps = stdout.toString().trim();
					const args = '-ax -o pid=,ppid=,pcpu=,pmem=,command=';

					// Set numeric locale to ensure '.' is used as the decimal separator
					exec(`${ps} ${args}`, { maxBuffer: 1000 * 1024, env: { LC_NUMERIC: 'en_US.UTF-8' } }, (err, stdout, stderr) => {
						// Silently ignoring the screen size is bogus error. See https://github.com/microsoft/vscode/issues/98590
						if (err || (stderr && !stderr.includes('screen size is bogus'))) {
							reject(err || new Error(stderr.toString()));
						} else {
							parsePsOutput(stdout, addToTree);

							if (process.platform === 'linux') {
								calculateLinuxCpuUsage();
							} else {
								if (!rootItem) {
									reject(new Error(`Root process ${rootPid} not found`));
								} else {
									resolve(rootItem);
								}
							}
						}
					});
				}
			});
		}
	});
}

function parsePsOutput(stdout: string, addToTree: (pid: number, ppid: number, cmd: string, load: number, mem: number) => void): void {
	const PID_CMD = /^\s*([0-9]+)\s+([0-9]+)\s+([0-9]+\.[0-9]+)\s+([0-9]+\.[0-9]+)\s+(.+)$/;
	const lines = stdout.toString().split('\n');
	for (const line of lines) {
		const matches = PID_CMD.exec(line.trim());
		if (matches && matches.length === 6) {
			addToTree(parseInt(matches[1]), parseInt(matches[2]), matches[5], parseFloat(matches[3]), parseFloat(matches[4]));
		}
	}
}
