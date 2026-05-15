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
import { IFileService } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IAgentPluginManager } from '../../common/agentPluginManager.js';
import { DiscoveredType, SessionCustomizationDiscovery } from '../../node/copilot/sessionCustomizationDiscovery.js';
import { SessionPluginBundler } from '../../node/copilot/sessionPluginBundler.js';

suite('SessionCustomizationDiscovery + SessionPluginBundler', () => {

	const disposables = new DisposableStore();
	let fileService: FileService;
	let instantiationService: TestInstantiationService;
	let workspace: URI;
	let userHome: URI;
	let pluginBasePath: URI;

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		const memFs = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.inMemory, memFs));

		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, new NullLogService());

		workspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
		userHome = URI.from({ scheme: Schemas.inMemory, path: '/home' });
		pluginBasePath = URI.from({ scheme: Schemas.inMemory, path: '/agentPlugins' });
		instantiationService.stub(IAgentPluginManager, { basePath: pluginBasePath } as Partial<IAgentPluginManager>);
	});

	teardown(() => {
		disposables.clear();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	async function seed(path: string, content = ''): Promise<URI> {
		const uri = URI.from({ scheme: Schemas.inMemory, path });
		await fileService.writeFile(uri, VSBuffer.fromString(content));
		return uri;
	}

	test('discovers agents, skills, and instructions across workspace and home roots', async () => {
		const wsAgent = await seed('/workspace/.github/agents/foo.agent.md', 'agent body');
		const wsSkill = await seed('/workspace/.github/skills/bar/SKILL.md', 'skill body');
		const wsInstr = await seed('/workspace/.github/instructions/baz.instructions.md', 'instr body');
		const userAgent = await seed('/home/.copilot/agents/qux.agent.md', 'user agent');
		const userSkill = await seed('/home/.agents/skills/zap/SKILL.md', 'user skill');
		// Noise that should not be picked up
		await seed('/workspace/.github/agents/not-an-agent.txt', 'ignored');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		const files = await discovery.files();

		assert.deepStrictEqual([...files].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())), [
			{ uri: userAgent, type: DiscoveredType.Agent },
			{ uri: userSkill, type: DiscoveredType.Skill },
			{ uri: wsAgent, type: DiscoveredType.Agent },
			{ uri: wsInstr, type: DiscoveredType.Instruction },
			{ uri: wsSkill, type: DiscoveredType.Skill },
		].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())));
	});

	test('bundles discovered files into the synthetic plugin tree', async () => {
		await seed('/workspace/.github/agents/foo.agent.md', 'agent body');
		await seed('/workspace/.github/skills/bar/SKILL.md', 'skill body');
		await seed('/workspace/.github/instructions/baz.instructions.md', 'instr body');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		const bundler = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
		const files = await discovery.files();
		const result = await bundler.bundle(files);

		assert.ok(result);
		assert.strictEqual(result.ref.displayName, 'VS Code Synced Data');
		assert.ok(result.ref.nonce);

		const root = bundler.rootUri;
		const manifest = await fileService.readFile(URI.joinPath(root, '.plugin', 'plugin.json'));
		assert.match(manifest.value.toString(), /"name": "VS Code Synced Data"/);

		const agent = await fileService.readFile(URI.joinPath(root, 'agents', 'foo.agent.md'));
		assert.strictEqual(agent.value.toString(), 'agent body');

		const skill = await fileService.readFile(URI.joinPath(root, 'skills', 'bar', 'SKILL.md'));
		assert.strictEqual(skill.value.toString(), 'skill body');

		const instr = await fileService.readFile(URI.joinPath(root, 'rules', 'baz.instructions.md'));
		assert.strictEqual(instr.value.toString(), 'instr body');
	});

	test('returns undefined when no files were discovered', async () => {
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		const bundler = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
		const files = await discovery.files();
		const result = await bundler.bundle(files);
		assert.strictEqual(result, undefined);
	});

	test('produces a stable nonce for identical content', async () => {
		await seed('/workspace/.github/agents/foo.agent.md', 'agent body');
		await seed('/workspace/.github/skills/bar/SKILL.md', 'skill body');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		const bundler = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
		const first = await bundler.bundle(await discovery.files());
		const second = await bundler.bundle(await discovery.files());
		assert.ok(first && second);
		assert.strictEqual(first.ref.nonce, second.ref.nonce);
	});

	test('different working directories produce different bundle authorities', async () => {
		const otherWorkspace = URI.from({ scheme: Schemas.inMemory, path: '/other-workspace' });
		const a = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
		const b = disposables.add(instantiationService.createInstance(SessionPluginBundler, otherWorkspace));
		assert.notStrictEqual(a.rootUri.toString(), b.rootUri.toString());
	});
});
