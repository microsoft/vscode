/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { CopilotClient } from '@github/copilot-sdk';
import { DeferredPromise, raceTimeout, timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileService } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { CustomizationType, type SkillCustomization } from '../../common/state/sessionState.js';
import { SessionCustomizationDiscovery } from '../../node/copilot/sessionCustomizationDiscovery.js';

type AgentsDiscoverRequest = Parameters<CopilotClient['rpc']['agents']['discover']>[0];

suite('SessionCustomizationDiscovery', () => {

	const disposables = new DisposableStore();
	let fileService: FileService;
	let instantiationService: TestInstantiationService;
	let workspace: URI;
	let userHome: URI;

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		const memFs = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.inMemory, memFs));

		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, new NullLogService());

		workspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
		userHome = URI.from({ scheme: Schemas.inMemory, path: '/home' });
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

	// Mirror `URI.file`'s separator normalization (it rewrites `\` → `/` on Windows) so a
	// round-trip through `.fsPath` — used by `projectPath` attribution in discovery — matches
	// on Windows too, where `URI.fsPath` yields backslashes.
	const inMemoryPathToUri = (path: string) => URI.from({ scheme: Schemas.inMemory, path: path.replace(/\\/g, '/') });

	test('groups discovered customizations by parent folder', async () => {
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
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

	test('projects SDK-native plugin customizations as a plugin container', async () => {
		const errors: string[] = [];
		const logService = new class extends NullLogService {
			override error(message: string | Error): void {
				errors.push(String(message));
			}
		}();
		instantiationService.stub(ILogService, logService);

		const pluginRoot = '/home/.copilot/installed-plugins/example';
		await seed(`${pluginRoot}/.plugin/plugin.json`, JSON.stringify({ name: 'example-plugin', version: '1.2.3' }));
		const pluginAgent = await seed(`${pluginRoot}/agents/reviewer.agent.md`, '---\nname: reviewer\ndescription: Reviews changes\n---\n');
		const pluginSkill = await seed(`${pluginRoot}/skills/example/SKILL.md`, '---\nname: example\ndescription: Example skill\n---\n');
		const pluginRule = await seed(`${pluginRoot}/rules/example.instructions.md`, '---\nname: Example instruction\n---\n');
		const builtinSkill = await seed('/runtime/skills/builtin/SKILL.md', '---\nname: builtin\n---\n');
		const projectSkill = await seed('/workspace/.github/skills/project/SKILL.md', '---\nname: project\n---\n');
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				agents: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({
						agents: [{ id: 'reviewer', name: 'reviewer', description: 'Reviews changes', path: pluginAgent.path, source: 'plugin', userInvocable: true }],
					}),
				},
				instructions: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({
						sources: [{ id: 'example-instruction', label: 'Example instruction', description: '', sourcePath: pluginRule.path, type: 'plugin', location: 'plugin' }],
					}),
				},
				skills: {
					getDiscoveryPaths: async () => ({ paths: [{ path: '/workspace/.github/skills' }] }),
					discover: async () => ({
						skills: [
							{ name: 'example', description: '', path: pluginSkill.path, source: 'plugin', enabled: true, userInvocable: true },
							{ name: 'builtin', description: '', path: builtinSkill.path, source: 'builtin', enabled: true, userInvocable: true },
							{ name: 'project', description: '', path: projectSkill.path, source: 'project', enabled: true, userInvocable: true },
						],
					}),
				},
			},
		} as unknown as CopilotClient;

		const customizations = await discovery.discover(client, CancellationToken.None);

		assert.deepStrictEqual({
			errors,
			skillDirectories: customizations
				.filter(customization => customization.type === CustomizationType.Directory && customization.contents === 'skill')
				.map(customization => ({
					uri: customization.uri,
					children: customization.children?.map(child => child.uri),
				})),
			plugins: customizations
				.filter(customization => customization.type === CustomizationType.Plugin)
				.map(customization => ({
					uri: customization.uri,
					name: customization.name,
					version: customization.version,
					children: customization.children?.map(child => ({ type: child.type, uri: child.uri })),
				})),
		}, {
			errors: [],
			skillDirectories: [{
				uri: URI.from({ scheme: Schemas.inMemory, path: '/workspace/.github/skills' }).toString(),
				children: [projectSkill.toString()],
			}],
			plugins: [{
				uri: URI.from({ scheme: Schemas.inMemory, path: pluginRoot }).toString(),
				name: 'example-plugin',
				version: '1.2.3',
				children: [
					{ type: CustomizationType.Agent, uri: pluginAgent.toString() },
					{ type: CustomizationType.Skill, uri: pluginSkill.toString() },
					{ type: CustomizationType.Rule, uri: pluginRule.toString() },
				],
			}],
		});
	});

	test('discover includes hooks from recursive and fixed hook locations', async () => {
		await seed('/workspace/.github/hooks/pre-tool.json', '{"PreToolUse": []}');
		await seed('/workspace/.github/copilot/settings.json', '{"hooks": {"PreToolUse": []}}');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				agents: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ agents: [] }),
				},
				instructions: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ sources: [] }),
				},
				skills: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ skills: [] }),
				},
			},
		} as unknown as CopilotClient;

		const customizations = await discovery.discover(client, CancellationToken.None);
		const hookDirectories = customizations
			.filter(customization => customization.contents === 'hook')
			.map(customization => ({
				uri: URI.parse(customization.uri).path,
				children: (customization.children ?? []).map(child => URI.parse(child.uri).path).sort(),
			}))
			.sort((a, b) => a.uri.localeCompare(b.uri));

		assert.deepStrictEqual(hookDirectories, [
			{ uri: '/home/.copilot/hooks', children: [] },
			{ uri: '/workspace/.github/copilot', children: ['/workspace/.github/copilot/settings.json'] },
			{ uri: '/workspace/.github/hooks', children: ['/workspace/.github/hooks/pre-tool.json'] },
		]);
	});

	test('marks agent instruction rule sources as always apply', async () => {
		await seed('/workspace/AGENTS.md', 'workspace agents instructions');
		await seed('/workspace/.github/instructions/rule.instructions.md', 'scoped instruction');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				agents: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ agents: [] }),
				},
				instructions: {
					getDiscoveryPaths: async () => ({
						paths: [
							{ path: '/workspace/.github/instructions', kind: 'directory' },
							{ path: '/workspace/AGENTS.md', kind: 'file' },
						],
					}),
					discover: async () => ({
						sources: [
							{ id: 'agentInstruction', label: 'AGENTS.md', sourcePath: '/workspace/AGENTS.md', applyTo: [], type: 'repo' },
							{ id: 'scopedInstruction', label: 'Rule', sourcePath: '/workspace/.github/instructions/rule.instructions.md', applyTo: ['src/**'], type: 'child-instructions' },
						],
					}),
				},
				skills: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ skills: [] }),
				},
			},
		} as unknown as CopilotClient;

		const customizations = await discovery.discover(client, CancellationToken.None);
		const rules = customizations
			.filter(customization => customization.contents === 'rule')
			.flatMap(customization => customization.children ?? [])
			.map(child => ({
				uri: URI.parse(child.uri).path,
				alwaysApply: child.type === 'rule' ? child.alwaysApply : undefined,
			}))
			.sort((a, b) => a.uri.localeCompare(b.uri));

		assert.deepStrictEqual(rules, [
			{ uri: '/workspace/.github/instructions/rule.instructions.md', alwaysApply: false },
			{ uri: '/workspace/AGENTS.md', alwaysApply: true },
		]);
	});

	test('drops missing agent instruction files and empty agent instruction directories', async () => {
		await seed('/workspace/.github/instructions/rule.instructions.md', 'scoped instruction');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				agents: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ agents: [] }),
				},
				instructions: {
					getDiscoveryPaths: async () => ({
						paths: [
							{ path: '/workspace/.github/instructions', kind: 'directory' },
							{ path: '/workspace/AGENTS.md', kind: 'file' },
						],
					}),
					discover: async () => ({
						sources: [
							{ id: 'agentInstruction', label: 'AGENTS.md', sourcePath: '/workspace/AGENTS.md', applyTo: [], type: 'repo' },
							{ id: 'scopedInstruction', label: 'Rule', sourcePath: '/workspace/.github/instructions/rule.instructions.md', applyTo: ['src/**'], type: 'child-instructions' },
						],
					}),
				},
				skills: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ skills: [] }),
				},
			},
		} as unknown as CopilotClient;

		const customizations = await discovery.discover(client, CancellationToken.None);
		const ruleDirectories = customizations
			.filter(customization => customization.contents === 'rule')
			.map(customization => ({
				uri: URI.parse(customization.uri).path,
				children: (customization.children ?? []).map(child => URI.parse(child.uri).path).sort(),
			}))
			.sort((a, b) => a.uri.localeCompare(b.uri));

		assert.deepStrictEqual(ruleDirectories, [
			{ uri: '/workspace/.github/instructions', children: ['/workspace/.github/instructions/rule.instructions.md'] },
		]);
	});

	test('discover returns working-directory agents, skills, instructions, hooks, and agent instructions', async () => {
		await seed('/workspace/.github/agents/foo.agent.md', 'agent body');
		await seed('/workspace/.github/skills/bar/SKILL.md', 'skill body');
		await seed('/workspace/.github/instructions/baz.instructions.md', 'instruction body');
		await seed('/workspace/.github/hooks/pre-tool.json', '{"PreToolUse": []}');
		await seed('/workspace/.github/copilot/settings.json', '{"hooks": {"PreToolUse": []}}');
		await seed('/workspace/.github/copilot-instructions.md', 'workspace copilot instructions');
		await seed('/workspace/AGENTS.md', 'workspace agents instructions');
		await seed('/home/.copilot/copilot-instructions.md', 'user copilot instructions');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				agents: {
					getDiscoveryPaths: async () => ({ paths: [{ path: '/workspace/.github/agents' }] }),
					discover: async () => ({
						agents: [
							{ id: 'agent', name: 'Agent', description: 'agent description', path: '/workspace/.github/agents/foo.agent.md', userInvocable: true },
						],
					}),
				},
				instructions: {
					getDiscoveryPaths: async () => ({
						paths: [
							{ path: '/workspace/.github/instructions', kind: 'directory' },
							{ path: '/workspace/.github/copilot-instructions.md', kind: 'file' },
							{ path: '/workspace/AGENTS.md', kind: 'file' },
							{ path: '/home/.copilot/copilot-instructions.md', kind: 'file' },
						],
					}),
					discover: async () => ({
						sources: [
							{ id: 'rule', label: 'Rule', description: 'rule description', sourcePath: '/workspace/.github/instructions/baz.instructions.md', applyTo: [] },
						],
					}),
				},
				skills: {
					getDiscoveryPaths: async () => ({ paths: [{ path: '/workspace/.github/skills' }] }),
					discover: async () => ({
						skills: [
							{ name: 'Skill', description: 'skill description', path: '/workspace/.github/skills/bar/SKILL.md' },
						],
					}),
				},
			},
		} as unknown as CopilotClient;

		const customizations = await discovery.discover(client, CancellationToken.None);
		const directories = customizations
			.map(customization => ({
				contents: customization.contents,
				uri: URI.parse(customization.uri).path,
				writable: customization.writable,
				children: (customization.children ?? []).map(child => URI.parse(child.uri).path).sort(),
			}))
			.sort((a, b) => a.uri.localeCompare(b.uri));

		assert.deepStrictEqual(directories, [
			{ contents: 'rule', uri: '/home', writable: false, children: ['/home/.copilot/copilot-instructions.md'] },
			{ contents: 'hook', uri: '/home/.copilot/hooks', writable: true, children: [] },
			{ contents: 'rule', uri: '/workspace', writable: false, children: ['/workspace/.github/copilot-instructions.md', '/workspace/AGENTS.md'] },
			{ contents: 'agent', uri: '/workspace/.github/agents', writable: true, children: ['/workspace/.github/agents/foo.agent.md'] },
			{ contents: 'hook', uri: '/workspace/.github/copilot', writable: true, children: ['/workspace/.github/copilot/settings.json'] },
			{ contents: 'hook', uri: '/workspace/.github/hooks', writable: true, children: ['/workspace/.github/hooks/pre-tool.json'] },
			{ contents: 'rule', uri: '/workspace/.github/instructions', writable: true, children: ['/workspace/.github/instructions/baz.instructions.md'] },
			{ contents: 'skill', uri: '/workspace/.github/skills', writable: true, children: ['/workspace/.github/skills/bar/SKILL.md'] },
		]);
	});

	test('discover preserves SDK skill visibility and file-backed model invocation metadata', async () => {
		await seed('/workspace/.github/skills/bar/SKILL.md', '---\nname: bar\ndisable-model-invocation: true\n---\nskill body');
		await seed('/workspace/.github/skills/default/SKILL.md', '---\nname: default\n---\nskill body');
		await seed('/workspace/.github/skills/visible/SKILL.md', '---\nname: visible\nuser-invocable: true\ndisable-model-invocation: false\n---\nskill body');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				agents: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ agents: [] }),
				},
				instructions: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ sources: [] }),
				},
				skills: {
					getDiscoveryPaths: async () => ({ paths: [{ path: '/workspace/.github/skills' }] }),
					discover: async () => ({
						skills: [{
							name: 'bar',
							description: 'skill description',
							path: '/workspace/.github/skills/bar/SKILL.md',
							enabled: false,
							userInvocable: false,
						}, {
							name: 'default',
							description: 'default skill',
							path: '/workspace/.github/skills/default/SKILL.md',
							enabled: true,
						}, {
							name: 'visible',
							description: 'visible skill',
							path: '/workspace/.github/skills/visible/SKILL.md',
							enabled: true,
							userInvocable: true,
						}],
					}),
				},
			},
		} as unknown as CopilotClient;

		const customizations = await discovery.discover(client, CancellationToken.None);
		const skills = customizations
			.flatMap(customization => customization.children ?? [])
			.filter((child): child is SkillCustomization => child.type === CustomizationType.Skill)
			.map(skill => ({
				name: skill.name,
				description: skill.description,
				enabled: skill.enabled,
				disableModelInvocation: skill.disableModelInvocation,
				disableUserInvocation: skill.disableUserInvocation,
			}))
			.sort((a, b) => a.name.localeCompare(b.name));

		assert.deepStrictEqual(skills, [{
			name: 'bar',
			description: 'skill description',
			enabled: false,
			disableModelInvocation: true,
			disableUserInvocation: true,
		}, {
			name: 'default',
			description: 'default skill',
			enabled: true,
			disableModelInvocation: undefined,
			disableUserInvocation: undefined,
		}, {
			name: 'visible',
			description: 'visible skill',
			enabled: true,
			disableModelInvocation: undefined,
			disableUserInvocation: undefined,
		}]);
	});

	test('discover groups case-variant instructions and nested skills under their roots', async () => {
		const caseVariantUserHome = URI.from({ scheme: Schemas.inMemory, path: '/HOME' });
		await seed('/home/.copilot/copilot-instructions.md', 'user copilot instructions');
		await seed('/workspace/.github/skills/bar/SKILL.md', 'skill body');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], caseVariantUserHome, inMemoryPathToUri));
		const client = {
			rpc: {
				agents: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ agents: [] }),
				},
				instructions: {
					getDiscoveryPaths: async () => ({ paths: [{ path: '/home/.copilot/copilot-instructions.md', kind: 'file' }] }),
					discover: async () => ({ sources: [{ id: 'userInstruction', label: 'User instruction', sourcePath: '/home/.copilot/copilot-instructions.md', type: 'home' }] }),
				},
				skills: {
					getDiscoveryPaths: async () => ({
						paths: [
							{ path: '/workspace/.github/skills' },
							{ path: '/workspace/.github/skills/bar' },
						]
					}),
					discover: async () => ({ skills: [{ name: 'Skill', description: 'skill description', path: '/workspace/.github/skills/bar/SKILL.md' }] }),
				},
			},
		} as unknown as CopilotClient;

		const customizations = await discovery.discover(client, CancellationToken.None);
		const directories = customizations
			.filter(customization => customization.contents === 'rule' || customization.contents === 'skill')
			.map(customization => ({
				contents: customization.contents,
				uri: URI.parse(customization.uri).path,
				children: (customization.children ?? []).map(child => URI.parse(child.uri).path),
			}));

		assert.deepStrictEqual(directories, [
			{ contents: 'rule', uri: '/HOME', children: ['/home/.copilot/copilot-instructions.md'] },
			{ contents: 'skill', uri: '/workspace/.github/skills', children: ['/workspace/.github/skills/bar/SKILL.md'] },
		]);
	});

	test('watches the discovered skill root so new skills fire onDidChange', async () => {
		// The skill root exists but is empty; getDiscoveryPaths still reports it.
		await fileService.createFolder(URI.from({ scheme: Schemas.inMemory, path: '/workspace/.github/skills' }));

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				agents: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ agents: [] }),
				},
				instructions: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ sources: [] }),
				},
				skills: {
					getDiscoveryPaths: async () => ({ paths: [{ path: '/workspace/.github/skills' }] }),
					discover: async () => ({ skills: [] }),
				},
			},
		} as unknown as CopilotClient;

		await discovery.discover(client, CancellationToken.None);
		await timeout(50);

		let changeCount = 0;
		const fired = new DeferredPromise<void>();
		disposables.add(discovery.onDidChange(() => {
			changeCount++;
			fired.complete();
		}));

		await seed('/workspace/.github/skills/new-skill/SKILL.md', 'new workspace skill');
		await raceTimeout(fired.p, 500);

		assert.strictEqual(changeCount, 1, 'expected onDidChange to fire when a skill is added under the discovered skill root');
	});

	test('discover propagates cancellation without logging an error', async () => {
		const errors: string[] = [];
		const logService = new class extends NullLogService {
			override error(message: string | Error): void {
				errors.push(String(message));
			}
		}();
		instantiationService.stub(ILogService, logService);

		const agentDiscoveryStarted = new DeferredPromise<void>();
		const agentDiscovery = new DeferredPromise<{ agents: [] }>();
		const client = {
			rpc: {
				agents: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: () => {
						agentDiscoveryStarted.complete();
						return agentDiscovery.p;
					},
				},
				instructions: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ sources: [] }),
				},
				skills: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ skills: [] }),
				},
			},
		} as unknown as CopilotClient;

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const cancelSource = disposables.add(new CancellationTokenSource());
		const discovering = discovery.discover(client, cancelSource.token).then(
			() => false,
			error => error instanceof CancellationError,
		);

		await agentDiscoveryStarted.p;
		cancelSource.cancel();
		const wasCancellationError = await discovering;
		agentDiscovery.complete({ agents: [] });

		assert.deepStrictEqual({ wasCancellationError, errors }, { wasCancellationError: true, errors: [] });
	});

	test('discover includes hooks from the primary working directory only', async () => {
		const secondWorkspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace2' });
		await seed('/workspace/.github/hooks/pre-tool.json', '{"PreToolUse": []}');
		await seed('/workspace2/.github/hooks/pre-tool.json', '{"PreToolUse": []}');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace, secondWorkspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				agents: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ agents: [] }) },
				instructions: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ sources: [] }) },
				skills: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ skills: [] }) },
			},
		} as unknown as CopilotClient;

		const hookChildren = (await discovery.discover(client, CancellationToken.None))
			.filter(customization => customization.contents === 'hook')
			.flatMap(customization => (customization.children ?? []).map(child => URI.parse(child.uri).path))
			.sort();

		// Hooks come only from the primary root (`/workspace`), never `/workspace2`.
		assert.deepStrictEqual(hookChildren, ['/workspace/.github/hooks/pre-tool.json']);
	});

	test('discover resolves relative instructions against their attributed project root and groups per root', async () => {
		const secondWorkspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace2' });
		const firstFile = await seed('/workspace/.github/copilot-instructions.md', 'first');
		const secondFile = await seed('/workspace2/.github/copilot-instructions.md', 'second');

		let requestedProjectPaths: string[] | undefined;
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace, secondWorkspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				agents: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ agents: [] }) },
				instructions: {
					getDiscoveryPaths: async () => ({
						paths: [
							{ path: '/workspace/.github/copilot-instructions.md', kind: 'file' },
							{ path: '/workspace2/.github/copilot-instructions.md', kind: 'file' },
						],
					}),
					discover: async (request: AgentsDiscoverRequest) => {
						requestedProjectPaths = request.projectPaths;
						// Same RELATIVE sourcePath from two roots, disambiguated only by projectPath.
						return {
							sources: [
								{ id: 'a', label: 'A', sourcePath: '.github/copilot-instructions.md', applyTo: undefined, type: 'repo', projectPath: workspace.fsPath },
								{ id: 'b', label: 'B', sourcePath: '.github/copilot-instructions.md', applyTo: undefined, type: 'repo', projectPath: secondWorkspace.fsPath },
							],
						};
					},
				},
				skills: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ skills: [] }) },
			},
		} as unknown as CopilotClient;

		const customizations = await discovery.discover(client, CancellationToken.None);
		const ruleDirectories = customizations
			.filter(customization => customization.contents === 'rule')
			.map(customization => ({
				uri: customization.uri,
				children: (customization.children ?? []).map(child => child.uri).sort(),
			}))
			.sort((a, b) => a.uri.localeCompare(b.uri));

		assert.deepStrictEqual({ requestedProjectPaths, ruleDirectories }, {
			requestedProjectPaths: [workspace.fsPath, secondWorkspace.fsPath],
			ruleDirectories: [
				{ uri: workspace.toString(), children: [firstFile.toString()] },
				{ uri: secondWorkspace.toString(), children: [secondFile.toString()] },
			].sort((a, b) => a.uri.localeCompare(b.uri)),
		});
	});

	test('discover surfaces agents and skills from every working directory in one call', async () => {
		const secondWorkspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace2' });
		let agentProjectPaths: string[] | undefined;
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace, secondWorkspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				agents: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async (request: AgentsDiscoverRequest) => {
						agentProjectPaths = request.projectPaths;
						return {
							agents: [
								{ id: 'one', name: 'One', description: '', path: '/workspace/.github/agents/one.agent.md', userInvocable: false },
								{ id: 'two', name: 'Two', description: '', path: '/workspace2/.github/agents/two.agent.md', userInvocable: false },
							],
						};
					},
				},
				instructions: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ sources: [] }) },
				skills: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({
						skills: [
							{ path: '/workspace/.github/skills/a', name: 'A', description: '' },
							{ path: '/workspace2/.github/skills/b', name: 'B', description: '' },
						],
					}),
				},
			},
		} as unknown as CopilotClient;

		const customizations = await discovery.discover(client, CancellationToken.None);
		const childUris = customizations
			.flatMap(customization => (customization.children ?? []).map(child => URI.parse(child.uri).path))
			.sort();

		assert.deepStrictEqual({ agentProjectPaths, childUris }, {
			agentProjectPaths: [workspace.fsPath, secondWorkspace.fsPath],
			childUris: [
				'/workspace/.github/agents/one.agent.md',
				'/workspace/.github/skills/a',
				'/workspace2/.github/agents/two.agent.md',
				'/workspace2/.github/skills/b',
			],
		});
	});
});
