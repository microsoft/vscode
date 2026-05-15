/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import ansiColors from 'ansi-colors';
import * as cp from 'child_process';
import es from 'event-stream';
import fancyLog from 'fancy-log';
import * as path from 'path';

const root = path.dirname(path.dirname(import.meta.dirname));
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
const timestampRegex = /^\[\d{2}:\d{2}:\d{2}\]\s*/;

// Matches `file(line,col): error TSxxxx: message` lines emitted by tsgo with `--pretty false`.
const errorLineRegex = /^(.+?)\((\d+),(\d+)\):\s*error\s+(\w+):\s*(.+)$/;

export interface ITsgoError {
	readonly file?: string;
	readonly line?: number;
	readonly column?: number;
	readonly code?: string;
	readonly message: string;
}

export interface ITsgoConfig {
	readonly taskName: string;
	readonly noEmit?: boolean;
	/** Invoked once per completed run with the parsed error list (empty on success). */
	readonly onResult?: (result: { readonly errors: readonly ITsgoError[] }) => void;
}

export function spawnTsgo(projectPath: string, config: ITsgoConfig, onComplete?: () => Promise<void> | void): Promise<void> {
	function runReporter(output: string) {
		const lines = (output || '').split('\n');
		const errors: ITsgoError[] = [];
		for (const line of lines) {
			const m = errorLineRegex.exec(line);
			if (!m) {
				continue;
			}
			errors.push({
				file: m[1],
				line: Number(m[2]),
				column: Number(m[3]),
				code: m[4],
				message: m[5],
			});
		}
		fancyLog(`Finished ${ansiColors.green(config.taskName)} ${projectPath} with ${errors.length} errors.`);
		for (const line of lines.filter(l => /error \w+:/.test(l))) {
			fancyLog(line);
		}
		config.onResult?.({ errors });
	}

	const args = ['tsgo', '--project', projectPath, '--pretty', 'false', '--incremental'];
	if (config.noEmit) {
		args.push('--noEmit');
	} else {
		args.push('--sourceMap', '--inlineSources');
	}
	const child = cp.spawn(npx, args, {
		cwd: root,
		stdio: ['ignore', 'pipe', 'pipe'],
		shell: true
	});

	let stdoutData = '';
	let stderrData = '';

	child.stdout?.on('data', (data: Buffer) => {
		stdoutData += data.toString();
	});
	child.stderr?.on('data', (data: Buffer) => {
		stderrData += data.toString();
	});

	return new Promise<void>((resolve, reject) => {
		child.on('exit', code => {
			const allOutput = stdoutData + '\n' + stderrData;
			const lines = allOutput
				.split(/\r?\n/)
				.map(line => line.replace(ansiRegex, '').trim())
				.map(line => line.replace(timestampRegex, ''))
				.filter(line => line.length > 0)
				.filter(line => !/Starting compilation|File change detected|Compilation complete/i.test(line));

			runReporter(lines.join('\n'));

			if (code === 0) {
				Promise.resolve(onComplete?.()).then(() => resolve(), reject);
			} else {
				reject(new Error(`tsgo exited with code ${code ?? 'unknown'}`));
			}
		});

		child.on('error', err => {
			reject(err);
		});
	});
}

export function createTsgoStream(projectPath: string, config: ITsgoConfig, onComplete?: () => Promise<void> | void): NodeJS.ReadWriteStream {
	const stream = es.through();

	spawnTsgo(projectPath, config, onComplete).then(() => {
		stream.emit('end');
	}).catch(err => {
		stream.emit('error', err);
	});

	return stream;
}
