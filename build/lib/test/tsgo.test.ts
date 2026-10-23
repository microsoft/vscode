/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, before, suite, test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { createTsgoStream, spawnTsgo } from '../tsgo.ts';

suite('tsgo completion callbacks', () => {
	let root: string;
	let project: string;

	before(async () => {
		root = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-tsgo-completion-'));
		project = path.join(root, 'tsconfig.json');
		await fs.writeFile(project, JSON.stringify({
			compilerOptions: { types: [], target: 'es2024' },
			files: ['entry.ts'],
		}));
		await fs.writeFile(path.join(root, 'entry.ts'), 'export const value = 1;');
	});

	after(async () => {
		await fs.rm(root, { recursive: true, force: true });
	});

	test('rejects a synchronous completion exception', async () => {
		const failure = new Error('completion failed');
		await assert.rejects(spawnTsgo(project, { taskName: 'test', noEmit: true }, () => {
			throw failure;
		}), error => error === failure);
	});

	test('rejects an asynchronous completion failure', async () => {
		const failure = new Error('completion failed');
		await assert.rejects(spawnTsgo(project, { taskName: 'test', noEmit: true }, () => Promise.reject(failure)), error => error === failure);
	});

	test('waits for asynchronous completion', async () => {
		const started = Promise.withResolvers<void>();
		const completion = Promise.withResolvers<void>();
		let settled = false;
		const build = spawnTsgo(project, { taskName: 'test', noEmit: true }, () => {
			started.resolve();
			return completion.promise;
		}).then(() => { settled = true; });
		await started.promise;
		await setImmediate();
		try {
			assert.equal(settled, false);
		} finally {
			completion.resolve();
		}
		await build;
		assert.equal(settled, true);
	});

	test('succeeds without a completion callback', async () => {
		await spawnTsgo(project, { taskName: 'test', noEmit: true });
	});

	test('reports a synchronous completion exception through the stream', async () => {
		const failure = new Error('completion failed');
		const stream = createTsgoStream(project, { taskName: 'test', noEmit: true }, () => {
			throw failure;
		});
		const error = await new Promise<Error>((resolve, reject) => {
			stream.once('end', () => reject(new Error('Expected a stream error')));
			stream.once('error', resolve);
		});
		assert.equal(error, failure);
	});
});
