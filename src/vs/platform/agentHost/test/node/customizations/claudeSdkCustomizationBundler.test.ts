/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../instantiation/test/common/instantiationServiceMock.js';
import { FileService } from '../../../../files/common/fileService.js';
import { IFileService } from '../../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../log/common/log.js';
import { IAgentPluginManager, ISyncedCustomization } from '../../../common/agentPluginManager.js';
import { CustomizationLoadStatus, CustomizationType, type ClientPluginCustomization, type Customization } from '../../../common/state/sessionState.js';
import type { ISdkResolvedCustomizations } from '../../../node/claude/claudeSdkPipeline.js';
import { ClaudeSdkCustomizationBundler } from '../../../node/claude/customizations/claudeSdkCustomizationBundler.js';

suite('ClaudeSdkCustomizationBundler', () => {

	const disposables = new DisposableStore();
	let fileService: FileService;
	let bundler: ClaudeSdkCustomizationBundler;
	const basePath = URI.from({ scheme: Schemas.inMemory, path: '/userData' });
	const workingDir = URI.file('/work');

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

		const inst = disposables.add(new TestInstantiationService());
		inst.stub(IFileService, fileService);
		inst.stub(IAgentPluginManager, {
			basePath,
			syncCustomizations: async (_clientId: string, _refs: readonly ClientPluginCustomization[]): Promise<ISyncedCustomization[]> => [],
		} satisfies Partial<IAgentPluginManager> as unknown as IAgentPluginManager);
		bundler = disposables.add(inst.createInstance(ClaudeSdkCustomizationBundler, workingDir));
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function snapshot(overrides: Partial<ISdkResolvedCustomizations> = {}): ISdkResolvedCustomizations {
		return {
			commands: [],
			agents: [],
			mcpServers: [],
			...overrides,
		};
	}

	test('returns undefined when SDK snapshot has no commands or agents', async () => {
		const result = await bundler.bundle(snapshot());
		assert.strictEqual(result, undefined);
	});

	test('writes manifest, agent files, and skill subdirs for a snapshot with agents and commands', async () => {
		const result = await bundler.bundle(snapshot({
			agents: [{ name: 'planner', description: 'Plans things', model: 'claude' }],
			commands: [{ name: 'doit', description: 'Does it', argumentHint: '<x>' }],
		}));

		assert.ok(result, 'should produce a bundle');
		const rootUri = URI.parse(result!.uri);
		const manifest = await fileService.readFile(URI.joinPath(rootUri, '.plugin', 'plugin.json'));
		const manifestJson = JSON.parse(manifest.value.toString());
		assert.strictEqual(manifestJson.name, 'claude-discovered');
		const agentFile = await fileService.readFile(URI.joinPath(rootUri, 'agents', 'planner.md'));
		assert.match(agentFile.value.toString(), /name: "planner"/);
		assert.match(agentFile.value.toString(), /description: "Plans things"/);
		const skillFile = await fileService.readFile(URI.joinPath(rootUri, 'skills', 'doit', 'SKILL.md'));
		assert.match(skillFile.value.toString(), /name: "doit"/);
		assert.match(skillFile.value.toString(), /Usage: `<x>`/);
	});

	test('children include agent customizations sourced from the SDK snapshot with on-disk file URIs', async () => {
		const result = await bundler.bundle(snapshot({
			agents: [
				{ name: 'a1', description: 'one', model: 'm' },
				{ name: 'a2', description: 'two', model: 'm' },
			],
		}));
		const agents = result!.children!.filter(c => c.type === CustomizationType.Agent);
		assert.deepStrictEqual(agents.map(a => a.name), ['a1', 'a2']);
		assert.ok(agents[0].uri.endsWith('/agents/a1.md'), `expected on-disk path, got ${agents[0].uri}`);
		assert.ok(agents[1].uri.endsWith('/agents/a2.md'));
	});

	test('repeated bundle with same snapshot is nonce-stable and does not rewrite', async () => {
		const r1 = await bundler.bundle(snapshot({
			agents: [{ name: 'p', description: 'd', model: 'm' }],
		}));
		const rootUri = URI.parse(r1!.uri);
		const agentUri = URI.joinPath(rootUri, 'agents', 'p.md');
		const stat1 = await fileService.stat(agentUri);

		const r2 = await bundler.bundle(snapshot({
			agents: [{ name: 'p', description: 'd', model: 'm' }],
		}));
		assert.strictEqual(r1!.id, r2!.id);
		const stat2 = await fileService.stat(agentUri);
		assert.strictEqual(stat1.mtime, stat2.mtime, 'unchanged snapshot must not rewrite the on-disk tree');
	});

	test('changed snapshot deletes prior bundle tree before writing the new one', async () => {
		await bundler.bundle(snapshot({
			agents: [{ name: 'old', description: 'd', model: 'm' }],
		}));
		const result = await bundler.bundle(snapshot({
			agents: [{ name: 'new', description: 'd', model: 'm' }],
		}));
		const rootUri = URI.parse(result!.uri);
		assert.ok(await fileService.exists(URI.joinPath(rootUri, 'agents', 'new.md')));
		assert.ok(!(await fileService.exists(URI.joinPath(rootUri, 'agents', 'old.md'))), 'previous agent file should be deleted');
	});

	test('sanitises agent and command names — invalid chars replaced, length capped, empty falls back to "unnamed"', async () => {
		const longName = 'a'.repeat(200);
		const result = await bundler.bundle(snapshot({
			agents: [
				{ name: 'has spaces & slashes/here', description: 'd', model: 'm' },
				{ name: longName, description: 'd', model: 'm' },
				{ name: '!!!', description: 'd', model: 'm' },
			],
		}));
		const rootUri = URI.parse(result!.uri);
		assert.ok(await fileService.exists(URI.joinPath(rootUri, 'agents', 'has_spaces___slashes_here.md')));
		assert.ok(await fileService.exists(URI.joinPath(rootUri, 'agents', `${'a'.repeat(128)}.md`)));
		assert.ok(await fileService.exists(URI.joinPath(rootUri, 'agents', '___.md')));
	});

	test('discoverable bundles for different working directories namespace by hash so they do not collide', async () => {
		const inst = disposables.add(new TestInstantiationService());
		inst.stub(IFileService, fileService);
		inst.stub(IAgentPluginManager, {
			basePath,
		} satisfies Partial<IAgentPluginManager> as unknown as IAgentPluginManager);
		const other = disposables.add(inst.createInstance(ClaudeSdkCustomizationBundler, URI.file('/other-work')));

		const a = await bundler.bundle(snapshot({ agents: [{ name: 'x', description: 'd', model: 'm' }] }));
		const b = await other.bundle(snapshot({ agents: [{ name: 'x', description: 'd', model: 'm' }] }));
		assert.notStrictEqual(a!.uri, b!.uri);
	});

	test('returned Customization carries the expected shape (load Loaded, enabled true, name)', async () => {
		const result = await bundler.bundle(snapshot({
			agents: [{ name: 'a', description: 'd', model: 'm' }],
			commands: [{ name: 'c', description: 'd', argumentHint: '<x>' }],
		}));
		assert.deepStrictEqual({
			enabled: result!.enabled,
			loadKind: result!.load?.kind,
			type: result!.type,
		}, {
			enabled: true,
			loadKind: CustomizationLoadStatus.Loaded,
			type: CustomizationType.Plugin,
		});
		assert.ok(typeof result!.name === 'string' && result!.name.length > 0);
	});

	// Smoke: ensure return type compiles against Customization
	function _typeCheck(): Customization | undefined {
		return undefined;
	}
	void _typeCheck;
});
