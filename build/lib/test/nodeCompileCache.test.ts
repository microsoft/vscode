/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'node:test';
import { validateNodeCompileCache, waitForProcessesToExit } from '../nodeCompileCache.ts';

const kinds = ['main', 'extension-host', 'shared-process', 'pty-host', 'agent-host'];
const tag = 'v24.21.0-x64-c3a7e8f2';

suite('validateNodeCompileCache', () => {
	let root: string;

	beforeEach(async () => {
		root = await mkdtemp(path.join(tmpdir(), 'node-compile-cache-test-'));
		for (const kind of kinds) {
			await mkdir(path.join(root, kind, tag), { recursive: true });
			await writeFile(path.join(root, kind, '.ready'), '');
			await writeFile(path.join(root, kind, tag, '80a81d3f'), 'entry');
		}
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	test('removes the temporary file of an interrupted cache write and keeps the entries', async () => {
		await writeFile(path.join(root, 'shared-process', tag, '9ae38d4e.R1g79n'), 'partial');

		const count = await validateNodeCompileCache(root, 'x64');

		assert.deepEqual({ count, sharedProcess: await readdir(path.join(root, 'shared-process', tag)) }, { count: kinds.length, sharedProcess: ['80a81d3f'] });
	});

	test('still rejects other unexpected cache entries', async () => {
		await writeFile(path.join(root, 'pty-host', tag, '80a81d3f.tmp'), '');

		await assert.rejects(validateNodeCompileCache(root, 'x64'), /unexpected pty-host cache entries .*80a81d3f\.tmp/);
	});

	test('still rejects a cache that only has an interrupted write', async () => {
		await rm(path.join(root, 'agent-host', tag, '80a81d3f'));
		await writeFile(path.join(root, 'agent-host', tag, '80a81d3f.Ab12Cd'), 'partial');

		await assert.rejects(validateNodeCompileCache(root, 'x64'), /produced no agent-host cache entries/);
	});
});

suite('waitForProcessesToExit', () => {
	test('waits until no process is running', async () => {
		const reports = [[1, 2], [2], []];
		let calls = 0;
		await waitForProcessesToExit(async () => reports[calls++], 60_000, 1);
		assert.equal(calls, 3);
	});

	test('rejects when processes are still running after the timeout', async () => {
		let calls = 0;
		await assert.rejects(waitForProcessesToExit(async () => { calls++; return [1]; }, 20, 1), /processes 1 are still running after 20ms/);
		assert.ok(calls > 1);
	});

	test('rejects when listing the processes does not answer within the timeout', async () => {
		await assert.rejects(waitForProcessesToExit(() => new Promise(() => { }), 20, 1), /could not list the app's processes within 20ms/);
	});
});
