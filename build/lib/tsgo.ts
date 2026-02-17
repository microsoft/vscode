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

export function spawnTsgo(projectPath: string, config: { taskName: string; noEmit?: boolean }, onComplete?: () => Promise<void> | void): Promise<void> {
	function runReporter(stdError: string) {
		const matches = (stdError || '').match(/error \w+: (.+)?/g);
		fancyLog(`Finished ${ansiColors.green(config.taskName)} ${projectPath} with ${matches ? matches.length : 0} errors.`);
		for (const match of matches || []) {
			fancyLog.error(match);
		}
	}

	const args = ['tsgo', '--project', projectPath, '--pretty', 'false'];
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

	const handleData = (data: Buffer) => {
		const lines = data.toString()
			.split(/\r?\n/)
			.map(line => line.replace(ansiRegex, '').trim())
			.filter(line => line.length > 0)
			.filter(line => !/Starting compilation|File change detected|Compilation complete/i.test(line));

		runReporter(lines.join('\n'));
	};

	child.stdout?.on('data', handleData);
	child.stderr?.on('data', handleData);

	return new Promise<void>((resolve, reject) => {
		child.on('exit', code => {
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

export function createTsgoStream(projectPath: string, config: { taskName: string; noEmit?: boolean }, onComplete?: () => Promise<void> | void): NodeJS.ReadWriteStream {
	const stream = es.through();

	spawnTsgo(projectPath, config, onComplete).then(() => {
		stream.emit('end');
	}).catch(err => {
		stream.emit('error', err);
	});

	return stream;
}
