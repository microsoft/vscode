/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { spawn, exec } from 'child_process';
import { basename } from 'path';

export interface ProcessItem {
	name: string;
	cmd: string;
	pid: string;
	children?: ProcessItem[];
}

export function listProcesses(rootPid: number): Promise<ProcessItem> {

	return new Promise((resolve, reject) => {

		const NODE = new RegExp('^(?:node|iojs|gulp)$', 'i');

		if (process.platform === 'win32') {

			const CMD_PID = new RegExp('^(.+) ([0-9]+)$');
			const EXECUTABLE_ARGS = new RegExp('^(?:"([^"]+)"|([^ ]+))(?: (.+))?$');

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
					const items: ProcessItem[] = [];

					const lines = stdout.split('\r\n');
					for (const line of lines) {
						const matches = CMD_PID.exec(line.trim());
						if (matches && matches.length === 3) {

							let cmd = matches[1].trim();
							const pid = matches[2];

							// remove leading device specifier
							if (cmd.indexOf('\\??\\') === 0) {
								cmd = cmd.replace('\\??\\', '');
							}

							let executable_path: string | undefined;
							const matches2 = EXECUTABLE_ARGS.exec(cmd);
							if (matches2 && matches2.length >= 2) {
								if (matches2.length >= 3) {
									executable_path = matches2[1] || matches2[2];
								} else {
									executable_path = matches2[1];
								}
							}

							if (executable_path) {

								let executable_name = basename(executable_path);
								executable_name = executable_name.split('.')[0];
								if (!NODE.test(executable_name)) {
									continue;
								}

								items.push({
									name: executable_name,
									cmd,
									pid
								});
							}
						}
					}

					resolve(items[0]); // TODO build proper structure
				}
			});

			cmd.stdin.write('wmic process get ProcessId,CommandLine \n');
			cmd.stdin.end();

		} else {	// OS X & Linux

			const PID_CMD = new RegExp('^\\s*([0-9]+)\\s+([0-9]+)\\s+(.+)$');
			// const MAC_APPS = new RegExp('^.*/(.*).(?:app|bundle)/Contents/.*$');
			const TYPE = new RegExp('--type=([a-zA-Z-]+)');
			const RENDERER_PROCESS_HINT = new RegExp('--disable-blink-features=Auxclick');

			exec('ps -ax -o pid=,ppid=,command=', { maxBuffer: 1000 * 1024 }, (err, stdout, stderr) => {

				if (err || stderr) {
					reject(err || stderr.toString());
				} else {
					const map = new Map<string, ProcessItem>();

					let rootItem: ProcessItem;

					const lines = stdout.toString().split('\n');
					for (const line of lines) {

						let matches = PID_CMD.exec(line);
						if (matches && matches.length === 4) {

							const pid = matches[1];
							const ppid = matches[2];
							const cmd = matches[3];

							const parent = map.get(ppid);

							if (pid === String(rootPid) || parent) {

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
									} else if (matches[1] === 'gpu-process') {
										name = 'gpu-process';
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
									pid
								};

								if (pid === String(rootPid)) {
									rootItem = item;
								}

								if (parent) {
									if (!parent.children) {
										parent.children = [];
									}
									parent.children.push(item);
								}

								map.set(pid, item);
							}
						}
					}

					const items: ProcessItem[] = [];
					walk(items, rootItem);
					resolve(rootItem);
				}
			});
		}
	});
}

function walk(items: ProcessItem[], root: ProcessItem) {
	items.push(root);
	if (root.children) {
		root.children.sort((a, b) => parseInt(a.pid) - parseInt(b.pid)).forEach(item => walk(items, item));
	}
}