/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import es from 'event-stream';
import * as path from 'path';
import { createReporter } from './reporter.ts';

const root = path.dirname(path.dirname(import.meta.dirname));
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

export function spawnTsgo(projectPath: string, config: { reporterId: string }, onComplete?: () => Promise<void> | void): Promise<void> {
	const reporter = createReporter(config.reporterId);
	let report: NodeJS.ReadWriteStream | undefined;

	const beginReport = (emitError: boolean) => {
		if (report) {
			report.end();
		}
		report = reporter.end(emitError);
	};

	const endReport = () => {
		if (!report) {
			return;
		}
		report.end();
		report = undefined;
	};

	beginReport(false);

	const args = ['tsgo', '--project', projectPath, '--pretty', 'false', '--sourceMap', '--inlineSources'];
	const child = cp.spawn(npx, args, {
		cwd: root,
		stdio: ['ignore', 'pipe', 'pipe'],
		shell: true
	});

	let buffer = '';
	const handleLine = (line: string) => {
		const trimmed = line.replace(ansiRegex, '').trim();
		if (!trimmed) {
			return;
		}
		if (/Starting compilation|File change detected/i.test(trimmed)) {
			beginReport(false);
			return;
		}
		if (/Compilation complete/i.test(trimmed)) {
			endReport();
			return;
		}

		const match = /(.*\(\d+,\d+\): )(.*: )(.*)/.exec(trimmed);

		if (match) {
			const fullpath = path.isAbsolute(match[1]) ? match[1] : path.join(root, match[1]);
			const message = match[3];
			reporter(fullpath + message);
		} else {
			reporter(trimmed);
		}
	};

	const handleData = (data: Buffer) => {
		buffer += data.toString('utf8');
		const lines = buffer.split(/\r?\n/);
		buffer = lines.pop() ?? '';
		for (const line of lines) {
			handleLine(line);
		}
	};

	child.stdout?.on('data', handleData);
	child.stderr?.on('data', handleData);

	return new Promise<void>((resolve, reject) => {
		child.on('exit', code => {
			if (buffer.trim()) {
				handleLine(buffer);
				buffer = '';
			}
			endReport();
			if (code === 0) {
				Promise.resolve(onComplete?.()).then(() => resolve(), reject);
			} else {
				reject(new Error(`tsgo exited with code ${code ?? 'unknown'}`));
			}
		});

		child.on('error', err => {
			endReport();
			reject(err);
		});
	});
}

export function createTsgoStream(projectPath: string, config: { reporterId: string }, onComplete?: () => Promise<void> | void): NodeJS.ReadWriteStream {
	const stream = es.through();

	spawnTsgo(projectPath, config, onComplete).then(() => {
		stream.emit('end');
	}).catch(() => {
		// Errors are already reported by spawnTsgo via the reporter.
		// Don't emit 'error' on the stream as that would exit the watch process.
		stream.emit('end');
	});

	return stream;
}
