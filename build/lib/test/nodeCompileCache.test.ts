/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, suite, test } from 'node:test';
import { validateNodeCompileCache } from '../nodeCompileCache.ts';

const kinds = ['main', 'extension-host', 'shared-process', 'pty-host', 'agent-host'];
const tag = `v24.22.1-${process.arch}-7034790f`;

suite('validateNodeCompileCache', () => {
	let root: string;

	beforeEach(async () => {
		root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'node-compile-cache-test-'));
		for (const kind of kinds) {
			const cacheDirectory = path.join(root, kind, tag);
			await fs.promises.mkdir(cacheDirectory, { recursive: true });
			await fs.promises.writeFile(path.join(root, kind, '.ready'), '');
			await fs.promises.writeFile(path.join(cacheDirectory, '6664eb6b'), 'entry');
		}
	});

	afterEach(async () => {
		await fs.promises.rm(root, { recursive: true, force: true });
	});

	test('removes temporary files a process left mid-write when it was stopped', async () => {
		// Node writes each entry to `<entry>.XXXXXX` (uv_fs_mkstemp) and renames it into place.
		const leftover = path.join(root, 'shared-process', tag, '6664eb6b.cqknyl');
		await fs.promises.writeFile(leftover, 'partial');

		const count = await validateNodeCompileCache(root, process.arch);

		assert.deepStrictEqual({ count, leftoverExists: fs.existsSync(leftover), entry: fs.existsSync(path.join(root, 'shared-process', tag, '6664eb6b')) }, { count: kinds.length, leftoverExists: false, entry: true });
	});

	test('still rejects other unexpected cache entries', async () => {
		await fs.promises.writeFile(path.join(root, 'shared-process', tag, 'unexpected.txt'), '');

		await assert.rejects(validateNodeCompileCache(root, process.arch), /unexpected shared-process cache entries in .*: unexpected\.txt\./);
	});
});
