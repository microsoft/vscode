/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileDeleteOptions, IFileWriteOptions } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { AGENT_CLIENT_SCHEME, toAgentClientUri } from '../../common/agentClientUri.js';
import { customizationId, type ClientPluginCustomization, type PluginCustomization } from '../../common/state/sessionState.js';
import { CustomizationType } from '../../common/state/protocol/state.js';
import { AgentPluginManager } from '../../node/agentPluginManager.js';

class TestAgentPluginManager extends AgentPluginManager {
	constructor(
		basePath: URI,
		fileService: FileService,
		logService: NullLogService,
		private readonly _disposables: DisposableStore,
		maxRevisions?: number,
	) {
		super(basePath, fileService, logService, maxRevisions);
	}

	override async syncCustomizations(clientId: string, customizations: ClientPluginCustomization[], progress?: (status: PluginCustomization) => void) {
		const result = await super.syncCustomizations(clientId, customizations, progress);
		for (const item of result) {
			if (item.lease) {
				this._disposables.add(item.lease);
			}
		}
		return result;
	}
}

/**
 * In-memory provider that can simulate a locked (undeletable) resource, like a
 * directory still held by a running session, so eviction fails with an error.
 */
class LockableInMemoryFileSystemProvider extends InMemoryFileSystemProvider {
	readonly lockedPaths = new Set<string>();
	readonly ownerWriteStarted = new DeferredPromise<void>();
	readonly operationLog: string[] = [];
	ownerWriteBarrier: DeferredPromise<void> | undefined;

	override async delete(resource: URI, opts: IFileDeleteOptions): Promise<void> {
		for (const locked of this.lockedPaths) {
			if (resource.path.includes(locked)) {
				throw new Error('EBUSY: resource busy or locked');
			}
		}
		return super.delete(resource, opts);
	}

	override async writeFile(resource: URI, content: Uint8Array, opts: IFileWriteOptions): Promise<void> {
		if (this.ownerWriteBarrier && resource.path.endsWith('/owner.json')) {
			this.ownerWriteStarted.complete();
			await this.ownerWriteBarrier.p;
			this.operationLog.push('owner-write-complete');
		}
		return super.writeFile(resource, content, opts);
	}

	override async mkdir(resource: URI): Promise<void> {
		if (this.ownerWriteBarrier && resource.path.includes('/inmemory-plugins-')) {
			this.operationLog.push('plugin-materialize');
		}
		return super.mkdir(resource);
	}
}

suite('AgentPluginManager', () => {

	const disposables = new DisposableStore();
	let fileService: FileService;
	let provider: LockableInMemoryFileSystemProvider;
	let manager: AgentPluginManager;
	const basePath = URI.from({ scheme: Schemas.inMemory, path: '/userData' });

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		provider = disposables.add(new LockableInMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.inMemory, provider));
		disposables.add(fileService.registerProvider(AGENT_CLIENT_SCHEME, disposables.add(new InMemoryFileSystemProvider())));
		manager = createManager();
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function pluginUri(name: string): string {
		return URI.from({ scheme: Schemas.inMemory, path: `/plugins/${name}` }).toString();
	}

	function createManager(maxRevisions?: number): AgentPluginManager {
		return disposables.add(new TestAgentPluginManager(basePath, fileService, new NullLogService(), disposables, maxRevisions));
	}

	function makeRef(name: string, nonce?: string): ClientPluginCustomization {
		const uri = pluginUri(name);
		return {
			type: CustomizationType.Plugin,
			id: customizationId(uri),
			uri,
			name: `Plugin ${name}`,
			...(nonce !== undefined ? { nonce } : {}),
		};
	}

	async function seedPluginDir(name: string, files: Record<string, string>): Promise<void> {
		const originalUri = URI.from({ scheme: Schemas.inMemory, path: `/plugins/${name}` });
		const agentClientDir = toAgentClientUri(originalUri, 'test-client');
		await fileService.createFolder(agentClientDir);
		for (const [fileName, content] of Object.entries(files)) {
			await fileService.writeFile(URI.joinPath(agentClientDir, fileName), VSBuffer.fromString(content));
		}
	}

	async function readRevisionNames(target: AgentPluginManager = manager): Promise<Set<string>> {
		const root = await fileService.resolve(target.basePath);
		const pluginDirectories = root.children?.filter(child => child.isDirectory) ?? [];
		const revisions = await Promise.all(pluginDirectories.map(plugin => fileService.resolve(plugin.resource)));
		return new Set(revisions.flatMap(plugin => plugin.children?.filter(child => child.isDirectory).map(child => child.name) ?? []));
	}

	// ---- syncCustomizations -------------------------------------------------

	suite('syncCustomizations', () => {

		test('returns loaded status and pluginDir for each synced plugin', async () => {
			await seedPluginDir('alpha', { 'index.js': 'a' });
			await seedPluginDir('beta', { 'index.js': 'b' });

			const results = await manager.syncCustomizations('test-client', [
				makeRef('alpha', 'n1'),
				makeRef('beta', 'n2'),
			]);
			assert.strictEqual(results[0].customization.load?.kind, 'loaded');
			assert.ok(results[0].pluginDir, 'should have pluginDir');
			assert.strictEqual(results[1].customization.load?.kind, 'loaded');
			assert.ok(results[1].pluginDir, 'should have pluginDir');
		});

		test('returns error status without pluginDir when source missing', async () => {
			const results = await manager.syncCustomizations('test-client', [makeRef('nonexistent')]);

			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0].customization.load?.kind, 'error');
			assert.ok(results[0].customization.load?.kind === 'error' && results[0].customization.load.message);
			assert.strictEqual(results[0].pluginDir, undefined);
		});

		test('mixes loaded and error results', async () => {
			await seedPluginDir('good', { 'index.js': 'ok' });

			const results = await manager.syncCustomizations('test-client', [
				makeRef('good', 'n1'),
				makeRef('missing'),
			]);
			assert.strictEqual(results[1].customization.load?.kind, 'error');
			assert.strictEqual(results[1].pluginDir, undefined);
		});

		test('fires progress callback with changed customization status', async () => {
			await seedPluginDir('prog', { 'index.js': 'content' });

			const progressCalls: PluginCustomization[] = [];
			await manager.syncCustomizations('test-client', [makeRef('prog', 'n1')], status => {
				progressCalls.push(status);
			});

			assert.deepStrictEqual(progressCalls.map(call => call.load?.kind), ['loaded']);
		});

		test('skips copy when nonce matches', async () => {
			await seedPluginDir('cached', { 'index.js': 'v1' });
			const ref = makeRef('cached', 'nonce-abc');

			const result1 = await manager.syncCustomizations('test-client', [ref]);
			assert.ok(result1[0].pluginDir);

			// Second sync with same nonce should still succeed (from cache)
			const result2 = await manager.syncCustomizations('test-client', [ref]);
			assert.ok(result2[0].pluginDir);
			assert.strictEqual(result1[0].pluginDir!.toString(), result2[0].pluginDir!.toString());
		});

		test('new nonce materializes a fresh subdirectory and retains the previous one', async () => {
			await seedPluginDir('rev', { 'index.js': 'v1' });

			const r1 = await manager.syncCustomizations('test-client', [makeRef('rev', 'nonce-1')]);
			const dir1 = r1[0].pluginDir!;

			// Re-seed with new content and sync with a different nonce.
			await seedPluginDir('rev', { 'index.js': 'v2' });
			const r2 = await manager.syncCustomizations('test-client', [makeRef('rev', 'nonce-2')]);
			const dir2 = r2[0].pluginDir!;

			assert.notStrictEqual(dir1.toString(), dir2.toString(), 'new nonce should use a new subdirectory');
			assert.strictEqual(await fileService.exists(dir2), true, 'new nonce subdirectory should exist');
			assert.strictEqual(await fileService.exists(dir1), true, 'superseded nonce should be retained within the window');
			assert.deepStrictEqual(await readRevisionNames(), new Set(['nonce-1', 'nonce-2']));
		});

		test('a missing nonce materializes each sync in a fresh retained directory', async () => {
			await seedPluginDir('rev', { 'SKILL.md': 'skill v1' });
			const first = await manager.syncCustomizations('test-client', [makeRef('rev')]);

			await seedPluginDir('rev', { 'SKILL.md': 'skill v2' });
			const second = await manager.syncCustomizations('test-client', [makeRef('rev')]);

			assert.deepStrictEqual({
				pathsDiffer: first[0].pluginDir?.toString() !== second[0].pluginDir?.toString(),
				firstContent: (await fileService.readFile(URI.joinPath(first[0].pluginDir!, 'SKILL.md'))).value.toString(),
				secondContent: (await fileService.readFile(URI.joinPath(second[0].pluginDir!, 'SKILL.md'))).value.toString(),
			}, {
				pathsDiffer: true,
				firstContent: 'skill v1',
				secondContent: 'skill v2',
			});
		});

		test('a nonce that cycles back to a retained revision is a cache hit', async () => {
			await seedPluginDir('rev', { 'index.js': 'v1' });
			const r1 = await manager.syncCustomizations('test-client', [makeRef('rev', 'nonce-1')]);
			const dir1 = r1[0].pluginDir!;

			await seedPluginDir('rev', { 'index.js': 'v2' });
			await manager.syncCustomizations('test-client', [makeRef('rev', 'nonce-2')]);

			// Back to the original content. The source no longer matters: a hit
			// must reuse the retained directory rather than re-copying.
			await fileService.del(toAgentClientUri(URI.from({ scheme: Schemas.inMemory, path: '/plugins/rev' }), 'test-client'), { recursive: true });
			const r3 = await manager.syncCustomizations('test-client', [makeRef('rev', 'nonce-1')]);

			assert.strictEqual(r3[0].pluginDir?.toString(), dir1.toString());
			assert.strictEqual((r3[0].customization as PluginCustomization).load?.kind, 'loaded');
			assert.strictEqual((await fileService.readFile(URI.joinPath(dir1, 'index.js'))).value.toString(), 'v1');
		});

		test('evicts the oldest released revision once the per-plugin retention window is exceeded', async () => {
			// One more revision than the retention window (8).
			for (let i = 1; i <= 9; i++) {
				await seedPluginDir('rev', { 'index.js': `v${i}` });
				const result = await manager.syncCustomizations('test-client', [makeRef('rev', `nonce-${i}`)]);
				result[0].lease?.dispose();
			}
			await manager.syncCustomizations('test-client', [makeRef('rev', 'nonce-9')]);

			assert.deepStrictEqual(
				await readRevisionNames(),
				new Set(['nonce-2', 'nonce-3', 'nonce-4', 'nonce-5', 'nonce-6', 'nonce-7', 'nonce-8', 'nonce-9']),
			);
		});

		test('keeps a synchronized skill readable while newer revisions are materialized', async () => {
			await seedPluginDir('rev', { 'SKILL.md': 'skill v1' });
			const active = await manager.syncCustomizations('test-client', [makeRef('rev', 'nonce-1')]);
			const activeSkill = URI.joinPath(active[0].pluginDir!, 'SKILL.md');

			for (let i = 2; i <= 9; i++) {
				await seedPluginDir('rev', { 'SKILL.md': `skill v${i}` });
				await manager.syncCustomizations('test-client', [makeRef('rev', `nonce-${i}`)]);
			}

			assert.strictEqual((await fileService.readFile(activeSkill)).value.toString(), 'skill v1');
		});

		test('retains a locked older nonce while evicting the next released revision', async () => {
			await seedPluginDir('rev', { 'index.js': 'v1' });
			const r1 = await manager.syncCustomizations('test-client', [makeRef('rev', 'nonce-1')]);
			const dir1 = r1[0].pluginDir!;
			r1[0].lease?.dispose();
			provider.lockedPaths.add(dir1.path);

			for (let i = 2; i <= 9; i++) {
				await seedPluginDir('rev', { 'index.js': `v${i}` });
				const result = await manager.syncCustomizations('test-client', [makeRef('rev', `nonce-${i}`)]);
				result[0].lease?.dispose();
			}
			await manager.syncCustomizations('test-client', [makeRef('rev', 'nonce-9')]);

			assert.strictEqual(await fileService.exists(dir1), true, 'locked older nonce should be retained on disk');
			assert.ok(!(await readRevisionNames()).has('nonce-2'), 'next released nonce should be evicted');
		});

		test('evicts a previously locked older nonce after the lock is released', async () => {
			await seedPluginDir('rev', { 'index.js': 'v1' });
			const r1 = await manager.syncCustomizations('test-client', [makeRef('rev', 'nonce-1')]);
			const dir1 = r1[0].pluginDir!;
			r1[0].lease?.dispose();
			provider.lockedPaths.add(dir1.path);

			// Push the locked revision out of the retention window so eviction
			// is attempted (and fails) while the lock is held.
			for (let i = 2; i <= 9; i++) {
				await seedPluginDir('rev', { 'index.js': `v${i}` });
				const result = await manager.syncCustomizations('test-client', [makeRef('rev', `nonce-${i}`)]);
				result[0].lease?.dispose();
			}
			assert.strictEqual(await fileService.exists(dir1), true, 'locked nonce should survive while held');

			provider.lockedPaths.clear();
			await seedPluginDir('rev', { 'index.js': 'v10' });
			await manager.syncCustomizations('test-client', [makeRef('rev', 'nonce-10')]);

			assert.strictEqual(await fileService.exists(dir1), false, 'released older nonce should be evicted');
			assert.ok(!(await readRevisionNames()).has('nonce-1'));
		});

		test('recopies a retained revision when its directory is already gone', async () => {
			await seedPluginDir('rev', { 'index.js': 'v1' });
			const r1 = await manager.syncCustomizations('test-client', [makeRef('rev', 'nonce-1')]);
			const dir1 = r1[0].pluginDir!;
			await fileService.del(dir1, { recursive: true });
			await manager.syncCustomizations('test-client', [makeRef('rev', 'nonce-1')]);

			assert.strictEqual((await fileService.readFile(URI.joinPath(dir1, 'index.js'))).value.toString(), 'v1');
		});

		test('serializes concurrent syncs of the same URI', async () => {
			await seedPluginDir('concurrent', { 'index.js': 'v1' });
			const ref = makeRef('concurrent', 'n1');

			// Fire two syncs concurrently
			const [r1, r2] = await Promise.all([
				manager.syncCustomizations('test-client', [ref]),
				manager.syncCustomizations('test-client', [ref]),
			]);

			// Both should succeed without error
			assert.strictEqual(r1[0].customization.load?.kind, 'loaded');
			assert.strictEqual(r2[0].customization.load?.kind, 'loaded');
		});

		test('waits for runtime initialization before starting concurrent syncs', async () => {
			await seedPluginDir('concurrent', { 'index.js': 'v1' });
			const manager2 = createManager();
			const ownerWriteBarrier = provider.ownerWriteBarrier = new DeferredPromise<void>();
			const firstSync = manager2.syncCustomizations('test-client', [makeRef('concurrent', 'n2')]);
			await provider.ownerWriteStarted.p;

			const secondSync = manager2.syncCustomizations('test-client', [makeRef('concurrent', 'n2')]);
			ownerWriteBarrier.complete();
			await Promise.all([firstSync, secondSync]);

			assert.strictEqual(provider.operationLog[0], 'owner-write-complete');
		});
	});

	// ---- LRU eviction -------------------------------------------------------

	suite('LRU eviction', () => {
		test('does not evict a path returned by another manager sharing the user data root', async () => {
			const firstManager = createManager(1);
			await seedPluginDir('plugin-1', { 'SKILL.md': 'active skill' });
			const active = await firstManager.syncCustomizations('test-client', [makeRef('plugin-1', 'n1')]);
			const activeSkill = URI.joinPath(active[0].pluginDir!, 'SKILL.md');

			await seedPluginDir('plugin-2', { 'SKILL.md': 'another skill' });
			await firstManager.syncCustomizations('test-client', [makeRef('plugin-2', 'n2')]);

			const secondManager = createManager(1);
			await secondManager.syncCustomizations('test-client', [makeRef('plugin-2', 'n2')]);

			assert.strictEqual((await fileService.readFile(activeSkill)).value.toString(), 'active skill');
		});

		test('keeps synchronized plugins readable while the runtime limit is exceeded', async () => {
			const smallManager = createManager(2);
			await seedPluginDir('plugin-1', { 'SKILL.md': 'active skill' });
			const active = await smallManager.syncCustomizations('test-client', [makeRef('plugin-1', 'n1')]);
			const activeSkill = URI.joinPath(active[0].pluginDir!, 'SKILL.md');

			for (let i = 2; i <= 3; i++) {
				await seedPluginDir(`plugin-${i}`, { 'SKILL.md': `skill ${i}` });
				await smallManager.syncCustomizations('test-client', [makeRef(`plugin-${i}`, `n${i}`)]);
			}

			assert.strictEqual((await fileService.readFile(activeSkill)).value.toString(), 'active skill');
		});

		test('evicts least recently used released plugins when limit exceeded', async () => {
			const smallManager = createManager(3);

			for (let i = 1; i <= 4; i++) {
				await seedPluginDir(`plugin-${i}`, { 'index.js': `p${i}` });
				const result = await smallManager.syncCustomizations('test-client', [makeRef(`plugin-${i}`, `n${i}`)]);
				result[0].lease?.dispose();
			}
			await smallManager.syncCustomizations('test-client', [makeRef('plugin-4', 'n4')]);

			// The evicted directory should leave exactly three plugin roots.
			const listing = await fileService.resolve(smallManager.basePath);
			assert.ok(listing.children);
			const pluginDirs = listing.children.filter(child => child.isDirectory);
			assert.strictEqual(pluginDirs.length, 3, 'should have exactly 3 plugin dirs after eviction');
		});

		test('retains a locked LRU candidate and skips ahead to evict an unlocked one', async () => {
			const smallManager = createManager(2);

			await seedPluginDir('plugin-1', { 'index.js': 'p1' });
			const r1 = await smallManager.syncCustomizations('client-1', [makeRef('plugin-1', 'n1')]);
			const dir1 = r1[0].pluginDir!;
			r1[0].lease?.dispose();

			await seedPluginDir('plugin-2', { 'index.js': 'p2' });
			const r2 = await smallManager.syncCustomizations('client-2', [makeRef('plugin-2', 'n2')]);
			const dir2 = r2[0].pluginDir!;
			r2[0].lease?.dispose();

			// Lock the LRU head so its directory can't be deleted.
			provider.lockedPaths.add(dir1.path);

			await seedPluginDir('plugin-3', { 'index.js': 'p3' });
			await smallManager.syncCustomizations('client-3', [makeRef('plugin-3', 'n3')]);

			// plugin-1 should survive (locked) and plugin-2 should be evicted instead.
			assert.strictEqual(await fileService.exists(dir1), true, 'locked plugin-1 should be retained');
			assert.strictEqual(await fileService.exists(dir2), false, 'unlocked plugin-2 should be evicted');
		});
	});

	// ---- runtime cleanup ----------------------------------------------------

	suite('runtime cleanup', () => {

		test('removes a runtime owned by a process that is no longer alive', async () => {
			const staleRuntime = URI.joinPath(basePath, 'agentPlugins', 'runtimes', 'stale');
			await fileService.writeFile(URI.joinPath(staleRuntime, 'owner.json'), VSBuffer.fromString(JSON.stringify({ pid: 2147483646, instanceId: 'stale' })));
			await fileService.writeFile(URI.joinPath(staleRuntime, 'plugin', 'SKILL.md'), VSBuffer.fromString('stale'));

			await seedPluginDir('current', { 'SKILL.md': 'current' });
			await manager.syncCustomizations('test-client', [makeRef('current', 'n1')]);

			assert.strictEqual(await fileService.exists(staleRuntime), false);
		});
	});
});
