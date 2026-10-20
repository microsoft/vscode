/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import { access, mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from '../../common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

// The compile-cache APIs are not available in the Electron renderer test runtime.
(process.versions.electron ? suite.skip : suite)('Node compile cache readiness', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let cache: typeof import('../../node/nodeCompileCache.js');
	let root: string;
	let previousRoot: string | undefined;

	setup(async () => {
		cache = await import('../../node/nodeCompileCache.js');
		const buildDirectory = join(process.cwd(), '.build');
		await mkdir(buildDirectory, { recursive: true });
		root = await mkdtemp(join(buildDirectory, 'node-compile-cache-'));
		previousRoot = process.env['VSCODE_NODE_COMPILE_CACHE_ROOT'];
		process.env['VSCODE_NODE_COMPILE_CACHE_ROOT'] = root;
	});

	teardown(async () => {
		if (previousRoot === undefined) {
			delete process.env['VSCODE_NODE_COMPILE_CACHE_ROOT'];
		} else {
			process.env['VSCODE_NODE_COMPILE_CACHE_ROOT'] = previousRoot;
		}
		await rm(root, { recursive: true, force: true });
	});

	async function markReady(kind: typeof cache.nodeCompileCacheKinds[number]): Promise<void> {
		await mkdir(join(root, kind), { recursive: true });
		await writeFile(join(root, kind, '.ready'), '');
	}

	test('completes when all process markers already exist', async () => {
		await Promise.all(cache.nodeCompileCacheKinds.map(kind => markReady(kind)));
		await cache.waitForNodeCompileCacheReady();
	});

	test('waits for a missing process marker', async () => {
		const lastKind = cache.nodeCompileCacheKinds.at(-1)!;
		await Promise.all(cache.nodeCompileCacheKinds.filter(kind => kind !== lastKind).map(kind => markReady(kind)));
		let completed = false;
		const pending = cache.waitForNodeCompileCacheReady().then(() => { completed = true; });
		await new Promise<void>(resolve => setImmediate(resolve));
		const completedBeforeLastMarker = completed;
		try {
			await markReady(lastKind);
			await pending;
			assert.deepStrictEqual({ completedBeforeLastMarker, completed }, { completedBeforeLastMarker: false, completed: true });
		} finally {
			await markReady(lastKind);
			await pending;
		}
	});

	suite('exit request', () => {
		const processWithPort = process as unknown as { parentPort?: { on(event: 'message', listener: (e: { data: unknown }) => void): void; postMessage(message: unknown): void } };
		const environmentKeys = ['VSCODE_GENERATE_NODE_COMPILE_CACHE', 'VSCODE_NODE_COMPILE_CACHE_KIND', 'VSCODE_NODE_COMPILE_CACHE_MEASUREMENTS'];
		let previousEnvironment: (string | undefined)[];
		let previousExit: typeof process.exit;
		let listeners: ((e: { data: unknown }) => void)[];
		let exitCodes: (string | number | null | undefined)[];
		let posted: unknown[];

		setup(async () => {
			previousEnvironment = environmentKeys.map(key => process.env[key]);
			for (const key of environmentKeys) {
				delete process.env[key];
			}
			process.env['VSCODE_NODE_COMPILE_CACHE_KIND'] = 'shared-process';
			await mkdir(join(root, 'shared-process'), { recursive: true });
			listeners = [];
			exitCodes = [];
			posted = [];
			processWithPort.parentPort = { on: (_event, listener) => listeners.push(listener), postMessage: message => posted.push(message) };
			previousExit = process.exit;
			process.exit = (code => { exitCodes.push(code); }) as typeof process.exit;
		});

		teardown(() => {
			process.exit = previousExit;
			delete processWithPort.parentPort;
			environmentKeys.forEach((key, index) => {
				if (previousEnvironment[index] === undefined) {
					delete process.env[key];
				} else {
					process.env[key] = previousEnvironment[index];
				}
			});
		});

		test('a process outside cache generation neither writes a marker nor handles the exit request', async () => {
			cache.markNodeCompileCacheReady();
			assert.deepStrictEqual({
				isGenerating: cache.isGeneratingNodeCompileCache(),
				listeners: listeners.length,
				posted,
				marker: await exists(join(root, 'shared-process', '.ready')),
			}, { isGenerating: false, listeners: 0, posted: [], marker: false });
		});

		test('a cache generator announces and exits on the exit request only', async () => {
			process.env['VSCODE_GENERATE_NODE_COMPILE_CACHE'] = '1';
			cache.markNodeCompileCacheReady();
			listeners.forEach(listener => listener({ data: 'some other message' }));
			const exitsBeforeRequest = exitCodes.length;
			listeners.forEach(listener => listener({ data: cache.nodeCompileCacheExitRequest }));
			assert.deepStrictEqual({
				isGenerating: cache.isGeneratingNodeCompileCache(),
				listeners: listeners.length,
				posted,
				marker: await exists(join(root, 'shared-process', '.ready')),
				exitsBeforeRequest,
				exitCodes,
			}, { isGenerating: true, listeners: 1, posted: [cache.nodeCompileCacheExitRequestHandled], marker: true, exitsBeforeRequest: 0, exitCodes: [0] });
		});
	});

	suite('exitNodeCompileCacheProcess', () => {

		class FakeProcess extends EventEmitter {
			readonly posted: unknown[] = [];
			killed = false;
			constructor(private readonly exitOnRequest: boolean) {
				super();
			}
			postMessage(message: unknown): void {
				this.posted.push(message);
				if (this.exitOnRequest && message === cache.nodeCompileCacheExitRequest) {
					setImmediate(() => this.emit('exit'));
				}
			}
			kill(): boolean {
				this.killed = true;
				return true;
			}
		}

		test('asks a process that handles the request to exit and waits for it', async () => {
			const child = new FakeProcess(true);
			await cache.exitNodeCompileCacheProcess(child, true, 60_000);
			assert.deepStrictEqual({ posted: child.posted, killed: child.killed, listeners: child.listenerCount('message') }, { posted: [cache.nodeCompileCacheExitRequest], killed: false, listeners: 0 });
		});

		test('asks a process to exit once it announces that it handles the request', async () => {
			const child = new FakeProcess(true);
			const exited = cache.exitNodeCompileCacheProcess(child, false, 60_000);
			const postedBeforeAnnouncement = [...child.posted];
			child.emit('message', cache.nodeCompileCacheExitRequestHandled);
			await exited;
			assert.deepStrictEqual({ postedBeforeAnnouncement, posted: child.posted, killed: child.killed }, { postedBeforeAnnouncement: [], posted: [cache.nodeCompileCacheExitRequest], killed: false });
		});

		test('kills a process that does not exit in time', async () => {
			const child = new FakeProcess(false);
			await cache.exitNodeCompileCacheProcess(child, true, 1);
			assert.deepStrictEqual({ posted: child.posted, killed: child.killed, listeners: child.listenerCount('message') }, { posted: [cache.nodeCompileCacheExitRequest], killed: true, listeners: 0 });
		});
	});
});

async function exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}
