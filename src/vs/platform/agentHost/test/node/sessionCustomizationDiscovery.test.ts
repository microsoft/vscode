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
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileService } from '../../../files/common/files.js';
import { createInMemoryFileService } from '../../../files/test/common/inMemoryFileService.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { CustomizationLoadStatus, CustomizationType, type SkillCustomization } from '../../common/state/sessionState.js';
import { McpServerStatus } from '../../common/state/protocol/state.js';
import { readCustomizationDiscoveryMeta } from '../../common/meta/customizationDiscoveryMeta.js';
import { hasReadableCustomizationContent } from '../../common/agentHostCustomizationUri.js';
import { readSkillArgumentHint } from '../../common/meta/skillCustomizationMeta.js';
import { SessionCustomizationDiscovery } from '../../node/copilot/sessionCustomizationDiscovery.js';

type AgentsDiscoverRequest = Parameters<CopilotClient['rpc']['agents']['discover']>[0];

suite('SessionCustomizationDiscovery', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let fileService: FileService;
	let instantiationService: TestInstantiationService;
	let workspace: URI;
	let userHome: URI;

	setup(() => {
		fileService = createInMemoryFileService(disposables, Schemas.inMemory);

		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, new NullLogService());

		workspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
		userHome = URI.from({ scheme: Schemas.inMemory, path: '/home' });
	});


	async function seed(path: string, content = ''): Promise<URI> {
		const uri = URI.from({ scheme: Schemas.inMemory, path });
		await fileService.writeFile(uri, VSBuffer.fromString(content));
		return uri;
	}

	// Mirror `URI.file`'s separator normalization (it rewrites `\` → `/` on Windows) so a
	// round-trip through `.fsPath` — used by `projectPath` attribution in discovery — matches
	// on Windows too, where `URI.fsPath` yields backslashes.
	const inMemoryPathToUri = (path: string) => URI.from({ scheme: Schemas.inMemory, path: path.replace(/\\/g, '/') });

	function hookDiscoveryClient(discover: CopilotClient['rpc']['hooks']['discover']): CopilotClient {
		return {
			rpc: {
				hooks: { discover },
				mcp: { discover: async () => ({ servers: [] }) },
				agents: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ agents: [] }) },
				instructions: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ sources: [] }) },
				skills: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ skills: [] }) },
			},
		} as unknown as CopilotClient;
	}

	test('groups discovered customizations by parent folder', async () => {
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				hooks: { discover: async () => ({ hooks: [], warnings: [], errors: [] }) },
				mcp: { discover: async () => ({ servers: [] }) },
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

	test('projects SDK-native GitHub marketplace plugin customizations as a plugin container', async () => {
		const errors: string[] = [];
		const logService = new class extends NullLogService {
			override error(message: string | Error): void {
				errors.push(String(message));
			}
		}();
		instantiationService.stub(ILogService, logService);

		const pluginRoot = '/home/.copilot/installed-plugins/example';
		await seed(`${pluginRoot}/.github/plugin/plugin.json`, JSON.stringify({ name: 'example-plugin', version: '1.2.3' }));
		const pluginAgent = await seed(`${pluginRoot}/agents/reviewer.agent.md`, '---\nname: reviewer\ndescription: Reviews changes\nuser-invocable: false\ndisable-model-invocation: true\nmodel: test-model\ntools: [read, search]\n---\n');
		await seed(`${pluginRoot}/agents/not-discovered.agent.md`, '---\nname: not-discovered\n---\n');
		const pluginSkill = await seed(`${pluginRoot}/skills/example/SKILL.md`, '---\nname: example\ndescription: Example skill\n---\n');
		const pluginRule = await seed(`${pluginRoot}/rules/example.instructions.md`, '---\nname: Example instruction\n---\n');
		const builtinSkill = await seed('/runtime/skills/builtin/SKILL.md', '---\nname: builtin\n---\n');
		const projectSkill = await seed('/workspace/.github/skills/project/SKILL.md', '---\nname: project\n---\n');
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				hooks: { discover: async () => ({ hooks: [], warnings: [], errors: [] }) },
				mcp: { discover: async () => ({ servers: [] }) },
				agents: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({
						agents: [{ id: 'example-plugin@marketplace:reviewer', name: 'example-plugin:reviewer', description: 'Reviews changes', path: pluginAgent.path, source: 'plugin', userInvocable: false }],
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
			nativeAgents: customizations.flatMap(customization => customization.type === CustomizationType.Plugin
				? customization.children?.filter(child => child.type === CustomizationType.Agent).map(child => ({
					id: child.id, name: child.name, meta: child._meta,
					disableUserInvocation: child.disableUserInvocation, disableModelInvocation: child.disableModelInvocation,
					model: child.model, tools: child.tools,
				})) ?? []
				: []),
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
			nativeAgents: [{
				id: 'example-plugin@marketplace:reviewer', name: 'reviewer', meta: { userInvocable: false },
				disableUserInvocation: true, disableModelInvocation: true, model: 'test-model', tools: ['read', 'search'],
			}],
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

	test('does not re-register native agents as loose files when their plugin manifest is missing', async () => {
		const warnings: string[] = [];
		instantiationService.stub(ILogService, new class extends NullLogService {
			override warn(message: string): void {
				warnings.push(message);
			}
		}());
		const pluginAgent = await seed('/workspace/.github/agents/native.agent.md', '---\nname: native\n---\n');
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				hooks: { discover: async () => ({ hooks: [], warnings: [], errors: [] }) },
				mcp: { discover: async () => ({ servers: [] }) },
				agents: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({
						agents: [{ id: 'plugin:native', name: 'native', path: pluginAgent.path, source: 'plugin' }],
					}),
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
		assert.deepStrictEqual({
			agents: customizations.flatMap(customization => customization.children?.filter(child => child.type === CustomizationType.Agent) ?? []),
			warned: warnings.some(message => message.includes('Could not find a plugin manifest')),
		}, {
			agents: [],
			warned: true,
		});
	});

	test('keeps plugin, workspace, and user agents in their source containers', async () => {
		const pluginRoot = '/home/.copilot/installed-plugins/multi-agent';
		await seed(`${pluginRoot}/.github/plugin/plugin.json`, JSON.stringify({ name: 'multi-agent-plugin', version: '1.0.0' }));
		const pluginParent = await seed(`${pluginRoot}/agents/parent.agent.md`, '---\nname: plugin-parent\ndescription: Delegates work\n---\n');
		const pluginSibling = await seed(`${pluginRoot}/agents/sibling.agent.md`, '---\nname: plugin-sibling\ndescription: Completes delegated work\n---\n');
		const workspaceAgent = await seed('/workspace/.github/agents/workspace.agent.md', '---\nname: workspace-agent\ndescription: Works in the repository\n---\n');
		const userAgent = await seed('/home/.copilot/agents/user.agent.md', '---\nname: user-agent\ndescription: Works across repositories\n---\n');
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				hooks: { discover: async () => ({ hooks: [], warnings: [], errors: [] }) },
				mcp: { discover: async () => ({ servers: [] }) },
				agents: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({
						agents: [
							{ id: 'plugin-parent', name: 'plugin-parent', description: 'Delegates work', path: pluginParent.path, source: 'plugin', userInvocable: true },
							{ id: 'plugin-sibling', name: 'plugin-sibling', description: 'Completes delegated work', path: pluginSibling.path, source: 'plugin', userInvocable: true },
							{ id: 'workspace-agent', name: 'workspace-agent', description: 'Works in the repository', path: workspaceAgent.path, source: 'project', userInvocable: true },
							{ id: 'user-agent', name: 'user-agent', description: 'Works across repositories', path: userAgent.path, source: 'user', userInvocable: true },
						],
					}),
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

		assert.deepStrictEqual({
			agentDirectories: customizations
				.filter(customization => customization.type === CustomizationType.Directory
					&& customization.contents === CustomizationType.Agent
					&& customization.children?.length)
				.map(customization => ({
					uri: URI.parse(customization.uri).path,
					children: customization.children?.map(child => ({ name: child.name, uri: URI.parse(child.uri).path })),
				}))
				.sort((a, b) => a.uri.localeCompare(b.uri)),
			plugins: customizations
				.filter(customization => customization.type === CustomizationType.Plugin)
				.map(customization => ({
					uri: URI.parse(customization.uri).path,
					name: customization.name,
					children: customization.children?.map(child => ({ name: child.name, uri: URI.parse(child.uri).path })),
				})),
		}, {
			agentDirectories: [
				{
					uri: '/home/.copilot/agents',
					children: [{ name: 'user-agent', uri: '/home/.copilot/agents/user.agent.md' }],
				},
				{
					uri: '/workspace/.github/agents',
					children: [{ name: 'workspace-agent', uri: '/workspace/.github/agents/workspace.agent.md' }],
				},
			],
			plugins: [{
				uri: pluginRoot,
				name: 'multi-agent-plugin',
				children: [
					{ name: 'plugin-parent', uri: `${pluginRoot}/agents/parent.agent.md` },
					{ name: 'plugin-sibling', uri: `${pluginRoot}/agents/sibling.agent.md` },
				],
			}],
		});
	});

	test('discover does not publish hook files absent from SDK discovery', async () => {
		await seed('/workspace/.github/hooks/pre-tool.json', '{"PreToolUse": []}');
		await seed('/workspace/.github/copilot/settings.json', '{"hooks": {"PreToolUse": []}}');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				hooks: { discover: async () => ({ hooks: [], warnings: [], errors: [] }) },
				mcp: { discover: async () => ({ servers: [] }) },
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
			{ uri: '/workspace/.github/hooks', children: [] },
		]);
	});

	for (const nativeRepositoryHook of [false, true]) {
		test(`workspace hook fallback preserves SDK identities and disabled state (native repository hook: ${nativeRepositoryHook})`, async () => {
			await seed('/workspace/.github/hooks/test.json', 'must be parsed by the SDK, not the host');
			await seed('/workspace2/.github/hooks/secondary.json');
			const secondWorkspace = inMemoryPathToUri('/workspace2');
			const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace, secondWorkspace], userHome, inMemoryPathToUri));
			const requests: Parameters<CopilotClient['rpc']['hooks']['discover']>[0][] = [];
			const client = hookDiscoveryClient(async request => {
				requests.push(request);
				const hooks: Awaited<ReturnType<CopilotClient['rpc']['hooks']['discover']>>['hooks'] = [
					{ id: 'opaque-plugin', hookType: 'sessionStart', origin: 'plugin', enabled: false },
					{ id: 'opaque-user', hookType: 'sessionStart', origin: 'user', enabled: false },
				];
				if (nativeRepositoryHook || request.hookDirectories) {
					hooks.push({ id: 'opaque-workspace', hookType: 'preToolUse', origin: nativeRepositoryHook ? 'repository' : 'user', enabled: false });
				}
				if (request.hookDirectories) {
					hooks.push({ id: 'opaque-workspace', hookType: 'preToolUse', origin: 'user', enabled: true });
				}
				return { hooks, warnings: ['SDK warning'], errors: ['SDK partial error'] };
			});
			const result = await discovery.discover(client, CancellationToken.None);
			const hooks = result.find(item => item.contents === CustomizationType.Hook && item.children?.length);
			assert.deepStrictEqual({
				hooks: hooks?.children?.map(hook => ({
					id: hook.id, source: readCustomizationDiscoveryMeta(hook)?.source,
					enabled: hook.type === CustomizationType.Hook ? hook.enabled : undefined,
					readable: hasReadableCustomizationContent(URI.parse(hook.uri)),
				})),
				load: hooks?.type === CustomizationType.Directory ? hooks.load : undefined,
				requests,
			}, {
				hooks: [
					{ id: 'opaque-plugin', source: 'plugin', enabled: false, readable: false },
					{ id: 'opaque-user', source: 'user', enabled: false, readable: false },
					{ id: 'opaque-workspace', source: 'repository', enabled: false, readable: false },
				],
				load: { kind: CustomizationLoadStatus.Degraded, message: 'SDK partial error\nSDK warning' },
				requests: [
					{ projectPaths: [workspace.fsPath] },
					...nativeRepositoryHook ? [] : [{ projectPaths: [workspace.fsPath], hookDirectories: [inMemoryPathToUri('/workspace/.github/hooks').fsPath] }],
				],
			});
		});
	}

	test('workspace hook fallback failure preserves successful native discovery', async () => {
		await seed('/workspace/.github/hooks/test.json');
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const client = hookDiscoveryClient(async request => {
			if (request.hookDirectories) {
				throw new Error('SDK fallback unavailable');
			}
			return { hooks: [{ id: 'native', hookType: 'sessionStart', origin: 'plugin', enabled: true }], errors: [], warnings: [] };
		});
		const result = await discovery.discover(client, CancellationToken.None);
		const hooks = result.find(item => item.contents === CustomizationType.Hook && item.children?.length);
		assert.deepStrictEqual({
			ids: hooks?.children?.map(hook => hook.id),
			load: hooks?.type === CustomizationType.Directory ? hooks.load : undefined,
		}, {
			ids: ['native'],
			load: { kind: CustomizationLoadStatus.Degraded, message: 'Workspace hook discovery failed: SDK fallback unavailable' },
		});
	});

	test('workspace hook fallback propagates cancellation', async () => {
		await seed('/workspace/.github/hooks/test.json');
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const cancellation = disposables.add(new CancellationTokenSource());
		const enteredFallback = new DeferredPromise<void>();
		const pendingFallback = new DeferredPromise<Awaited<ReturnType<CopilotClient['rpc']['hooks']['discover']>>>();
		const client = hookDiscoveryClient(async request => {
			if (request.hookDirectories) {
				await enteredFallback.complete();
				return pendingFallback.p;
			}
			return { hooks: [], errors: [], warnings: [] };
		});
		const result = discovery.discover(client, cancellation.token);
		await enteredFallback.p;
		cancellation.cancel();
		try {
			await assert.rejects(result, CancellationError);
		} finally {
			await pendingFallback.complete({ hooks: [], errors: [], warnings: [] });
		}
	});

	test('publishes hooks-only and MCP-only native contributions with SDK provenance and partial diagnostics', async () => {
		const messages: string[] = [];
		instantiationService.stub(ILogService, new class extends NullLogService {
			override warn(message: string): void { messages.push(message); }
			override error(message: string | Error): void { messages.push(String(message)); }
		}());
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const mcpRequests: Parameters<CopilotClient['rpc']['mcp']['discover']>[0][] = [];
		const client = {
			rpc: {
				agents: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ agents: [] }) },
				instructions: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ sources: [] }) },
				skills: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ skills: [] }) },
				hooks: {
					discover: async () => ({
						hooks: [
							{ id: 'opaque:one', hookType: 'sessionStart', origin: 'plugin', source: 'hooks-only', enabled: true },
							{ id: 'opaque:two', hookType: 'sessionStart', origin: 'plugin', source: 'hooks-only', enabled: false },
						],
						warnings: ['Recovered source'], errors: ['Another source failed'],
					})
				},
				mcp: {
					discover: async (request: Parameters<CopilotClient['rpc']['mcp']['discover']>[0]) => {
						mcpRequests.push(request);
						return {
							servers: [{
								name: 'native', source: 'plugin', enabled: false,
								effectiveSource: { kind: 'plugin', id: 'do-not-parse', editability: 'read-only', plugin: { id: 'opaque-plugin', name: 'mcp-only' }, file: { uri: 'file:///host/plugins/mcp.json' } },
							}]
						};
					}
				},
			},
		} as unknown as CopilotClient;
		const customizations = await discovery.discover(client, CancellationToken.None);
		const hooks = customizations.find(customization => customization.contents === CustomizationType.Hook && customization.children?.length);
		const mcp = customizations.find(customization => customization.type === CustomizationType.McpServer);
		assert.deepStrictEqual({
			hooks: hooks?.children?.map(hook => ({ id: hook.id, name: hook.name, enabled: hook.type === CustomizationType.Hook ? hook.enabled : undefined, readable: hasReadableCustomizationContent(URI.parse(hook.uri)), provenance: readCustomizationDiscoveryMeta(hook) })),
			load: hooks?.type === CustomizationType.Directory ? hooks.load : undefined,
			mcp: mcp?.type === CustomizationType.McpServer ? { name: mcp.name, uri: mcp.uri, state: mcp.state, provenance: readCustomizationDiscoveryMeta(mcp) } : undefined,
			requests: mcpRequests,
			diagnostics: messages.filter(message => message.includes('Hook discovery:')),
		}, {
			hooks: [true, false].map((enabled, index) => ({
				id: index === 0 ? 'opaque:one' : 'opaque:two', name: 'sessionStart', enabled, readable: false,
				provenance: { source: 'plugin', sourceLabel: 'hooks-only', hookType: 'sessionStart', defaultEnabled: undefined, sourceId: undefined, pluginId: undefined },
			})),
			load: { kind: CustomizationLoadStatus.Degraded, message: 'Another source failed\nRecovered source' },
			mcp: { name: 'native', uri: inMemoryPathToUri('/host/plugins/mcp.json').toString(), state: { kind: McpServerStatus.Stopped }, provenance: { source: 'plugin', sourceLabel: undefined, hookType: undefined, defaultEnabled: false, sourceId: 'do-not-parse', pluginId: 'opaque-plugin' } },
			requests: [{ workingDirectory: workspace.fsPath, includeEffectiveSource: true }],
			diagnostics: ['[SessionCustomizationDiscovery] Hook discovery: Recovered source', '[SessionCustomizationDiscovery] Hook discovery: Another source failed'],
		});
		client.rpc.hooks.discover = async () => ({ hooks: [], errors: [], warnings: [] });
		client.rpc.mcp.discover = async () => ({ servers: [] });
		const refreshed = await discovery.discover(client, CancellationToken.None);
		assert.deepStrictEqual(refreshed.flatMap(customization => customization.type === CustomizationType.McpServer ? [customization.name] : customization.children?.map(child => child.name) ?? []), []);

		for (const name of ['mcp-only', 'mixed']) {
			await seed(`/host/plugins/${name}/.plugin/plugin.json`, JSON.stringify({ name }));
			await seed(`/host/plugins/${name}/.mcp.json`, JSON.stringify({ mcpServers: { [name]: { command: 'node' } } }));
		}
		await seed('/host/plugins/mixed/agents/review.agent.md', '---\nname: review\n---\nReview');
		await seed('/host/plugins/mixed/hooks/hooks.json', '{"hooks":{"sessionStart":[{"type":"command","bash":"echo hook"}]}}');
		client.rpc.agents.discover = async () => ({ agents: [{ id: 'native-review', name: 'review', displayName: 'review', description: '', path: '/host/plugins/mixed/agents/review.agent.md', source: 'plugin' }] });
		client.rpc.hooks.discover = async () => ({
			hooks: [{ id: 'mixed-hook', hookType: 'sessionStart', origin: 'plugin', enabled: true, source: 'mixed' }], errors: [], warnings: [],
		});
		client.rpc.mcp.discover = async () => ({
			servers: ['mcp-only', 'mixed'].map(name => ({
				name, type: 'stdio', source: 'plugin', enabled: false,
				effectiveSource: { kind: 'plugin', id: `opaque:${name}`, editability: 'read-only', plugin: { id: name }, file: { uri: URI.file(`/host/plugins/${name}/.mcp.json`).toString() } },
			}))
		});
		const native = await discovery.discover(client, CancellationToken.None);
		assert.deepStrictEqual(native.flatMap(item => {
			if (item.type === CustomizationType.Plugin) {
				return [{ name: item.name, children: item.children?.map(child => ({ name: child.name, type: child.type })) }];
			}
			if (item.type === CustomizationType.McpServer || item.children?.length) {
				return [{ name: item.name, children: item.children?.map(child => ({ name: child.name, type: child.type })) }];
			}
			return [];
		}), [
			{ name: 'Copilot hooks', children: [{ name: 'sessionStart', type: CustomizationType.Hook }] },
			{ name: 'mcp-only', children: [{ name: 'mcp-only', type: CustomizationType.McpServer }] },
			{ name: 'mixed', children: [{ name: 'review', type: CustomizationType.Agent }, { name: 'mixed', type: CustomizationType.McpServer }] },
		]);

		client.rpc.hooks.discover = async () => { throw new Error('hooks unavailable'); };
		client.rpc.mcp.discover = async () => { throw new Error('MCP unavailable'); };
		const partial = await discovery.discover(client, CancellationToken.None);
		assert.deepStrictEqual({
			failures: partial.filter(item => item.type === CustomizationType.Directory && item.load?.kind === CustomizationLoadStatus.Error).map(item => item.type === CustomizationType.Directory && item.load),
			agents: partial.flatMap(item => item.children?.filter(child => child.type === CustomizationType.Agent).map(child => child.id) ?? []),
		}, {
			failures: [{ kind: CustomizationLoadStatus.Error, message: 'hooks unavailable' }, { kind: CustomizationLoadStatus.Error, message: 'MCP unavailable' }],
			agents: ['native-review'],
		});
	});

	test('marks agent instruction rule sources as always apply', async () => {
		await seed('/workspace/AGENTS.md', 'workspace agents instructions');
		await seed('/workspace/.github/instructions/rule.instructions.md', 'scoped instruction');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				hooks: { discover: async () => ({ hooks: [], warnings: [], errors: [] }) },
				mcp: { discover: async () => ({ servers: [] }) },
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
				hooks: { discover: async () => ({ hooks: [], warnings: [], errors: [] }) },
				mcp: { discover: async () => ({ servers: [] }) },
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
				hooks: { discover: async () => ({ hooks: [], warnings: [], errors: [] }) },
				mcp: { discover: async () => ({ servers: [] }) },
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
			{ contents: 'hook', uri: '/workspace/.github/hooks', writable: true, children: [] },
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
				hooks: { discover: async () => ({ hooks: [], warnings: [], errors: [] }) },
				mcp: { discover: async () => ({ servers: [] }) },
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

	test('discover publishes skill argument hints from the SDK or the skill frontmatter', async () => {
		await seed('/workspace/.github/skills/sdk/SKILL.md', '---\nname: sdk\nargument-hint: from file\n---\nskill body');
		await seed('/workspace/.github/skills/file/SKILL.md', '---\nname: file\nargument-hint: "<problem> [offline]"\n---\nskill body');
		await seed('/workspace/.github/skills/none/SKILL.md', '---\nname: none\n---\nskill body');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				hooks: { discover: async () => ({ hooks: [], warnings: [], errors: [] }) },
				mcp: { discover: async () => ({ servers: [] }) },
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
						skills: [
							{ name: 'sdk', description: '', path: '/workspace/.github/skills/sdk/SKILL.md', enabled: true, userInvocable: true, argumentHint: 'from sdk' },
							{ name: 'file', description: '', path: '/workspace/.github/skills/file/SKILL.md', enabled: true, userInvocable: true },
							{ name: 'none', description: '', path: '/workspace/.github/skills/none/SKILL.md', enabled: true, userInvocable: true },
						],
					}),
				},
			},
		} as unknown as CopilotClient;

		const customizations = await discovery.discover(client, CancellationToken.None);
		const hints = customizations
			.flatMap(customization => customization.children ?? [])
			.filter((child): child is SkillCustomization => child.type === CustomizationType.Skill)
			.map(skill => ({ name: skill.name, argumentHint: readSkillArgumentHint(skill) }))
			.sort((a, b) => a.name.localeCompare(b.name));

		assert.deepStrictEqual(hints, [
			{ name: 'file', argumentHint: '<problem> [offline]' },
			{ name: 'none', argumentHint: undefined },
			{ name: 'sdk', argumentHint: 'from sdk' },
		]);
	});

	test('discover groups case-variant instructions and nested skills under their roots', async () => {
		const caseVariantUserHome = URI.from({ scheme: Schemas.inMemory, path: '/HOME' });
		await seed('/home/.copilot/copilot-instructions.md', 'user copilot instructions');
		await seed('/workspace/.github/skills/bar/SKILL.md', 'skill body');

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], caseVariantUserHome, inMemoryPathToUri));
		const client = {
			rpc: {
				hooks: { discover: async () => ({ hooks: [], warnings: [], errors: [] }) },
				mcp: { discover: async () => ({ servers: [] }) },
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
				hooks: { discover: async () => ({ hooks: [], warnings: [], errors: [] }) },
				mcp: { discover: async () => ({ servers: [] }) },
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

	test('does not fire onDidChange for unrelated changes under the workspace or user home', async () => {
		await seed('/home/.claude/CLAUDE.md', 'user instructions');
		await seed('/workspace/AGENTS.md', 'workspace instructions');
		await fileService.createFolder(URI.from({ scheme: Schemas.inMemory, path: '/home/.copilot/skills' }));
		await fileService.createFolder(URI.from({ scheme: Schemas.inMemory, path: '/workspace/src' }));

		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				hooks: { discover: async () => ({ hooks: [], warnings: [], errors: [] }) },
				mcp: { discover: async () => ({ servers: [] }) },
				agents: {
					getDiscoveryPaths: async () => ({ paths: [] }),
					discover: async () => ({ agents: [] }),
				},
				instructions: {
					getDiscoveryPaths: async () => ({
						paths: [
							{ path: '/workspace/AGENTS.md', kind: 'file' },
							{ path: '/home/.claude/CLAUDE.md', kind: 'file' },
						],
					}),
					discover: async () => ({ sources: [] }),
				},
				skills: {
					getDiscoveryPaths: async () => ({ paths: [{ path: '/home/.copilot/skills' }] }),
					discover: async () => ({ skills: [] }),
				},
			},
		} as unknown as CopilotClient;

		await discovery.discover(client, CancellationToken.None);
		await timeout(50);

		const changes: string[] = [];
		disposables.add(discovery.onDidChange(() => changes.push('changed')));

		const expectChange = async (label: string, action: () => Promise<unknown>) => {
			changes.length = 0;
			await action();
			await timeout(50);
			return `${label}: ${changes.length > 0}`;
		};

		const results = [
			await expectChange('unrelated file in user home', () => seed('/home/unrelated.txt')),
			await expectChange('unrelated file in ~/.copilot', () => seed('/home/.copilot/state.json')),
			await expectChange('unrelated file in workspace', () => seed('/workspace/src/file.ts')),
			await expectChange('user instruction file', () => seed('/home/.claude/CLAUDE.md', 'changed')),
			await expectChange('workspace instruction file', () => seed('/workspace/AGENTS.md', 'changed')),
			await expectChange('user skill', () => seed('/home/.copilot/skills/new/SKILL.md', 'skill')),
		];

		assert.deepStrictEqual(results, [
			'unrelated file in user home: false',
			'unrelated file in ~/.copilot: false',
			'unrelated file in workspace: false',
			'user instruction file: true',
			'workspace instruction file: true',
			'user skill: true',
		]);
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
				hooks: { discover: async () => ({ hooks: [], warnings: [], errors: [] }) },
				mcp: { discover: async () => ({ servers: [] }) },
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
				hooks: { discover: async () => ({ hooks: [], warnings: [], errors: [] }) },
				mcp: { discover: async () => ({ servers: [] }) },
				agents: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ agents: [] }) },
				instructions: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ sources: [] }) },
				skills: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ skills: [] }) },
			},
		} as unknown as CopilotClient;

		const requests: Parameters<CopilotClient['rpc']['hooks']['discover']>[0][] = [];
		client.rpc.hooks.discover = async request => {
			requests.push(request);
			return { hooks: [], warnings: [], errors: [] };
		};
		await discovery.discover(client, CancellationToken.None);
		assert.deepStrictEqual(requests, [
			{ projectPaths: [workspace.fsPath] },
			{ projectPaths: [workspace.fsPath], hookDirectories: [inMemoryPathToUri('/workspace/.github/hooks').fsPath] },
		]);
	});

	test('discover resolves relative instructions against their attributed project root and groups per root', async () => {
		const secondWorkspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace2' });
		const firstFile = await seed('/workspace/.github/copilot-instructions.md', 'first');
		const secondFile = await seed('/workspace2/.github/copilot-instructions.md', 'second');

		let requestedProjectPaths: string[] | undefined;
		const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace, secondWorkspace], userHome, inMemoryPathToUri));
		const client = {
			rpc: {
				hooks: { discover: async () => ({ hooks: [], warnings: [], errors: [] }) },
				mcp: { discover: async () => ({ servers: [] }) },
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
				hooks: { discover: async () => ({ hooks: [], warnings: [], errors: [] }) },
				mcp: { discover: async () => ({ servers: [] }) },
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
