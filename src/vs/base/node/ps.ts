/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { exec } from 'child_process';
import { promises as fs, readFileSync } from 'fs';
import { totalmem } from 'os';
import { ProcessItem } from '../common/processes.js';
import { parse } from '../common/path.js';
import { isLinux, isMacintosh, isWindows } from '../common/platform.js';

const BATCH_SIZE = 200;

export const JS_FILENAME_PATTERN = /[a-zA-Z-]+\.js\b/g;

export function listProcesses(rootPid: number): Promise<ProcessItem> {
	return new Promise((resolve, reject) => {
		let rootItem: ProcessItem | undefined;
		const map = new Map<number, ProcessItem>();
		const totalMemory = totalmem();

		function addToTree(pid: number, ppid: number, cmd: string, load: number, mem: number) {
			const parent = map.get(ppid);
			if (pid === rootPid || parent) {
				const item: ProcessItem = {
					name: findName(cmd),
					cmd,
					pid,
					ppid,
					load,
					mem: isWindows ? mem : (totalMemory * (mem / 100))
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
			const WINDOWS_CRASH_REPORTER = /--crashes-directory/i;
			const CONPTY = /conhost\.exe.+--headless/i;
			const TYPE = /--type=([a-zA-Z-]+)/;

			// find windows crash reporter
			if (WINDOWS_CRASH_REPORTER.exec(cmd)) {
				return 'electron-crash-reporter';
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

			if (cmd.indexOf('node ') < 0 && cmd.indexOf('node.exe') < 0) {
				let result = ''; // find all xyz.js
				do {
					matches = JS_FILENAME_PATTERN.exec(cmd);
					if (matches) {
						result += matches + ' ';
					}
				} while (matches);

				if (result) {
					return `electron-nodejs (${result.trim()})`;
				}
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
		}

		// OS X & Linux
		else {
			if (isLinux) {
				readProcessesFromProc(addToTree).then(() => {
					if (!rootItem) {
						reject(new Error(`Root process ${rootPid} not found`));
						return;
					}

					// Snapshot CPU times, wait briefly, then snapshot again to
					// compute interval-based CPU usage instead of lifetime averages.
					const pids = [...map.keys()];
					const totalBefore = readTotalCpuTime();
					const processBefore = new Map<number, number>();
					for (const pid of pids) {
						processBefore.set(pid, readProcessCpuTime(pid));
					}

					setTimeout(() => {
						try {
							const totalAfter = readTotalCpuTime();
							const totalDelta = totalAfter - totalBefore;
							if (totalDelta > 0) {
								for (const pid of pids) {
									const processInfo = map.get(pid);
									if (processInfo) {
										const before = processBefore.get(pid) ?? 0;
										const after = readProcessCpuTime(pid);
										const delta = Math.max(0, after - before);
										processInfo.load = Math.round((100 * delta) / totalDelta);
									}
								}
							}
						} catch {
							// If /proc reads fail, keep the values from readProcessesFromProc
						}
						resolve(rootItem!);
					}, 500);
				}, reject);
			} else {
				exec('which ps', {}, (err, stdout, stderr) => {
					if (err || stderr) {
						reject(err || new Error(stderr.toString()));
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

								if (!rootItem) {
									reject(new Error(`Root process ${rootPid} not found`));
								} else {
									resolve(rootItem);
								}
							}
						});
					}
				});
			}
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

async function readProcessesFromProc(addToTree: (pid: number, ppid: number, cmd: string, load: number, mem: number) => void): Promise<void> {
	const totalMemKB = readTotalMemoryKB();
	const entries = (await fs.readdir('/proc')).filter(e => /^\d+$/.test(e)).sort((a, b) => parseInt(a) - parseInt(b));

	for (let i = 0; i < entries.length; i += BATCH_SIZE) {
		if (i > 0) {
			await yieldToEventLoop();
		}
		const batch = entries.slice(i, i + BATCH_SIZE);
		for (const entry of batch) {
			try {
				const stat = readFileSync(`/proc/${entry}/stat`, 'utf8');
				const closeParen = stat.lastIndexOf(')');
				const fields = stat.substring(closeParen + 2).split(' ');
				const pid = parseInt(entry);
				const ppid = parseInt(fields[1]);

				let pmem = 0;
				try {
					const status = readFileSync(`/proc/${entry}/status`, 'utf8');
					const rssMatch = status.match(/VmRSS:\s+(?<kb>\d+)/);
					if (rssMatch?.groups) {
						pmem = (100 * parseInt(rssMatch.groups.kb)) / totalMemKB;
					}
				} catch {
					// Process may have exited
				}

				let cmd = '';
				try {
					cmd = readFileSync(`/proc/${entry}/cmdline`, 'utf8').replace(/\0/g, ' ').trim();
				} catch {
					// Process may have exited
				}

				addToTree(pid, ppid, cmd, 0, pmem);
			} catch {
				// Process may have exited
			}
		}
	}
}

function yieldToEventLoop(): Promise<void> {
	return new Promise(resolve => setImmediate(resolve));
}

function readTotalMemoryKB(): number {
	const meminfo = readFileSync('/proc/meminfo', 'utf8');
	const match = meminfo.match(/MemTotal:\s+(?<kb>\d+)/);
	return match?.groups ? parseInt(match.groups.kb) : 1;
}

function readTotalCpuTime(): number {
	const stat = readFileSync('/proc/stat', 'utf8');
	const firstLine = stat.substring(0, stat.indexOf('\n'));
	// Remove the "cpu " prefix and sum all time values
	const values = firstLine.replace(/^cpu\s+/, '').trim().split(/\s+/);
	let total = 0;
	for (const val of values) {
		total += parseInt(val);
	}
	return total;
}

function readProcessCpuTime(pid: number): number {
	try {
		const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
		// The comm field (field 2) is in parentheses and may contain spaces,
		// so find the last ')' to reliably locate subsequent fields
		const closeParen = stat.lastIndexOf(')');
		const fields = stat.substring(closeParen + 2).split(' ');
		// After ')', fields[0]=state, ..., fields[11]=utime, fields[12]=stime
		return parseInt(fields[11]) + parseInt(fields[12]);
	} catch {
		return 0;
	}
}

/**
 * Check whether a process has child processes, optionally ignoring processes
 * whose executable name is in the provided ignore list.
 */
export function hasChildProcesses(pid: number, ignoreNames?: string[]): Promise<boolean> {
	if (isLinux) {
		return hasChildProcessesFromProc(pid, ignoreNames);
	}

	if (isMacintosh) {
		return hasChildProcessesMacOS(pid, ignoreNames);
	}

	// Windows: use the native module via listProcesses
	return listProcesses(pid).then(item => {
		const children = item.children ?? [];
		if (children.length === 0) {
			return false;
		}
		if (ignoreNames && ignoreNames.length > 0) {
			return children.some(child => !shouldIgnoreProcess(child.cmd, ignoreNames));
		}
		return true;
	});
}

function shouldIgnoreProcess(cmd: string, ignoreNames: string[]): boolean {
	if (!cmd) {
		return false;
	}
	let executable: string;
	if (cmd.startsWith('"')) {
		executable = cmd.substring(1, cmd.indexOf('"', 1));
	} else {
		const spaceIndex = cmd.indexOf(' ');
		executable = spaceIndex === -1 ? cmd : cmd.substring(0, spaceIndex);
	}
	return ignoreNames.includes(parse(executable).name);
}

async function hasChildProcessesFromProc(pid: number, ignoreNames?: string[]): Promise<boolean> {
	let entries: string[];
	try {
		entries = (await fs.readdir('/proc')).filter(e => /^\d+$/.test(e));
	} catch {
		return false;
	}

	const hasIgnoreList = ignoreNames && ignoreNames.length > 0;
	let childCount = 0;
	let singleChildEntry: string | undefined;

	for (let i = 0; i < entries.length; i += BATCH_SIZE) {
		if (i > 0) {
			await yieldToEventLoop();
		}
		const batch = entries.slice(i, i + BATCH_SIZE);
		for (const entry of batch) {
			try {
				const stat = readFileSync(`/proc/${entry}/stat`, 'utf8');
				const closeParen = stat.lastIndexOf(')');
				const fields = stat.substring(closeParen + 2).split(' ');
				if (parseInt(fields[1]) === pid) {
					if (!hasIgnoreList) {
						return true;
					}
					childCount++;
					if (childCount === 1) {
						singleChildEntry = entry;
					} else if (childCount > 1) {
						return true;
					}
				}
			} catch {
				// Process may have exited
			}
		}
	}

	if (childCount === 0) {
		return false;
	}

	// Exactly one child — check if it should be ignored
	let cmd = '';
	if (singleChildEntry) {
		try {
			cmd = readFileSync(`/proc/${singleChildEntry}/cmdline`, 'utf8').replace(/\0/g, ' ').trim();
		} catch {
			// Process may have exited
		}
	}
	return !shouldIgnoreProcess(cmd, ignoreNames!);
}

function hasChildProcessesMacOS(pid: number, ignoreNames?: string[]): Promise<boolean> {
	return new Promise<boolean>(resolve => {
		exec(`pgrep -P ${pid}`, (err, stdout) => {
			if (err || !stdout.trim()) {
				resolve(false);
				return;
			}
			const childPids = stdout.trim().split('\n').map(p => parseInt(p.trim())).filter(p => !isNaN(p));
			if (childPids.length === 0) {
				resolve(false);
				return;
			}
			if (!ignoreNames || ignoreNames.length === 0 || childPids.length > 1) {
				resolve(true);
				return;
			}
			// Single child — check against ignore list
			exec(`ps -p ${childPids[0]} -o command=`, (err, stdout) => {
				if (err || !stdout.trim()) {
					resolve(true);
					return;
				}
				resolve(!shouldIgnoreProcess(stdout.trim(), ignoreNames));
			});
		});
	});
}
