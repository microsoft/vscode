/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as childProcess from 'child_process';
import { PassThrough } from 'stream';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { FileAccess } from '../../../../../base/common/network.js';
import * as path from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileQuery, IFolderQuery, QueryType } from '../../common/search.js';
import { FileWalker, MAX_PARALLEL_EXISTS_FOLDER_TRAVERSALS } from '../../node/fileSearch.js';

const TEST_FIXTURES = path.normalize(FileAccess.asFileUri('vs/workbench/services/search/test/node/fixtures').fsPath);
const TEST_FOLDER_QUERY = { folder: URI.file(TEST_FIXTURES) };
const TEST_QUERY: IFileQuery = {
	type: QueryType.File,
	folderQueries: [TEST_FOLDER_QUERY]
};

type SpawnRipgrepCmd = NonNullable<ConstructorParameters<typeof FileWalker>[1]>;

class TestRipgrepProcess extends childProcess.ChildProcess implements childProcess.ChildProcessWithoutNullStreams {
	override readonly pid = 1;
	override stdin = new PassThrough();
	override stdout = new PassThrough();
	override stderr = new PassThrough();
	override readonly stdio: childProcess.ChildProcessWithoutNullStreams['stdio'] = [this.stdin, this.stdout, this.stderr, undefined, undefined];
	state: 'running' | 'exited' | 'killed' = 'running';

	constructor(readonly folder: string) {
		super();
	}

	exit(code: number | null, state: 'exited' | 'killed' = 'exited'): void {
		setTimeout(() => {
			if (this.state === 'running') {
				this.state = state;
				this.emit('close', code);
			}
		});
	}

	override kill(): boolean {
		this.exit(null, 'killed');
		return true;
	}
}

class TestRipgrepSpawner {
	readonly processes: TestRipgrepProcess[] = [];
	peakRunning = 0;

	constructor(private readonly onSpawn: (cmd: TestRipgrepProcess) => void = () => { }) { }

	readonly spawn: SpawnRipgrepCmd = async (_config, folderQuery, _includePattern, _excludePattern, _numThreads, _excludeExceptions, token) => {
		if (token?.isCancellationRequested) {
			return undefined;
		}
		const cmd = new TestRipgrepProcess(folderQuery.folder.fsPath);
		this.processes.push(cmd);
		this.peakRunning = Math.max(this.peakRunning, this.processes.filter(spawned => spawned.state === 'running').length);
		this.onSpawn(cmd);
		return { cmd, rgDiskPath: 'rg', siblingClauses: {}, rgArgs: { args: [], siblingClauses: {} }, cwd: folderQuery.folder.fsPath };
	};
}

function createFolderQueries(count: number): IFolderQuery[] {
	return Array.from({ length: count }, (_, index) => ({ folder: URI.file(path.join(TEST_FIXTURES, `folder${index}`)) }));
}

function createExistsQuery(folderQueries: IFolderQuery[]): IFileQuery {
	return { type: QueryType.File, folderQueries, includePattern: { '**/*.marker': true }, exists: true };
}

function walk(walker: FileWalker, folderQueries: IFolderQuery[]): Promise<{ error: string | undefined; isLimitHit: boolean }> {
	return new Promise(resolve => walker.walk(folderQueries, [], undefined, () => { }, () => { }, (error, isLimitHit) => resolve({ error: error?.message, isLimitHit })));
}

suite('FileWalker', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('an exists query launches a bounded batch of processes and stops them when one finds a match', async () => {
		const folderQueries = createFolderQueries(300);
		const spawner = new TestRipgrepSpawner();
		const completed = walk(new FileWalker(createExistsQuery(folderQueries), spawner.spawn), folderQueries);
		await timeout(0);

		const launchedBeforeMatch = spawner.processes.length;
		spawner.processes[0].exit(0);
		const result = await completed;

		assert.deepStrictEqual({ result, launchedBeforeMatch, states: spawner.processes.map(cmd => cmd.state) }, {
			result: { error: undefined, isLimitHit: true },
			launchedBeforeMatch: MAX_PARALLEL_EXISTS_FOLDER_TRAVERSALS,
			states: ['exited', ...Array(MAX_PARALLEL_EXISTS_FOLDER_TRAVERSALS - 1).fill('killed')]
		});
	});

	test('an exists query finds a match in the last folder', async () => {
		const folderQueries = createFolderQueries(20);
		const lastFolder = folderQueries[folderQueries.length - 1].folder.fsPath;
		const spawner = new TestRipgrepSpawner(cmd => cmd.exit(cmd.folder === lastFolder ? 0 : 1));
		const result = await walk(new FileWalker(createExistsQuery(folderQueries), spawner.spawn), folderQueries);

		assert.deepStrictEqual({ result, launched: spawner.processes.length, peakRunning: spawner.peakRunning }, {
			result: { error: undefined, isLimitHit: true },
			launched: 20,
			peakRunning: MAX_PARALLEL_EXISTS_FOLDER_TRAVERSALS
		});
	});

	test('an exists query without a match searches every folder', async () => {
		const folderQueries = createFolderQueries(20);
		const spawner = new TestRipgrepSpawner(cmd => cmd.exit(1));
		const result = await walk(new FileWalker(createExistsQuery(folderQueries), spawner.spawn), folderQueries);

		assert.deepStrictEqual({ result, launched: spawner.processes.length, peakRunning: spawner.peakRunning }, {
			result: { error: undefined, isLimitHit: false },
			launched: 20,
			peakRunning: MAX_PARALLEL_EXISTS_FOLDER_TRAVERSALS
		});
	});

	test('an exists query settles the folders whose process fails to launch', async () => {
		const folderQueries = createFolderQueries(20);
		const spawner = new TestRipgrepSpawner(cmd => cmd.exit(1));
		const walker = new FileWalker(createExistsQuery(folderQueries), async (...args) => {
			if (args[1] === folderQueries[0]) {
				throw new Error('failed to launch');
			}
			return spawner.spawn(...args);
		});
		const result = await walk(walker, folderQueries);

		assert.deepStrictEqual({ result, launched: spawner.processes.length }, {
			result: { error: 'failed to launch', isLimitHit: false },
			launched: 19
		});
	});

	test('cancelling an exists query launches none of its queued folders', async () => {
		const folderQueries = createFolderQueries(300);
		const spawner = new TestRipgrepSpawner();
		const walker = new FileWalker(createExistsQuery(folderQueries), spawner.spawn);
		const completed = walk(walker, folderQueries);
		await timeout(0);

		walker.cancel();
		const result = await completed;

		assert.deepStrictEqual({ result, states: spawner.processes.map(cmd => cmd.state) }, {
			result: { error: undefined, isLimitHit: false },
			states: Array(MAX_PARALLEL_EXISTS_FOLDER_TRAVERSALS).fill('killed')
		});
	});

	test('a match of one exists query does not stop the processes of another query', async () => {
		const folderQueries = createFolderQueries(2);
		const first = new TestRipgrepSpawner();
		const second = new TestRipgrepSpawner();
		const firstCompleted = walk(new FileWalker(createExistsQuery(folderQueries), first.spawn), folderQueries);
		const secondWalker = new FileWalker(createExistsQuery(folderQueries), second.spawn);
		const secondCompleted = walk(secondWalker, folderQueries);
		await timeout(0);

		first.processes[0].exit(0);
		const firstResult = await firstCompleted;
		const secondStates = second.processes.map(cmd => cmd.state);
		secondWalker.cancel();
		await secondCompleted;

		assert.deepStrictEqual({ firstResult, secondStates }, {
			firstResult: { error: undefined, isLimitHit: true },
			secondStates: ['running', 'running']
		});
	});

	test('a file search that is not an exists query searches all folders at once', async () => {
		const folderQueries = createFolderQueries(20);
		const spawner = new TestRipgrepSpawner(cmd => cmd.exit(1));
		const result = await walk(new FileWalker({ type: QueryType.File, folderQueries }, spawner.spawn), folderQueries);

		assert.deepStrictEqual({ result, peakRunning: spawner.peakRunning }, {
			result: { error: undefined, isLimitHit: false },
			peakRunning: 20
		});
	});

	test('cancelling while ripgrep is resolving cancels the token of the spawner', async () => {
		const allowSpawn = new DeferredPromise<void>();
		const spawner = new TestRipgrepSpawner();
		const walker = new FileWalker(TEST_QUERY, async (...args) => {
			await allowSpawn.p;
			return spawner.spawn(...args);
		});
		const completed = walk(walker, [TEST_FOLDER_QUERY]);

		walker.cancel();
		allowSpawn.complete();

		assert.deepStrictEqual({ result: await completed, launched: spawner.processes.length }, {
			result: { error: undefined, isLimitHit: false },
			launched: 0
		});
	});

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
