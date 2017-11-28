/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { spawn, exec } from 'child_process';

export interface ProcessItem {
	name: string;
	cmd: string;
	pid: number;
	ppid: number;

	children?: ProcessItem[];
}

export function listProcesses(rootPid: number): Promise<ProcessItem> {

	return new Promise((resolve, reject) => {

		const RENDERER_PROCESS_HINT = new RegExp('--disable-blink-features=Auxclick');

		let rootItem: ProcessItem;
		const map = new Map<number, ProcessItem>();
		const TYPE = new RegExp('--type=([a-zA-Z-]+)');

		if (process.platform === 'win32') {

			const CMD_PID = new RegExp('^(.+)\\s+([0-9]+)\\s+([0-9]+)$');

			let stdout = '';
			let stderr = '';

			const cmd = spawn('cmd');

			cmd.stdout.on('data', data => {
				stdout += data.toString();
			});
			cmd.stderr.on('data', data => {
				stderr += data.toString();
			});

			cmd.on('exit', () => {

				if (stderr.length > 0) {
					reject(stderr);
				} else {

					const lines = stdout.split('\r\n');
					for (const line of lines) {
						let matches = CMD_PID.exec(line.trim());
						if (matches && matches.length === 4) {

							let cmd = matches[1].trim();
							const ppid = parseInt(matches[2]);
							const pid = parseInt(matches[3]);

							const parent = map.get(ppid);

							if (pid === rootPid || parent) {

								let name = cmd;

								// find "--type=xxxx"
								matches = TYPE.exec(cmd);
								if (matches && matches.length === 2) {
									if (matches[1] === 'renderer') {
										if (!RENDERER_PROCESS_HINT.exec(cmd)) {
											name = 'shared-process';
										} else {
											const rid = /--renderer-client-id=([0-9]+)/;
											matches = rid.exec(cmd);
											if (matches && matches.length === 2) {
												name = `renderer ${matches[1]}`;
											}
										}
									} else {
										name = matches[1];
									}
								} else {
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
										name = `node ${result}`;
									}
								}

								const item = {
									name,
									cmd,
									pid,
									ppid
								};

								if (pid === rootPid) {
									rootItem = item;
								}

								if (parent) {
									if (!parent.children) {
										parent.children = [];
									}
									parent.children.push(item);
									parent.children = parent.children.sort((a, b) => a.pid - b.pid);
								}

								map.set(pid, item);
							}
						}
					}

					resolve(rootItem);
				}
			});

			cmd.stdin.write('wmic process get ProcessId,ParentProcessId,CommandLine \n');
			cmd.stdin.end();

		} else {	// OS X & Linux

			const PID_CMD = new RegExp('^\\s*([0-9]+)\\s+([0-9]+)\\s+(.+)$');

			exec('ps -ax -o pid=,ppid=,command=', { maxBuffer: 1000 * 1024 }, (err, stdout, stderr) => {

				if (err || stderr) {
					reject(err || stderr.toString());
				} else {

					const lines = stdout.toString().split('\n');
					for (const line of lines) {

						let matches = PID_CMD.exec(line);
						if (matches && matches.length === 4) {

							const pid = parseInt(matches[1]);
							const ppid = parseInt(matches[2]);
							const cmd = matches[3];

							const parent = map.get(ppid);

							if (pid === rootPid || parent) {

								let name = cmd;

								// find "--type=xxxx"
								matches = TYPE.exec(cmd);
								if (matches && matches.length === 2) {
									if (matches[1] === 'renderer') {
										if (!RENDERER_PROCESS_HINT.exec(cmd)) {
											name = 'shared-process';
										} else {
											const rid = /--renderer-client-id=([0-9]+)/;
											matches = rid.exec(cmd);
											if (matches && matches.length === 2) {
												name = `renderer ${matches[1]}`;
											}
										}
									} else {
										name = matches[1];
									}
								} else {
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
										name = `node ${result}`;
									}
								}

								const item = {
									name,
									cmd,
									pid,
									ppid
								};

								if (pid === rootPid) {
									rootItem = item;
								}

								if (parent) {
									if (!parent.children) {
										parent.children = [];
									}
									parent.children.push(item);
									parent.children = parent.children.sort((a, b) => a.pid - b.pid);
								}

								map.set(pid, item);
							}
						}
					}
					resolve(rootItem);
				}
			});
		}
	});
}
