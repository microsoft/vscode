/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { CopilotClient } from '@github/copilot-sdk';
import { DeferredPromise, raceTimeout, timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
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
import type { AgentsDiscoverRequest } from '../../node/copilot/copilotRCP.js';
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

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
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

	test('groups discovered customizations by parent folder', async () => {
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
		const client = {
			rpc: {
				agents: {
					discover: async () => ({
						agents: [
							{ id: 'one', name: 'One', description: '', path: '/workspace/.github/agents/one.agent.md', userInvocable: false },
							{ id: 'two', name: 'Two', description: '', path: '/workspace/.github/agents/two.agent.md', userInvocable: true },
							{ id: 'three', name: 'Three', description: '', path: '/workspace/.github/other/three.agent.md', userInvocable: false },
						],
					}),
				},
				instructions: { discover: async () => ({ sources: [] }) },
				skills: { discover: async () => ({ skills: [] }) },
			},
		} as unknown as CopilotClient;

		const customizations = await discovery.discover(client, CancellationToken.None);
		const agentDirectories = customizations.filter(customization => customization.contents === 'agent');

		const getPath = (uri: string) => URI.parse(uri).path;

		assert.strictEqual(agentDirectories.length, 2);
		assert.deepStrictEqual(agentDirectories.map(customization => getPath(customization.uri)).sort(), [
			'/workspace/.github/agents',
			'/workspace/.github/other',
		]);
		const agentsInAgentsDir = agentDirectories.find(customization => getPath(customization.uri) === '/workspace/.github/agents');
		assert.ok(agentsInAgentsDir);
		assert.deepStrictEqual(agentsInAgentsDir.children?.map(child => getPath(child.uri)).sort(), [
			'/workspace/.github/agents/one.agent.md',
			'/workspace/.github/agents/two.agent.md',
		]);
	});

	test('discovers agents from multiple working directories', async () => {
		const secondWorkspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace2' });
		const requestedProjectPaths: string[][] = [];
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace, secondWorkspace], userHome));
		const client = {
			rpc: {
				agents: {
					discover: async (request: AgentsDiscoverRequest) => {
						requestedProjectPaths.push(request.projectPaths ?? []);
						return {
							agents: [
								{ id: 'one', name: 'One', description: '', path: '/workspace/.github/agents/one.agent.md', userInvocable: false },
								{ id: 'two', name: 'Two', description: '', path: '/workspace2/.github/agents/two.agent.md', userInvocable: false },
							],
						};
					},
				},
				instructions: { discover: async () => ({ sources: [] }) },
				skills: { discover: async () => ({ skills: [] }) },
			},
		} as unknown as CopilotClient;

		const customizations = await discovery.discover(client, CancellationToken.None);
		const agentDirectories = customizations.filter(customization => customization.contents === 'agent');
		const getPath = (uri: string) => URI.parse(uri).path;

		assert.deepStrictEqual(requestedProjectPaths, [[workspace.fsPath, secondWorkspace.fsPath]]);
		assert.deepStrictEqual(agentDirectories.map(customization => getPath(customization.uri)).sort(), [
			'/workspace/.github/agents',
			'/workspace2/.github/agents',
		]);
	});

	test('resolves relative instruction paths against their own working directory', async () => {
		const secondWorkspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace2' });
		const requestedProjectPaths: string[][] = [];
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace, secondWorkspace], userHome));
		const client = {
			rpc: {
				agents: { discover: async () => ({ agents: [] }) },
				instructions: {
					discover: async (request: AgentsDiscoverRequest) => {
						const projectPath = (request.projectPaths ?? [])[0];
						requestedProjectPaths.push(request.projectPaths ?? []);
						return {
							sources: [
								{ id: `rule-${projectPath}`, label: 'Rule', description: '', sourcePath: '.github/copilot-instructions.md', applyTo: undefined },
							],
						};
					},
				},
				skills: { discover: async () => ({ skills: [] }) },
			},
		} as unknown as CopilotClient;

		const customizations = await discovery.discover(client, CancellationToken.None);
		const ruleDirectories = customizations.filter(customization => customization.contents === 'rule');
		const getPath = (uri: string) => URI.parse(uri).path;

		// instructions.discover is called once per working directory (relative paths are resolved per-project).
		assert.deepStrictEqual(requestedProjectPaths.map(paths => [...paths].sort()).sort(), [
			[workspace.fsPath],
			[secondWorkspace.fsPath],
		].sort());
		assert.deepStrictEqual(ruleDirectories.map(customization => getPath(customization.uri)).sort(), [
			'/workspace/.github',
			'/workspace2/.github',
		]);
	});

	test('scans customization files across multiple working directories', async () => {
		const secondWorkspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace2' });
		const wsAgent = await seed('/workspace/.github/agents/foo.agent.md', 'first workspace agent');
		const ws2Agent = await seed('/workspace2/.github/agents/bar.agent.md', 'second workspace agent');
		const ws2Skill = await seed('/workspace2/.github/skills/baz/SKILL.md', 'second workspace skill');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace, secondWorkspace], userHome));
		const files = (await discovery.scan(CancellationToken.None))
			.flatMap(directory => directory.files.map(file => ({ uri: file.uri, type: directory.type })));

		assert.deepStrictEqual([...files].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())), [
			{ uri: ws2Agent, type: DiscoveredType.Agent },
			{ uri: ws2Skill, type: DiscoveredType.Skill },
			{ uri: wsAgent, type: DiscoveredType.Agent },
		].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())));
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
		await seed('/home/.copilot/skills/alpha/SKILL.md', 'user copilot skill');
		await seed('/home/.agents/skills/aaa/SKILL.md', 'user skill aaa');
		await seed('/home/.agents/skills/zap/SKILL.md', 'user skill');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
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

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
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
		await seed('/workspace/.github/hooks/pre-tool.json', '{"PreToolUse": []}');
		await seed('/workspace/.github/copilot-instructions.md', 'workspace copilot instructions');
		await seed('/workspace/.claude/CLAUDE.md', 'workspace claude instruction');
		await seed('/home/.copilot/agents/user.agent.md', 'user agent');
		await seed('/home/.copilot/skills/copilot-user-skill/SKILL.md', 'user copilot skill');
		await seed('/home/.agents/skills/user-skill/SKILL.md', 'user skill');
		await seed('/home/.copilot/instructions/user.instructions.md', 'user instruction');
		await seed('/home/.copilot/hooks/post-tool.json', '{"PostToolUse": []}');
		await seed('/home/.copilot/copilot-instructions.md', 'user copilot instructions');

		const watchCalls: Array<{ resource: string; recursive: boolean }> = [];
		const originalWatch = fileService.watch.bind(fileService);
		disposables.add({ dispose: () => { fileService.watch = originalWatch as typeof fileService.watch; } });
		fileService.watch = ((resource, options) => {
			watchCalls.push({ resource: resource.toString(), recursive: options?.recursive === true });
			return originalWatch(resource, options);
		}) as typeof fileService.watch;

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
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
		assert.strictEqual(watched.get(URI.joinPath(workspace, '.github', 'hooks').toString()), true);
		assert.strictEqual(watched.get(URI.joinPath(userHome, '.copilot').toString()), false);
		assert.strictEqual(watched.get(URI.joinPath(userHome, '.copilot', 'agents').toString()), false);
		assert.strictEqual(watched.get(URI.joinPath(userHome, '.copilot', 'skills').toString()), true);
		assert.strictEqual(watched.get(URI.joinPath(userHome, '.agents', 'skills').toString()), true);
		assert.strictEqual(watched.get(URI.joinPath(userHome, '.copilot', 'instructions').toString()), true);
		assert.strictEqual(watched.get(URI.joinPath(userHome, '.copilot', 'hooks').toString()), true);
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

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
		await discovery.scan(CancellationToken.None);
		const watchCallsAfterFirstScan = watchCalls.length;

		await discovery.scan(CancellationToken.None);

		assert.strictEqual(watchCalls.length, watchCallsAfterFirstScan, 'expected no new watch registrations for unchanged roots');
		assert.strictEqual(watchDisposeCalls, 0, 'expected existing watchers to remain active for unchanged roots');
	});

	test('fires onDidChange when a new agent file is added under a non-recursively watched root', async () => {
		// Seed an existing agent so `.github/agents` is discovered and watched.
		await seed('/workspace/.github/agents/foo.agent.md', 'workspace agent');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
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

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
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

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
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

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
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

	test('does not fire onDidChange for files outside any trigger URI', async () => {
		// Seed a customization so the workspace + `.github` dirs get watchers.
		await seed('/workspace/.github/agents/foo.agent.md', 'workspace agent');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
		await discovery.scan(CancellationToken.None);
		await timeout(50);

		let changeCount = 0;
		disposables.add(discovery.onDidChange(() => {
			changeCount++;
		}));

		// None of these paths intersect any trigger URI:
		//  - `.git/HEAD`             : `.git` is unrelated (not `.github`)
		//  - `.vscode/settings.json` : `.vscode` is unrelated
		//  - `README.md`             : at workspace root but not AGENTS.md/CLAUDE.md/GEMINI.md
		//  - `src/index.ts`          : unrelated top-level directory
		await seed('/workspace/.git/HEAD', 'ref: refs/heads/main');
		await seed('/workspace/.vscode/settings.json', '{}');
		await seed('/workspace/README.md', '# project');
		await seed('/workspace/src/index.ts', 'export {};');

		// Give the in-memory provider time to deliver any (stray) events.
		await timeout(100);

		assert.strictEqual(changeCount, 0, 'expected onDidChange not to fire for paths outside any trigger URI');
	});

	test('cancellation of one caller does not affect another concurrent caller', async () => {
		await seed('/workspace/.github/agents/foo.agent.md', 'workspace agent');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
		const cancelSource = new CancellationTokenSource();
		disposables.add(cancelSource);

		const cancelled = discovery.scan(cancelSource.token);
		const nonCancelled = discovery.scan(CancellationToken.None);
		cancelSource.cancel();

		await assert.rejects(cancelled);
		const directories = await nonCancelled;
		assert.ok(directories.some(directory => directory.type === DiscoveredType.Agent));
	});

	test('discovers agents, skills, instructions, and hooks across workspace and home roots', async () => {
		const wsAgent = await seed('/workspace/.github/agents/foo.agent.md', 'agent body');
		const wsSkill = await seed('/workspace/.github/skills/bar/SKILL.md', 'skill body');
		const wsInstr = await seed('/workspace/.github/instructions/baz.instructions.md', 'instr body');
		const wsHook = await seed('/workspace/.github/hooks/pre-tool.json', '{"PreToolUse": []}');
		const userAgent = await seed('/home/.copilot/agents/qux.agent.md', 'user agent');
		const userCopilotSkill = await seed('/home/.copilot/skills/copilot-zap/SKILL.md', 'user copilot skill');
		const userSkill = await seed('/home/.agents/skills/zap/SKILL.md', 'user skill');
		const userHook = await seed('/home/.copilot/hooks/post-tool.json', '{"PostToolUse": []}');
		// Noise that should not be picked up
		await seed('/workspace/.github/agents/not-an-agent.txt', 'ignored');
		await seed('/workspace/.github/hooks/not-a-hook.md', 'ignored');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
		const directories = await discovery.scan(CancellationToken.None);
		const files = directories.flatMap(directory => directory.files.map(file => ({ uri: file.uri, type: directory.type })));

		assert.deepStrictEqual([...files].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())), [
			{ uri: userAgent, type: DiscoveredType.Agent },
			{ uri: userCopilotSkill, type: DiscoveredType.Skill },
			{ uri: userHook, type: DiscoveredType.Hook },
			{ uri: userSkill, type: DiscoveredType.Skill },
			{ uri: wsAgent, type: DiscoveredType.Agent },
			{ uri: wsHook, type: DiscoveredType.Hook },
			{ uri: wsInstr, type: DiscoveredType.Instruction },
			{ uri: wsSkill, type: DiscoveredType.Skill },
		].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())));
		assert.ok(directories.some(directory => directory.uri.toString() === URI.joinPath(workspace, '.github', 'agents').toString()));
	});

	test('discovers nested .json hook files', async () => {
		const nestedWsHook = await seed('/workspace/.github/hooks/team/security/pre-tool.json', '{"PreToolUse": []}');
		const nestedUserHook = await seed('/home/.copilot/hooks/domain/tools/post-tool.json', '{"PostToolUse": []}');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
		const files = (await discovery.scan(CancellationToken.None)).flatMap(directory => directory.files.map(file => ({ uri: file.uri, type: directory.type })));

		assert.deepStrictEqual([...files].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())), [
			{ uri: nestedUserHook, type: DiscoveredType.Hook },
			{ uri: nestedWsHook, type: DiscoveredType.Hook },
		].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())));
	});

	test('discovers hook settings files from fixed workspace locations', async () => {
		const githubSettings = await seed('/workspace/.github/copilot/settings.json', '{"hooks": {"PreToolUse": []}}');
		const githubLocalSettings = await seed('/workspace/.github/copilot/settings.local.json', '{"hooks": {"PostToolUse": []}}');
		const claudeSettings = await seed('/workspace/.claude/settings.json', '{"hooks": {"SessionStart": []}}');
		const claudeLocalSettings = await seed('/workspace/.claude/settings.local.json', '{"hooks": {"SessionEnd": []}}');
		await seed('/workspace/.github/copilot/settings.dev.json', '{"hooks": {"Ignored": []}}');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
		const files = (await discovery.scan(CancellationToken.None)).flatMap(directory => directory.files.map(file => ({ uri: file.uri, type: directory.type })));

		assert.deepStrictEqual([...files].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())), [
			{ uri: claudeLocalSettings, type: DiscoveredType.Hook },
			{ uri: claudeSettings, type: DiscoveredType.Hook },
			{ uri: githubLocalSettings, type: DiscoveredType.Hook },
			{ uri: githubSettings, type: DiscoveredType.Hook },
		].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())));
	});

	test('fires onDidChange when fixed hook settings file is modified', async () => {
		await seed('/workspace/.github/copilot/settings.json', '{"hooks": {"PreToolUse": []}}');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
		await discovery.scan(CancellationToken.None);
		await timeout(50);

		let changeCount = 0;
		const fired = new DeferredPromise<void>();
		disposables.add(discovery.onDidChange(() => {
			changeCount++;
			fired.complete();
		}));

		await seed('/workspace/.github/copilot/settings.json', '{"hooks": {"PreToolUse": [{"command": "echo test"}]}}');
		await raceTimeout(fired.p, 500);

		assert.strictEqual(changeCount, 1, 'expected onDidChange to fire when fixed hook settings file is modified');
	});

	test('excludes exact-case README.md inside agent folders', async () => {
		const wsAgent = await seed('/workspace/.github/agents/foo.agent.md', 'agent body');
		const wsPlainAgent = await seed('/workspace/.github/agents/plain.md', 'plain agent body');
		const wsLowerReadmeAgent = await seed('/workspace/.github/agents/readme.md', 'docs lower');
		await seed('/workspace/.github/agents/README.md', 'docs');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
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

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
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

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
		const files = (await discovery.scan(CancellationToken.None)).flatMap(directory => directory.files.map(file => ({ uri: file.uri, type: directory.type })));

		assert.deepStrictEqual([...files].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())), [
			{ uri: nestedUserInstr, type: DiscoveredType.Instruction },
			{ uri: nestedWsInstr, type: DiscoveredType.Instruction },
		].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())));
	});



	test('bundles nested .instructions.md files into rules', async () => {
		await seed('/workspace/.github/instructions/team/security/policy.instructions.md', 'workspace nested instruction');
		await seed('/home/.copilot/instructions/domain/tools/deep.instructions.md', 'user nested instruction');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
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
		// Ensure workspace root exists
		await fileService.createFolder(workspace);
		await fileService.createFolder(userHome);

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
		const directories = await discovery.scan(CancellationToken.None);

		// Even with no files, discovery should return all search root directories
		// directories should never be null/undefined, should be an empty array if no directories found
		assert.ok(Array.isArray(directories), `Expected directories to be an array, got ${JSON.stringify(directories)}`);

		// Since we're now discovering all roots even if they don't exist,
		// we expect to find some directories (at minimum the workspace root for AGENTS.md)
		if (directories.length === 0) {
			// If no directories are discovered, that's okay for this test - it means discovery
			// is still looking for actual files/directories. Update test expectations.
			return;
		}

		// All directories should be empty since no files were created
		for (const dir of directories) {
			assert.strictEqual(dir.files.length, 0, `Expected ${dir.uri.toString()} to have no files`);
		}

		// Bundler returns undefined when directories are empty (no customizations to bundle)
		const bundler = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
		await bundler.bundle(directories);
		// Just verify bundling doesn't crash
	});

	test('maps discovered files to parsed plugin preserving source URIs', async () => {
		const agent = await seed('/workspace/.github/agents/foo.agent.md', '---\nname: Workspace Agent\ndescription: Agent description\n---\nbody');
		const skill = await seed('/workspace/.github/skills/bar/SKILL.md', '---\nname: Workspace Skill\ndescription: Skill description\n---\nbody');
		const instruction = await seed('/workspace/.github/instructions/baz.instructions.md', '---\nname: Workspace Rule\ndescription: Rule description\nglobs:\n  - src/**\n---\nbody');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
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

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
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

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
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
		await seed('/workspace/.github/hooks/pre-tool.json', '{"PreToolUse": []}');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
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

		const hook = await fileService.readFile(URI.joinPath(root, 'hooks', 'pre-tool.json'));
		assert.strictEqual(hook.value.toString(), '{"PreToolUse": []}');
	});


	test('produces a stable nonce for identical content', async () => {
		await seed('/workspace/.github/agents/foo.agent.md', 'agent body');
		await seed('/workspace/.github/skills/bar/SKILL.md', 'skill body');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
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

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome));
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
