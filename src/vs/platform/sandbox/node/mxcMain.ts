/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ContainerRequest, MxcProcess } from '@microsoft/mxc-sdk/v1';
import { readFile } from 'fs/promises';
import { finished, type Readable, type Writable } from 'stream';
import { fileURLToPath } from 'url';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';

/** Streams an MXC workload through the terminal, forwards termination signals, and drains output before disposal. */
export async function runWindowsMxc(
	request: ContainerRequest,
	spawn: (request: ContainerRequest) => Promise<Pick<MxcProcess, 'standardInput' | 'standardOutput' | 'standardError' | 'wait' | 'kill' | 'dispose' | 'warnings'>> = async request => (await import('@microsoft/mxc-sdk/v1')).spawn(request),
	input: Readable = process.stdin,
	output: Writable = process.stdout,
	errorOutput: Writable = process.stderr,
): Promise<number> {
	const store = new DisposableStore();
	try {
		const sandbox = store.add(await spawn(request));
		const kill = () => sandbox.kill();
		const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGBREAK'];
		for (const signal of signals) {
			process.on(signal, kill);
			store.add(toDisposable(() => process.off(signal, kill)));
		}
		const stdin = sandbox.standardInput;
		const stdout = sandbox.standardOutput;
		const stderr = sandbox.standardError;
		const outputFinished = [stdout, stderr].map(stream => stream ? new Promise<void>((resolve, reject) => {
			store.add(toDisposable(finished(stream, { readable: true, writable: false }, error => {
				if (error) {
					reject(error);
				} else {
					resolve();
				}
			})));
		}) : undefined);
		if (stdin) {
			input.pipe(stdin);
			store.add(toDisposable(() => input.unpipe(stdin)));
		}
		stdout?.pipe(output, { end: false });
		stderr?.pipe(errorOutput, { end: false });
		store.add(toDisposable(() => {
			stdout?.unpipe(output);
			stderr?.unpipe(errorOutput);
		}));
		const [result] = await Promise.all([sandbox.wait(), Promise.all(outputFinished)]);
		for (const warning of sandbox.warnings) {
			errorOutput.write(`${warning}\n`);
		}
		return result.exitCode;
	} finally {
		store.dispose();
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		const [configPath, binPath] = process.argv.slice(2);
		if (!configPath || !binPath) {
			throw new Error('Expected an MXC request file and native binary directory');
		}
		process.env['MXC_BIN_DIR'] = binPath;
		const request: ContainerRequest = JSON.parse(await readFile(configPath, 'utf8'));
		process.exitCode = await runWindowsMxc(request);
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}
