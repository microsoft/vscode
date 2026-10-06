/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ContainerRequest, MxcProcess } from '@microsoft/mxc-sdk/v1';
import { readFile } from 'fs/promises';
import type { Readable, Writable } from 'stream';
import { fileURLToPath } from 'node:url';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';

/** Streams an MXC workload through the terminal without interpreting its sandbox policy. */
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
		process.on('SIGINT', kill);
		process.on('SIGTERM', kill);
		store.add(toDisposable(() => {
			process.off('SIGINT', kill);
			process.off('SIGTERM', kill);
		}));
		const stdin = sandbox.standardInput;
		const stdout = sandbox.standardOutput;
		const stderr = sandbox.standardError;
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
		const result = await sandbox.wait();
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
