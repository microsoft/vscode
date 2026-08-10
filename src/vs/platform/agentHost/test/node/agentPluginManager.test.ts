/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileDeleteOptions } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { AGENT_CLIENT_SCHEME, toAgentClientUri } from '../../common/agentClientUri.js';
import { customizationId, type ClientPluginCustomization, type PluginCustomization } from '../../common/state/sessionState.js';
import { CustomizationType } from '../../common/state/protocol/state.js';
import { AgentPluginManager } from '../../node/agentPluginManager.js';

/**
 * In-memory provider that can simulate a locked (undeletable) resource, like a
 * directory still held by a running session, so eviction fails with an error.
 */
class LockableInMemoryFileSystemProvider extends InMemoryFileSystemProvider {
	readonly lockedPaths = new Set<string>();

	override async delete(resource: URI, opts: IFileDeleteOptions): Promise<void> {
		for (const locked of this.lockedPaths) {
			if (resource.path.includes(locked)) {
				throw new Error('EBUSY: resource busy or locked');
			}
		}
		return super.delete(resource, opts);
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
		manager = new AgentPluginManager(basePath, fileService, new NullLogService());
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function pluginUri(name: string): string {
		return URI.from({ scheme: Schemas.inMemory, path: `/plugins/${name}` }).toString();
	}

	function makeRef(name: string, nonce?: string): ClientPluginCustomization {
		const uri = pluginUri(name);
		return {
			type: CustomizationType.Plugin,
			id: customizationId(uri),
			uri,
			name: `Plugin ${name}`,
			enabled: true,
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

	async function readCacheNonces(): Promise<Set<string>> {
		const cachePath = URI.joinPath(basePath, 'agentPlugins', 'cache.json');
		const content = await fileService.readFile(cachePath);
		const parsed: { entries: { uri: string; nonce: string }[] } = JSON.parse(content.value.toString());
		return new Set(parsed.entries.map(entry => entry.nonce));
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

		test('new nonce materializes a fresh subdirectory and evicts the stale one', async () => {
			await seedPluginDir('rev', { 'index.js': 'v1' });

			const r1 = await manager.syncCustomizations('test-client', [makeRef('rev', 'nonce-1')]);
			const dir1 = r1[0].pluginDir!;

			// Re-seed with new content and sync with a different nonce.
			await seedPluginDir('rev', { 'index.js': 'v2' });
			const r2 = await manager.syncCustomizations('test-client', [makeRef('rev', 'nonce-2')]);
			const dir2 = r2[0].pluginDir!;

			assert.notStrictEqual(dir1.toString(), dir2.toString(), 'new nonce should use a new subdirectory');
			assert.strictEqual(await fileService.exists(dir2), true, 'new nonce subdirectory should exist');
			assert.strictEqual(await fileService.exists(dir1), false, 'stale nonce subdirectory should be evicted');
			assert.deepStrictEqual(await readCacheNonces(), new Set(['nonce-2']));
		});

		// Content-hash nonces are signed 32-bit integers, so `-N` and `N` both
		// occur in practice; sanitizing away the sign would map them to one
		// directory while the LRU tracks them as separate revisions, so evicting
		// one would delete the other's materialized content.
		test('negative and positive nonces materialize distinct subdirectories', async () => {
			await seedPluginDir('signed', { 'index.js': 'v1' });
			const r1 = await manager.syncCustomizations('test-client', [makeRef('signed', '-28114114')]);
			const dir1 = r1[0].pluginDir!;

			await seedPluginDir('signed', { 'index.js': 'v2' });
			const r2 = await manager.syncCustomizations('test-client', [makeRef('signed', '28114114')]);
			const dir2 = r2[0].pluginDir!;

			assert.notStrictEqual(dir1.toString(), dir2.toString(), 'sign-differing nonces must not share a directory');
			assert.strictEqual((await fileService.readFile(URI.joinPath(dir2, 'index.js'))).value.toString(), 'v2');
		});

		// A nonce is an opaque client token, so the directory mapping must be
		// injective for *any* pair of distinct nonces — including one that is
		// already path-safe and happens to look like another's encoded form.
		test('distinct nonces never share a directory, whatever their shape', async () => {
			const nonces = ['-28114114', '28114114', 'n-LTI4MTE0MTE0', 'default', '', 'a/b', 'a-b', 'a_b', 'A'.repeat(400), 'A'.repeat(401)];
			const dirs = new Map<string, string>();
			for (const nonce of nonces) {
				await seedPluginDir('shapes', { 'index.js': nonce });
				const result = await manager.syncCustomizations('test-client', [makeRef('shapes', nonce)]);
				const dir = result[0].pluginDir!.toString();
				const clash = [...dirs.entries()].find(([, d]) => d === dir);
				// The empty nonce is treated as absent, so it legitimately shares the `default` slot.
				if (nonce !== '' && clash && clash[0] !== '') {
					assert.fail(`nonce ${JSON.stringify(nonce)} collided with ${JSON.stringify(clash[0])} at ${dir}`);
				}
				dirs.set(nonce, dir);
			}
		});

		test('retains a locked older nonce so both revisions coexist', async () => {
			await seedPluginDir('rev', { 'index.js': 'v1' });
			const r1 = await manager.syncCustomizations('test-client', [makeRef('rev', 'nonce-1')]);
			const dir1 = r1[0].pluginDir!;

			// Simulate a session still holding the first revision.
			provider.lockedPaths.add(dir1.path);

			await seedPluginDir('rev', { 'index.js': 'v2' });
			const r2 = await manager.syncCustomizations('test-client', [makeRef('rev', 'nonce-2')]);
			const dir2 = r2[0].pluginDir!;

			assert.strictEqual(await fileService.exists(dir1), true, 'locked older nonce should be retained on disk');
			assert.strictEqual(await fileService.exists(dir2), true, 'new nonce subdirectory should exist');
			assert.deepStrictEqual(await readCacheNonces(), new Set(['nonce-1', 'nonce-2']));
		});

		test('evicts a previously locked older nonce on startup once released', async () => {
			await seedPluginDir('rev', { 'index.js': 'v1' });
			const r1 = await manager.syncCustomizations('test-client', [makeRef('rev', 'nonce-1')]);
			const dir1 = r1[0].pluginDir!;
			provider.lockedPaths.add(dir1.path);

			await seedPluginDir('rev', { 'index.js': 'v2' });
			await manager.syncCustomizations('test-client', [makeRef('rev', 'nonce-2')]);

			// Release the lock and start a fresh manager against the same base path.
			provider.lockedPaths.clear();
			const manager2 = new AgentPluginManager(basePath, fileService, new NullLogService());
			await manager2.syncCustomizations('test-client', [makeRef('rev', 'nonce-2')]);

			assert.strictEqual(await fileService.exists(dir1), false, 'released older nonce should be evicted on startup');
			assert.deepStrictEqual(await readCacheNonces(), new Set(['nonce-2']));
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
	});

	// ---- LRU eviction -------------------------------------------------------

	suite('LRU eviction', () => {

		test('evicts least recently used plugins when limit exceeded', async () => {
			const smallManager = new AgentPluginManager(basePath, fileService, new NullLogService(), 3);

			for (let i = 1; i <= 4; i++) {
				await seedPluginDir(`plugin-${i}`, { 'index.js': `p${i}` });
				await smallManager.syncCustomizations('test-client', [makeRef(`plugin-${i}`, `n${i}`)]);
			}

			// The evicted dir should no longer exist on disk (cache.json + 3 plugin dirs)
			const evictedDir = URI.joinPath(basePath, 'agentPlugins');
			const listing = await fileService.resolve(evictedDir);
			assert.ok(listing.children);
			const pluginDirs = listing.children.filter(c => c.isDirectory);
			assert.strictEqual(pluginDirs.length, 3, 'should have exactly 3 plugin dirs after eviction');
		});

		test('retains a locked LRU candidate and skips ahead to evict an unlocked one', async () => {
			const smallManager = new AgentPluginManager(basePath, fileService, new NullLogService(), 2);

			await seedPluginDir('plugin-1', { 'index.js': 'p1' });
			const r1 = await smallManager.syncCustomizations('client-1', [makeRef('plugin-1', 'n1')]);
			const dir1 = r1[0].pluginDir!;

			await seedPluginDir('plugin-2', { 'index.js': 'p2' });
			const r2 = await smallManager.syncCustomizations('client-2', [makeRef('plugin-2', 'n2')]);
			const dir2 = r2[0].pluginDir!;

			// Lock the LRU head so its directory can't be deleted.
			provider.lockedPaths.add(dir1.path);

			await seedPluginDir('plugin-3', { 'index.js': 'p3' });
			await smallManager.syncCustomizations('client-3', [makeRef('plugin-3', 'n3')]);

			// plugin-1 should survive (locked) and plugin-2 should be evicted instead.
			assert.strictEqual(await fileService.exists(dir1), true, 'locked plugin-1 should be retained');
			assert.strictEqual(await fileService.exists(dir2), false, 'unlocked plugin-2 should be evicted');
		});
	});

	// ---- cache persistence --------------------------------------------------

	suite('cache persistence', () => {

		test('restores nonce cache from disk on new manager instance', async () => {
			await seedPluginDir('persist1', { 'index.js': 'v1' });
			const ref = makeRef('persist1', 'nonce-persist');

			// Sync with first manager
			await manager.syncCustomizations('test-client', [ref]);

			// Create a new manager pointing to the same base path
			const manager2 = new AgentPluginManager(basePath, fileService, new NullLogService());
			const result = await manager2.syncCustomizations('test-client', [ref]);

			// Should be loaded from cache (nonce match), not error
			assert.strictEqual((result[0].customization as PluginCustomization).load?.kind, 'loaded');
			assert.ok(result[0].pluginDir);
		});

		// The nonce → directory mapping changed, so entries written by an older
		// build point at directories this build never looks up. They must be
		// removed rather than orphaned, and must not linger in the LRU.
		test('discards directories and entries from a superseded cache layout', async () => {
			const uri = pluginUri('legacy');
			const legacyDir = URI.joinPath(basePath, 'agentPlugins', uri.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''), '28114114');
			await fileService.writeFile(URI.joinPath(legacyDir, 'index.js'), VSBuffer.fromString('stale'));
			// Pre-versioning format: a bare array of entries.
			await fileService.writeFile(
				URI.joinPath(basePath, 'agentPlugins', 'cache.json'),
				VSBuffer.fromString(JSON.stringify([{ uri, nonce: '-28114114' }])),
			);

			await seedPluginDir('legacy', { 'index.js': 'fresh' });
			const result = await new AgentPluginManager(basePath, fileService, new NullLogService())
				.syncCustomizations('test-client', [makeRef('legacy', '-28114114')]);

			assert.strictEqual(await fileService.exists(legacyDir), false, 'legacy directory should be removed');
			assert.strictEqual((await fileService.readFile(URI.joinPath(result[0].pluginDir!, 'index.js'))).value.toString(), 'fresh');
			assert.deepStrictEqual(await readCacheNonces(), new Set(['-28114114']));
		});
	});
});
