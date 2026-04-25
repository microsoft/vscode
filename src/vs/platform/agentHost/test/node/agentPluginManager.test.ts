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
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { AGENT_CLIENT_SCHEME, toAgentClientUri } from '../../common/agentClientUri.js';
import { CustomizationStatus, type CustomizationRef, type SessionCustomization } from '../../common/state/sessionState.js';
import { AgentPluginManager } from '../../node/agentPluginManager.js';

suite('AgentPluginManager', () => {

	const disposables = new DisposableStore();
	let fileService: FileService;
	let manager: AgentPluginManager;
	const basePath = URI.from({ scheme: Schemas.inMemory, path: '/userData' });

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		disposables.add(fileService.registerProvider(AGENT_CLIENT_SCHEME, disposables.add(new InMemoryFileSystemProvider())));
		manager = new AgentPluginManager(basePath, fileService, new NullLogService());
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function pluginUri(name: string): string {
		return URI.from({ scheme: Schemas.inMemory, path: `/plugins/${name}` }).toString();
	}

	function makeRef(name: string, nonce?: string): CustomizationRef {
		return { uri: pluginUri(name), displayName: `Plugin ${name}`, nonce };
	}

	async function seedPluginDir(name: string, files: Record<string, string>): Promise<void> {
		const originalUri = URI.from({ scheme: Schemas.inMemory, path: `/plugins/${name}` });
		const agentClientDir = toAgentClientUri(originalUri, 'test-client');
		await fileService.createFolder(agentClientDir);
		for (const [fileName, content] of Object.entries(files)) {
			await fileService.writeFile(URI.joinPath(agentClientDir, fileName), VSBuffer.fromString(content));
		}
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
			assert.strictEqual(results[0].customization.status, CustomizationStatus.Loaded);
			assert.ok(results[0].pluginDir, 'should have pluginDir');
			assert.strictEqual(results[1].customization.status, CustomizationStatus.Loaded);
			assert.ok(results[1].pluginDir, 'should have pluginDir');
		});

		test('returns error status without pluginDir when source missing', async () => {
			const results = await manager.syncCustomizations('test-client', [makeRef('nonexistent')]);

			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0].customization.status, CustomizationStatus.Error);
			assert.ok(results[0].customization.statusMessage);
			assert.strictEqual(results[0].pluginDir, undefined);
		});

		test('mixes loaded and error results', async () => {
			await seedPluginDir('good', { 'index.js': 'ok' });

			const results = await manager.syncCustomizations('test-client', [
				makeRef('good', 'n1'),
				makeRef('missing'),
			]);
			assert.strictEqual(results[1].customization.status, CustomizationStatus.Error);
			assert.strictEqual(results[1].pluginDir, undefined);
		});

		test('fires progress callback with loading, then loaded', async () => {
			await seedPluginDir('prog', { 'index.js': 'content' });

			const progressCalls: SessionCustomization[][] = [];
			await manager.syncCustomizations('test-client', [makeRef('prog', 'n1')], statuses => {
				progressCalls.push(statuses);
			});

			// At least two calls: initial loading + final loaded
			assert.ok(progressCalls.length >= 2, `expected at least 2 progress calls, got ${progressCalls.length}`);
			assert.strictEqual(progressCalls[0][0].status, CustomizationStatus.Loading);
			assert.strictEqual(progressCalls[progressCalls.length - 1][0].status, CustomizationStatus.Loaded);
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

		test('serializes concurrent syncs of the same URI', async () => {
			await seedPluginDir('concurrent', { 'index.js': 'v1' });
			const ref = makeRef('concurrent', 'n1');

			// Fire two syncs concurrently
			const [r1, r2] = await Promise.all([
				manager.syncCustomizations('test-client', [ref]),
				manager.syncCustomizations('test-client', [ref]),
			]);

			// Both should succeed without error
			assert.strictEqual(r1[0].customization.status, CustomizationStatus.Loaded);
			assert.strictEqual(r2[0].customization.status, CustomizationStatus.Loaded);
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
			assert.strictEqual(result[0].customization.status, CustomizationStatus.Loaded);
			assert.ok(result[0].pluginDir);
		});
	});
});
