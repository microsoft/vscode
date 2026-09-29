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
import { FileSystemProviderCapabilities, IFileDeleteOptions, IFileWriteOptions } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { AGENT_CLIENT_SCHEME, toAgentClientUri } from '../../common/agentClientUri.js';
import { toClientPluginMcpDefaultCwdsMeta } from '../../common/meta/clientPluginCustomizationMeta.js';
import { customizationId, type ClientPluginCustomization, type PluginCustomization } from '../../common/state/sessionState.js';
import { CustomizationEnablementKind, CustomizationLoadStatus, CustomizationType } from '../../common/state/protocol/state.js';
import { AgentPluginManager } from '../../node/agentPluginManager.js';
import { parseCapturedPluginCustomization } from '../../node/shared/automationCustomizations.js';

/**
 * In-memory provider that can simulate a locked (undeletable) resource, like a
 * directory still held by a running session, so eviction fails with an error.
 */
class LockableInMemoryFileSystemProvider extends InMemoryFileSystemProvider {
	override get capabilities(): FileSystemProviderCapabilities {
		return super.capabilities | FileSystemProviderCapabilities.FileAtomicWrite;
	}

	readonly lockedPaths = new Set<string>();
	readonly cacheReadStarted = new DeferredPromise<void>();
	readonly operationLog: string[] = [];
	cacheReadBarrier: DeferredPromise<void> | undefined;
	failStagedWriteAfter: number | undefined;
	failCacheWrite = false;
	failCacheWrites = 0;
	readonly cacheWriteAtomicOptions: IFileWriteOptions['atomic'][] = [];
	private _stagedWriteCount = 0;

	override async delete(resource: URI, opts: IFileDeleteOptions): Promise<void> {
		for (const locked of this.lockedPaths) {
			if (resource.path.includes(locked)) {
				throw new Error('EBUSY: resource busy or locked');
			}
		}
		return super.delete(resource, opts);
	}

	override async readFile(resource: URI): Promise<Uint8Array> {
		const content = await super.readFile(resource);
		if (this.cacheReadBarrier && resource.path.endsWith('/agentPlugins/cache.json')) {
			this.cacheReadStarted.complete();
			await this.cacheReadBarrier.p;
			this.operationLog.push('cache-read-complete');
		}
		return content;
	}

	override async mkdir(resource: URI): Promise<void> {
		if (this.cacheReadBarrier && resource.path.includes('/agentPlugins/') && !resource.path.endsWith('/cache.json')) {
			this.operationLog.push('plugin-materialize');
		}
		return super.mkdir(resource);
	}

	override async writeFile(resource: URI, content: Uint8Array, opts: IFileWriteOptions): Promise<void> {
		if (resource.path.endsWith('/agentPlugins/cache.json')) {
			this.cacheWriteAtomicOptions.push(opts.atomic);
			if (this.failCacheWrite || this.failCacheWrites > 0) {
				if (this.failCacheWrites > 0) {
					this.failCacheWrites--;
				}
				throw new Error('simulated cache persistence failure');
			}
		}
		if (this.failStagedWriteAfter !== undefined) {
			if (this._stagedWriteCount++ >= this.failStagedWriteAfter) {
				throw new Error('simulated staged copy failure');
			}
		}
		return super.writeFile(resource, content, opts);
	}

	override async write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		if (this.failStagedWriteAfter !== undefined && this._stagedWriteCount++ >= this.failStagedWriteAfter) {
			throw new Error('simulated staged copy failure');
		}
		return super.write(fd, pos, data, offset, length);
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
		const entries: { uri: string; nonce: string }[] = JSON.parse(content.value.toString());
		return new Set(entries.map(entry => entry.nonce));
	}

	async function readCacheHolders(): Promise<Set<string>> {
		const cachePath = URI.joinPath(basePath, 'agentPlugins', 'cache.json');
		const content = await fileService.readFile(cachePath);
		const entries: { holders?: string[] }[] = JSON.parse(content.value.toString());
		return new Set(entries.flatMap(entry => entry.holders ?? []));
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
			assert.deepStrictEqual(await readCacheNonces(), new Set(['nonce-1', 'nonce-2']));
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

		test('evicts the oldest revision once the per-plugin retention window is exceeded', async () => {
			// One more revision than the retention window (8).
			for (let i = 1; i <= 9; i++) {
				await seedPluginDir('rev', { 'index.js': `v${i}` });
				await manager.syncCustomizations('test-client', [makeRef('rev', `nonce-${i}`)]);
			}

			assert.deepStrictEqual(
				await readCacheNonces(),
				new Set(['nonce-2', 'nonce-3', 'nonce-4', 'nonce-5', 'nonce-6', 'nonce-7', 'nonce-8', 'nonce-9']),
			);
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

			// Push the locked revision out of the retention window so eviction
			// is attempted (and fails) while the lock is held.
			for (let i = 2; i <= 9; i++) {
				await seedPluginDir('rev', { 'index.js': `v${i}` });
				await manager.syncCustomizations('test-client', [makeRef('rev', `nonce-${i}`)]);
			}
			assert.strictEqual(await fileService.exists(dir1), true, 'locked nonce should survive while held');

			// Release the lock and start a fresh manager against the same base path.
			provider.lockedPaths.clear();
			const manager2 = new AgentPluginManager(basePath, fileService, new NullLogService());
			await manager2.syncCustomizations('test-client', [makeRef('rev', 'nonce-9')]);

			assert.strictEqual(await fileService.exists(dir1), false, 'released older nonce should be evicted on startup');
			assert.ok(!(await readCacheNonces()).has('nonce-1'));
		});

		test('drops a stale cache entry when its directory is already gone', async () => {
			await seedPluginDir('rev', { 'index.js': 'v1' });
			const r1 = await manager.syncCustomizations('test-client', [makeRef('rev', 'nonce-1')]);
			const dir1 = r1[0].pluginDir!;

			await seedPluginDir('rev', { 'index.js': 'v2' });
			await manager.syncCustomizations('test-client', [makeRef('rev', 'nonce-2')]);

			// nonce-1 is still inside the retention window, so only the missing
			// directory itself can tell us the entry is worthless.
			await fileService.del(dir1, { recursive: true });
			const manager2 = new AgentPluginManager(basePath, fileService, new NullLogService());
			await manager2.syncCustomizations('test-client', [makeRef('rev', 'nonce-2')]);

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

		test('waits for cache initialization before starting concurrent syncs', async () => {
			await seedPluginDir('concurrent', { 'index.js': 'v1' });
			await manager.syncCustomizations('test-client', [makeRef('concurrent', 'n1')]);

			const manager2 = new AgentPluginManager(basePath, fileService, new NullLogService());
			const cacheReadBarrier = provider.cacheReadBarrier = new DeferredPromise<void>();
			const firstSync = manager2.syncCustomizations('test-client', [makeRef('concurrent', 'n2')]);
			await provider.cacheReadStarted.p;

			const secondSync = manager2.syncCustomizations('test-client', [makeRef('concurrent', 'n2')]);
			cacheReadBarrier.complete();
			await Promise.all([firstSync, secondSync]);

			assert.strictEqual(provider.operationLog[0], 'cache-read-complete');
		});

		test('fails closed without overwriting a malformed cache manifest', async () => {
			const cachePath = URI.joinPath(basePath, 'agentPlugins', 'cache.json');
			const malformedManifest = '{not valid json';
			await fileService.createFolder(URI.joinPath(basePath, 'agentPlugins'));
			await fileService.writeFile(cachePath, VSBuffer.fromString(malformedManifest));
			await seedPluginDir('malformed-cache', { 'index.js': 'content' });

			const restarted = new AgentPluginManager(basePath, fileService, new NullLogService());
			await assert.rejects(() => restarted.syncCustomizations('test-client', [makeRef('malformed-cache', 'nonce')]));

			assert.strictEqual((await fileService.readFile(cachePath)).value.toString(), malformedManifest);
		});
	});

	// ---- captureCustomizations ----------------------------------------------

	suite('captureCustomizations', () => {

		test('throws when a capture source is missing', async () => {
			await assert.rejects(() => manager.captureCustomizations('test-client', [makeRef('missing')]));
		});

		test('captures each nonce-less plugin revision immutably in a host-owned directory', async () => {
			await seedPluginDir('immutable', { 'index.js': 'v1' });
			const ref = { ...makeRef('immutable'), clientId: 'test-client' };
			const first = await manager.captureCustomizations('test-client', [ref]);
			const captured = first.customizations[0];
			const pluginDir = manager.getCapturedPluginDir(captured.uri);

			await seedPluginDir('immutable', { 'index.js': 'v2' });
			const second = await manager.captureCustomizations('test-client', [ref]);
			const secondDir = manager.getCapturedPluginDir(second.customizations[0].uri)!;

			assert.deepStrictEqual(
				{
					id: captured.id,
					uri: captured.uri,
					hasClientId: Object.hasOwn(captured, 'clientId'),
					firstContent: pluginDir && (await fileService.readFile(URI.joinPath(pluginDir, 'index.js'))).value.toString(),
					secondContent: (await fileService.readFile(URI.joinPath(secondDir, 'index.js'))).value.toString(),
					secondUri: second.customizations[0].uri,
				},
				{
					id: ref.id,
					uri: pluginDir?.toString(),
					hasClientId: false,
					firstContent: 'v1',
					secondContent: 'v2',
					secondUri: secondDir.toString(),
				},
			);
			assert.notStrictEqual(second.customizations[0].uri, captured.uri);

			first.dispose();
			second.dispose();
		});

		test('parses captured plugin contents without trusting client children or load state', async () => {
			await seedPluginDir('parsed', {
				'.mcp.json': '{"mcpServers":{"captured":{"command":"node"}}}',
			});
			const source: ClientPluginCustomization = {
				...makeRef('parsed', 'nonce'),
				children: [],
				load: { kind: CustomizationLoadStatus.Error, message: 'forged' },
				enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
				childEnablement: { captured: [{ kind: CustomizationEnablementKind.Global, enabled: false }] },
				_meta: toClientPluginMcpDefaultCwdsMeta({ captured: null }),
			};
			const capture = await manager.captureCustomizations('test-client', [source]);
			const captured = capture.customizations[0];
			const parsed = await parseCapturedPluginCustomization(
				captured,
				source,
				manager.getCapturedPluginDir(captured.uri)!,
				URI.file('/workspace'),
				URI.file('/home/user'),
				fileService,
			);

			assert.deepStrictEqual(
				{
					load: parsed.load,
					children: parsed.children?.map(child => ({
						type: child.type,
						name: child.type === CustomizationType.McpServer ? child.name : undefined,
						enablement: child.type === CustomizationType.McpServer ? child.enablement : undefined,
					})),
					meta: parsed._meta,
				},
				{
					load: { kind: CustomizationLoadStatus.Loaded },
					children: [{
						type: CustomizationType.McpServer,
						name: 'captured',
						enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
					}],
					meta: {
						...toClientPluginMcpDefaultCwdsMeta({ captured: null }),
					},
				},
			);

			capture.dispose();
		});

		test('removes an incomplete staged capture before retrying', async () => {
			await seedPluginDir('retry', { 'one.js': 'one', 'two.js': 'two' });
			provider.failStagedWriteAfter = 1;
			await assert.rejects(() => manager.captureCustomizations('test-client', [makeRef('retry', 'nonce')]));

			provider.failStagedWriteAfter = undefined;
			const capture = await manager.captureCustomizations('test-client', [makeRef('retry', 'nonce')]);
			const pluginDir = manager.getCapturedPluginDir(capture.customizations[0].uri)!;

			assert.deepStrictEqual(
				{
					one: (await fileService.readFile(URI.joinPath(pluginDir, 'one.js'))).value.toString(),
					two: (await fileService.readFile(URI.joinPath(pluginDir, 'two.js'))).value.toString(),
				},
				{ one: 'one', two: 'two' },
			);

			capture.dispose();
		});

		test('keeps concurrently staged captures through serialized cache cleanup', async () => {
			const smallManager = new AgentPluginManager(basePath, fileService, new NullLogService(), 1);
			await seedPluginDir('concurrent-capture', { 'index.js': 'content' });

			const [first, second] = await Promise.all([
				smallManager.captureCustomizations('test-client', [makeRef('concurrent-capture', 'one')]),
				smallManager.captureCustomizations('test-client', [makeRef('concurrent-capture', 'two')]),
			]);
			const firstDir = smallManager.getCapturedPluginDir(first.customizations[0].uri)!;
			const secondDir = smallManager.getCapturedPluginDir(second.customizations[0].uri)!;

			assert.deepStrictEqual(
				{
					first: await fileService.exists(firstDir),
					second: await fileService.exists(secondDir),
				},
				{ first: true, second: true },
			);

			first.dispose();
			second.dispose();
		});

		test('uses collision-free host directories for durable captures', async () => {
			await seedPluginDir('a-b', { 'index.js': 'first' });
			await seedPluginDir('a_b', { 'index.js': 'second' });

			const first = await manager.captureCustomizations('test-client', [makeRef('a-b', 'x-y')]);
			const second = await manager.captureCustomizations('test-client', [makeRef('a_b', 'x_y')]);
			const firstDir = manager.getCapturedPluginDir(first.customizations[0].uri)!;
			const secondDir = manager.getCapturedPluginDir(second.customizations[0].uri)!;

			assert.deepStrictEqual(
				{
					differentDirectories: firstDir.toString() !== secondDir.toString(),
					first: (await fileService.readFile(URI.joinPath(firstDir, 'index.js'))).value.toString(),
					second: (await fileService.readFile(URI.joinPath(secondDir, 'index.js'))).value.toString(),
				},
				{ differentDirectories: true, first: 'first', second: 'second' },
			);

			first.dispose();
			second.dispose();
		});

		test('does not trust client-provided parsed contents or metadata', async () => {
			await seedPluginDir('metadata', { 'index.js': 'content' });
			const ref: ClientPluginCustomization = {
				...makeRef('metadata', 'nonce'),
				clientId: 'test-client',
				load: { kind: CustomizationLoadStatus.Degraded, message: 'Parsed with a warning' },
				childEnablement: { server: [] },
				_meta: { defaultCwd: '/workspace' },
				children: [],
			};

			const capture = await manager.captureCustomizations('test-client', [ref]);
			const captured = capture.customizations[0] as ClientPluginCustomization;

			assert.deepStrictEqual(
				{
					load: captured.load,
					childEnablement: captured.childEnablement,
					meta: captured._meta,
					children: captured.children,
					hasClientId: Object.hasOwn(captured, 'clientId'),
				},
				{
					load: undefined,
					childEnablement: undefined,
					meta: undefined,
					children: undefined,
					hasClientId: false,
				},
			);

			capture.dispose();
		});

		test('keeps durable holders through startup global and per-plugin cleanup', async () => {
			const smallManager = new AgentPluginManager(basePath, fileService, new NullLogService(), 1);
			await seedPluginDir('retained', { 'index.js': 'v1' });
			const retained = await smallManager.captureCustomizations('test-client', [makeRef('retained', 'one')]);
			const retainedDir = smallManager.getCapturedPluginDir(retained.customizations[0].uri)!;
			retained.dispose();
			await smallManager.retainCustomizationHolders(new Map([['automation:one', retained.customizations]]));

			const restarted = new AgentPluginManager(basePath, fileService, new NullLogService(), 1);
			for (let i = 2; i <= 9; i++) {
				await seedPluginDir('retained', { 'index.js': `v${i}` });
				const capture = await restarted.captureCustomizations('test-client', [makeRef('retained', `${i}`)]);
				capture.dispose();
			}

			assert.strictEqual(await fileService.exists(retainedDir), true);
		});

		test('preserves durable holders while replacing a captured revision and syncing its unchanged source', async () => {
			const smallManager = new AgentPluginManager(basePath, fileService, new NullLogService(), 1);
			const ref = makeRef('holder-update', 'nonce');
			await seedPluginDir('holder-update', { 'index.js': 'v1' });
			const initial = await smallManager.captureCustomizations('test-client', [ref]);
			const capturedDir = smallManager.getCapturedPluginDir(initial.customizations[0].uri)!;
			initial.dispose();
			await smallManager.retainCustomizationHolders(new Map([['automation:holder-update', initial.customizations]]));

			await fileService.del(capturedDir, { recursive: true });
			const replacement = await smallManager.captureCustomizations('test-client', [ref]);
			replacement.dispose();
			await smallManager.syncCustomizations('test-client', [ref]);

			assert.deepStrictEqual(
				{
					exists: await fileService.exists(capturedDir),
					holders: await readCacheHolders(),
				},
				{ exists: true, holders: new Set(['automation:holder-update']) },
			);
		});

		test('reconciles multiple holders independently', async () => {
			const smallManager = new AgentPluginManager(basePath, fileService, new NullLogService(), 1);
			await seedPluginDir('holders', { 'index.js': 'one' });
			const first = await smallManager.captureCustomizations('test-client', [makeRef('holders', 'one')]);
			const firstDir = smallManager.getCapturedPluginDir(first.customizations[0].uri)!;
			first.dispose();
			await smallManager.retainCustomizationHolders(new Map([
				['automation:first', first.customizations],
				['automation:second', first.customizations],
			]));

			await smallManager.reconcileCustomizationHolders('automation:', new Map([
				['automation:first', first.customizations],
			]));
			await seedPluginDir('holders', { 'index.js': 'two' });
			const second = await smallManager.captureCustomizations('test-client', [makeRef('holders', 'two')]);
			second.dispose();

			assert.deepStrictEqual(
				{
					exists: await fileService.exists(firstDir),
					holders: await readCacheHolders(),
				},
				{ exists: true, holders: new Set(['automation:first']) },
			);
		});

		test('forgets captured directory lookups after eviction', async () => {
			const smallManager = new AgentPluginManager(basePath, fileService, new NullLogService(), 1);
			await seedPluginDir('lookup', { 'index.js': 'v1' });
			const first = await smallManager.captureCustomizations('test-client', [makeRef('lookup', 'one')]);
			const firstUri = first.customizations[0].uri;
			first.dispose();

			await seedPluginDir('lookup', { 'index.js': 'v2' });
			const second = await smallManager.captureCustomizations('test-client', [makeRef('lookup', 'two')]);

			assert.strictEqual(smallManager.getCapturedPluginDir(firstUri), undefined);

			second.dispose();
		});

		test('releases a rolled-back capture lease without adding durable holders', async () => {
			const smallManager = new AgentPluginManager(basePath, fileService, new NullLogService(), 1);
			await seedPluginDir('restart', { 'index.js': 'v1' });
			const retained = await smallManager.captureCustomizations('test-client', [makeRef('restart', 'one')]);
			const retainedDir = smallManager.getCapturedPluginDir(retained.customizations[0].uri)!;
			retained.dispose();
			await smallManager.retainCustomizationHolders(new Map([['automation:retained', retained.customizations]]));

			await seedPluginDir('restart', { 'index.js': 'v2' });
			const rollback = await smallManager.captureCustomizations('test-client', [makeRef('restart', 'two')]);
			const rollbackDir = smallManager.getCapturedPluginDir(rollback.customizations[0].uri)!;
			rollback.dispose();

			const restarted = new AgentPluginManager(basePath, fileService, new NullLogService(), 1);
			await seedPluginDir('restart', { 'index.js': 'v3' });
			const latest = await restarted.captureCustomizations('test-client', [makeRef('restart', 'three')]);

			assert.deepStrictEqual(
				{
					retained: await fileService.exists(retainedDir),
					rolledBack: await fileService.exists(rollbackDir),
				},
				{ retained: true, rolledBack: false },
			);

			latest.dispose();
		});

		test('preserves an adopted retained capture when recapturing its original source', async () => {
			await seedPluginDir('cache-loss', { 'index.js': 'v1' });
			const captured = await manager.captureCustomizations('test-client', [makeRef('cache-loss', 'nonce')]);
			const capturedDir = manager.getCapturedPluginDir(captured.customizations[0].uri)!;
			captured.dispose();
			await manager.retainCustomizationHolders(new Map([['automation:cache-loss', captured.customizations]]));

			await fileService.del(URI.joinPath(basePath, 'agentPlugins', 'cache.json'));
			const restarted = new AgentPluginManager(basePath, fileService, new NullLogService(), 1);
			await restarted.retainCustomizationHolders(new Map([['automation:cache-loss', captured.customizations]]));
			const recaptured = await restarted.captureCustomizations('test-client', [makeRef('cache-loss', 'nonce')]);
			recaptured.dispose();

			await seedPluginDir('eviction-pressure', { 'index.js': 'v2' });
			const pressure = await restarted.captureCustomizations('test-client', [makeRef('eviction-pressure', 'nonce')]);
			const pressureDir = restarted.getCapturedPluginDir(pressure.customizations[0].uri)!;
			pressure.dispose();
			const morePressure = await restarted.captureCustomizations('test-client', [makeRef('eviction-pressure', 'nonce-2')]);
			morePressure.dispose();

			const restartedAgain = new AgentPluginManager(basePath, fileService, new NullLogService(), 1);
			await restartedAgain.retainCustomizationHolders(new Map([['automation:cache-loss', captured.customizations]]));
			const cachePath = URI.joinPath(basePath, 'agentPlugins', 'cache.json');
			const cacheEntries: { capturedUri?: string }[] = JSON.parse((await fileService.readFile(cachePath)).value.toString());

			assert.deepStrictEqual(
				{
					uri: restartedAgain.getCapturedPluginDir(captured.customizations[0].uri)?.toString(),
					content: (await fileService.readFile(URI.joinPath(capturedDir, 'index.js'))).value.toString(),
					holders: await readCacheHolders(),
					matchingCacheEntries: cacheEntries.filter(entry => entry.capturedUri === captured.customizations[0].uri).length,
					pressureEvicted: !(await fileService.exists(pressureDir)),
				},
				{ uri: captured.customizations[0].uri, content: 'v1', holders: new Set(['automation:cache-loss']), matchingCacheEntries: 1, pressureEvicted: true },
			);
		});

		test('keeps durable cache content when an atomic holder reconciliation write fails', async () => {
			const smallManager = new AgentPluginManager(basePath, fileService, new NullLogService(), 1);
			await seedPluginDir('durable', { 'index.js': 'one' });
			const retained = await smallManager.captureCustomizations('test-client', [makeRef('durable', 'one')]);
			const retainedDir = smallManager.getCapturedPluginDir(retained.customizations[0].uri)!;
			retained.dispose();
			await smallManager.retainCustomizationHolders(new Map([['automation:durable', retained.customizations]]));
			const cachePath = URI.joinPath(basePath, 'agentPlugins', 'cache.json');
			const cacheContent = (await fileService.readFile(cachePath)).value.toString();

			provider.cacheWriteAtomicOptions.length = 0;
			provider.failCacheWrite = true;
			await assert.rejects(() => smallManager.reconcileCustomizationHolders('automation:', new Map()));
			provider.failCacheWrite = false;

			assert.deepStrictEqual(
				{
					atomicOptions: provider.cacheWriteAtomicOptions,
					cacheContent: (await fileService.readFile(cachePath)).value.toString(),
				},
				{
					atomicOptions: [{ postfix: '.tmp' }],
					cacheContent,
				},
			);

			const restarted = new AgentPluginManager(basePath, fileService, new NullLogService(), 1);
			await seedPluginDir('durable', { 'index.js': 'two' });
			const replacement = await restarted.captureCustomizations('test-client', [makeRef('durable', 'two')]);
			replacement.dispose();

			assert.strictEqual(await fileService.exists(retainedDir), true);
		});

		test('keeps a queued holder registration after an overlapping registration fails', async () => {
			const smallManager = new AgentPluginManager(basePath, fileService, new NullLogService(), 1);
			await seedPluginDir('overlapping-holders', { 'index.js': 'one' });
			const captured = await smallManager.captureCustomizations('test-client', [makeRef('overlapping-holders', 'one')]);
			const capturedDir = smallManager.getCapturedPluginDir(captured.customizations[0].uri)!;
			captured.dispose();

			provider.failCacheWrites = 1;
			const [first, second] = await Promise.allSettled([
				smallManager.retainCustomizationHolders(new Map([['automation:first', captured.customizations]])),
				smallManager.retainCustomizationHolders(new Map([['automation:second', captured.customizations]])),
			]);

			assert.deepStrictEqual(
				{
					first: first.status,
					second: second.status,
					holders: await readCacheHolders(),
					captured: await fileService.exists(capturedDir),
				},
				{
					first: 'rejected',
					second: 'fulfilled',
					holders: new Set(['automation:second']),
					captured: true,
				},
			);
		});

		test('rejects holder reconciliation outside its prefix without changing durable holders', async () => {
			await seedPluginDir('holder-prefix', { 'index.js': 'one' });
			const captured = await manager.captureCustomizations('test-client', [makeRef('holder-prefix', 'one')]);
			captured.dispose();
			await manager.retainCustomizationHolders(new Map([['automation:preserved', captured.customizations]]));

			await assert.rejects(
				() => manager.reconcileCustomizationHolders('automation:', new Map([['other:invalid', captured.customizations]])),
				/does not belong/,
			);

			assert.deepStrictEqual(await readCacheHolders(), new Set(['automation:preserved']));
		});

		test('removes stale holders only after authoritative reconciliation', async () => {
			const smallManager = new AgentPluginManager(basePath, fileService, new NullLogService(), 1);
			await seedPluginDir('stale', { 'index.js': 'one' });
			const stale = await smallManager.captureCustomizations('test-client', [makeRef('stale', 'one')]);
			const staleDir = smallManager.getCapturedPluginDir(stale.customizations[0].uri)!;
			stale.dispose();
			await smallManager.retainCustomizationHolders(new Map([['automation:stale', stale.customizations]]));

			await seedPluginDir('stale', { 'index.js': 'two' });
			const beforeReconcile = await smallManager.captureCustomizations('test-client', [makeRef('stale', 'two')]);
			beforeReconcile.dispose();
			assert.strictEqual(await fileService.exists(staleDir), true);

			await smallManager.reconcileCustomizationHolders('automation:', new Map());
			await seedPluginDir('stale', { 'index.js': 'three' });
			const afterReconcile = await smallManager.captureCustomizations('test-client', [makeRef('stale', 'three')]);
			afterReconcile.dispose();
			assert.strictEqual(await fileService.exists(staleDir), false);
		});

		test('loads legacy cache entries without durable holders', async () => {
			await seedPluginDir('legacy', { 'index.js': 'one' });
			const first = await manager.captureCustomizations('test-client', [makeRef('legacy', 'one')]);
			const firstDir = manager.getCapturedPluginDir(first.customizations[0].uri)!;
			first.dispose();

			const restarted = new AgentPluginManager(basePath, fileService, new NullLogService(), 1);
			await seedPluginDir('legacy', { 'index.js': 'two' });
			const second = await restarted.captureCustomizations('test-client', [makeRef('legacy', 'two')]);
			second.dispose();

			assert.strictEqual(await fileService.exists(firstDir), false);
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
	});
});
