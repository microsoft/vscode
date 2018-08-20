/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';

export class ProcessTreeNode {
	children?: ProcessTreeNode[];

	constructor(public pid: number, public ppid: number, public command: string, public args: string) {
	}
}

export async function getProcessTree(rootPid: number): Promise<ProcessTreeNode | undefined> {

	const map = new Map<number, ProcessTreeNode>();

	map.set(0, new ProcessTreeNode(0, 0, '???', ''));

	try {
		await getProcesses((pid: number, ppid: number, command: string, args: string) => {
			if (pid !== ppid) {
				map.set(pid, new ProcessTreeNode(pid, ppid, command, args));
			}
		});
	} catch (err) {
		return undefined;
	}

	const values = map.values();
	for (const p of values) {
		const parent = map.get(p.ppid);
		if (parent && parent !== p) {
			if (!parent.children) {
				parent.children = [];
			}
			parent.children.push(p);
		}
	}

	if (!isNaN(rootPid) && rootPid > 0) {
		return map.get(rootPid);
	}
	return map.get(0);
}

export function getProcesses(one: (pid: number, ppid: number, command: string, args: string, date?: number) => void): Promise<void> {

	// returns a function that aggregates chunks of data until one or more complete lines are received and passes them to a callback.
	function lines(callback: (a: string) => void) {
		let unfinished = '';	// unfinished last line of chunk
		return (data: string | Buffer) => {
			const lines = data.toString().split(/\r?\n/);
			const finishedLines = lines.slice(0, lines.length - 1);
			finishedLines[0] = unfinished + finishedLines[0]; // complete previous unfinished line
			unfinished = lines[lines.length - 1]; // remember unfinished last line of this chunk for next round
			for (const s of finishedLines) {
				callback(s);
			}
		};
	}

	return new Promise((resolve, reject) => {

		let proc: ChildProcess;

		if (process.platform === 'win32') {

			// attributes columns are in alphabetic order!
			const CMD_PAT = /^(.*)\s+([0-9]+)\.[0-9]+[+-][0-9]+\s+([0-9]+)\s+([0-9]+)$/;

			const wmic = join(process.env['WINDIR'] || 'C:\\Windows', 'System32', 'wbem', 'WMIC.exe');
			proc = spawn(wmic, ['process', 'get', 'CommandLine,CreationDate,ParentProcessId,ProcessId']);
			proc.stdout.setEncoding('utf8');
			proc.stdout.on('data', lines(line => {
				let matches = CMD_PAT.exec(line.trim());
				if (matches && matches.length === 5) {
					const pid = Number(matches[4]);
					const ppid = Number(matches[3]);
					const date = Number(matches[2]);
					let args = matches[1].trim();
					if (!isNaN(pid) && !isNaN(ppid) && args) {
						let command = args;
						if (args[0] === '"') {
							const end = args.indexOf('"', 1);
							if (end > 0) {
								command = args.substr(1, end - 1);
								args = args.substr(end + 2);
							}
						} else {
							const end = args.indexOf(' ');
							if (end > 0) {
								command = args.substr(0, end);
								args = args.substr(end + 1);
							} else {
								args = '';
							}
						}
						one(pid, ppid, command, args, date);
					}
				}
			}));

		} else if (process.platform === 'darwin') {	// OS X

			proc = spawn('/bin/ps', ['-x', '-o', `pid,ppid,comm=${'a'.repeat(256)},command`]);
			proc.stdout.setEncoding('utf8');
			proc.stdout.on('data', lines(line => {

				const pid = Number(line.substr(0, 5));
				const ppid = Number(line.substr(6, 5));
				const command = line.substr(12, 256).trim();
				const args = line.substr(269 + command.length);

				if (!isNaN(pid) && !isNaN(ppid)) {
					one(pid, ppid, command, args);
				}
			}));

		} else {	// linux

			proc = spawn('/bin/ps', ['-ax', '-o', 'pid,ppid,comm:20,command']);
			proc.stdout.setEncoding('utf8');
			proc.stdout.on('data', lines(line => {

				const pid = Number(line.substr(0, 5));
				const ppid = Number(line.substr(6, 5));
				let command = line.substr(12, 20).trim();
				let args = line.substr(33);

				let pos = args.indexOf(command);
				if (pos >= 0) {
					pos = pos + command.length;
					while (pos < args.length) {
						if (args[pos] === ' ') {
							break;
						}
						pos++;
					}
					command = args.substr(0, pos);
					args = args.substr(pos + 1);
				}

				if (!isNaN(pid) && !isNaN(ppid)) {
					one(pid, ppid, command, args);
				}
			}));
		}

		proc.on('error', err => {
			reject(err);
		});

		proc.stderr.setEncoding('utf8');
		proc.stderr.on('data', data => {
			reject(new Error(data.toString()));
		});

		proc.on('close', (code, signal) => {
			if (code === 0) {
				resolve();
			} else if (code > 0) {
				reject(new Error(`process terminated with exit code: ${code}`));
			}
			if (signal) {
				reject(new Error(`process terminated with signal: ${signal}`));
			}
		});

		proc.on('exit', (code, signal) => {
			if (code === 0) {
				//resolve();
			} else if (code > 0) {
				reject(new Error(`process terminated with exit code: ${code}`));
			}
			if (signal) {
				reject(new Error(`process terminated with signal: ${signal}`));
			}
		});
	});
}

