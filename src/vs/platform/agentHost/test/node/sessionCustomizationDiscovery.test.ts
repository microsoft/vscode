/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { DeferredPromise, raceTimeout, timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { Promises } from '../../../../base/node/pfs.js';
import { flakySuite } from '../../../../base/test/common/testUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getRandomTestPath } from '../../../../base/test/node/testUtils.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileService } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { DiskFileSystemProvider } from '../../../files/node/diskFileSystemProvider.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IAgentPluginManager } from '../../common/agentPluginManager.js';
import { DiscoveredType, SessionCustomizationDiscovery } from '../../node/copilot/sessionCustomizationDiscovery.js';
import { SessionPluginBundler } from '../../node/shared/sessionPluginBundler.js';
import { mapToParsedPlugin, toDiscoveredDirectoryCustomizations } from '../../node/copilot/copilotAgent.js';

suite('SessionCustomizationDiscovery', () => {

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

	test('discovers supported agent instruction files in workspace roots', async () => {
		const wsCopilotInstructions = await seed('/workspace/.github/copilot-instructions.md', 'workspace copilot instructions');
		const wsGeminiInstructions = await seed('/workspace/GEMINI.md', 'workspace gemini instructions');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		const files = (await discovery.scan(CancellationToken.None))
			.flatMap(directory => directory.files.map(file => ({ uri: file.uri, type: directory.type })))
			.filter(entry => entry.type === DiscoveredType.AgentInstruction)
			.map(entry => entry.uri.toString())
			.sort((a, b) => a.localeCompare(b));

		assert.deepStrictEqual(files, [
			wsCopilotInstructions.toString(),
			wsGeminiInstructions.toString(),
		].sort((a, b) => a.localeCompare(b)));
	});

	test('returns directories sorted by type and URI', async () => {
		await seed('/workspace/.github/agents/aaa.agent.md', 'workspace agent a');
		await seed('/workspace/.github/agents/foo.agent.md', 'workspace agent');
		await seed('/workspace/.github/skills/alpha/SKILL.md', 'workspace skill alpha');
		await seed('/workspace/.github/skills/bar/SKILL.md', 'workspace skill');
		await seed('/workspace/.github/instructions/alpha.instructions.md', 'workspace instruction alpha');
		await seed('/workspace/.github/instructions/baz.instructions.md', 'workspace instruction');
		await seed('/workspace/.github/copilot-instructions.md', 'workspace copilot instructions');
		await seed('/home/.copilot/agents/abc.agent.md', 'user agent abc');
		await seed('/home/.copilot/agents/qux.agent.md', 'user agent');
		await seed('/home/.agents/skills/aaa/SKILL.md', 'user skill aaa');
		await seed('/home/.agents/skills/zap/SKILL.md', 'user skill');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		const directories = await discovery.scan(CancellationToken.None);
		const actual = directories.map(directory => `${directory.type}:${directory.uri.toString()}`);
		const expected = [...actual].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);

		assert.deepStrictEqual(actual, expected);
		for (const directory of directories) {
			const actualFiles = directory.files.map(file => file.uri.toString());
			const expectedFiles = [...actualFiles].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
			assert.deepStrictEqual(actualFiles, expectedFiles);
		}
	});

	test('does not discover agent instruction files outside supported roots', async () => {
		await seed('/workspace/.github/copilot-instructions.md', 'workspace copilot instructions');
		await seed('/workspace/docs/AGENTS.md', 'unsupported root');
		await seed('/workspace/.claude/GEMINI.md', 'unsupported filename in .claude');
		await seed('/home/copilot-instructions.md', 'unsupported home root');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		const files = (await discovery.scan(CancellationToken.None))
			.flatMap(directory => directory.files.map(file => ({ uri: file.uri, type: directory.type })))
			.filter(entry => entry.type === DiscoveredType.AgentInstruction)
			.map(entry => entry.uri.toString())
			.sort((a, b) => a.localeCompare(b));

		assert.deepStrictEqual(files, [
			URI.from({ scheme: Schemas.inMemory, path: '/workspace/.github/copilot-instructions.md' }).toString(),
		]);
	});

	test('installs watchers for roots that contain discovered customizations', async () => {
		await seed('/workspace/.github/agents/foo.agent.md', 'workspace agent');
		await seed('/workspace/.github/skills/bar/SKILL.md', 'workspace skill');
		await seed('/workspace/.github/instructions/rules.instructions.md', 'workspace instruction');
		await seed('/workspace/.github/copilot-instructions.md', 'workspace copilot instructions');
		await seed('/workspace/.claude/CLAUDE.md', 'workspace claude instruction');
		await seed('/home/.copilot/agents/user.agent.md', 'user agent');
		await seed('/home/.agents/skills/user-skill/SKILL.md', 'user skill');
		await seed('/home/.copilot/instructions/user.instructions.md', 'user instruction');
		await seed('/home/.copilot/copilot-instructions.md', 'user copilot instructions');

		const watchCalls: Array<{ resource: string; recursive: boolean }> = [];
		const originalWatch = fileService.watch.bind(fileService);
		disposables.add({ dispose: () => { fileService.watch = originalWatch as typeof fileService.watch; } });
		fileService.watch = ((resource, options) => {
			watchCalls.push({ resource: resource.toString(), recursive: options?.recursive === true });
			return originalWatch(resource, options);
		}) as typeof fileService.watch;

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		await discovery.scan(CancellationToken.None);

		const watched = new Map<string, boolean>();
		for (const call of watchCalls) {
			const previous = watched.get(call.resource);
			watched.set(call.resource, previous === true || call.recursive);
		}
		assert.strictEqual(watched.get(workspace.toString()), false);
		assert.strictEqual(watched.get(URI.joinPath(workspace, '.github').toString()), false);
		assert.strictEqual(watched.get(URI.joinPath(workspace, '.claude').toString()), false);
		assert.strictEqual(watched.get(URI.joinPath(workspace, '.github', 'agents').toString()), false);
		assert.strictEqual(watched.get(URI.joinPath(workspace, '.github', 'skills').toString()), true);
		assert.strictEqual(watched.get(URI.joinPath(workspace, '.github', 'instructions').toString()), true);
		assert.strictEqual(watched.get(URI.joinPath(userHome, '.copilot').toString()), false);
		assert.strictEqual(watched.get(URI.joinPath(userHome, '.copilot', 'agents').toString()), false);
		assert.strictEqual(watched.get(URI.joinPath(userHome, '.agents', 'skills').toString()), true);
		assert.strictEqual(watched.get(URI.joinPath(userHome, '.copilot', 'instructions').toString()), true);
	});

	test('refresh keeps existing watchers when discovered roots are unchanged', async () => {
		await seed('/workspace/.github/agents/foo.agent.md', 'workspace agent');

		const watchCalls: string[] = [];
		let watchDisposeCalls = 0;
		const originalWatch = fileService.watch.bind(fileService);
		disposables.add({ dispose: () => { fileService.watch = originalWatch as typeof fileService.watch; } });
		fileService.watch = ((resource, options) => {
			watchCalls.push(resource.toString());
			const disposable = originalWatch(resource, options);
			return {
				dispose: () => {
					watchDisposeCalls++;
					disposable.dispose();
				}
			};
		}) as typeof fileService.watch;

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		await discovery.scan(CancellationToken.None);
		const watchCallsAfterFirstScan = watchCalls.length;

		await discovery.scan(CancellationToken.None);

		assert.strictEqual(watchCalls.length, watchCallsAfterFirstScan, 'expected no new watch registrations for unchanged roots');
		assert.strictEqual(watchDisposeCalls, 0, 'expected existing watchers to remain active for unchanged roots');
	});

	test('fires onDidChange when a new agent file is added under a non-recursively watched root', async () => {
		// Seed an existing agent so `.github/agents` is discovered and watched.
		await seed('/workspace/.github/agents/foo.agent.md', 'workspace agent');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		await discovery.scan(CancellationToken.None);

		// Flush buffered file change events from the initial seed/scan so the
		// assertion below only observes the event triggered by the new file.
		await timeout(50);

		let changeCount = 0;
		const fired = new DeferredPromise<void>();
		disposables.add(discovery.onDidChange(() => {
			changeCount++;
			fired.complete();
		}));

		await seed('/workspace/.github/agents/bar.agent.md', 'new workspace agent');
		await raceTimeout(fired.p, 500);

		assert.strictEqual(changeCount, 1, 'expected onDidChange to fire for a new agent file inside the watched directory');
	});

	test('fires onDidChange when an existing agent file is modified under a non-recursively watched root', async () => {
		await seed('/workspace/.github/agents/foo.agent.md', 'workspace agent');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		await discovery.scan(CancellationToken.None);
		await timeout(50);

		let changeCount = 0;
		const fired = new DeferredPromise<void>();
		disposables.add(discovery.onDidChange(() => {
			changeCount++;
			fired.complete();
		}));

		// Overwrite the existing agent file to produce an UPDATED event.
		await seed('/workspace/.github/agents/foo.agent.md', 'workspace agent (updated)');
		await raceTimeout(fired.p, 500);

		assert.strictEqual(changeCount, 1, 'expected onDidChange to fire when an existing agent file is modified');
	});

	test('fires onDidChange when an existing agent file is deleted under a non-recursively watched root', async () => {
		const agentUri = await seed('/workspace/.github/agents/foo.agent.md', 'workspace agent');
		// Seed a second agent so the parent directory still exists after the deletion.
		await seed('/workspace/.github/agents/bar.agent.md', 'workspace agent bar');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		await discovery.scan(CancellationToken.None);
		await timeout(50);

		let changeCount = 0;
		const fired = new DeferredPromise<void>();
		disposables.add(discovery.onDidChange(() => {
			changeCount++;
			fired.complete();
		}));

		await fileService.del(agentUri);
		await raceTimeout(fired.p, 500);

		assert.strictEqual(changeCount, 1, 'expected onDidChange to fire when an existing agent file is deleted');
	});

	test('fires onDidChange when AGENTS.md in the workspace root is modified', async () => {
		// AGENTS.md lives directly under the workspace root, which is watched non-recursively.
		await seed('/workspace/AGENTS.md', 'agents instructions');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		await discovery.scan(CancellationToken.None);
		await timeout(50);

		let changeCount = 0;
		const fired = new DeferredPromise<void>();
		disposables.add(discovery.onDidChange(() => {
			changeCount++;
			fired.complete();
		}));

		await seed('/workspace/AGENTS.md', 'agents instructions (updated)');
		await raceTimeout(fired.p, 500);

		assert.strictEqual(changeCount, 1, 'expected onDidChange to fire when AGENTS.md at the workspace root is modified');
	});

	test('cancellation of one caller does not affect another concurrent caller', async () => {
		await seed('/workspace/.github/agents/foo.agent.md', 'workspace agent');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		const cancelSource = new CancellationTokenSource();
		disposables.add(cancelSource);

		const cancelled = discovery.scan(cancelSource.token);
		const nonCancelled = discovery.scan(CancellationToken.None);
		cancelSource.cancel();

		await assert.rejects(cancelled);
		const directories = await nonCancelled;
		assert.ok(directories.some(directory => directory.type === DiscoveredType.Agent));
	});

	test('discovers agents, skills, and instructions across workspace and home roots', async () => {
		const wsAgent = await seed('/workspace/.github/agents/foo.agent.md', 'agent body');
		const wsSkill = await seed('/workspace/.github/skills/bar/SKILL.md', 'skill body');
		const wsInstr = await seed('/workspace/.github/instructions/baz.instructions.md', 'instr body');
		const userAgent = await seed('/home/.copilot/agents/qux.agent.md', 'user agent');
		const userSkill = await seed('/home/.agents/skills/zap/SKILL.md', 'user skill');
		// Noise that should not be picked up
		await seed('/workspace/.github/agents/not-an-agent.txt', 'ignored');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		const directories = await discovery.scan(CancellationToken.None);
		const files = directories.flatMap(directory => directory.files.map(file => ({ uri: file.uri, type: directory.type })));

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
		const files = (await discovery.scan(CancellationToken.None)).flatMap(directory => directory.files.map(file => ({ uri: file.uri, type: directory.type })));

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
		const files = (await discovery.scan(CancellationToken.None)).flatMap(directory => directory.files.map(file => ({ uri: file.uri, type: directory.type })));

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
		const files = (await discovery.scan(CancellationToken.None)).flatMap(directory => directory.files.map(file => ({ uri: file.uri, type: directory.type })));

		assert.deepStrictEqual([...files].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())), [
			{ uri: nestedUserInstr, type: DiscoveredType.Instruction },
			{ uri: nestedWsInstr, type: DiscoveredType.Instruction },
		].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())));
	});



	test('bundles nested .instructions.md files into rules', async () => {
		await seed('/workspace/.github/instructions/team/security/policy.instructions.md', 'workspace nested instruction');
		await seed('/home/.copilot/instructions/domain/tools/deep.instructions.md', 'user nested instruction');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		const bundler = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
		const result = await bundler.bundle(await discovery.scan(CancellationToken.None));

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
		const directories = await discovery.scan(CancellationToken.None);
		const result = await bundler.bundle(directories);
		assert.strictEqual(result, undefined);
	});

	test('maps discovered files to parsed plugin preserving source URIs', async () => {
		const agent = await seed('/workspace/.github/agents/foo.agent.md', '---\nname: Workspace Agent\ndescription: Agent description\n---\nbody');
		const skill = await seed('/workspace/.github/skills/bar/SKILL.md', '---\nname: Workspace Skill\ndescription: Skill description\n---\nbody');
		const instruction = await seed('/workspace/.github/instructions/baz.instructions.md', '---\nname: Workspace Rule\ndescription: Rule description\nglobs:\n  - src/**\n---\nbody');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		const customizations = await toDiscoveredDirectoryCustomizations(await discovery.scan(CancellationToken.None), fileService);

		const plugin = mapToParsedPlugin(customizations);

		assert.ok(plugin);
		assert.strictEqual(plugin.agents.length, 1);
		assert.strictEqual(plugin.skills.length, 1);
		assert.strictEqual(plugin.instructions.length, 1);
		assert.deepStrictEqual(
			{
				agentUri: plugin.agents[0].uri.toString(),
				agentDescription: plugin.agents[0].description,
				skillUri: plugin.skills[0].uri.toString(),
				skillDescription: plugin.skills[0].description,
				ruleUri: plugin.instructions[0].uri.toString(),
				ruleDescription: plugin.instructions[0].description,
			},
			{
				agentUri: agent.toString(),
				agentDescription: 'Agent description',
				skillUri: skill.toString(),
				skillDescription: 'Skill description',
				ruleUri: instruction.toString(),
				ruleDescription: 'Rule description',
			}
		);
	});

	test('does not include parsed agent-instruction rules in mapToParsedPlugin output', async () => {
		await seed('/workspace/.github/copilot-instructions.md', 'workspace instructions');
		await seed('/workspace/.agents/skills/bar/SKILL.md', '---\nname: bar\ndescription: Skill description\n---\nbody');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		const customizations = await toDiscoveredDirectoryCustomizations(await discovery.scan(CancellationToken.None), fileService);

		const plugin = mapToParsedPlugin(customizations);

		assert.ok(plugin);
		assert.strictEqual(plugin.skills.length, 1);
		assert.strictEqual(plugin.instructions.length, 0);
	});

	test('returns undefined from mapToParsedPlugin when all customizations are agent-instruction files', async () => {
		// Only agent instruction files are discovered — these are excluded from the parsed plugin output.
		await seed('/workspace/.github/copilot-instructions.md', 'workspace instructions');
		await seed('/home/.copilot/copilot-instructions.md', 'user instructions');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		const customizations = await toDiscoveredDirectoryCustomizations(await discovery.scan(CancellationToken.None), fileService);

		const plugin = mapToParsedPlugin(customizations);

		assert.strictEqual(plugin, undefined);
	});
});


suite('SessionPluginBundler', () => {
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

	test('bundles discovered files into the synthetic plugin tree', async () => {
		await seed('/workspace/.github/agents/foo.agent.md', 'agent body');
		await seed('/workspace/.github/skills/bar/SKILL.md', 'skill body');
		await seed('/workspace/.github/instructions/baz.instructions.md', 'instr body');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		const bundler = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
		const directories = await discovery.scan(CancellationToken.None);
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


	test('produces a stable nonce for identical content', async () => {
		await seed('/workspace/.github/agents/foo.agent.md', 'agent body');
		await seed('/workspace/.github/skills/bar/SKILL.md', 'skill body');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		const bundler = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
		const first = await bundler.bundle(await discovery.scan(CancellationToken.None));

		let writeCalls = 0;
		let deleteCalls = 0;
		const originalWriteFile = fileService.writeFile.bind(fileService);
		const originalDel = fileService.del.bind(fileService);
		disposables.add({
			dispose: () => {
				fileService.writeFile = originalWriteFile as typeof fileService.writeFile;
				fileService.del = originalDel as typeof fileService.del;
			}
		});
		fileService.writeFile = ((...args: Parameters<typeof fileService.writeFile>) => {
			writeCalls++;
			return originalWriteFile(...args);
		}) as typeof fileService.writeFile;
		fileService.del = ((...args: Parameters<typeof fileService.del>) => {
			deleteCalls++;
			return originalDel(...args);
		}) as typeof fileService.del;

		const second = await bundler.bundle(await discovery.scan(CancellationToken.None));
		assert.ok(first);
		assert.ok(second);
		assert.deepStrictEqual({
			firstNonce: first.ref.nonce,
			secondNonce: second.ref.nonce,
			writeCalls,
			deleteCalls,
		}, {
			firstNonce: first.ref.nonce,
			secondNonce: first.ref.nonce,
			writeCalls: 0,
			deleteCalls: 0,
		});
	});

	test('returns undefined without rewriting when cancelled', async () => {
		await seed('/workspace/.github/agents/foo.agent.md', 'agent body');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		const bundler = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));

		let writeCalls = 0;
		let deleteCalls = 0;
		const originalWriteFile = fileService.writeFile.bind(fileService);
		const originalDel = fileService.del.bind(fileService);
		disposables.add({
			dispose: () => {
				fileService.writeFile = originalWriteFile as typeof fileService.writeFile;
				fileService.del = originalDel as typeof fileService.del;
			}
		});
		fileService.writeFile = ((...args: Parameters<typeof fileService.writeFile>) => {
			writeCalls++;
			return originalWriteFile(...args);
		}) as typeof fileService.writeFile;
		fileService.del = ((...args: Parameters<typeof fileService.del>) => {
			deleteCalls++;
			return originalDel(...args);
		}) as typeof fileService.del;

		const result = await bundler.bundle(await discovery.scan(CancellationToken.None), CancellationToken.Cancelled);
		assert.deepStrictEqual({ result, writeCalls, deleteCalls }, { result: undefined, writeCalls: 0, deleteCalls: 0 });
	});

	test('different working directories produce different bundle authorities', async () => {
		const otherWorkspace = URI.from({ scheme: Schemas.inMemory, path: '/other-workspace' });
		const a = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
		const b = disposables.add(instantiationService.createInstance(SessionPluginBundler, otherWorkspace));
		assert.notStrictEqual(a.rootUri.toString(), b.rootUri.toString());
	});
});

flakySuite('SessionCustomizationDiscovery (real filesystem)', () => {

	const disposables = new DisposableStore();
	let testDir: string;
	let workspaceDir: string;
	let userHomeDir: string;
	let fileService: FileService;
	let instantiationService: TestInstantiationService;
	let workspace: URI;
	let userHome: URI;

	setup(async () => {
		// Use realpathSync to resolve symlinks on macOS (tmp dir is symlinked
		// under /var -> /private/var); mismatched paths trip up watcher matching.
		testDir = getRandomTestPath(fs.realpathSync(tmpdir()), 'vsctests', 'discovery');
		workspaceDir = join(testDir, 'workspace');
		userHomeDir = join(testDir, 'home');
		await fs.promises.mkdir(workspaceDir, { recursive: true });
		await fs.promises.mkdir(userHomeDir, { recursive: true });

		workspace = URI.file(workspaceDir);
		userHome = URI.file(userHomeDir);

		const log = new NullLogService();
		fileService = disposables.add(new FileService(log));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(log))));

		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IAgentPluginManager, { basePath: URI.file(join(testDir, 'agentPlugins')) } as Partial<IAgentPluginManager>);
	});

	teardown(async () => {
		disposables.clear();
		await Promises.rm(testDir).catch(() => undefined);
	});

	// Confirms the OS-level watcher for `dirPath` is live by writing throwaway
	// sentinel files as direct children of it until we observe a corresponding
	// onDidChange event. Works for both recursive and non-recursive watchers.
	// Returns as soon as the watcher fires (plus a short drain), avoiding fixed
	// warmup delays.
	async function waitForWatcher(discovery: SessionCustomizationDiscovery, dirPath: string): Promise<void> {
		for (let attempt = 0; attempt < 100; attempt++) {
			let fired = false;
			const sub = discovery.onDidChange(() => { fired = true; });
			try {
				const sentinel = join(dirPath, `__warmup-${attempt}.tmp`);
				await fs.promises.writeFile(sentinel, `warmup ${attempt}`);
				await timeout(20);
				if (fired) {
					// Drain any FS events still in flight from earlier sentinel writes
					// so they don't leak into the test's assertion window.
					let lastFire = Date.now();
					const drain = discovery.onDidChange(() => { lastFire = Date.now(); });
					try {
						while (Date.now() - lastFire < 100) {
							await timeout(30);
						}
					} finally {
						drain.dispose();
					}
					return;
				}
			} finally {
				sub.dispose();
			}
		}
		throw new Error(`watcher for ${dirPath} did not become ready within budget`);
	}

	test('does not fire onDidChange when a file outside watched roots is modified', async () => {
		// Seed an agent file so the workspace and its agent dirs get watched.
		const agentsDir = join(workspaceDir, '.github', 'agents');
		await fs.promises.mkdir(agentsDir, { recursive: true });
		await fs.promises.writeFile(join(agentsDir, 'foo.agent.md'), 'workspace agent');

		// Pre-create the unrelated nested dir so adding a file inside it later
		// does not change a directly-watched directory's direct entries.
		const outsideDir = join(workspaceDir, 'src');
		await fs.promises.mkdir(outsideDir, { recursive: true });

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		await discovery.scan(CancellationToken.None);

		// Wait until at least one watched directory's watcher is observably live.
		await waitForWatcher(discovery, agentsDir);

		let changeCount = 0;
		disposables.add(discovery.onDidChange(() => {
			changeCount++;
		}));

		// This file lives under <workspace>/src/, which is NOT a direct entry of
		// any non-recursively watched root (workspace itself is watched only for
		// its direct children like AGENTS.md). The OS-level watcher should not
		// deliver an event for it.
		await fs.promises.writeFile(join(outsideDir, 'test.ts'), 'unrelated source file');

		// Wait long enough for any stray watcher events to propagate.
		await timeout(500);

		assert.strictEqual(changeCount, 0, 'expected onDidChange not to fire for changes outside any watched root');
	});

	test('fires onDidChange when AGENTS.md in the workspace root is modified', async () => {
		// AGENTS.md is a direct child of the workspace, which is watched non-recursively.
		await fs.promises.writeFile(join(workspaceDir, 'AGENTS.md'), 'workspace agents instructions');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		await discovery.scan(CancellationToken.None);

		// Wait until the workspace-root watcher is observably live.
		await waitForWatcher(discovery, workspaceDir);

		let changeCount = 0;
		const fired = new DeferredPromise<void>();
		disposables.add(discovery.onDidChange(() => {
			changeCount++;
			fired.complete();
		}));

		await fs.promises.writeFile(join(workspaceDir, 'AGENTS.md'), 'workspace agents instructions (updated)');
		await raceTimeout(fired.p, 5000);

		assert.strictEqual(changeCount, 1, 'expected onDidChange to fire when AGENTS.md at the workspace root is modified');
	});

	test('fires onDidChange when files under .github/instructions are modified (including nested)', async () => {
		// .github/instructions is watched recursively, so both a direct child and
		// a nested file inside a subdirectory should trigger refresh.
		const instructionsDir = join(workspaceDir, '.github', 'instructions');
		const nestedDir = join(instructionsDir, 'inner');
		await fs.promises.mkdir(nestedDir, { recursive: true });
		const fooPath = join(instructionsDir, 'foo.instructions.md');
		const innerPath = join(nestedDir, 'inner.instructions.md');
		await fs.promises.writeFile(fooPath, 'foo v1');
		await fs.promises.writeFile(innerPath, 'inner v1');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, workspace, userHome));
		await discovery.scan(CancellationToken.None);

		// Wait until the recursive instructions watcher is observably live.
		await waitForWatcher(discovery, instructionsDir);

		let changeCount = 0;
		let fired = new DeferredPromise<void>();
		disposables.add(discovery.onDidChange(() => {
			changeCount++;
			fired.complete();
		}));

		// Direct child of the recursively-watched directory.
		await fs.promises.writeFile(fooPath, 'foo v2');
		await raceTimeout(fired.p, 5000);
		assert.ok(changeCount >= 1, 'expected onDidChange to fire for .github/instructions/foo.instructions.md');

		const countAfterFoo = changeCount;
		fired = new DeferredPromise<void>();

		// Nested file inside the recursively-watched directory.
		await fs.promises.writeFile(innerPath, 'inner v2');
		await raceTimeout(fired.p, 5000);
		assert.ok(changeCount > countAfterFoo, 'expected onDidChange to fire for .github/instructions/inner/inner.instructions.md');
	});
});
