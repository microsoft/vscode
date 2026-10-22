/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, suite, test } from 'node:test';
import { createTsgoStream, spawnTsgo } from '../tsgo.ts';

suite('tsgo', () => {
	let projectDir: string;
	let tsconfigPath: string;

	beforeEach(() => {
		projectDir = realpathSync(mkdtempSync(join(tmpdir(), 'tsgo-test-')));
		tsconfigPath = join(projectDir, 'tsconfig.json');
		writeFileSync(tsconfigPath, JSON.stringify({
			compilerOptions: {
				target: 'ES2022',
				module: 'NodeNext',
				moduleResolution: 'NodeNext',
				skipLibCheck: true,
			},
			files: ['index.ts'],
		}));
		writeFileSync(join(projectDir, 'index.ts'), 'export const answer = 42;\n');
	});

	afterEach(() => {
		rmSync(projectDir, { recursive: true, force: true });
	});

	test('spawnTsgo resolves after successful compilation when onComplete is omitted', async () => {
		await spawnTsgo(tsconfigPath, { taskName: 'test-tsgo-no-cb', noEmit: true });
	});

	test('spawnTsgo resolves after successful completion callback', async () => {
		let completed = false;
		await spawnTsgo(tsconfigPath, { taskName: 'test-tsgo-success', noEmit: true }, () => {
			completed = true;
		});
		assert.strictEqual(completed, true);
	});

	test('spawnTsgo resolves after successful async completion callback', async () => {
		let completed = false;
		await spawnTsgo(tsconfigPath, { taskName: 'test-tsgo-async-success', noEmit: true }, async () => {
			completed = true;
		});
		assert.strictEqual(completed, true);
	});

	test('spawnTsgo rejects when completion callback throws synchronously', async () => {
		await assert.rejects(
			spawnTsgo(tsconfigPath, { taskName: 'test-tsgo-sync-throw', noEmit: true }, () => {
				throw new Error('sync completion callback failure');
			}),
			/sync completion callback failure/
		);
	});

	test('spawnTsgo rejects when completion callback rejects asynchronously', async () => {
		await assert.rejects(
			spawnTsgo(tsconfigPath, { taskName: 'test-tsgo-async-reject', noEmit: true }, () => {
				return Promise.reject(new Error('async completion callback rejection'));
			}),
			/async completion callback rejection/
		);
	});

	test('createTsgoStream emits error when completion callback throws synchronously', async () => {
		const stream = createTsgoStream(tsconfigPath, { taskName: 'test-tsgo-stream-sync-throw', noEmit: true }, () => {
			throw new Error('sync completion stream failure');
		});

		const error = await new Promise<Error>((resolve, reject) => {
			stream.on('error', resolve);
			stream.on('end', () => reject(new Error('expected stream error, received end')));
		});

		assert.match(error.message, /sync completion stream failure/);
	});

	test('createTsgoStream emits end on successful completion', async () => {
		let completed = false;
		const stream = createTsgoStream(tsconfigPath, { taskName: 'test-tsgo-stream-success', noEmit: true }, () => {
			completed = true;
		});

		await new Promise<void>((resolve, reject) => {
			stream.on('end', resolve);
			stream.on('error', reject);
		});

		assert.strictEqual(completed, true);
	});
});
