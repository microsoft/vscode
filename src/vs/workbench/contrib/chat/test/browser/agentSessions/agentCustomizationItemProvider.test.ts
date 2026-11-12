/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { agentHostConnectionKinds } from '../../../../../../platform/agentHost/test/common/testAgentHostResourceUriMappers.js';
import { DeferredPromise, raceCancellation } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IFileContent, IFileService } from '../../../../../../platform/files/common/files.js';
import { createInMemoryFileService } from '../../../../../../platform/files/test/common/inMemoryFileService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../../../platform/extensions/common/extensions.js';
import { CustomizationLoadStatus, CustomizationType, type AgentCustomization, type ClientPluginCustomization, type Customization, type HookCustomization, type McpServerCustomization, type PluginCustomization, type SkillCustomization } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { createAgentHostResourceUriMapper, toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { CustomizationEnablementKind, McpServerStatus } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { AgentCustomizationItemProvider } from '../../../browser/agentSessions/agentHost/agentCustomizationItemProvider.js';
import { NullAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { AICustomizationScopes, AICustomizationSources, IAICustomizationWorkspaceService } from '../../../common/aiCustomizationWorkspaceService.js';
import { PromptFileSource, PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { ChatMode, CustomChatMode } from '../../../common/chatModes.js';
import { IExtensionPromptPath, IPromptPath, IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../../../../../../workbench/services/agentHost/common/agentHostFileSystemService.js';
import { withCustomizationDiscoveryMeta } from '../../../../../../platform/agentHost/common/meta/customizationDiscoveryMeta.js';
import { withRuntimePluginEnablement } from '../../../../../../platform/agentHost/common/meta/pluginEnablementMeta.js';
import { withCustomizationOrganizationMeta } from '../../../../../../platform/agentHost/common/meta/customizationOrganizationMeta.js';
import { AGENT_BUILTIN_CUSTOMIZATION_SCHEME, hasReadableCustomizationContent } from '../../../../../../platform/agentHost/common/agentHostCustomizationUri.js';
import { AICustomizationItemNormalizer, expandHookFileItems, ICustomizationSkillItem, ItemProviderItemSource } from '../../../browser/aiCustomization/aiCustomizationItemSource.js';
import { buildMcpResourceUri } from '../../../../../../platform/agentHost/common/mcpResourceUri.js';
import { withMcpServerDisplayNameMeta, withMcpServerSourceMeta } from '../../../../../../platform/agentHost/common/meta/mcpCustomizationMeta.js';
import { TestPathService } from '../../../../../test/browser/workbenchTestServices.js';

function makePromptsService(extensionFiles: readonly IExtensionPromptPath[] = []): IPromptsService {
	return upcastPartial<IPromptsService>({
		onDidChangeSkills: Event.None,
		getDisabledPromptFiles: () => new ResourceSet(),
		listPromptFilesForStorage: async (_type, storage) => storage === PromptsStorage.extension ? extensionFiles : [],
	});
}

const labelService = upcastPartial<ILabelService>({ getUriLabel: resource => resource.toString() });

suite('AgentCustomizationItemProvider', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps runtime enablement explanations on controls rather than plugin status badges', async () => {
		let ready = false;
		class TestCustomizationService extends NullAgentHostCustomizationService {
			canSetRuntimePluginEnablement(): boolean { return true; }
			override getCustomizations(): readonly Customization[] {
				return [{
					type: CustomizationType.Plugin, id: 'native', name: 'Native', uri: 'other-host:/plugin', children: [],
					load: { kind: ready ? CustomizationLoadStatus.Loaded : CustomizationLoadStatus.Loading },
					enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
					_meta: withRuntimePluginEnablement(undefined, {
						provider: 'copilotcli', plugin: 'direct', globalEnabled: false,
						effectiveEnabled: ready ? false : undefined, repositorySupported: false,
					}),
				}];
			}
		}
		const provider = disposables.add(new AgentCustomizationItemProvider({ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('host') }, undefined, undefined,
			upcastPartial<IFileService>({ canHandleResource: async () => false }), new NullLogService(), new TestCustomizationService(), makePromptsService(), labelService));
		const session = URI.parse('agent-host-copilot:/session');
		const pending = await provider.provideChatSessionCustomizations(session, CancellationToken.None);
		ready = true;
		const initialized = await provider.provideChatSessionCustomizations(session, CancellationToken.None);
		assert.deepStrictEqual([pending, initialized].map(items => items.filter(item => item.type === 'plugin').map(item => ({
			statusMessage: item.statusMessage, enabled: item.enabled, toggleEnabled: item.actions?.[0].enabled,
		}))), [
			[{ statusMessage: 'Waiting for Session Start', enabled: undefined, toggleEnabled: false }],
			[{ statusMessage: undefined, enabled: false, toggleEnabled: true }],
		]);
	});

	for (const kind of agentHostConnectionKinds) {
		test(`projects host-owned troubleshooting as a discovery-only built-in skill (${kind.name})`, async () => {
			const directory = URI.from({ scheme: AGENT_BUILTIN_CUSTOMIZATION_SCHEME, path: '/skills' });
			const resource = URI.from({ scheme: AGENT_BUILTIN_CUSTOMIZATION_SCHEME, path: '/skill/troubleshoot' });
			class TestCustomizationService extends NullAgentHostCustomizationService {
				override getCustomizations(): readonly Customization[] {
					return [{
						type: CustomizationType.Directory, id: directory.toString(), uri: directory.toString(), name: 'builtin',
						contents: CustomizationType.Skill, enabled: true, writable: false,
						children: [{ type: CustomizationType.Skill, id: resource.toString(), uri: resource.toString(), name: 'troubleshoot' }],
					}];
				}
			}
			const provider = disposables.add(new AgentCustomizationItemProvider({ clientId: 'vscode', resourceUris: kind.resourceUris }, undefined, undefined,
				upcastPartial<IFileService>({ canHandleResource: async () => false }), new NullLogService(), new TestCustomizationService(), makePromptsService(), labelService));
			const items = await provider.provideChatSessionCustomizations(URI.parse('agent-host-copilot:/session'), CancellationToken.None);
			assert.deepStrictEqual(items.filter(item => item.type === PromptsType.skill).map(item => ({
				name: item.name, source: item.source, readable: hasReadableCustomizationContent(item.uri),
			})), [{ name: 'troubleshoot', source: AICustomizationSources.builtin, readable: false }]);
		});

		test(`groups MCP skills by user source and parent plugin while preserving enablement and host resource mapping (${kind.name})`, async () => {
			const session = URI.parse('agent-host-copilot:/remote');
			const resource = URI.parse(buildMcpResourceUri('opaque-mcp-channel:skills', 'skill://server/friendly/SKILL.md', 'Friendly'));
			const skill = (name: string, enabled = true, userInvocable = true): SkillCustomization => ({
				type: CustomizationType.Skill, id: `skill:${name}`, uri: resource.toString(), name, description: 'MCP skill',
				enabled, disableUserInvocation: !userInvocable,
			});
			const server = (name: string, children: SkillCustomization[], enabled = true): McpServerCustomization => ({
				type: CustomizationType.McpServer, id: `server:${name}`, uri: `mcp-config:/${name}`, name, children,
				state: { kind: McpServerStatus.Ready }, enablement: [{ kind: CustomizationEnablementKind.Session, enabled }],
			});
			class TestCustomizationService extends NullAgentHostCustomizationService {
				override getCustomizations(): readonly Customization[] {
					return [
						{ ...server('top', [skill('Friendly'), skill('Disabled', false), skill('Not Invocable', true, false)]), _meta: withMcpServerDisplayNameMeta(withMcpServerSourceMeta(undefined, 'user'), 'Friendly Server') },
						{ type: CustomizationType.Plugin, id: 'foreign-plugin', uri: 'file:///foreign/plugin', clientId: 'other-client', name: 'Plugin', _meta: withCustomizationDiscoveryMeta(undefined, { source: 'repository' }), children: [{ ...server('nested', [skill('Nested')]), _meta: withCustomizationDiscoveryMeta(withMcpServerSourceMeta(undefined, 'plugin'), { source: 'plugin' }) }] },
						{ type: CustomizationType.Plugin, id: 'host-plugin', uri: 'other-host:/plugin', name: 'Host Plugin', _meta: withCustomizationDiscoveryMeta(undefined, { source: 'builtin' }), children: [server('host-nested', [skill('Host Nested')])] },
						server('disabled', [skill('Disabled Server')], false),
						{ ...server('workspace', [skill('Workspace')]), _meta: withMcpServerSourceMeta(undefined, 'workspace') },
						{ type: CustomizationType.Plugin, id: 'disabled-plugin', uri: 'file:///disabled/plugin', name: 'Disabled Plugin', enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }], children: [server('disabled-parent', [skill('Disabled Parent')])] },
						server('unreadable', [{ ...skill('No Channel'), uri: 'agent-discovery://server/no-channel/SKILL.md' }]),
					];
				}
			}
			const provider = disposables.add(new AgentCustomizationItemProvider({ clientId: 'vscode', resourceUris: kind.resourceUris }, undefined, undefined,
				upcastPartial<IFileService>({ canHandleResource: async () => false }), new NullLogService(), new TestCustomizationService(), makePromptsService(), labelService));
			const items: ICustomizationSkillItem[] = (await provider.provideChatSessionCustomizations(session, CancellationToken.None)).filter(item => item.type === PromptsType.skill);
			const clientResource = kind.name === 'remote agent host' ? toAgentHostUri(resource, 'remote-test')
				: kind.name === 'editor remote' ? toAgentHostUri(resource, 'editor-remote-test') : resource;
			const expected = (name: string, server: string, label: string, group: string, scope: string, enabled = true, userInvocable = true) => ({
				key: `skill:${name}`, name, uri: clientResource.toString(), source: AICustomizationSources.plugin, group, scope, description: 'MCP skill', enabled, userInvocable, readable: true,
				bundle: { id: `server:${server}`, name: `Skills from ${label}`, description: 'MCP Server', namePrefix: `${server}:` },
			});
			assert.deepStrictEqual(items.map(item => ({
				key: item.itemKey, name: item.name, uri: hasReadableCustomizationContent(item.uri) ? item.uri.toString() : undefined,
				source: item.source, group: item.groupKey, scope: item.scope, description: item.description, enabled: item.enabled, userInvocable: item.userInvocable,
				readable: hasReadableCustomizationContent(item.uri), bundle: item.skillBundle,
			})), [
				expected('Friendly', 'top', 'Friendly Server', AICustomizationSources.user, 'user'),
				expected('Disabled', 'top', 'Friendly Server', AICustomizationSources.user, 'user', false),
				expected('Not Invocable', 'top', 'Friendly Server', AICustomizationSources.user, 'user', true, false),
				expected('Nested', 'nested', 'nested', 'remote-client', 'workspace'),
				expected('Host Nested', 'host-nested', 'host-nested', 'remote-host', 'application'),
				expected('Workspace', 'workspace', 'workspace', AICustomizationSources.local, 'workspace'),
				{ ...expected('No Channel', 'unreadable', 'unreadable', AICustomizationSources.builtin, 'application'), uri: undefined, readable: false },
			]);
		});
	}

	test('omits MCP skill bundles for servers without skills', async () => {
		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getCustomizations(): readonly Customization[] {
				const server: McpServerCustomization = {
					type: CustomizationType.McpServer, id: 'empty', uri: 'mcp-config:/empty', name: 'Empty', state: { kind: McpServerStatus.Ready },
				};
				return [server, { ...server, id: 'empty-children', children: [] }, {
					type: CustomizationType.Plugin, id: 'plugin', uri: 'other-host:/plugin', clientId: 'other-client', name: 'Plugin', children: [server],
				}];
			}
		}
		const provider = disposables.add(new AgentCustomizationItemProvider({ clientId: 'vscode', resourceUris: agentHostConnectionKinds[0].resourceUris }, undefined, undefined,
			upcastPartial<IFileService>({ canHandleResource: async () => false }), new NullLogService(), new TestCustomizationService(), makePromptsService(), labelService));
		const items = await provider.provideChatSessionCustomizations(URI.parse('agent-host-copilot:/session'), CancellationToken.None);
		assert.deepStrictEqual(items.filter(item => item.type === PromptsType.skill), []);
	});

	for (const kind of agentHostConnectionKinds) {
		test(`maps host children of own and foreign plugins while preserving own client containers (${kind.name})`, async () => {
			const session = URI.parse('agent-host-copilot:/remote');
			const hostAgent: AgentCustomization = { type: CustomizationType.Agent, id: 'host-agent', uri: 'file:///workspace/agents/host.agent.md', name: 'Host' };
			const ownAgent: AgentCustomization = { type: CustomizationType.Agent, id: 'own-agent', uri: 'file:///cache/own/agents/own.agent.md', name: 'Own', _meta: { 'vscode.sourceUri': 'vscode-agent-host-file:///workspace/plugins/own/agents/own.agent.md' } };
			const foreignAgent: AgentCustomization = { type: CustomizationType.Agent, id: 'foreign-agent', uri: 'file:///cache/foreign/agents/foreign.agent.md', name: 'Foreign' };
			const hostPlugin: PluginCustomization = { type: CustomizationType.Plugin, id: 'host-plugin', uri: 'file:///plugins/host', name: 'Host Plugin', load: { kind: CustomizationLoadStatus.Loaded } };
			const ownPlugin: PluginCustomization = { type: CustomizationType.Plugin, id: 'own-plugin', uri: 'vscode-agent-host-file:///workspace/plugins/own', name: 'Own Plugin', clientId: 'vscode', children: [ownAgent], load: { kind: CustomizationLoadStatus.Loaded } };
			const foreignPlugin: PluginCustomization = { type: CustomizationType.Plugin, id: 'foreign-plugin', uri: 'file:///foreign/plugins/foreign', name: 'Foreign Plugin', clientId: 'other-window', children: [foreignAgent], load: { kind: CustomizationLoadStatus.Loaded } };
			class TestCustomizationService extends NullAgentHostCustomizationService {
				override getCustomAgents() { return [hostAgent, ownAgent, foreignAgent]; }
				override getWorkingDirectories() { return ['file:///workspace']; }
				override getClientWorkingDirectoryUris() { return [kind.toClient(URI.file('/workspace'))]; }
				override getCustomizations(): readonly Customization[] {
					return [
						{ type: CustomizationType.Directory, id: 'host', uri: 'file:///workspace/agents', name: 'Host Agents', contents: CustomizationType.Agent, enabled: true, writable: true, children: [hostAgent] },
						hostPlugin, ownPlugin, foreignPlugin,
					];
				}
			}
			const filesystemRequests: string[] = [];
			const originRequests: string[] = [];
			const provider = disposables.add(new AgentCustomizationItemProvider({
				clientId: 'vscode', resourceUris: kind.resourceUris,
			}, undefined, uri => { originRequests.push(uri.toString()); return undefined; }, upcastPartial<IFileService>({
				canHandleResource: async uri => { filesystemRequests.push(uri.toString()); return false; },
			}), new NullLogService(), new TestCustomizationService(), makePromptsService(), labelService));
			const agents = await provider.provideCustomAgents(session, CancellationToken.None);
			const items = await provider.provideChatSessionCustomizations(session, CancellationToken.None);
			const folders = await provider.provideSourceFolders(session, PromptsType.agent, CancellationToken.None);
			assert.deepStrictEqual({
				agents: agents.map(agent => ({ id: agent.id, uri: agent.uri.toString(), source: agent.source.label })),
				plugins: items.filter(item => item.type === 'plugin').map(item => ({ key: item.itemKey, name: item.name, uri: item.uri.toString(), delivery: item.delivery, status: item.status, actions: item.actions?.length })),
				folders: folders.map(folder => ({ uri: folder.uri.toString(), source: folder.source })),
				filesystemRequests,
				ownSource: originRequests.includes(kind.toClient(URI.file('/workspace/plugins/own/agents/own.agent.md')).toString()),
			}, {
				agents: [
					{ id: kind.toClient(URI.file('/workspace/agents/host.agent.md')).toString(), uri: kind.toClient(URI.file('/workspace/agents/host.agent.md')).toString(), source: 'Workspace' },
					{ id: kind.toClient(URI.file('/cache/own/agents/own.agent.md')).toString(), uri: kind.toClient(URI.file('/cache/own/agents/own.agent.md')).toString(), source: 'Plugin: Own Plugin' },
					{ id: kind.toClient(URI.file('/cache/foreign/agents/foreign.agent.md')).toString(), uri: kind.toClient(URI.file('/cache/foreign/agents/foreign.agent.md')).toString(), source: 'Plugin: Foreign Plugin' },
				],
				plugins: [
					{ key: 'host-plugin', name: 'Host Plugin', uri: kind.toClient(URI.file('/plugins/host')).toString(), delivery: undefined, status: 'loaded', actions: 3 },
					{ key: 'own-plugin::vscode', name: 'Own Plugin', uri: kind.toClient(URI.file('/workspace/plugins/own')).toString(), delivery: 'syncedFromClient', status: 'loaded', actions: 0 },
					{ key: 'foreign-plugin::other-window', name: 'Foreign Plugin', uri: foreignPlugin.uri, delivery: 'syncedFromClient', status: 'loaded', actions: 0 },
				],
				folders: [{ uri: kind.toClient(URI.file('/workspace/agents')).toString(), source: 'local' }],
				filesystemRequests: [kind.toClient(URI.file('/plugins/host')).toString(), kind.toClient(URI.file('/workspace/plugins/own')).toString()],
				ownSource: true,
			});
		});
	}

	test('shows discovery errors even when no hook actions could be loaded', async () => {
		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getCustomizations(): readonly Customization[] {
				return [{
					type: CustomizationType.Directory, id: 'hooks', uri: 'agent-discovery://copilot/hooks',
					name: 'Hooks', contents: CustomizationType.Hook, enabled: true, writable: false, children: [],
					load: { kind: CustomizationLoadStatus.Error, message: 'SDK hook discovery failed' },
				}];
			}
		}
		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('remote') }, undefined, undefined, upcastPartial<IFileService>({}),
			new NullLogService(), new TestCustomizationService(), makePromptsService(), labelService,
		));
		const items = await provider.provideChatSessionCustomizations(URI.parse('other-host:/opaque/session'), CancellationToken.None);
		assert.deepStrictEqual(items.map(item => ({ name: item.name, status: item.status, message: item.statusMessage, readable: hasReadableCustomizationContent(item.uri) })),
			[{ name: 'Hooks', status: 'error', message: 'SDK hook discovery failed', readable: false }]);
	});

	test('shows host-discovered plugin hooks without reading client files and preserves individual enablement', async () => {
		let readCount = 0;
		const fileService = upcastPartial<IFileService>({ readFile: async () => { readCount++; throw new Error('Must not read client files'); } });
		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getCustomizations(): readonly Customization[] {
				return [{
					type: CustomizationType.Directory, id: 'hooks', uri: 'agent-discovery://copilot/hooks',
					name: 'Hooks', contents: CustomizationType.Hook, enabled: true, writable: false,
					children: [true, false].map((enabled, index) => ({
						type: CustomizationType.Hook, id: `hook-${index}`, uri: `agent-discovery://copilot/hooks#${index}`,
						name: 'sessionStart', enabled,
						_meta: withCustomizationDiscoveryMeta(undefined, { source: 'plugin', sourceLabel: 'Remote plugin', hookType: 'sessionStart' }),
					})),
				}];
			}
		}
		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('remote') }, undefined, undefined, fileService,
			new NullLogService(), new TestCustomizationService(), makePromptsService(), labelService,
		));
		const items = await provider.provideChatSessionCustomizations(URI.parse('other-host:/opaque/session'), CancellationToken.None);
		const expanded = await expandHookFileItems(items, upcastPartial<IAICustomizationWorkspaceService>({ getActiveProjectRoot: () => undefined }), fileService,
			new TestPathService(URI.file('/client-home')));
		assert.deepStrictEqual({
			readCount, items: expanded.map(item => ({
				key: item.itemKey, name: item.name, source: item.source, description: item.description,
				enabled: item.enabled, readable: hasReadableCustomizationContent(item.uri),
			}))
		}, {
			readCount: 0, items: [true, false].map((enabled, index) => ({
				key: `hook-${index}`, name: 'Session Start', source: AICustomizationSources.plugin, description: 'Remote plugin — Source file unavailable',
				enabled, readable: false,
			}))
		});
	});

	test('marks managed-policy hooks and organization-managed plugins as organization controlled', async () => {
		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getCustomizations(): readonly Customization[] {
				return [
					{
						type: CustomizationType.Directory, id: 'hooks', uri: 'agent-discovery://copilot/hooks',
						name: 'Hooks', contents: CustomizationType.Hook, enabled: true, writable: false,
						children: ([['policy', true], ['policy', false], ['user', true]] as const).map(([source, enabled], index) => ({
							type: CustomizationType.Hook, id: `hook-${index}`, uri: `agent-discovery://copilot/hooks#${index}`,
							name: 'sessionStart', enabled,
							_meta: withCustomizationDiscoveryMeta(undefined, { source, hookType: 'sessionStart' }),
						})),
					},
					...([['required', { requiredEnabled: true }], ['supplied', {}], ['unmanaged', undefined]] as const).map(([name, organization]): PluginCustomization => ({
						type: CustomizationType.Plugin, id: name, uri: `file:///plugins/${name}`, name,
						...(organization ? { _meta: withCustomizationOrganizationMeta(undefined, organization) } : {}),
					})),
				];
			}
		}
		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('remote') }, undefined, undefined, upcastPartial<IFileService>({}),
			new NullLogService(), new TestCustomizationService(), makePromptsService(), labelService,
		));
		const items = await provider.provideChatSessionCustomizations(URI.parse('other-host:/opaque/session'), CancellationToken.None);
		assert.deepStrictEqual(items.map(item => ({ key: item.itemKey ?? item.name, organizationControl: item.organizationControl })), [
			{ key: 'required', organizationControl: { requiredEnabled: true } },
			{ key: 'supplied', organizationControl: {} },
			{ key: 'unmanaged', organizationControl: undefined },
			{ key: 'hook-0', organizationControl: { requiredEnabled: true } },
			{ key: 'hook-1', organizationControl: {} },
			{ key: 'hook-2', organizationControl: undefined },
		]);
	});

	for (const kind of agentHostConnectionKinds) {
		for (const origin of ['repository', 'user'] as const) {
			test(`keeps readable SDK ${origin} hook actions distinct while expanding hook-file records (${kind.name})`, async () => {
				const session = URI.parse('other-session:/opaque');
				const definition = URI.file('/host/settings.json');
				const hookFile = URI.file('/host/hooks/legacy.json');
				const readRequests: string[] = [];
				const fileService = upcastPartial<IFileService>({
					readFile: async uri => {
						readRequests.push(uri.toString());
						return upcastPartial<IFileContent>({
							value: VSBuffer.fromString(JSON.stringify({
								version: 1,
								hooks: { sessionStart: ['first', 'second'].map(name => ({ type: 'command', bash: `echo ${name}`, powershell: `echo ${name}` })) },
							}))
						});
					},
				});
				class TestCustomizationService extends NullAgentHostCustomizationService {
					override getCustomizations(): readonly Customization[] {
						return [{
							type: CustomizationType.Directory, id: 'hooks', uri: 'agent-discovery://other-host/hooks',
							name: 'Hooks', contents: CustomizationType.Hook, enabled: true, writable: false,
							children: [
								...[true, false].map<HookCustomization>((enabled, index) => ({
									type: CustomizationType.Hook, id: `opaque-action-${index}`, uri: definition.toString(),
									name: 'sessionStart', enabled,
									_meta: withCustomizationDiscoveryMeta(undefined, { source: origin, sourceLabel: 'settings.json', hookType: 'sessionStart' }),
								})),
								{ type: CustomizationType.Hook, id: 'hook-file', uri: hookFile.toString(), name: 'legacy.json' },
							],
						}];
					}
				}
				const provider = disposables.add(new AgentCustomizationItemProvider(
					{ clientId: 'vscode', resourceUris: kind.resourceUris }, undefined, undefined, fileService,
					new NullLogService(), new TestCustomizationService(), makePromptsService(), labelService,
				));
				const source = disposables.add(new ItemProviderItemSource(
					session, provider, makePromptsService(), upcastPartial<IAICustomizationWorkspaceService>({ getActiveProjectRoot: () => undefined }),
					fileService, new TestPathService(URI.file('/client-home')), new AICustomizationItemNormalizer(labelService, upcastPartial<IProductService>({})),
				));
				const items = await source.fetchAICustomizationItems(PromptsType.hook);
				const definitionUri = kind.toClient(definition).toString();
				const hookFileUri = kind.toClient(hookFile).toString();
				assert.deepStrictEqual({
					readRequests,
					items: items.map(item => ({ id: item.id, uri: item.uri.toString(), description: item.description, disabled: item.disabled })),
					actionSources: items.filter(item => item.id.startsWith('opaque-action-')).map(item => item.source),
				}, {
					readRequests: [hookFileUri],
					items: [
						{ id: 'opaque-action-0', uri: definitionUri, description: 'settings.json', disabled: false },
						{ id: 'opaque-action-1', uri: definitionUri, description: 'settings.json', disabled: true },
						{ id: hookFileUri, uri: hookFileUri, description: 'echo first', disabled: false },
						{ id: `${hookFileUri}#1`, uri: hookFileUri, description: 'echo second', disabled: false },
					],
					actionSources: [origin === 'repository' ? AICustomizationSources.local : AICustomizationSources.user, origin === 'repository' ? AICustomizationSources.local : AICustomizationSources.user],
				});
			});
		}
	}

	test('preserves provider metadata when expanding readable hook files', async () => {
		const fileService = createInMemoryFileService(disposables, Schemas.file);
		const uri = URI.file('/workspace/.github/hooks/hooks.json');
		await fileService.writeFile(uri, VSBuffer.fromString(JSON.stringify({
			hooks: { PreToolUse: [{ type: 'command', command: 'echo validate' }] },
		})));
		const expanded = await expandHookFileItems([{
			uri,
			type: PromptsType.hook,
			name: 'hooks',
			source: AICustomizationSources.extension,
			scope: AICustomizationScopes.workspace,
			origin: { kind: 'account', label: 'contoso' },
			delivery: 'syncedFromClient',
			extensionId: 'github.copilot-chat',
			extensionLabel: 'GitHub Copilot Chat',
			pluginUri: undefined,
		}], upcastPartial<IAICustomizationWorkspaceService>({ getActiveProjectRoot: () => URI.file('/workspace') }), fileService,
			new TestPathService(URI.file('/client-home')));

		assert.deepStrictEqual(expanded.map(item => ({
			name: item.name,
			scope: item.scope,
			origin: item.origin,
			delivery: item.delivery,
			extensionLabel: item.extensionLabel,
		})), [{
			name: 'Pre-Tool Use',
			scope: 'workspace',
			origin: { kind: 'account', label: 'contoso' },
			delivery: 'syncedFromClient',
			extensionLabel: 'GitHub Copilot Chat',
		}]);
	});

	test('keeps case-distinct host agent URIs in their declared plugin sources', async () => {
		const agents: AgentCustomization[] = ['Reviewer', 'reviewer'].map(id => ({
			type: CustomizationType.Agent, id, uri: `other-host:/agents/${id}`, name: 'Reviewer',
		}));
		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getCustomAgents() { return agents; }
			override getCustomizations(): readonly Customization[] {
				return agents.map((agent, index) => ({
					type: CustomizationType.Plugin, id: `plugin-${index}`, uri: `other-host:/plugin/${index}`, name: `source-${index}`, children: [agent],
				}));
			}
		}
		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('remote') }, undefined, undefined, upcastPartial<IFileService>({}), new NullLogService(),
			new TestCustomizationService(), makePromptsService(), labelService,
		));
		const result = await provider.provideCustomAgents(URI.parse('other-session:/opaque'), CancellationToken.None);
		assert.deepStrictEqual(result.map(agent => ({ id: agent.id, source: agent.source.label })), [
			{ id: createAgentHostResourceUriMapper('remote').fromAgentHost(URI.parse(agents[0].uri)).toString(), source: 'Plugin: source-0' },
			{ id: createAgentHostResourceUriMapper('remote').fromAgentHost(URI.parse(agents[1].uri)).toString(), source: 'Plugin: source-1' },
		]);
	});

	test('projects optional host model preferences into cached chat modes', async () => {
		const agents: AgentCustomization[] = [
			{ type: CustomizationType.Agent, id: 'plain', uri: 'other-host:/plain', name: 'Plain' },
			{ type: CustomizationType.Agent, id: 'scalar', uri: 'other-host:/scalar', name: 'Scalar', model: 'sonnet' },
			{ type: CustomizationType.Agent, id: 'ordered', uri: 'other-host:/ordered', name: 'Ordered', model: 'missing', _meta: { 'vscode.models': ['missing', 'sonnet'], 'vscode.reasoningEffort': 'low' } },
		];
		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getCustomAgents() { return agents; }
		}
		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('remote') }, undefined, undefined, upcastPartial<IFileService>({}), new NullLogService(),
			new TestCustomizationService(), makePromptsService(), labelService,
		));
		const result = await provider.provideCustomAgents(URI.parse('other-session:/opaque'), CancellationToken.None);
		assert.deepStrictEqual(result.map(agent => {
			const mode = new CustomChatMode(agent);
			return { model: mode.toJSON().model, effort: mode.toJSON().reasoningEffort };
		}), [
			{ model: undefined, effort: undefined },
			{ model: ['sonnet'], effort: undefined },
			{ model: ['missing', 'sonnet'], effort: 'low' },
		]);
	});

	test('does not treat a case-distinct host agent as a client draft', async () => {
		const agents: AgentCustomization[] = ['Reviewer', 'reviewer'].map(id => ({
			type: CustomizationType.Agent, id, uri: `other-host:/agents/${id}`, name: 'Reviewer',
		}));
		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getCustomAgents() { return agents; }
		}
		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('remote') }, undefined, undefined, upcastPartial<IFileService>({}), new NullLogService(),
			new TestCustomizationService(), makePromptsService(), labelService,
		));
		provider.setDraftCustomAgents(observableValue<readonly AgentCustomization[]>('draft', [agents[0]]));
		const result = await provider.provideCustomAgents(URI.parse('other-session:/opaque'), CancellationToken.None);
		assert.deepStrictEqual(result.map(agent => agent.source.label), ['VS Code', 'Agent Host']);
	});

	test('retains agents and logs failures when optional extension label discovery fails', async () => {
		class TestLogService extends NullLogService {
			warnings = 0;
			override warn(): void { this.warnings++; }
		}
		const prompts = makePromptsService();
		prompts.listPromptFilesForStorage = async () => { throw new Error('Extension discovery failed'); };
		const log = new TestLogService();
		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('local') }, undefined, undefined, upcastPartial<IFileService>({}), log,
			new NullAgentHostCustomizationService(), prompts, labelService,
		));
		provider.setDraftCustomAgents(observableValue<readonly AgentCustomization[]>('draft', [
			{ type: CustomizationType.Agent, id: 'agent', uri: 'other-host:/agent', name: 'Reviewer' },
		]));
		const result = await provider.provideCustomAgents(URI.parse('other-session:/opaque'), CancellationToken.None);
		assert.deepStrictEqual({ ids: result.map(agent => agent.id), warnings: log.warnings }, { ids: ['other-host:/agent'], warnings: 1 });
	});

	test('does not turn cancelled extension discovery into a successful agent list', async () => {
		const prompts = makePromptsService();
		prompts.listPromptFilesForStorage = async () => { throw new CancellationError(); };
		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('local') }, undefined, undefined, upcastPartial<IFileService>({}), new NullLogService(),
			new NullAgentHostCustomizationService(), prompts, labelService,
		));
		await assert.rejects(() => provider.provideCustomAgents(URI.parse('other-session:/opaque'), CancellationToken.None), isCancellationError);
	});

	function extensionFile(name: string, displayName?: string): IExtensionPromptPath {
		return {
			uri: URI.parse(`file:///extensions/${name}/reviewer.agent.md`),
			type: PromptsType.agent,
			storage: PromptsStorage.extension,
			source: PromptFileSource.ExtensionContribution,
			extension: upcastPartial<IExtensionDescription>({ identifier: new ExtensionIdentifier(`publisher.${name}`), name, displayName }),
		};
	}

	test('labels opaque host agents with extension display names through explicit source metadata', async () => {
		const files = [extensionFile('first', 'First Extension'), extensionFile('second')];
		const sources = files.map(file => URI.parse(`client-customizations:/bundle/agents/${file.extension.name}/reviewer.agent.md`));
		const agents: AgentCustomization[] = sources.map((source, index) => ({
			type: CustomizationType.Agent, id: `agent-${index}`, uri: `other-host:/opaque/${index}`, name: 'Reviewer',
			_meta: { 'vscode.sourceUri': source.toString() },
		}));
		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getCustomAgents() { return agents; }
			override getCustomizations(): readonly Customization[] {
				return [{ type: CustomizationType.Plugin, id: 'bundle', uri: `${SYNCED_CUSTOMIZATION_SCHEME}:/bundle`, name: 'VS Code Synced Data', clientId: 'vscode', children: agents }];
			}
		}
		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('remote') }, undefined,
			uri => {
				const index = sources.findIndex(source => isEqual(source, uri));
				return index < 0 ? undefined : { uri: files[index].uri, source: AICustomizationSources.extension, extensionId: files[index].extension.identifier.value.toUpperCase() };
			},
			upcastPartial<IFileService>({}), new NullLogService(), new TestCustomizationService(), makePromptsService(files), labelService,
		));
		const result = await provider.provideCustomAgents(URI.parse('other-session:/opaque'), CancellationToken.None);
		assert.deepStrictEqual(result.map(agent => {
			const mode = new CustomChatMode(agent);
			return { id: mode.id, name: mode.name.get(), source: mode.source?.label, storage: mode.source?.storage };
		}), [
			{ id: createAgentHostResourceUriMapper('remote').fromAgentHost(URI.parse(agents[0].uri)).toString(), name: 'Reviewer', source: 'Extension: First Extension', storage: PromptsStorage.extension },
			{ id: createAgentHostResourceUriMapper('remote').fromAgentHost(URI.parse(agents[1].uri)).toString(), name: 'Reviewer', source: 'Extension: second', storage: PromptsStorage.extension },
		]);
	});

	test('labels original draft extension agents without host source metadata', async () => {
		const file = extensionFile('draft', 'Draft Extension');
		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('local') }, undefined, undefined, upcastPartial<IFileService>({}), new NullLogService(),
			new NullAgentHostCustomizationService(), makePromptsService([file]), labelService,
		));
		provider.setDraftCustomAgents(observableValue<readonly AgentCustomization[]>('draftAgents', [
			{ type: CustomizationType.Agent, id: file.uri.toString(), uri: file.uri.toString(), name: 'Reviewer' },
		]));
		const result = await provider.provideCustomAgents(URI.parse('agent-host-copilotcli:/draft'), CancellationToken.None);
		assert.deepStrictEqual(result.map(agent => ({ label: agent.source.label, storage: agent.source.storage })), [
			{ label: 'Extension: Draft Extension', storage: PromptsStorage.extension },
		]);
	});

	for (const sourceUri of [undefined, 42, 'relative/agent.md', 'other-source:/unmapped/agent.md']) {
		test(`retains generic source labels when provenance is unavailable: ${String(sourceUri)}`, async () => {
			const agents: AgentCustomization[] = [{
				type: CustomizationType.Agent, id: 'opaque-agent', uri: 'other-host:/opaque/agent', name: 'Reviewer',
				_meta: { 'vscode.sourceUri': sourceUri },
			}];
			class TestCustomizationService extends NullAgentHostCustomizationService {
				override getCustomAgents() { return agents; }
				override getCustomizations(): readonly Customization[] {
					return [{ type: CustomizationType.Plugin, id: 'bundle', uri: `${SYNCED_CUSTOMIZATION_SCHEME}:/bundle`, name: 'VS Code Synced Data', clientId: 'vscode', children: agents }];
				}
			}
			const provider = disposables.add(new AgentCustomizationItemProvider(
				{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('remote') }, undefined, () => undefined, upcastPartial<IFileService>({}), new NullLogService(),
				new TestCustomizationService(), makePromptsService([extensionFile('unrelated', 'Unrelated Extension')]), labelService,
			));
			const result = await provider.provideCustomAgents(URI.parse('other-session:/opaque'), CancellationToken.None);
			assert.deepStrictEqual(result.map(agent => ({ id: agent.id, source: agent.source.label })), [
				{ id: createAgentHostResourceUriMapper('remote').fromAgentHost(URI.parse(agents[0].uri)).toString(), source: 'VS Code' },
			]);
		});
	}

	test('labels declared draft plugin sources before host children are available', async () => {
		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('local') }, undefined, undefined, upcastPartial<IFileService>({}),
			new NullLogService(), new NullAgentHostCustomizationService(), makePromptsService(), labelService,
		));
		provider.setDraftCustomAgents(observableValue<readonly AgentCustomization[]>('draftAgents', [
			{ type: CustomizationType.Agent, id: 'plugin-agent', uri: 'file:///plugins/review-tools/agents/reviewer.agent.md', name: 'Reviewer' },
			{ type: CustomizationType.Agent, id: 'extension-agent', uri: 'file:///extensions/reviewer.agent.md', name: 'Reviewer' },
		]));
		provider.setDraftCustomizations(observableValue<readonly ClientPluginCustomization[]>('draftCustomizations', [
			{ type: CustomizationType.Plugin, id: 'plugin', uri: 'file:///plugins/review-tools', name: 'review-tools' },
			{ type: CustomizationType.Plugin, id: 'bundle', uri: `${SYNCED_CUSTOMIZATION_SCHEME}:/bundle`, name: 'VS Code Synced Data' },
		]));
		const agents = await provider.provideCustomAgents(URI.parse('agent-host-copilotcli:/draft'), CancellationToken.None);
		assert.deepStrictEqual(agents.map(agent => agent.source.label), ['Plugin: review-tools', 'VS Code']);
	});

	test('labels agent origins using their declared containers rather than backend URI conventions', async () => {
		const agents: AgentCustomization[] = [
			{ type: CustomizationType.Agent, id: 'opaque-client-agent', uri: 'other-host:/opaque/first', name: 'Reviewer' },
			{ type: CustomizationType.Agent, id: 'opaque-native-agent', uri: 'other-host:/opaque/second', name: 'Reviewer' },
		];
		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getCustomAgents() { return agents; }
			override getCustomizations(): readonly Customization[] {
				return [
					{ type: CustomizationType.Plugin, id: 'disabled', uri: 'other-host:/disabled', name: 'Wrong source', enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }], children: [agents[0]] },
					{ type: CustomizationType.Plugin, id: 'bundle', uri: `${SYNCED_CUSTOMIZATION_SCHEME}:/bundle`, name: 'VS Code Synced Data', clientId: 'vscode', children: [agents[0]] },
					{ type: CustomizationType.Plugin, id: 'native', uri: 'other-host:/declared/plugin', name: 'review-tools', children: [agents[1]] },
				];
			}
		}
		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('remote') }, undefined, undefined, upcastPartial<IFileService>({}),
			new NullLogService(), new TestCustomizationService(), makePromptsService(), labelService,
		));
		const result = await provider.provideCustomAgents(URI.parse('remote-agent-host-test-copilot:/session'), CancellationToken.None);
		assert.deepStrictEqual(result.map(agent => ({ id: agent.id, name: agent.name, source: agent.source.label })), [
			{ id: createAgentHostResourceUriMapper('remote').fromAgentHost(URI.parse(agents[0].uri)).toString(), name: 'Reviewer', source: 'VS Code' },
			{ id: createAgentHostResourceUriMapper('remote').fromAgentHost(URI.parse(agents[1].uri)).toString(), name: 'Reviewer', source: 'Plugin: review-tools' },
		]);
	});

	test('adds file names when matching agent labels also share the same source label', async () => {
		const agents: AgentCustomization[] = ['first', 'second'].map(name => ({
			type: CustomizationType.Agent, id: name, uri: `other-host:/files/${name}.agent.md`, name: 'Reviewer',
		}));
		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getCustomAgents() { return agents; }
			override getCustomizations(): readonly Customization[] {
				return [{ type: CustomizationType.Plugin, id: 'plugin', uri: 'other-host:/plugin', name: 'review-tools', children: agents }];
			}
		}
		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('remote') }, undefined, undefined, upcastPartial<IFileService>({}),
			new NullLogService(), new TestCustomizationService(), makePromptsService(), labelService,
		));
		const result = await provider.provideCustomAgents(URI.parse('remote-agent-host-test-copilot:/session'), CancellationToken.None);
		assert.deepStrictEqual(result.map(agent => agent.source.label), [
			'Plugin: review-tools (first.agent.md)', 'Plugin: review-tools (second.agent.md)',
		]);
	});

	for (const pathStyle of ['posix', 'windows']) {
		test(`uses compact ${pathStyle} locations when source and file names are both ambiguous`, async () => {
			const prefix = `/profiles/remote-user/${'customizations/materialized-cache/'.repeat(6)}`;
			const agents: AgentCustomization[] = ['first', 'second'].map(name => ({
				type: CustomizationType.Agent, id: name, uri: `other-host:${prefix}${name}/shared.agent.md`, name: 'Reviewer',
			}));
			class TestCustomizationService extends NullAgentHostCustomizationService {
				override getCustomAgents() { return agents; }
				override getCustomizations(): readonly Customization[] {
					return [{ type: CustomizationType.Plugin, id: 'plugin', uri: 'other-host:/plugin', name: 'review-tools', children: agents }];
				}
			}
			const provider = disposables.add(new AgentCustomizationItemProvider(
				{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('remote') }, undefined, undefined, upcastPartial<IFileService>({}),
				new NullLogService(), new TestCustomizationService(), makePromptsService(),
				upcastPartial<ILabelService>({
					getUriLabel: resource => pathStyle === 'windows' ? `C:${resource.path.replaceAll('/', '\\')}` : resource.path,
				}),
			));
			const result = await provider.provideCustomAgents(URI.parse('remote-agent-host-test-copilot:/session'), CancellationToken.None);
			assert.deepStrictEqual(result.map(agent => agent.source.label), pathStyle === 'windows' ? [
				'Plugin: review-tools (C:\\\u2026\\first\\\u2026)', 'Plugin: review-tools (C:\\\u2026\\second\\\u2026)',
			] : [
				'Plugin: review-tools (/profiles/\u2026/first/\u2026)', 'Plugin: review-tools (/profiles/\u2026/second/\u2026)',
			]);
		});
	}

	test('uses original locations to distinguish same-named bundled extension agents', async () => {
		const agents: AgentCustomization[] = ['first', 'second'].map(name => ({
			type: CustomizationType.Agent, id: name, uri: `file:///cache/bundle/agents/${name}/reviewer.agent.md`, name: 'Reviewer',
			_meta: { 'vscode.sourceUri': `${SYNCED_CUSTOMIZATION_SCHEME}:/bundle/agents/${name}/reviewer.agent.md` },
		}));
		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getCustomAgents() { return agents; }
			override getCustomizations(): readonly Customization[] {
				return [{ type: CustomizationType.Plugin, id: 'bundle', uri: `${SYNCED_CUSTOMIZATION_SCHEME}:/bundle`, name: 'VS Code Synced Data', clientId: 'vscode', children: agents }];
			}
		}
		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('local') }, undefined,
			resource => ({
				uri: URI.parse(`file:///extensions/${resource.path.includes('/first/') ? 'first' : 'second'}/reviewer.agent.md`),
				source: AICustomizationSources.extension,
			}),
			upcastPartial<IFileService>({}), new NullLogService(), new TestCustomizationService(), makePromptsService(),
			upcastPartial<ILabelService>({ getUriLabel: resource => resource.path }),
		));
		const result = await provider.provideCustomAgents(URI.parse('agent-host-copilotcli:/session'), CancellationToken.None);
		assert.deepStrictEqual(result.map(agent => agent.source.label), [
			'VS Code (/extensions/first/\u2026)', 'VS Code (/extensions/second/\u2026)',
		]);
	});

	test('provides synced client tools and MCP namespaces without runtime discovery', async () => {
		let inventoryReads = 0;
		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getAgentFileToolInventory() {
				inventoryReads++;
				return [
					{ name: 'publisher.extension/extensionTool', description: 'Provided by an extension', availability: 'available' as const },
					{ name: 'playwright/*', availability: 'disabled' as const },
				];
			}
		}
		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('remote') }, undefined, undefined, upcastPartial<IFileService>({}),
			new NullLogService(), new TestCustomizationService(), makePromptsService(), labelService,
		));

		const inventory = await provider.provideAgentFileTools(URI.parse('remote-agent-host-test-copilot:/session'), CancellationToken.None);
		const cancelledInventory = await provider.provideAgentFileTools(URI.parse('remote-agent-host-test-copilot:/session'), CancellationToken.Cancelled);

		assert.deepStrictEqual({
			inventory,
			cancelledInventory,
			inventoryReads,
		}, {
			inventory: [
				{ name: 'publisher.extension/extensionTool', description: 'Provided by an extension', availability: 'available' },
				{ name: 'playwright/*', availability: 'disabled' },
			],
			cancelledInventory: undefined,
			inventoryReads: 1,
		});
	});

	test('waits for the first snapshot before reading the tool inventory', async () => {
		const ready = new DeferredPromise<void>();
		const waiting = new DeferredPromise<void>();
		let reads = 0;
		class TestCustomizationService extends NullAgentHostCustomizationService {
			override async whenCustomizationsReady(_session: URI, token = CancellationToken.None) {
				waiting.complete();
				await raceCancellation(ready.p, token);
				return !token.isCancellationRequested;
			}
			override getAgentFileToolInventory() {
				reads++;
				return [{ name: 'custom/tool', availability: 'available' as const }];
			}
		}
		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('remote') }, undefined, undefined, upcastPartial<IFileService>({}),
			new NullLogService(), new TestCustomizationService(), makePromptsService(), labelService,
		));
		const operation = provider.provideAgentFileTools(URI.parse('remote-agent-host-test-copilot:/session'), CancellationToken.None);
		await waiting.p;
		assert.strictEqual(reads, 0);
		await ready.complete();
		assert.deepStrictEqual({ inventory: await operation, reads }, { inventory: [{ name: 'custom/tool', availability: 'available' }], reads: 1 });
	});

	test('cancels a tool inventory readiness wait without reading unresolved state', async () => {
		const waiting = new DeferredPromise<void>();
		const ready = new DeferredPromise<void>();
		const tokenSource = disposables.add(new CancellationTokenSource());
		let reads = 0;
		class TestCustomizationService extends NullAgentHostCustomizationService {
			override async whenCustomizationsReady(_session: URI, token = CancellationToken.None) {
				waiting.complete();
				await raceCancellation(ready.p, token);
				return !token.isCancellationRequested;
			}
			override getAgentFileToolInventory() { reads++; return undefined; }
		}
		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('remote') }, undefined, undefined, upcastPartial<IFileService>({}),
			new NullLogService(), new TestCustomizationService(), makePromptsService(), labelService,
		));
		const operation = provider.provideAgentFileTools(URI.parse('remote-agent-host-test-copilot:/session'), tokenSource.token);
		await waiting.p;
		tokenSource.cancel();
		assert.deepStrictEqual({ inventory: await operation, reads }, { inventory: undefined, reads: 0 });
	});

	test('maps explicit Ask semantics without relying on host names or URI conventions', async () => {
		const agents: AgentCustomization[] = [
			{ type: CustomizationType.Agent, id: 'host-ask', uri: 'other-host:/opaque/read-only', name: 'Questions', _meta: { 'vscode.chatMode': 'ask' } },
			{ type: CustomizationType.Agent, id: 'user-ask', uri: 'other-host:/opaque/user', name: 'Ask' },
			{ type: CustomizationType.Agent, id: 'invalid-ask', uri: 'other-host:/opaque/invalid', name: 'Ask', _meta: { 'vscode.chatMode': true } },
		];
		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getCustomAgents(): readonly AgentCustomization[] {
				return agents;
			}
		}
		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('remote') }, undefined, undefined, upcastPartial<IFileService>({}),
			new NullLogService(), new TestCustomizationService(), makePromptsService(), labelService,
		));
		const modes = (await provider.provideCustomAgents(URI.parse('remote-agent-host-test-copilot:/session'), CancellationToken.None)).map(agent => new CustomChatMode(agent));

		assert.deepStrictEqual(modes.map(mode => ({
			id: mode.id,
			kind: mode.kind,
			label: mode.label.get(),
			icon: mode.icon.get(),
			storage: mode.source.storage,
			isBuiltin: mode.isBuiltin,
		})), [
			{ id: createAgentHostResourceUriMapper('remote').fromAgentHost(URI.parse(agents[0].uri)).toString(), kind: 'ask', label: 'Ask', icon: ChatMode.Ask.icon.get(), storage: PromptsStorage.builtIn, isBuiltin: false },
			{ id: createAgentHostResourceUriMapper('remote').fromAgentHost(URI.parse(agents[1].uri)).toString(), kind: 'agent', label: 'Ask', icon: undefined, storage: PromptsStorage.local, isBuiltin: false },
			{ id: createAgentHostResourceUriMapper('remote').fromAgentHost(URI.parse(agents[2].uri)).toString(), kind: 'agent', label: 'Ask', icon: undefined, storage: PromptsStorage.local, isBuiltin: false },
		]);
	});

	test('derives directory grouping from discovery source without interpreting opaque host URIs', async () => {
		const customizations: Customization[] = [
			{ type: CustomizationType.Directory, id: 'host-builtins', uri: 'other-host:/opaque/agents', name: 'agents', enabled: true, contents: CustomizationType.Agent, writable: false, _meta: withCustomizationDiscoveryMeta(undefined, { source: 'builtin' }), children: [{ type: CustomizationType.Agent, id: 'ask', uri: 'other-host:/opaque/agents/ask', name: 'Ask' }] },
			{ type: CustomizationType.Directory, id: 'host-workspace', uri: 'other-host:/opaque/workspace-agents', name: 'agents', enabled: true, contents: CustomizationType.Agent, writable: true, _meta: withCustomizationDiscoveryMeta(undefined, { source: 'repository' }), children: [{ type: CustomizationType.Agent, id: 'reviewer', uri: 'other-host:/opaque/workspace-agents/reviewer', name: 'Reviewer' }] },
			{ type: CustomizationType.Directory, id: 'unscoped', uri: 'other-host:/opaque/user-agents', name: 'agents', enabled: true, contents: CustomizationType.Agent, writable: true, children: [{ type: CustomizationType.Agent, id: 'planner', uri: 'other-host:/opaque/user-agents/planner', name: 'Planner' }] },
			{ type: CustomizationType.Directory, id: 'unknown-source', uri: 'other-host:/opaque/more-agents', name: 'agents', enabled: true, contents: CustomizationType.Agent, writable: false, _meta: withCustomizationDiscoveryMeta(undefined, { source: 'future-source' }), children: [{ type: CustomizationType.Agent, id: 'tester', uri: 'other-host:/opaque/more-agents/tester', name: 'Tester' }] },
			{ type: CustomizationType.Directory, id: 'mixed', uri: 'other-host:/opaque/mixed-agents', name: 'agents', enabled: true, contents: CustomizationType.Agent, writable: false, _meta: withCustomizationDiscoveryMeta(undefined, { source: 'builtin' }), children: [{ type: CustomizationType.Agent, id: 'personal', uri: 'other-host:/opaque/mixed-agents/personal', name: 'Personal', _meta: withCustomizationDiscoveryMeta(undefined, { source: 'user' }) }] },
		];
		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getCustomizations(): readonly Customization[] {
				return customizations;
			}
		}
		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('remote') }, undefined, undefined, upcastPartial<IFileService>({}),
			new NullLogService(), new TestCustomizationService(), makePromptsService(), labelService,
		));

		const items = await provider.provideChatSessionCustomizations(URI.parse('remote-agent-host-test-copilot:/session'), CancellationToken.None);

		assert.deepStrictEqual(items.map(item => ({ name: item.name, source: item.source, scope: item.scope, origin: item.origin })), [
			{ name: 'Ask', source: AICustomizationSources.builtin, scope: 'application', origin: { kind: 'harness' } },
			{ name: 'Reviewer', source: AICustomizationSources.local, scope: 'workspace', origin: undefined },
			{ name: 'Planner', source: AICustomizationSources.user, scope: undefined, origin: undefined },
			{ name: 'Tester', source: AICustomizationSources.user, scope: undefined, origin: undefined },
			{ name: 'Personal', source: AICustomizationSources.user, scope: 'user', origin: undefined },
		]);
	});

	test('inherits plugin discovery grouping for expanded children, including cached expansions', async () => {
		const fileService = createInMemoryFileService(disposables, Schemas.file);
		const pluginUri = URI.file('/plugins/review');
		await fileService.writeFile(URI.joinPath(pluginUri, 'skills', 'review', 'SKILL.md'), VSBuffer.fromString('---\nname: Review\n---\nReview code.'));
		const plugin: PluginCustomization = {
			type: CustomizationType.Plugin, id: 'review', uri: pluginUri.toString(), name: 'Review Plugin',
			_meta: withCustomizationDiscoveryMeta(undefined, { source: 'repository' }),
		};
		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getCustomizations(): readonly Customization[] {
				return [plugin];
			}
		}
		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: agentHostConnectionKinds[0].resourceUris }, undefined, undefined, fileService,
			new NullLogService(), new TestCustomizationService(), makePromptsService(), labelService,
		));
		const session = URI.parse('agent-host-copilot:/session');
		const initial = await provider.provideChatSessionCustomizations(session, CancellationToken.None);
		plugin._meta = withCustomizationDiscoveryMeta(plugin._meta, { source: 'builtin' });
		const updated = await provider.provideChatSessionCustomizations(session, CancellationToken.None);
		const project = (items: readonly ICustomizationSkillItem[]) => items.map(item => ({
			name: item.name, source: item.source, scope: item.scope,
		}));

		assert.deepStrictEqual({ initial: project(initial), updated: project(updated) }, {
			initial: [
				{ name: 'Review Plugin', source: AICustomizationSources.plugin, scope: 'workspace' },
				{ name: 'Review', source: AICustomizationSources.plugin, scope: 'workspace' },
			],
			updated: [
				{ name: 'Review Plugin', source: AICustomizationSources.plugin, scope: 'application' },
				{ name: 'Review', source: AICustomizationSources.plugin, scope: 'application' },
			],
		});
	});

	test('surfaces draft bundle agents skills and instructions before session state exists', async () => {
		const bundleUri = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/bundle' });
		const workspaceAgentUri = URI.file('/workspace/.github/agents/reviewer.agent.md');
		const workspaceSkillUri = URI.file('/workspace/.github/skills/review/SKILL.md');
		const workspaceInstructionsUri = URI.file('/workspace/.github/instructions/review.instructions.md');
		const fileService = createInMemoryFileService(disposables, SYNCED_CUSTOMIZATION_SCHEME);
		await fileService.writeFile(URI.joinPath(bundleUri, 'agents', 'reviewer.agent.md'), VSBuffer.fromString('---\nname: Reviewer\ndescription: Reviews changes\n---\nReview carefully.'));
		await fileService.writeFile(URI.joinPath(bundleUri, 'skills', 'review', 'SKILL.md'), VSBuffer.fromString('---\nname: Review Skill\ndescription: Reviews code\n---\nReview code.'));
		await fileService.writeFile(URI.joinPath(bundleUri, 'rules', 'review.instructions.md'), VSBuffer.fromString('---\nname: Review Instructions\ndescription: Review rules\n---\nFollow review rules.'));

		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getWorkingDirectories(): readonly string[] {
				return ['file:///workspace'];
			}
			override getCustomizations(): readonly Customization[] {
				return [];
			}
		}

		const origins = new Map([
			[URI.joinPath(bundleUri, 'agents', 'reviewer.agent.md').toString(), workspaceAgentUri],
			[URI.joinPath(bundleUri, 'skills', 'review', 'SKILL.md').toString(), workspaceSkillUri],
			[URI.joinPath(bundleUri, 'rules', 'review.instructions.md').toString(), workspaceInstructionsUri],
		]);
		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('local') },
			undefined,
			syncedUri => {
				const uri = origins.get(syncedUri.toString());
				return uri ? { uri, source: AICustomizationSources.local } : undefined;
			},
			fileService,
			new NullLogService(),
			new TestCustomizationService(),
			makePromptsService(), labelService,
		));
		provider.setDraftCustomizations(observableValue<readonly ClientPluginCustomization[]>('draftCustomizations', [{
			type: CustomizationType.Plugin,
			id: bundleUri.toString(),
			uri: bundleUri.toString(),
			name: 'VS Code Synced Data',
			nonce: '1',
		}]));

		const items = await provider.provideChatSessionCustomizations(URI.parse('agent-host-codex:///draft'), CancellationToken.None);

		assert.deepStrictEqual(items.map(item => ({ type: item.type, name: item.name, uri: item.uri.toString() })), [
			{ type: PromptsType.agent, name: 'Reviewer', uri: workspaceAgentUri.toString() },
			{ type: PromptsType.instructions, name: 'Review Instructions', uri: workspaceInstructionsUri.toString() },
			{ type: PromptsType.skill, name: 'Review Skill', uri: workspaceSkillUri.toString() },
		]);
	});

	test('surfaces session agents through directory customizations', async () => {
		const agentUri = 'file:///workspace/.github/agents/reviewer.agent.md';
		const customizations: Customization[] = [{
			type: CustomizationType.Directory,
			id: 'workspace-agents',
			uri: 'file:///workspace/.github/agents',
			name: 'Workspace Agents',
			enabled: true,
			contents: CustomizationType.Agent,
			writable: true,
			children: [{
				type: CustomizationType.Agent,
				id: agentUri,
				uri: agentUri,
				name: 'Reviewer',
				description: 'Reviews changes',
			}],
		}];

		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getWorkingDirectories(): readonly string[] {
				return ['file:///workspace'];
			}
			override getCustomizations(): readonly Customization[] {
				return customizations;
			}
		}

		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('local') },
			undefined,
			undefined,
			upcastPartial<IFileService>({}),
			new NullLogService(),
			new TestCustomizationService(),
			makePromptsService(), labelService,
		));

		const items = await provider.provideChatSessionCustomizations(URI.parse('agent-host-codex:///session'), CancellationToken.None);

		assert.deepStrictEqual(items.map(item => ({
			type: item.type,
			name: item.name,
			uri: item.uri.toString(),
			source: item.source,
			enabled: item.enabled,
		})), [{
			type: PromptsType.agent,
			name: 'Reviewer',
			uri: agentUri,
			source: AICustomizationSources.local,
			enabled: true,
		}]);
	});

	test('waits for the first session snapshot before publishing draft fallback agents', async () => {
		const agent: AgentCustomization = {
			type: CustomizationType.Agent,
			id: 'file:///workspace/.github/agents/learn-writer.agent.md',
			uri: 'file:///workspace/.github/agents/learn-writer.agent.md',
			name: 'Learn Writer',
			description: 'Writes documentation',
		};
		let ready = false;
		const calls: string[] = [];

		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getCustomAgents(): readonly AgentCustomization[] {
				calls.push(`get:${ready ? 'ready' : 'pending'}`);
				return ready ? [agent] : [];
			}

			override async whenCustomizationsReady(): Promise<boolean> {
				calls.push('wait');
				await Promise.resolve();
				ready = true;
				return true;
			}
		}

		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('local') },
			undefined,
			undefined,
			upcastPartial<IFileService>({}),
			new NullLogService(),
			new TestCustomizationService(),
			makePromptsService(), labelService,
		));
		provider.setDraftCustomAgents(observableValue<readonly AgentCustomization[]>('draftAgents', [{
			type: CustomizationType.Agent,
			id: 'file:///workspace/.github/agents/draft.agent.md',
			uri: 'file:///workspace/.github/agents/draft.agent.md',
			name: 'Draft Agent',
			description: 'Available before materialization',
		}]));
		const sessionResource = URI.parse('agent-host-copilotcli:///session');

		const agents = await provider.provideCustomAgents(sessionResource, CancellationToken.None);

		assert.deepStrictEqual({
			calls,
			agents: agents.map(candidate => ({
				name: candidate.name,
				sessionTypes: candidate.sessionTypes,
			})),
		}, {
			calls: ['wait', 'get:ready'],
			agents: [{
				name: 'Learn Writer',
				sessionTypes: ['agent-host-copilotcli'],
			}],
		});
	});

	test('preserves remote source folder URIs transformed by the transport', async () => {
		const workspace = URI.from({ scheme: Schemas.vscodeRemote, authority: 'wsl+ubuntu', path: '/workspace' });
		const instructionsDirectory = URI.joinPath(workspace, '.github', 'instructions');
		const customizations: Customization[] = [{
			type: CustomizationType.Directory,
			id: 'workspace-instructions',
			uri: instructionsDirectory.toString(),
			name: 'Workspace Instructions',
			enabled: true,
			contents: CustomizationType.Rule,
			writable: true,
			children: [],
		}];

		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getWorkingDirectories(): readonly string[] {
				return [workspace.toString()];
			}
			override getCustomizations(): readonly Customization[] {
				return customizations;
			}
		}

		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('local') },
			undefined,
			undefined,
			upcastPartial<IFileService>({}),
			new NullLogService(),
			new TestCustomizationService(),
			makePromptsService(), labelService,
		));

		const folders = await provider.provideSourceFolders(URI.parse('agent-host-copilotcli:///session'), PromptsType.instructions, CancellationToken.None);

		assert.deepStrictEqual(folders.map(folder => ({
			uri: folder.uri.toString(),
			source: folder.source,
		})), [{
			uri: instructionsDirectory.toString(),
			source: AICustomizationSources.local,
		}]);
	});

	test('bounds and shares the source folder readiness wait', async () => {
		class TestCustomizationService extends NullAgentHostCustomizationService {
			readinessCalls = 0;

			override whenCustomizationsReady(): Promise<boolean> {
				this.readinessCalls++;
				return new Promise<boolean>(() => { });
			}
		}
		class TestAgentCustomizationItemProvider extends AgentCustomizationItemProvider {
			protected override readonly _sourceFolderReadinessTimeoutMs = 1;
		}

		const customizationService = new TestCustomizationService();
		const provider = disposables.add(new TestAgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('local') },
			undefined,
			undefined,
			upcastPartial<IFileService>({}),
			new NullLogService(),
			customizationService,
			makePromptsService(), labelService,
		));
		const sessionResource = URI.parse('agent-host-copilotcli:///session');

		const first = await provider.provideSourceFolders(sessionResource, PromptsType.agent, CancellationToken.None);
		const second = await provider.provideSourceFolders(sessionResource, PromptsType.instructions, CancellationToken.None);

		assert.deepStrictEqual({ first, second, readiness: provider.getSourceFolderReadiness(sessionResource), readinessCalls: customizationService.readinessCalls }, {
			first: [],
			second: [],
			readiness: 'loading',
			readinessCalls: 1,
		});
	});

	test('updates source folder readiness after a bounded wait completes', async () => {
		const readiness = new DeferredPromise<boolean>();
		class TestCustomizationService extends NullAgentHostCustomizationService {
			override whenCustomizationsReady(): Promise<boolean> {
				return readiness.p;
			}
		}
		class TestAgentCustomizationItemProvider extends AgentCustomizationItemProvider {
			protected override readonly _sourceFolderReadinessTimeoutMs = 1;
		}

		const provider = disposables.add(new TestAgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('local') },
			undefined,
			undefined,
			upcastPartial<IFileService>({}),
			new NullLogService(),
			new TestCustomizationService(),
			makePromptsService(),
			labelService,
		));
		const sessionResource = URI.parse('agent-host-copilotcli:///session');

		await provider.provideSourceFolders(sessionResource, PromptsType.agent, CancellationToken.None);
		const whileLoading = provider.getSourceFolderReadiness(sessionResource);
		readiness.complete(true);
		await readiness.p;

		assert.deepStrictEqual({
			whileLoading,
			afterSnapshot: provider.getSourceFolderReadiness(sessionResource),
		}, {
			whileLoading: 'loading',
			afterSnapshot: 'ready',
		});
	});

	test('retries source folder readiness after an unavailable result', async () => {
		const results = [false, true];
		class TestCustomizationService extends NullAgentHostCustomizationService {
			readinessCalls = 0;

			override whenCustomizationsReady(): Promise<boolean> {
				return Promise.resolve(results[this.readinessCalls++]);
			}
		}

		const customizationService = new TestCustomizationService();
		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('local') },
			undefined,
			undefined,
			upcastPartial<IFileService>({}),
			new NullLogService(),
			customizationService,
			makePromptsService(),
			labelService,
		));
		const sessionResource = URI.parse('agent-host-copilotcli:///session');

		await provider.provideSourceFolders(sessionResource, PromptsType.agent, CancellationToken.None);
		const first = provider.getSourceFolderReadiness(sessionResource);
		await provider.provideSourceFolders(sessionResource, PromptsType.agent, CancellationToken.None);

		assert.deepStrictEqual({
			first,
			second: provider.getSourceFolderReadiness(sessionResource),
			readinessCalls: customizationService.readinessCalls,
		}, {
			first: 'unavailable',
			second: 'ready',
			readinessCalls: 2,
		});
	});

	test('classifies a directory child by its real file URI when its container is synthetic', async () => {
		const skillUri = 'file:///workspace/.agents/skills/launch/SKILL.md';
		const customizations: Customization[] = [{
			type: CustomizationType.Directory,
			id: 'codex-repository-skills',
			uri: 'codex-skills:/repo',
			name: 'Repository',
			enabled: true,
			contents: CustomizationType.Skill,
			writable: false,
			children: [{
				type: CustomizationType.Skill,
				id: skillUri,
				uri: skillUri,
				name: 'launch',
				description: 'Launch Code OSS.',
			}],
		}];

		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getWorkingDirectories(): readonly string[] {
				return ['file:///workspace'];
			}
			override getCustomizations(): readonly Customization[] {
				return customizations;
			}
		}

		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('local') },
			undefined,
			undefined,
			upcastPartial<IFileService>({}),
			new NullLogService(),
			new TestCustomizationService(),
			makePromptsService(), labelService,
		));

		const items = await provider.provideChatSessionCustomizations(URI.parse('agent-host-codex:///session'), CancellationToken.None);

		assert.deepStrictEqual(items.map(item => ({
			type: item.type,
			name: item.name,
			uri: item.uri.toString(),
			source: item.source,
		})), [{
			type: PromptsType.skill,
			name: 'launch',
			uri: skillUri,
			source: AICustomizationSources.local,
		}]);
	});

	test('overrides a stale enabled provider row when its built-in skill is user-disabled', async () => {
		const bundleUri = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/bundle' });
		const bundledSkillUri = URI.joinPath(bundleUri, 'skills', 'create-pr', 'SKILL.md');
		const builtinSkillUri = URI.file('/builtin/create-pr/SKILL.md');
		const fileService = createInMemoryFileService(disposables, SYNCED_CUSTOMIZATION_SCHEME);
		await fileService.writeFile(bundledSkillUri, VSBuffer.fromString('---\nname: create-pr\ndescription: Create a pull request.\n---\nCreate it.'));
		const promptsService = upcastPartial<IPromptsService>({
			onDidChangeSkills: Event.None,
			getDisabledPromptFiles: () => new ResourceSet([builtinSkillUri]),
			listPromptFilesForStorage: async () => [{
				uri: builtinSkillUri,
				type: PromptsType.skill,
				storage: PromptsStorage.builtIn,
				name: 'create-pr',
				description: 'Create a pull request.',
			} as IPromptPath],
		});
		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('local') },
			undefined,
			syncedUri => syncedUri.toString() === bundledSkillUri.toString()
				? { uri: builtinSkillUri, source: AICustomizationSources.builtin }
				: undefined,
			fileService,
			new NullLogService(),
			new NullAgentHostCustomizationService(),
			promptsService, labelService,
		));
		provider.setDraftCustomizations(observableValue<readonly ClientPluginCustomization[]>('draftCustomizations', [{
			type: CustomizationType.Plugin,
			id: bundleUri.toString(),
			uri: bundleUri.toString(),
			name: 'VS Code Synced Data',
			nonce: '1',
		}]));

		const items = await provider.provideChatSessionCustomizations(URI.parse('agent-host-codex:///draft'), CancellationToken.None);

		assert.deepStrictEqual(items.map(item => ({
			uri: item.uri.toString(),
			type: item.type,
			source: item.source,
			enabled: item.enabled,
		})), [{
			uri: builtinSkillUri.toString(),
			type: PromptsType.skill,
			source: AICustomizationSources.builtin,
			enabled: false,
		}]);
	});

	test('surfaces only the host-published winning disabled reason', async () => {
		const customizations: PluginCustomization[] = [
			{
				type: CustomizationType.Plugin,
				id: 'plugin-1',
				uri: 'file:///plugins/one',
				name: 'Plugin One',
				enablement: [
					{ kind: CustomizationEnablementKind.Session, enabled: false },
					{ kind: CustomizationEnablementKind.Global, enabled: true },
				],
			},
			{
				type: CustomizationType.Plugin,
				id: 'plugin-2',
				uri: 'file:///plugins/two',
				name: 'Plugin Two',
			},
		];
		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getCustomizations(): readonly Customization[] {
				return customizations;
			}
		}

		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('local') },
			undefined,
			undefined,
			upcastPartial<IFileService>({}),
			new NullLogService(),
			new TestCustomizationService(),
			makePromptsService(), labelService,
		));
		const items = await provider.provideChatSessionCustomizations(URI.parse('agent-host-codex:///session'), CancellationToken.None);

		assert.deepStrictEqual(items.map(item => ({
			name: item.name,
			enabled: item.enabled,
			disabledReason: item.disabledReason,
		})), [
			{
				name: 'Plugin One',
				enabled: false,
				disabledReason: { source: 'scope', scope: CustomizationEnablementKind.Session },
			},
			{
				name: 'Plugin Two',
				enabled: true,
				disabledReason: undefined,
			},
		]);
	});

	test('supplements provider output with user-disabled built-in skills', async () => {
		const disabledSkill = URI.file('/builtin/create-pr/SKILL.md');
		let disabledPromptFiles = new ResourceSet([disabledSkill]);
		const onDidChangeSkills = disposables.add(new Emitter<void>());
		const promptsService = upcastPartial<IPromptsService>({
			onDidChangeSkills: onDidChangeSkills.event,
			getDisabledPromptFiles: () => disabledPromptFiles,
			listPromptFilesForStorage: async (type: PromptsType, storage: PromptsStorage) => type === PromptsType.skill && storage === PromptsStorage.builtIn
				? [{ uri: disabledSkill, type, storage, name: 'create-pr', description: 'Create a pull request.' } satisfies IPromptPath]
				: [],
		});
		const provider = disposables.add(new AgentCustomizationItemProvider(
			{ clientId: 'vscode', resourceUris: createAgentHostResourceUriMapper('local') },
			undefined,
			undefined,
			upcastPartial<IFileService>({}),
			new NullLogService(),
			new NullAgentHostCustomizationService(),
			promptsService, labelService,
		));
		let changeCount = 0;
		disposables.add(provider.onDidChange(() => changeCount++));

		const disabledItems = await provider.provideChatSessionCustomizations(URI.parse('agent-host-codex:///session'), CancellationToken.None);
		disabledPromptFiles = new ResourceSet();
		onDidChangeSkills.fire();
		const enabledItems = await provider.provideChatSessionCustomizations(URI.parse('agent-host-codex:///session'), CancellationToken.None);

		assert.deepStrictEqual({
			disabledItems: disabledItems.map(item => ({
				uri: item.uri.toString(),
				type: item.type,
				name: item.name,
				source: item.source,
				enabled: item.enabled,
			})),
			changeCount,
			enabledItems,
		}, {
			disabledItems: [{
				uri: disabledSkill.toString(),
				type: PromptsType.skill,
				name: 'create-pr',
				source: AICustomizationSources.builtin,
				enabled: false,
			}],
			changeCount: 1,
			enabledItems: [],
		});
	});
});
