/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { createInMemoryFileService } from '../../../../../../platform/files/test/common/inMemoryFileService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../../../platform/extensions/common/extensions.js';
import { CustomizationLoadStatus, CustomizationType, type AgentCustomization, type ClientPluginCustomization, type Customization, type PluginCustomization } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { CustomizationEnablementKind } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { AgentCustomizationItemProvider } from '../../../browser/agentSessions/agentHost/agentCustomizationItemProvider.js';
import { NullAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { AICustomizationSources, IAICustomizationWorkspaceService } from '../../../common/aiCustomizationWorkspaceService.js';
import { PromptFileSource, PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { ChatMode, CustomChatMode } from '../../../common/chatModes.js';
import { IExtensionPromptPath, IPromptPath, IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../../../../../../workbench/services/agentHost/common/agentHostFileSystemService.js';
import { withCustomizationDiscoveryMeta } from '../../../../../../platform/agentHost/common/meta/customizationDiscoveryMeta.js';
import { hasReadableCustomizationContent } from '../../../../../../platform/agentHost/common/agentHostCustomizationUri.js';
import { expandHookFileItems } from '../../../browser/aiCustomization/aiCustomizationItemSource.js';
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
			'remote', undefined, undefined, upcastPartial<IFileService>({}),
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
			'remote', undefined, undefined, fileService,
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
			'remote', undefined, undefined, upcastPartial<IFileService>({}), new NullLogService(),
			new TestCustomizationService(), makePromptsService(), labelService,
		));
		const result = await provider.provideCustomAgents(URI.parse('other-session:/opaque'), CancellationToken.None);
		assert.deepStrictEqual(result.map(agent => ({ id: agent.id, source: agent.source.label })), [
			{ id: agents[0].uri, source: 'Plugin: source-0' },
			{ id: agents[1].uri, source: 'Plugin: source-1' },
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
			'remote', undefined, undefined, upcastPartial<IFileService>({}), new NullLogService(),
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
			'local', undefined, undefined, upcastPartial<IFileService>({}), log,
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
			'local', undefined, undefined, upcastPartial<IFileService>({}), new NullLogService(),
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
				return [{ type: CustomizationType.Plugin, id: 'bundle', uri: `${SYNCED_CUSTOMIZATION_SCHEME}:/bundle`, name: 'VS Code Synced Data', children: agents }];
			}
		}
		const provider = disposables.add(new AgentCustomizationItemProvider(
			'remote', undefined,
			uri => {
				const index = sources.findIndex(source => isEqual(source, uri));
				return index < 0 ? undefined : { uri: files[index].uri, source: AICustomizationSources.extension, extensionId: files[index].extension.identifier.value.toUpperCase() };
			},
			upcastPartial<IFileService>({}), new NullLogService(), new TestCustomizationService(), makePromptsService(files), labelService,
		));
		const result = await provider.provideCustomAgents(URI.parse('other-session:/opaque'), CancellationToken.None);
		assert.deepStrictEqual(result.map(agent => ({ id: agent.id, name: agent.name, source: agent.source.label })), [
			{ id: agents[0].uri, name: 'Reviewer', source: 'Extension: First Extension' },
			{ id: agents[1].uri, name: 'Reviewer', source: 'Extension: second' },
		]);
	});

	test('labels original draft extension agents without host source metadata', async () => {
		const file = extensionFile('draft', 'Draft Extension');
		const provider = disposables.add(new AgentCustomizationItemProvider(
			'local', undefined, undefined, upcastPartial<IFileService>({}), new NullLogService(),
			new NullAgentHostCustomizationService(), makePromptsService([file]), labelService,
		));
		provider.setDraftCustomAgents(observableValue<readonly AgentCustomization[]>('draftAgents', [
			{ type: CustomizationType.Agent, id: file.uri.toString(), uri: file.uri.toString(), name: 'Reviewer' },
		]));
		const result = await provider.provideCustomAgents(URI.parse('agent-host-copilotcli:/draft'), CancellationToken.None);
		assert.deepStrictEqual(result.map(agent => agent.source.label), ['Extension: Draft Extension']);
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
					return [{ type: CustomizationType.Plugin, id: 'bundle', uri: `${SYNCED_CUSTOMIZATION_SCHEME}:/bundle`, name: 'VS Code Synced Data', children: agents }];
				}
			}
			const provider = disposables.add(new AgentCustomizationItemProvider(
				'remote', undefined, () => undefined, upcastPartial<IFileService>({}), new NullLogService(),
				new TestCustomizationService(), makePromptsService([extensionFile('unrelated', 'Unrelated Extension')]), labelService,
			));
			const result = await provider.provideCustomAgents(URI.parse('other-session:/opaque'), CancellationToken.None);
			assert.deepStrictEqual(result.map(agent => ({ id: agent.id, source: agent.source.label })), [
				{ id: agents[0].uri, source: 'VS Code' },
			]);
		});
	}

	test('labels declared draft plugin sources before host children are available', async () => {
		const provider = disposables.add(new AgentCustomizationItemProvider(
			'local', undefined, undefined, upcastPartial<IFileService>({}),
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
					{ type: CustomizationType.Plugin, id: 'bundle', uri: `${SYNCED_CUSTOMIZATION_SCHEME}:/bundle`, name: 'VS Code Synced Data', children: [agents[0]] },
					{ type: CustomizationType.Plugin, id: 'native', uri: 'other-host:/declared/plugin', name: 'review-tools', children: [agents[1]] },
				];
			}
		}
		const provider = disposables.add(new AgentCustomizationItemProvider(
			'remote', undefined, undefined, upcastPartial<IFileService>({}),
			new NullLogService(), new TestCustomizationService(), makePromptsService(), labelService,
		));
		const result = await provider.provideCustomAgents(URI.parse('remote-agent-host-test-copilot:/session'), CancellationToken.None);
		assert.deepStrictEqual(result.map(agent => ({ id: agent.id, name: agent.name, source: agent.source.label })), [
			{ id: agents[0].uri, name: 'Reviewer', source: 'VS Code' },
			{ id: agents[1].uri, name: 'Reviewer', source: 'Plugin: review-tools' },
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
			'remote', undefined, undefined, upcastPartial<IFileService>({}),
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
				'remote', undefined, undefined, upcastPartial<IFileService>({}),
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
			type: CustomizationType.Agent, id: name, uri: `${SYNCED_CUSTOMIZATION_SCHEME}:/bundle/agents/${name}/reviewer.agent.md`, name: 'Reviewer',
		}));
		class TestCustomizationService extends NullAgentHostCustomizationService {
			override getCustomAgents() { return agents; }
			override getCustomizations(): readonly Customization[] {
				return [{ type: CustomizationType.Plugin, id: 'bundle', uri: `${SYNCED_CUSTOMIZATION_SCHEME}:/bundle`, name: 'VS Code Synced Data', children: agents }];
			}
		}
		const provider = disposables.add(new AgentCustomizationItemProvider(
			'local', undefined,
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
			'remote', undefined, undefined, upcastPartial<IFileService>({}),
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
			'remote', undefined, undefined, upcastPartial<IFileService>({}),
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
			{ id: agents[0].uri, kind: 'ask', label: 'Ask', icon: ChatMode.Ask.icon.get(), storage: PromptsStorage.builtIn, isBuiltin: false },
			{ id: agents[1].uri, kind: 'agent', label: 'Ask', icon: undefined, storage: PromptsStorage.local, isBuiltin: false },
			{ id: agents[2].uri, kind: 'agent', label: 'Ask', icon: undefined, storage: PromptsStorage.local, isBuiltin: false },
		]);
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
			'local',
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
			'local',
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
			'local',
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
			'local',
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
			'local',
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
			'local',
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
			'local',
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
			'local',
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
			'local',
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
			'local',
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
			'local',
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
