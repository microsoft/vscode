/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as childProcess from 'child_process';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { FileAccess } from '../../../../../base/common/network.js';
import * as path from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileQuery, QueryType } from '../../common/search.js';
import { FileWalker } from '../../node/fileSearch.js';

const TEST_FIXTURES = path.normalize(FileAccess.asFileUri('vs/workbench/services/search/test/node/fixtures').fsPath);
const TEST_FOLDER_QUERY = { folder: URI.file(TEST_FIXTURES) };
const TEST_QUERY: IFileQuery = {
	type: QueryType.File,
	folderQueries: [TEST_FOLDER_QUERY]
};

suite('FileWalker', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('cancelling one walker does not cancel another walker', async () => {
		const startWalker = () => {
			const spawned = new DeferredPromise<childProcess.ChildProcess>();
			const completed = new DeferredPromise<void>();
			const walker = new FileWalker(TEST_QUERY, async () => {
				const cmd = childProcess.spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
				spawned.complete(cmd);
				return {
					cmd,
					rgDiskPath: process.execPath,
					siblingClauses: {},
					rgArgs: { args: [], siblingClauses: {} },
					cwd: TEST_FIXTURES
				};
			});
			walker.walk([TEST_FOLDER_QUERY], [], undefined, () => { }, () => { }, () => completed.complete());
			return { walker, spawned: spawned.p, completed: completed.p };
		};

		const first = startWalker();
		const second = startWalker();
		const [firstProcess, secondProcess] = await Promise.all([first.spawned, second.spawned]);

		try {
			first.walker.cancel();
			await first.completed;

			assert.deepStrictEqual({
				firstProcessKilled: firstProcess.killed,
				secondProcessKilled: secondProcess.killed
			}, {
				firstProcessKilled: true,
				secondProcessKilled: false
			});
		} finally {
			if (!firstProcess.killed) {
				firstProcess.kill();
			}
			second.walker.cancel();
			await second.completed;
		}
	});

	test('cancelling while ripgrep is resolving kills the spawned process', async () => {
		const allowSpawn = new DeferredPromise<void>();
		const spawned = new DeferredPromise<childProcess.ChildProcess>();
		const completed = new DeferredPromise<void>();
		const walker = new FileWalker(TEST_QUERY, async () => {
			await allowSpawn.p;
			const cmd = childProcess.spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
			spawned.complete(cmd);
			return {
				cmd,
				rgDiskPath: process.execPath,
				siblingClauses: {},
				rgArgs: { args: [], siblingClauses: {} },
				cwd: TEST_FIXTURES
			};
		});
		walker.walk([TEST_FOLDER_QUERY], [], undefined, () => { }, () => { }, () => completed.complete());

		walker.cancel();
		allowSpawn.complete();
		const spawnedProcess = await spawned.p;

		try {
			await completed.p;
			assert.strictEqual(spawnedProcess.killed, true);
		} finally {
			if (!spawnedProcess.killed) {
				spawnedProcess.kill();
			}
		}
	});

	test('cancelling while a missing ripgrep executable is resolving handles the spawn error', async () => {
		const allowSpawn = new DeferredPromise<void>();
		const completed = new DeferredPromise<void>();
		const walker = new FileWalker(TEST_QUERY, async () => {
			await allowSpawn.p;
			const cmd = childProcess.spawn(path.join(TEST_FIXTURES, 'missing-ripgrep'));
			return {
				cmd,
				rgDiskPath: process.execPath,
				siblingClauses: {},
				rgArgs: { args: [], siblingClauses: {} },
				cwd: TEST_FIXTURES
			};
		});
		walker.walk([TEST_FOLDER_QUERY], [], undefined, () => { }, () => { }, () => completed.complete());

		walker.cancel();
		allowSpawn.complete();

		await completed.p;
	});
});
