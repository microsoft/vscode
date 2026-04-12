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
import { AgentPluginManager } from '../../node/agentPluginManager.js';
suite('AgentPluginManager', () => {
    const disposables = new DisposableStore();
    let fileService;
    let manager;
    const basePath = URI.from({ scheme: Schemas.inMemory, path: '/userData' });
    setup(() => {
        fileService = disposables.add(new FileService(new NullLogService()));
        disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
        disposables.add(fileService.registerProvider(AGENT_CLIENT_SCHEME, disposables.add(new InMemoryFileSystemProvider())));
        manager = new AgentPluginManager(basePath, fileService, new NullLogService());
    });
    teardown(() => disposables.clear());
    ensureNoDisposablesAreLeakedInTestSuite();
    function pluginUri(name) {
        return URI.from({ scheme: Schemas.inMemory, path: `/plugins/${name}` }).toString();
    }
    function makeRef(name, nonce) {
        return { uri: pluginUri(name), displayName: `Plugin ${name}`, nonce };
    }
    async function seedPluginDir(name, files) {
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
            assert.strictEqual(results[0].customization.status, "loaded" /* CustomizationStatus.Loaded */);
            assert.ok(results[0].pluginDir, 'should have pluginDir');
            assert.strictEqual(results[1].customization.status, "loaded" /* CustomizationStatus.Loaded */);
            assert.ok(results[1].pluginDir, 'should have pluginDir');
        });
        test('returns error status without pluginDir when source missing', async () => {
            const results = await manager.syncCustomizations('test-client', [makeRef('nonexistent')]);
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].customization.status, "error" /* CustomizationStatus.Error */);
            assert.ok(results[0].customization.statusMessage);
            assert.strictEqual(results[0].pluginDir, undefined);
        });
        test('mixes loaded and error results', async () => {
            await seedPluginDir('good', { 'index.js': 'ok' });
            const results = await manager.syncCustomizations('test-client', [
                makeRef('good', 'n1'),
                makeRef('missing'),
            ]);
            assert.strictEqual(results[1].customization.status, "error" /* CustomizationStatus.Error */);
            assert.strictEqual(results[1].pluginDir, undefined);
        });
        test('fires progress callback with loading, then loaded', async () => {
            await seedPluginDir('prog', { 'index.js': 'content' });
            const progressCalls = [];
            await manager.syncCustomizations('test-client', [makeRef('prog', 'n1')], statuses => {
                progressCalls.push(statuses);
            });
            // At least two calls: initial loading + final loaded
            assert.ok(progressCalls.length >= 2, `expected at least 2 progress calls, got ${progressCalls.length}`);
            assert.strictEqual(progressCalls[0][0].status, "loading" /* CustomizationStatus.Loading */);
            assert.strictEqual(progressCalls[progressCalls.length - 1][0].status, "loaded" /* CustomizationStatus.Loaded */);
        });
        test('skips copy when nonce matches', async () => {
            await seedPluginDir('cached', { 'index.js': 'v1' });
            const ref = makeRef('cached', 'nonce-abc');
            const result1 = await manager.syncCustomizations('test-client', [ref]);
            assert.ok(result1[0].pluginDir);
            // Second sync with same nonce should still succeed (from cache)
            const result2 = await manager.syncCustomizations('test-client', [ref]);
            assert.ok(result2[0].pluginDir);
            assert.strictEqual(result1[0].pluginDir.toString(), result2[0].pluginDir.toString());
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
            assert.strictEqual(r1[0].customization.status, "loaded" /* CustomizationStatus.Loaded */);
            assert.strictEqual(r2[0].customization.status, "loaded" /* CustomizationStatus.Loaded */);
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
            assert.strictEqual(result[0].customization.status, "loaded" /* CustomizationStatus.Loaded */);
            assert.ok(result[0].pluginDir);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRQbHVnaW5NYW5hZ2VyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9hZ2VudEhvc3QvdGVzdC9ub2RlL2FnZW50UGx1Z2luTWFuYWdlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUV2RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUV0RSxLQUFLLENBQUMsb0JBQW9CLEVBQUUsR0FBRyxFQUFFO0lBRWhDLE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7SUFDMUMsSUFBSSxXQUF3QixDQUFDO0lBQzdCLElBQUksT0FBMkIsQ0FBQztJQUNoQyxNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxF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