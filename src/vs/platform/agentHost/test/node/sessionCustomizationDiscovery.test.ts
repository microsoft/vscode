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
import { SessionPluginBundler } from '../../node/shared/sessionPluginBundler.js';

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
		const directories = await discovery.directories();
		const files = directories.flatMap(directory => directory.files.map(uri => ({ uri, type: directory.type })));

		assert.deepStrictEqual([...files].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())), [
			{ uri: userAgent, type: DiscoveredType.Agent },
			{ uri: userSkill, type: DiscoveredType.Skill },
			{ uri: wsAgent, type: DiscoveredType.Agent },
			{ uri: wsInstr, type: DiscoveredType.Instruction },
			{ uri: wsSkill, type: DiscoveredType.Skill },
		].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())));
		assert.ok(directories.some(directory => directory.uri.toString() === URI.joinPath(workspace, '.github', 'agents').toString()));
	});

	test('excludes exact-case README.md inside agent folders', async () => {
		const wsAgent = await seed('/workspace/.github/agents/foo.agent.md', 'agent body');
		const wsPlainAgent = await seed('/workspace/.github/agents/plain.md', 'plain agent body');
		const wsLowerReadmeAgent = await seed('/workspace/.github/agents/readme.md', 'docs lower');
		await seed('/workspace/.github/agents/README.md', 'docs');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		const files = (await discovery.directories()).flatMap(directory => directory.files.map(uri => ({ uri, type: directory.type })));

		assert.deepStrictEqual([...files].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())), [
			{ uri: wsAgent, type: DiscoveredType.Agent },
			{ uri: wsLowerReadmeAgent, type: DiscoveredType.Agent },
			{ uri: wsPlainAgent, type: DiscoveredType.Agent },
		].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())));
	});

	test('includes non-README markdown files inside agent folders', async () => {
		const wsAgent = await seed('/workspace/.github/agents/foo.agent.md', 'agent body');
		const wsLegacyMode = await seed('/workspace/.github/agents/legacy.chatmode.md', 'legacy mode body');
		const wsPrompt = await seed('/workspace/.github/agents/bar.prompt.md', 'prompt body');
		const wsInstruction = await seed('/workspace/.github/agents/baz.instructions.md', 'instruction body');
		const wsCopilotInstructions = await seed('/workspace/.github/agents/copilot-instructions.md', 'copilot instructions body');
		const wsSkill = await seed('/workspace/.github/agents/SKILL.md', 'skill body');
		const wsSkillLowercase = await seed('/workspace/.github/agents/skill.md', 'skill body lowercase');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		const files = (await discovery.directories()).flatMap(directory => directory.files.map(uri => ({ uri, type: directory.type })));

		assert.deepStrictEqual([...files].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())), [
			{ uri: wsCopilotInstructions, type: DiscoveredType.Agent },
			{ uri: wsAgent, type: DiscoveredType.Agent },
			{ uri: wsInstruction, type: DiscoveredType.Agent },
			{ uri: wsLegacyMode, type: DiscoveredType.Agent },
			{ uri: wsPrompt, type: DiscoveredType.Agent },
			{ uri: wsSkill, type: DiscoveredType.Agent },
			{ uri: wsSkillLowercase, type: DiscoveredType.Agent },
		].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())));
	});

	test('discovers nested .instructions.md files', async () => {
		const nestedWsInstr = await seed('/workspace/.github/instructions/team/security/policy.instructions.md', 'workspace nested instruction');
		const nestedUserInstr = await seed('/home/.copilot/instructions/domain/tools/deep.instructions.md', 'user nested instruction');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		const files = (await discovery.directories()).flatMap(directory => directory.files.map(uri => ({ uri, type: directory.type })));

		assert.deepStrictEqual([...files].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())), [
			{ uri: nestedUserInstr, type: DiscoveredType.Instruction },
			{ uri: nestedWsInstr, type: DiscoveredType.Instruction },
		].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())));
	});

	test('bundles discovered files into the synthetic plugin tree', async () => {
		await seed('/workspace/.github/agents/foo.agent.md', 'agent body');
		await seed('/workspace/.github/skills/bar/SKILL.md', 'skill body');
		await seed('/workspace/.github/instructions/baz.instructions.md', 'instr body');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		const bundler = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
		const directories = await discovery.directories();
		const result = await bundler.bundle(directories);

		assert.ok(result);
		assert.strictEqual(result.ref.name, 'VS Code Synced Data');
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

	test('bundles nested .instructions.md files into rules', async () => {
		await seed('/workspace/.github/instructions/team/security/policy.instructions.md', 'workspace nested instruction');
		await seed('/home/.copilot/instructions/domain/tools/deep.instructions.md', 'user nested instruction');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		const bundler = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
		const result = await bundler.bundle(await discovery.directories());

		assert.ok(result);

		const root = bundler.rootUri;
		const workspaceInstr = await fileService.readFile(URI.joinPath(root, 'rules', 'policy.instructions.md'));
		assert.strictEqual(workspaceInstr.value.toString(), 'workspace nested instruction');

		const userInstr = await fileService.readFile(URI.joinPath(root, 'rules', 'deep.instructions.md'));
		assert.strictEqual(userInstr.value.toString(), 'user nested instruction');
	});

	test('returns undefined when no files were discovered', async () => {
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		const bundler = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
		const directories = await discovery.directories();
		const result = await bundler.bundle(directories);
		assert.strictEqual(result, undefined);
	});

	test('produces a stable nonce for identical content', async () => {
		await seed('/workspace/.github/agents/foo.agent.md', 'agent body');
		await seed('/workspace/.github/skills/bar/SKILL.md', 'skill body');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		const bundler = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
		const first = await bundler.bundle(await discovery.directories());
		const second = await bundler.bundle(await discovery.directories());
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
