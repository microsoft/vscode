/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { disposableTimeout } from '../../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { parseLinkedText } from '../../../../../../../base/common/linkedText.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IAgentCustomizationInstallation, IAgentCustomizationInstallationApplyRequest, IAgentCustomizationInstallationConfigurationRequest, IAgentCustomizationMarketplaceSearchRequest, IAgentPluginInstallation, IAgentPluginInstallRequest } from '../../../../../../../platform/agentHost/common/agent.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService } from '../../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostService } from '../../../../../../../platform/agentHost/common/agentService.js';
import { CustomizationMarketplaceRecoveryGroup } from '../../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceSources } from '../../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IDialogService } from '../../../../../../../platform/dialogs/common/dialogs.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { type IMcpServerConfiguration, McpServerType } from '../../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { AgentHostCustomizationMarketplaceInstallProvider } from '../../../../browser/agentSessions/agentHost/agentHostCustomizationMarketplaceInstallProvider.js';
import { IAgentHostCustomizationService } from '../../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IAgentPlugin, IAgentPluginService } from '../../../../common/plugins/agentPluginService.js';
import { ContributionEnablementState, EnablementModel } from '../../../../common/enablement.js';
import { InMemoryStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { IInputBox, IQuickInputButton, IQuickInputHideEvent, IQuickInputService, IQuickPick, IQuickPickDidAcceptEvent, IQuickPickItem, QuickInputHideReason } from '../../../../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../../platform/workspace/common/workspaceTrust.js';

interface ITestProviderOptions {
	readonly quickInput?: IQuickInputService;
	readonly trusted?: boolean;
	readonly requestTrust?: () => Promise<boolean | undefined>;
}

/** Creates a provider with optional quick input and workspace trust fakes. */
function createTestProvider(
	providerId: string,
	resolveAuthentication: () => Promise<boolean>,
	agentHostService: IAgentHostService,
	connections: IAgentHostConnectionsService,
	customizations: IAgentHostCustomizationService,
	dialogs: IDialogService,
	logService: ILogService,
	plugins: IAgentPluginService,
	options: ITestProviderOptions = {},
): AgentHostCustomizationMarketplaceInstallProvider {
	return new AgentHostCustomizationMarketplaceInstallProvider(
		providerId,
		resolveAuthentication,
		agentHostService,
		connections,
		customizations,
		dialogs,
		logService,
		plugins,
		options.quickInput ?? new class extends mock<IQuickInputService>() { }(),
		new class extends mock<IWorkspaceTrustManagementService>() {
			override isWorkspaceTrusted() { return options.trusted ?? true; }
		}(),
		new class extends mock<IWorkspaceTrustRequestService>() {
			override async requestWorkspaceTrust() { return options.requestTrust ? options.requestTrust() : true; }
		}(),
	);
}

/** Wraps a review in the owned shape the host returns. */
function ownedReview<T>(review: T) {
	return { kind: 'review' as const, review, hostGeneration: 'generation', ownershipToken: 'token' };
}

suite('AgentHostCustomizationMarketplaceInstallProvider', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let pluginService: IAgentPluginService;
	const discoveredPlugins = observableValue<readonly IAgentPlugin[]>('plugins', []);

	setup(() => {
		discoveredPlugins.set([], undefined);
		pluginService = {
			_serviceBrand: undefined,
			plugins: discoveredPlugins,
			enablementModel: store.add(new EnablementModel('testPlugins', store.add(new InMemoryStorageService()))),
		};
	});

	test('installs raw plugin sources through management using the owning backend session and chat', async () => {
		const frontendSession = URI.parse('agent-host-copilotcli:/frontend');
		const backendSession = URI.parse('vendor-session://host/opaque-session');
		const backendChat = URI.parse('vendor-chat://host/opaque-chat');
		const calls: { provider: string; request: IAgentPluginInstallRequest; session: URI | undefined; chat: URI | undefined }[] = [];
		let connectionAuthority = AMBIENT_AGENT_HOST_AUTHORITY;
		const provider = store.add(createTestProvider(
			'copilotcli',
			async () => true,
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async installPlugin(provider: string, request: IAgentPluginInstallRequest, session?: URI, chat?: URI) {
					if (request.source === 'invalid') {
						throw new Error('SDK rejected source');
					}
					calls.push({ provider, request, session, chat });
				}
			}(),
			new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResourceIdentity() {
					return { connectionAuthority, backendSession };
				}
			}(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
				override getBackendChatResource() { return backendChat; }
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
			pluginService,
		));
		let changes = 0;
		store.add(provider.onDidChange(() => changes++));
		const sources = ['owner/repo', 'https://github.com/owner/repo.git', '/plugins/example', '~/plugins/example', 'file:///plugins/example', 'plugin@marketplace'];
		for (const source of sources) {
			await provider.installFromSource(frontendSession, source);
		}
		await assert.rejects(provider.installFromSource(frontendSession, 'invalid'), /SDK rejected source/);
		connectionAuthority = 'remote';
		await assert.rejects(provider.installFromSource(frontendSession, 'owner/repo'), /selected local Agent Host session is unavailable/);

		assert.deepStrictEqual({ calls, changes }, {
			calls: sources.map(source => ({
				provider: 'copilotcli', request: { source }, session: backendSession, chat: backendChat,
			})),
			changes: sources.length,
		});
	});

	test('session-free marketplace additions notify source consumers without resolving a session or chat', async () => {
		const calls: unknown[] = [];
		const provider = store.add(createTestProvider(
			'copilotcli',
			async () => true,
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async addPluginMarketplace(provider: string, session: URI | undefined, source: string, chat?: URI) {
					calls.push([provider, session, source, chat]);
					if (source === 'invalid') {
						throw new Error('SDK rejected source');
					}
					return { name: 'catalog', source, isDefault: false, managed: false, available: true };
				}
			}(),
			new class extends mock<IAgentHostConnectionsService>() { }(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
			pluginService,
		));
		const changes: string[] = [];
		store.add(provider.onDidChangeMarketplaces(() => changes.push('marketplaces')));
		store.add(provider.onDidChange(() => changes.push('customizations')));

		await provider.add(undefined, 'owner/repo#feature/beta');
		await assert.rejects(provider.add(undefined, 'invalid'), /SDK rejected source/);
		assert.deepStrictEqual({ calls, changes }, {
			calls: [
				['copilotcli', undefined, 'owner/repo#feature/beta', undefined],
				['copilotcli', undefined, 'invalid', undefined],
			],
			changes: ['marketplaces', 'customizations'],
		});
	});

	test('routes saved feeds through the owning session and preserves SDK identities and authentication recovery', async () => {
		const requests: { session: string; request: IAgentCustomizationMarketplaceSearchRequest }[] = [];
		const provider = store.add(createTestProvider(
			'copilotcli',
			async () => true,
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async searchCustomizationMarketplace(_provider: string, session: URI, request: IAgentCustomizationMarketplaceSearchRequest) {
					requests.push({ session: session.toString(), request });
					if (request.feedId === 'feed_auth') {
						return { kind: 'unavailable' as const, reason: 'authentication' as const };
					}
					return {
						kind: 'page' as const,
						items: [{
							selectionId: 'selection', identifier: 'feed-resource', kind: 'plugin' as const, displayName: 'Canvas Plugin',
							installable: true, iconUrl: 'https://raw.githubusercontent.com/example/icons/main/canvas.png',
							categories: ['build'], compatibilityTags: ['canvas', 'canvas-only'], installCount: 42,
						}],
					};
				}
			}(),
			new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResourceIdentity() {
					return { connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, backendSession: URI.parse('vendor-session://host/opaque-session') };
				}
			}(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
			pluginService,
		));
		const session = URI.parse('agent-host-copilotcli:/frontend');
		await assert.rejects(provider.getFeed(session, 'feed_auth', CancellationToken.None), /Sign in to Copilot/);
		const page = await provider.getFeed(session, 'feed_editorial', CancellationToken.None);
		const item = page.items[0];
		assert.deepStrictEqual({
			requests,
			item: { identifier: item.identifier, tags: item.tags, compatibilityTags: item.compatibilityTags, installCount: item.installCount, icon: URI.isUri(item.icon) ? item.icon.toString() : undefined, installation: item.installation },
			recovery: provider.getRecoveryAction()?.kind,
		}, {
			requests: ['feed_auth', 'feed_editorial'].map(feedId => ({
				session: 'vendor-session://host/opaque-session',
				request: { query: '', mediaType: undefined, limit: 30, cursor: undefined, feedId },
			})),
			item: {
				identifier: 'feed-resource', tags: ['build'], compatibilityTags: ['canvas', 'canvas-only'], installCount: 42, icon: 'https://raw.githubusercontent.com/example/icons/main/canvas.png',
				installation: { kind: 'providerCatalog', resourceKind: 'plugin', selectionId: 'selection', itemUrl: undefined, installable: true },
			},
			recovery: 'signIn',
		});
	});

	test('routes marketplace management through the Agent Host provider', async () => {
		const calls: { readonly operation: string; readonly args: readonly unknown[] }[] = [];
		const customizationChanges = store.add(new Emitter<void>());
		const frontendSession = URI.parse('agent-host-copilotcli:/frontend-session');
		const backendSession = URI.parse('agent-host-copilotcli:/backend-session');
		const backendChat = URI.parse('vendor-chat://opaque-host/peer-chat');
		const provider = store.add(createTestProvider(
			'copilotcli',
			async () => true,
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async addMcpServerConfiguration(provider: string, name: string, config: IMcpServerConfiguration) {
					calls.push({ operation: 'addMcp', args: [provider, name, config] });
				}
				override async listPluginMarketplaces(provider: string, session: URI, chat?: URI) {
					calls.push({ operation: 'list', args: [provider, session.toString(), chat?.toString()] });
					return [{
						name: 'marketplace',
						source: 'GitHub: owner/repository',
						isDefault: false,
						managed: false,
						available: true,
					}];
				}
				override async addPluginMarketplace(provider: string, session: URI, source: string, chat?: URI) {
					calls.push({ operation: 'add', args: [provider, session.toString(), source, chat?.toString()] });
					return {
						name: 'marketplace',
						source,
						isDefault: false,
						managed: false,
						available: true,
					};
				}
				override async browsePluginMarketplace(provider: string, session: URI, name: string, chat?: URI) {
					calls.push({ operation: 'browse', args: [provider, session.toString(), name, chat?.toString()] });
					return [
						{ name: 'plugin', description: 'Plugin description' },
						{ name: 'plugin-next', description: 'Next plugin' },
					];
				}
				override async removePluginMarketplace(provider: string, session: URI, name: string, force?: boolean, chat?: URI) {
					calls.push({ operation: 'remove', args: [provider, session.toString(), name, force, chat?.toString()] });
					return { removed: force === true, dependentPlugins: force ? undefined : ['plugin'] };
				}
				override async refreshPluginMarketplaces(provider: string, session: URI, name?: string, chat?: URI) {
					calls.push({ operation: 'refresh', args: [provider, session.toString(), name, chat?.toString()] });
					return [{ name: name ?? 'marketplace', success: true }];
				}
			}(),
			new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResourceIdentity() {
					return { connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, backendSession };
				}
			}(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = customizationChanges.event;
				override getBackendChatResource() { return backendChat; }
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
			pluginService,
		));
		let changeCount = 0;
		let marketplaceChangeCount = 0;
		store.add(provider.onDidChange(() => changeCount++));
		store.add(provider.onDidChangeMarketplaces(() => marketplaceChangeCount++));

		const listed = await provider.list(frontendSession);
		const added = await provider.add(frontendSession, 'owner/repository');
		const page = await provider.queryMarketplace(frontendSession, listed[0], { pageSize: 1 }, CancellationToken.None);
		const nextPage = await provider.queryMarketplace(frontendSession, listed[0], { pageSize: 1, cursor: page.nextCursor }, CancellationToken.None);
		const refused = await provider.remove(frontendSession, 'marketplace');
		const removed = await provider.remove(frontendSession, 'marketplace', true);
		const refreshed = await provider.refresh(frontendSession, 'marketplace');
		await provider.addGlobal('demo', { type: McpServerType.REMOTE, url: 'https://example.com/mcp' });
		customizationChanges.fire();

		assert.deepStrictEqual({
			listed,
			added,
			page,
			nextPage,
			refused,
			removed,
			refreshed,
			changeCount,
			marketplaceChangeCount,
			calls,
		}, {
			listed: [{
				name: 'marketplace',
				source: 'GitHub: owner/repository',
				isDefault: false,
				managed: false,
				available: true,
			}],
			added: {
				name: 'marketplace',
				source: 'owner/repository',
				isDefault: false,
				managed: false,
				available: true,
			},
			page: {
				items: [{
					identifier: '["GitHub: owner/repository","marketplace","plugin"]',
					displayName: 'plugin',
					description: 'Plugin description',
					mediaType: 'application/vnd.github.copilot-plugin',
					tags: [],
					capabilities: [],
					representativeQueries: [],
					installation: {
						kind: 'providerPlugin',
						name: 'plugin',
						marketplace: 'marketplace',
						marketplaceSource: 'GitHub: owner/repository',
						providerManaged: true,
					},
				}],
				total: 2,
				nextCursor: '1',
			},
			nextPage: {
				items: [{
					identifier: '["GitHub: owner/repository","marketplace","plugin-next"]',
					displayName: 'plugin-next',
					description: 'Next plugin',
					mediaType: 'application/vnd.github.copilot-plugin',
					tags: [],
					capabilities: [],
					representativeQueries: [],
					installation: {
						kind: 'providerPlugin',
						name: 'plugin-next',
						marketplace: 'marketplace',
						marketplaceSource: 'GitHub: owner/repository',
						providerManaged: true,
					},
				}],
				total: 2,
				nextCursor: undefined,
			},
			refused: { removed: false, dependentPlugins: ['plugin'] },
			removed: { removed: true, dependentPlugins: undefined },
			refreshed: [{ name: 'marketplace', success: true }],
			changeCount: 4,
			marketplaceChangeCount: 3,
			calls: [
				{ operation: 'list', args: ['copilotcli', backendSession.toString(), backendChat.toString()] },
				{ operation: 'add', args: ['copilotcli', backendSession.toString(), 'owner/repository', backendChat.toString()] },
				{ operation: 'browse', args: ['copilotcli', backendSession.toString(), 'marketplace', backendChat.toString()] },
				{ operation: 'browse', args: ['copilotcli', backendSession.toString(), 'marketplace', backendChat.toString()] },
				{ operation: 'remove', args: ['copilotcli', backendSession.toString(), 'marketplace', undefined, backendChat.toString()] },
				{ operation: 'remove', args: ['copilotcli', backendSession.toString(), 'marketplace', true, backendChat.toString()] },
				{ operation: 'refresh', args: ['copilotcli', backendSession.toString(), 'marketplace', backendChat.toString()] },
				{ operation: 'addMcp', args: ['copilotcli', 'demo', { type: McpServerType.REMOTE, url: 'https://example.com/mcp' }] },
			],
		});
	});

	test('uses the host-advertised backend session for SDK inventory', async () => {
		const frontendSession = URI.parse('agent-host-copilotcli:/frontend-session');
		const backendSession = URI.parse('vendor-session://opaque-host/backend-session?version=2');
		const calls: { provider: string; session: string }[] = [];
		const provider = store.add(createTestProvider(
			'copilotcli',
			async () => true,
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async listCustomizationInstallations(provider: string, session: URI) {
					calls.push({ provider, session: session.toString() });
					return [{
						installationId: 'figma-installation',
						kind: 'mcp' as const,
						mediaType: 'application/mcp-server+json',
						catalogue: {
							resourceId: 'urn:air:api.mcp.github.com:com.figma.mcp:mcp',
							displayName: 'Figma MCP Server',
							description: 'Use Figma design context.',
							source: 'agentfinder.github.com',
						},
						serverName: 'com.figma.mcp/mcp',
						state: 'installed' as const,
					}];
				}
			}(),
			new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResourceIdentity(session: URI) {
					assert.strictEqual(session, frontendSession);
					return { connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, backendSession };
				}
			}(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
				override getMcpServers() {
					return [];
				}
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
			pluginService,
		));

		const installations = await provider.getInstallations(frontendSession, CancellationToken.None);

		assert.deepStrictEqual({ calls, installations }, {
			calls: [{ provider: 'copilotcli', session: backendSession.toString() }],
			installations: [{
				installationId: 'figma-installation',
				resource: {
					sourceId: CustomizationMarketplaceSources.AgentFinderPublicFeed.id,
					identifier: 'urn:air:api.mcp.github.com:com.figma.mcp:mcp',
					displayName: 'Figma MCP Server',
					description: 'Use Figma design context.',
					mediaType: 'application/mcp-server+json',
					tags: [],
					capabilities: [],
					representativeQueries: [],
					version: undefined,
					externalUrl: undefined,
					url: undefined,
					publisher: undefined,
					publisherUrl: undefined,
					icon: URI.parse('https://avatars.githubusercontent.com/u/5155369?v=4'),
				},
				state: {
					kind: 'installed',
					target: { kind: 'mcp', id: undefined, name: 'com.figma.mcp/mcp' },
				},
			}],
		});
	});

	test('matches marketplace plugin separators consistently', async () => {
		const frontendSession = URI.parse('agent-host-copilotcli:/frontend-session');
		const backendSession = URI.parse('agent-host-copilotcli:/backend-session');
		const provider = store.add(createTestProvider(
			'copilotcli',
			async () => true,
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async browsePluginMarketplace() {
					return [
						{ name: 'handy-commands', description: 'Useful commands' },
						{ name: 'other-plugin', description: 'Something else' },
					];
				}
			}(),
			new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResourceIdentity() {
					return { connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, backendSession };
				}
			}(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
			pluginService,
		));
		const marketplace = {
			name: 'marketplace',
			source: 'GitHub: owner/repository',
			isDefault: false,
			managed: false,
			available: true,
		};
		const queries = ['handy-commands', 'handy commands', 'handy_commands', 'handy.commands', 'handy/commands'];
		const results = await Promise.all(queries.map(async query => {
			const page = await provider.queryMarketplace(frontendSession, marketplace, { query }, CancellationToken.None);
			return page.items.map(item => item.displayName);
		}));

		assert.deepStrictEqual(results, queries.map(() => ['handy-commands']));
	});

	test('projects SDK catalog searches and featured plugin browse results', async () => {
		const frontendSession = URI.parse('agent-host-copilotcli:/frontend-session');
		const backendSession = URI.parse('ahp-session:/backend-session');
		const calls: { readonly provider: string; readonly session: string; readonly query: string }[] = [];
		const provider = store.add(createTestProvider(
			'copilotcli',
			async () => true,
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async searchCustomizationMarketplace(provider: string, session: URI, request: { readonly query: string }) {
					calls.push({ provider, session: session.toString(), query: request.query });
					return {
						kind: 'page' as const,
						items: request.query ? [
							{
								selectionId: 'selection',
								kind: 'skill' as const,
								identifier: 'https://example.test/demo-skill',
								displayName: 'Demo Skill',
								description: 'Demo',
								publisher: 'octo-org',
								installable: true,
							},
							{
								selectionId: 'playwright',
								kind: 'mcp' as const,
								displayName: 'Playwright',
								description: 'Browser automation',
								itemUrl: 'https://api.mcp.github.com/oss/v0.1/servers/microsoft%2Fplaywright-mcp/versions/latest',
								connectorIds: ['githubcopilotplaywright'],
								installable: true,
							},
						] : [{
							selectionId: 'featured-plugin:awesome-copilot:azure',
							kind: 'plugin' as const,
							displayName: 'Azure',
							description: 'Azure tools',
							publisher: 'microsoft',
							pluginName: 'azure',
							marketplace: 'awesome-copilot',
							marketplaceSource: 'GitHub: github/awesome-copilot',
							installable: true,
						}],
						nextCursor: request.query ? 'next' : undefined,
					};
				}
			}(),
			new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResourceIdentity() {
					return { connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, backendSession };
				}
			}(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
			pluginService,
		));

		const page = await provider.query(frontendSession, { query: 'demo', pageSize: 12 }, CancellationToken.None);
		const browse = await provider.query(frontendSession, {}, CancellationToken.None);

		assert.deepStrictEqual({
			calls,
			browse,
			page: page && {
				...page,
				items: page.items.map(item => ({
					...item,
					publisherUrl: item.publisherUrl?.toString(),
					icon: URI.isUri(item.icon) ? item.icon.toString(true) : item.icon,
				})),
			},
		}, {
			calls: [
				{ provider: 'copilotcli', session: backendSession.toString(), query: 'demo' },
				{ provider: 'copilotcli', session: backendSession.toString(), query: '' },
			],
			browse: {
				items: [{
					identifier: '["GitHub: github/awesome-copilot","awesome-copilot","azure"]',
					displayName: 'Azure',
					description: 'Azure tools',
					mediaType: 'application/vnd.github.copilot-plugin',
					tags: [],
					capabilities: [],
					representativeQueries: [],
					connectorIds: undefined,
					version: undefined,
					repository: undefined,
					publisher: 'microsoft',
					publisherUrl: URI.parse('https://github.com/microsoft'),
					icon: URI.parse('https://github.com/microsoft.png'),
					installation: { kind: 'providerPlugin', name: 'azure', marketplace: 'awesome-copilot', marketplaceSource: 'GitHub: github/awesome-copilot' },
				}],
				nextCursor: undefined,
			},
			page: {
				items: [{
					identifier: 'https://example.test/demo-skill',
					displayName: 'Demo Skill',
					description: 'Demo',
					mediaType: 'application/ai-skill',
					tags: [],
					capabilities: [],
					representativeQueries: [],
					connectorIds: undefined,
					version: undefined,
					repository: undefined,
					publisher: 'octo-org',
					publisherUrl: 'https://github.com/octo-org',
					icon: 'https://github.com/octo-org.png',
					installation: { kind: 'providerCatalog', resourceKind: 'skill', selectionId: 'selection', itemUrl: undefined, installable: true },
				}, {
					identifier: 'https://api.mcp.github.com/oss/v0.1/servers/microsoft%2Fplaywright-mcp/versions/latest',
					displayName: 'Playwright',
					description: 'Browser automation',
					mediaType: 'application/mcp-server+json',
					tags: [],
					capabilities: [],
					representativeQueries: [],
					connectorIds: ['githubcopilotplaywright'],
					version: undefined,
					repository: undefined,
					publisher: undefined,
					publisherUrl: undefined,
					icon: 'https://avatars.githubusercontent.com/u/6154722?v=4',
					installation: {
						kind: 'providerCatalog',
						resourceKind: 'mcp',
						selectionId: 'playwright',
						itemUrl: 'https://api.mcp.github.com/oss/v0.1/servers/microsoft%2Fplaywright-mcp/versions/latest',
						installable: true,
					},
				}],
				nextCursor: 'next',
			},
		});
	});

	test('offers explicit sign-in before retrying SDK catalog search', async () => {
		let authenticationRequests = 0;
		let searchRequests = 0;
		const provider = store.add(createTestProvider(
			'copilotcli',
			async () => {
				authenticationRequests++;
				return true;
			},
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async searchCustomizationMarketplace() {
					searchRequests++;
					return searchRequests === 1
						? { kind: 'unavailable' as const, reason: 'authentication' as const }
						: {
							kind: 'page' as const,
							items: [{
								selectionId: 'figma',
								kind: 'mcp' as const,
								displayName: 'Figma MCP Server',
								installable: true,
							}],
						};
				}
			}(),
			new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResourceIdentity() {
					return {
						connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY,
						backendSession: URI.parse('ahp-session:/backend-session'),
					};
				}
			}(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
			pluginService,
		));

		await assert.rejects(
			provider.query(URI.parse('agent-host-copilotcli:/frontend-session'), { query: 'figma' }, CancellationToken.None),
			/Sign in to Copilot/,
		);
		const recovery = provider.getRecoveryAction();
		const beforeSignIn = { authenticationRequests, searchRequests, recovery: recovery && { label: recovery.label, kind: recovery.kind, groupId: recovery.groupId } };
		await recovery?.run(CancellationToken.None);
		const page = await provider.query(URI.parse('agent-host-copilotcli:/frontend-session'), { query: 'figma' }, CancellationToken.None);

		assert.deepStrictEqual({
			beforeSignIn,
			authenticationRequests,
			searchRequests,
			items: page?.items.map(item => item.displayName),
		}, {
			beforeSignIn: {
				authenticationRequests: 0,
				searchRequests: 1,
				recovery: { label: 'Sign In', kind: 'signIn', groupId: CustomizationMarketplaceRecoveryGroup.GitHubDefaultAccount },
			},
			authenticationRequests: 1,
			searchRequests: 2,
			items: ['Figma MCP Server'],
		});
	});

	test('surfaces an unavailable SDK catalog as a source error', async () => {
		const provider = store.add(createTestProvider(
			'copilotcli',
			async () => { throw new Error('Unexpected authentication'); },
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async searchCustomizationMarketplace() {
					return { kind: 'unavailable' as const, reason: 'unsupported' as const };
				}
			}(),
			new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResourceIdentity() {
					return {
						connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY,
						backendSession: URI.parse('ahp-session:/backend-session'),
					};
				}
			}(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
			pluginService,
		));

		await assert.rejects(
			provider.query(URI.parse('agent-host-copilotcli:/frontend-session'), { query: 'figma' }, CancellationToken.None),
			/does not support GitHub Feed search/,
		);
	});

	test('installs the retained SDK catalog selection without searching again', async () => {
		const session = URI.parse('agent-host-copilotcli:/frontend-session');
		const requests: unknown[] = [];
		const applied: string[] = [];
		let authenticationRequests = 0;
		let installed = false;
		const provider = store.add(createTestProvider(
			'copilotcli',
			async () => {
				authenticationRequests++;
				return true;
			},
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async listCustomizationInstallations(): Promise<readonly IAgentCustomizationInstallation[]> {
					return installed ? [{
						installationId: 'installation',
						kind: 'skill',
						mediaType: 'application/ai-skill',
						catalogue: {
							resourceId: 'urn:air:github.test:skill:demo',
							displayName: 'Demo Skill',
							publisher: 'octo-org',
							source: 'agentfinder.github.com',
						},
						name: 'demo',
						state: 'installed',
					}] : [];
				}
				override async prepareCustomizationInstallation(_provider: string, _session: URI, request: unknown) {
					requests.push(request);
					return ownedReview({
						operationId: 'operation',
						action: 'install' as const,
						kind: 'skill' as const,
						displayName: 'Demo Skill',
						source: 'owner/repo@revision/skills/demo',
						target: 'skills/demo',
						fileCount: 1,
						totalBytes: 10,
					});
				}
				override async applyCustomizationInstallation(_provider: string, { operationId }: { readonly operationId: string }) {
					applied.push(operationId);
					installed = true;
					return { kind: 'receipt' as const, installationId: 'installation' };
				}
			}(),
			new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResourceIdentity() {
					return { connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, backendSession: URI.parse('ahp-session:/backend-session') };
				}
			}(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
			}(),
			new class extends mock<IDialogService>() {
				override async confirm() { return { confirmed: true }; }
			}(),
			new NullLogService(),
			pluginService,
		));

		const resource = {
			sourceId: 'agentFinder',
			identifier: 'selection',
			displayName: 'Demo Skill',
			description: 'Demo',
			mediaType: 'application/ai-skill',
			tags: [],
			capabilities: [],
			representativeQueries: [],
			installation: { kind: 'providerCatalog', resourceKind: 'skill', selectionId: 'selection' },
		} as const;
		await provider.getInstallations(session, CancellationToken.None);
		await provider.install(session, resource, CancellationToken.None);
		const inventory = await provider.getInstallations(session, CancellationToken.None);

		assert.deepStrictEqual({
			authenticationRequests,
			requests,
			applied,
			inventory: inventory.map(item => ({
				installationId: item.installationId,
				identifier: item.resource.identifier,
				installation: item.resource.installation,
			})),
		}, {
			authenticationRequests: 1,
			requests: [{
				mediaType: 'application/ai-skill',
				identifier: 'selection',
				displayName: 'Demo Skill',
				description: 'Demo',
				version: undefined,
				itemUrl: undefined,
				selectionId: 'selection',
				installation: { kind: 'skill' },
			}],
			applied: ['operation'],
			inventory: [{
				installationId: 'installation',
				identifier: 'selection',
				installation: { kind: 'providerCatalog', resourceKind: 'skill', selectionId: 'selection' },
			}],
		});
	});

	test('routes a retained catalog plugin through verified SDK review and apply', async () => {
		const session = URI.parse('agent-host-copilotcli:/frontend-session');
		const requests: unknown[] = [];
		const applied: string[] = [];
		const confirmations: { message: string; detail?: string; primaryButton?: string }[] = [];
		const activations: boolean[] = [];
		const directSourceId = '5d5cce3c6590ade92bceb09d245a45035e2141d4c2e0882eac887c596b35fb5f';
		const installedPlugin = new class extends mock<IAgentPlugin>() {
			override readonly uri = URI.file('/plugins/demo');
			override readonly label = 'demo-plugin';
			override readonly copilotCliInstallation = {
				name: 'demo-plugin', marketplace: '', directSourceId,
			};
			override async setEnabled(enabled: boolean) { activations.push(enabled); }
		}();
		pluginService.enablementModel.setEnabled(installedPlugin.uri.toString(), ContributionEnablementState.DisabledProfile);
		let plugins: readonly IAgentPluginInstallation[] = [];
		const provider = store.add(createTestProvider(
			'copilotcli',
			async () => true,
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async prepareCustomizationInstallation(_provider: string, _session: URI, request: unknown) {
					requests.push(request);
					return ownedReview({
						operationId: 'plugin-operation',
						action: 'install' as const,
						kind: 'plugin' as const,
						displayName: 'Demo Plugin',
						description: 'A demo plugin',
						version: '1.2.3',
						source: 'github/demo-plugin@0123456789abcdef',
						target: '~/.copilot/installed-plugins/_direct/github--demo-plugin',
						fileCount: 2,
						totalBytes: 256,
						installsDisabled: true,
						mcpServerCount: 1,
					});
				}
				override async applyCustomizationInstallation(_provider: string, { operationId }: { readonly operationId: string }) {
					applied.push(operationId);
					discoveredPlugins.set([installedPlugin], undefined);
					return {
						kind: 'plugin' as const,
						name: 'demo-plugin',
						repository: 'github/demo-plugin',
						ref: '0123456789abcdef',
						path: 'plugins/demo',
					};
				}
				override async listPluginInstallations() { return plugins; }
			}(),
			new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResourceIdentity() {
					return { connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, backendSession: URI.parse('ahp-session:/backend-session') };
				}
			}(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
			}(),
			new class extends mock<IDialogService>() {
				override async confirm(confirmation: Parameters<IDialogService['confirm']>[0]) {
					confirmations.push({ message: confirmation.message, detail: typeof confirmation.detail === 'string' ? confirmation.detail : confirmation.detail?.value, primaryButton: confirmation.primaryButton });
					return { confirmed: true };
				}
			}(),
			new NullLogService(),
			pluginService,
		));

		const resource = {
			sourceId: 'agentFinder',
			identifier: 'demo-plugin',
			displayName: 'Demo Plugin',
			description: 'A demo plugin',
			version: '1.2.3',
			mediaType: 'application/vnd.github.copilot-plugin',
			tags: [],
			capabilities: [],
			representativeQueries: [],
			installation: { kind: 'providerCatalog', resourceKind: 'plugin', selectionId: 'plugin-selection', catalogIdentity: 'github/demo-plugin' },
		} as const;
		await provider.getInstallations(session, CancellationToken.None);
		await provider.install(session, resource, CancellationToken.None);
		plugins = [{
			name: 'unrelated-plugin',
			marketplace: '',
			directSourceId: 'unrelated-plugin-source',
			verifiedSource: { repository: 'github/unrelated-plugin', revision: 'fedcba9876543210' },
		}, {
			name: 'demo-plugin',
			marketplace: '',
			directSourceId,
			verifiedSource: { repository: 'github/demo-plugin', revision: '0123456789abcdef' },
		}];
		const uniquePlugins = plugins;
		plugins = [...plugins, { ...plugins[1], directSourceId: 'different-root-source' }];
		const ambiguousInventory = await provider.getInstallations(session, CancellationToken.None);
		assert.deepStrictEqual(ambiguousInventory.map(item => item.resource.identifier), ['unrelated-plugin-source', 'demo-plugin', 'different-root-source']);
		plugins = uniquePlugins;
		const inventory = await provider.getInstallations(session, CancellationToken.None);

		assert.deepStrictEqual({
			requests,
			applied,
			activations,
			enablement: pluginService.enablementModel.readEnabled(installedPlugin.uri.toString()),
			confirmations,
			inventory: inventory.map(item => ({
				installationId: item.installationId,
				identifier: item.resource.identifier,
				installation: item.resource.installation,
				target: item.state.target,
			})),
		}, {
			requests: [{
				mediaType: 'application/vnd.github.copilot-plugin',
				identifier: 'demo-plugin',
				displayName: 'Demo Plugin',
				description: 'A demo plugin',
				version: '1.2.3',
				itemUrl: undefined,
				selectionId: 'plugin-selection',
				catalogIdentity: 'github/demo-plugin',
				installation: { kind: 'plugin' },
			}],
			applied: ['plugin-operation'],
			activations: [true],
			enablement: ContributionEnablementState.DisabledProfile,
			confirmations: [{
				message: 'Install and enable \'Demo Plugin\'?',
				primaryButton: 'Install and Enable',
				detail: 'Plugins can supply agents, skills, hooks, and MCP servers. Only install resources from sources you trust.\n\nSource: github/demo-plugin@0123456789abcdef\nDestination: ~/.copilot/installed-plugins/_direct/github--demo-plugin\nFiles: 2\nSize: 256 bytes\n\nThe plugin will be enabled for your profile after installation, and running chats will reload its contributions.\nDeclared MCP servers: 1',
			}],
			inventory: [{
				installationId: '["plugin","direct","unrelated-plugin-source"]',
				identifier: 'unrelated-plugin-source',
				installation: undefined,
				target: { kind: 'plugin', name: 'unrelated-plugin' },
			}, {
				installationId: JSON.stringify(['plugin', 'direct', directSourceId]),
				identifier: 'demo-plugin',
				installation: { kind: 'providerCatalog', resourceKind: 'plugin', selectionId: 'plugin-selection', catalogIdentity: 'github/demo-plugin' },
				target: { kind: 'plugin', name: 'demo-plugin', uri: installedPlugin.uri },
			}],
		});
	});

	for (const scenario of ['enabled', 'delayed discovery', 'not discovered', 'cancelled', 'cancelled during apply', 'cancelled during discovery', 'install refused', 'enable refused', 'reload failed', 'managed', 'ambiguous'] as const) {
		test(`catalog activation: ${scenario}`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const cancellation = store.add(new CancellationTokenSource());
			const calls: string[] = [];
			const uri = URI.file('/plugins/direct');
			const plugin = new class extends mock<IAgentPlugin>() {
				override readonly uri = uri;
				override readonly label = 'canvas';
				override readonly policyEnablement = observableValue<boolean | undefined>('policy', scenario === 'managed' ? false : undefined);
				override readonly copilotCliInstallation = {
					name: 'canvas', marketplace: '', directSourceId: 'exact-source',
					source: { kind: 'github' as const, repository: 'owner/repo', sha: 'revision', path: 'plugins/canvas' },
				};
				override async setEnabled(enabled: boolean) {
					calls.push(`enable:${enabled}`);
					if (scenario === 'enable refused') {
						throw new Error('runtime policy refused');
					}
					calls.push('reload');
					if (scenario === 'reload failed') {
						throw new Error('reload failed');
					}
				}
			}();
			const wrongRoot = {
				...plugin,
				uri: URI.file('/plugins/other'),
				copilotCliInstallation: {
					...plugin.copilotCliInstallation,
					directSourceId: 'other-source',
					source: { ...plugin.copilotCliInstallation.source, path: 'plugins/other' },
				},
			};
			pluginService.enablementModel.setEnabled(uri.toString(), ContributionEnablementState.DisabledProfile);
			const provider = store.add(createTestProvider(
				'copilotcli', async () => true,
				new class extends mock<IAgentHostService>() {
					override readonly onAgentHostStart = Event.None;
					override readonly onAgentHostExit = Event.None;
					override async prepareCustomizationInstallation() {
						return ownedReview({
							operationId: 'operation', action: 'install' as const, kind: 'plugin' as const, displayName: 'canvas',
							source: 'owner/repo@revision', target: 'target', fileCount: 1, totalBytes: 1, installsDisabled: true, mcpServerCount: 0,
						});
					}
					override async applyCustomizationInstallation() {
						calls.push('install');
						if (scenario === 'install refused') {
							throw new Error('install refused');
						}
						if (scenario === 'delayed discovery') {
							store.add(disposableTimeout(() => discoveredPlugins.set([wrongRoot, plugin], undefined), 1));
						} else if (scenario === 'cancelled during discovery') {
							store.add(disposableTimeout(() => {
								cancellation.cancel();
								discoveredPlugins.set([wrongRoot, plugin], undefined);
							}, 1));
						} else {
							discoveredPlugins.set(scenario === 'not discovered' ? [wrongRoot] : scenario === 'ambiguous' ? [plugin, { ...plugin, uri: URI.file('/plugins/duplicate') }] : [wrongRoot, plugin], undefined);
						}
						if (scenario === 'cancelled during apply') {
							cancellation.cancel();
						}
						return { kind: 'plugin' as const, name: 'canvas', repository: 'owner/repo', ref: 'revision', path: 'plugins/canvas' };
					}
				}(),
				new class extends mock<IAgentHostConnectionsService>() {
					override resolveSessionResourceIdentity() { return undefined; }
				}(),
				new class extends mock<IAgentHostCustomizationService>() {
					override readonly onDidChangeCustomizations = Event.None;
				}(),
				new class extends mock<IDialogService>() {
					override async confirm() { return { confirmed: scenario !== 'cancelled' }; }
				}(),
				new NullLogService(),
				pluginService,
			));
			let changes = 0;
			store.add(provider.onDidChange(() => changes++));
			const install = provider.install(URI.parse('ahp-session:/test'), {
				sourceId: 'agentFinder', identifier: 'canvas', displayName: 'canvas', description: '',
				mediaType: 'application/vnd.github.copilot-plugin', tags: [], capabilities: [], representativeQueries: [],
				installation: { kind: 'providerCatalog', resourceKind: 'plugin', selectionId: 'selection' },
			}, cancellation.token);
			const succeeds = scenario === 'enabled' || scenario === 'delayed discovery';
			if (succeeds) {
				await install;
			} else {
				await assert.rejects(install, scenario.startsWith('cancelled') ? /Canceled/ : scenario === 'install refused' ? /install refused/ : scenario === 'not discovered' ? /was installed, but activation failed: The installed plugin was not discovered in time/ : /was installed, but activation failed/);
			}
			const applied = scenario !== 'cancelled' && scenario !== 'install refused';
			assert.deepStrictEqual({
				calls,
				changes,
				state: pluginService.enablementModel.readEnabled(uri.toString()),
			}, {
				calls: scenario === 'cancelled' ? [] : succeeds || scenario === 'reload failed' ? ['install', 'enable:true', 'reload'] : scenario === 'enable refused' ? ['install', 'enable:true'] : ['install'],
				changes: applied ? 2 : scenario === 'install refused' ? 1 : 0,
				state: ContributionEnablementState.DisabledProfile,
			});
		}));
	}

	test('routes MCP Gallery installation through the Agent Host SDK card flow', async () => {
		const session = URI.parse('agent-host-copilotcli:/frontend-session');
		const calls: string[] = [];
		const requests: unknown[] = [];
		const details: string[] = [];
		const provider = store.add(createTestProvider(
			'copilotcli',
			async () => {
				calls.push('authenticate');
				return true;
			},
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async prepareCustomizationInstallation(_provider: string, _session: URI, request: unknown) {
					calls.push('prepare');
					requests.push(request);
					return ownedReview({
						operationId: 'operation',
						action: 'install' as const,
						kind: 'mcp' as const,
						displayName: 'Demo MCP',
						serverName: 'owner/demo',
						target: 'owner/demo',
						command: 'uvx',
						args: ['markitdown-mcp'],
						env: { MODE: 'stdio' },
						configurationFields: [],
					});
				}
				override async applyCustomizationInstallation() {
					calls.push('apply');
					return { kind: 'receipt' as const, installationId: 'installation' };
				}
			}(),
			new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResourceIdentity() {
					return { connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, backendSession: URI.parse('ahp-session:/backend-session') };
				}
			}(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
			}(),
			new class extends mock<IDialogService>() {
				override readonly confirm: IDialogService['confirm'] = async confirmation => {
					details.push(typeof confirmation.detail === 'string' ? confirmation.detail : confirmation.detail?.value ?? '');
					return { confirmed: true };
				};
			}(),
			new NullLogService(),
			pluginService,
		));

		await provider.install(session, {
			sourceId: 'mcpGallery',
			identifier: 'default:io.example/demo',
			displayName: 'Demo MCP',
			description: 'Demo',
			mediaType: 'application/mcp-server+json',
			tags: [],
			capabilities: [],
			representativeQueries: [],
			version: '1.0.0',
			installation: {
				kind: 'mcpGallery',
				name: 'io.example/demo',
				registry: 'default',
				registryUrl: 'https://api.mcp.github.com',
				cardUrl: 'https://api.mcp.github.com/v0.1/servers/io.example%2Fdemo/versions/latest',
			},
		}, CancellationToken.None);

		assert.deepStrictEqual({ calls, requests, localReviewVisible: details.some(detail => detail.includes('Command: uvx') && detail.includes('Arguments: ["markitdown-mcp"]') && detail.includes('Environment: {"MODE":"stdio"}')) }, {
			calls: ['authenticate', 'prepare', 'apply'],
			localReviewVisible: true,
			requests: [{
				mediaType: 'application/mcp-server+json',
				identifier: 'default:io.example/demo',
				displayName: 'Demo MCP',
				description: 'Demo',
				version: '1.0.0',
				itemUrl: 'https://api.mcp.github.com/v0.1/servers/io.example%2Fdemo/versions/latest',
				installation: {
					kind: 'mcp',
					source: {
						kind: 'url',
						mediaType: 'application/mcp-server+json',
						url: 'https://api.mcp.github.com/v0.1/servers/io.example%2Fdemo/versions/latest',
					},
				},
			}],
		});
	});

	test('uses the durable MCP server identity when a receipt has no catalogue metadata', async () => {
		const session = URI.parse('agent-host-copilotcli:/frontend-session');
		const provider = store.add(createTestProvider(
			'copilotcli',
			async () => true,
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async listCustomizationInstallations(): Promise<readonly IAgentCustomizationInstallation[]> {
					return [{
						installationId: 'installation',
						kind: 'mcp',
						mediaType: 'application/mcp-server+json',
						serverName: 'io.example/demo',
						state: 'installed',
					}];
				}
			}(),
			new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResourceIdentity() {
					return { connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, backendSession: URI.parse('ahp-session:/backend-session') };
				}
			}(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
				override getMcpServers() { return []; }
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
			pluginService,
		));

		const installations = await provider.getInstallations(session, CancellationToken.None);

		assert.deepStrictEqual(installations.map(installation => ({
			identifier: installation.resource.identifier,
			displayName: installation.resource.displayName,
			target: installation.state.target,
		})), [{
			identifier: 'io.example/demo',
			displayName: 'io.example/demo',
			target: { kind: 'mcp', id: undefined, name: 'io.example/demo' },
		}]);
	});

	test('installs a featured SDK marketplace plugin without local marketplace identity', async () => {
		const session = URI.parse('agent-host-copilotcli:/frontend-session');
		const calls: unknown[] = [];
		const provider = store.add(createTestProvider(
			'copilotcli',
			async () => true,
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async installPlugin(provider: string, request: { readonly source: string }, session?: URI, chat?: URI): Promise<void> {
					calls.push({ provider, request, session: session?.toString(), chat: chat?.toString() });
				}
			}(),
			new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResourceIdentity() {
					return { connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, backendSession: session };
				}
			}(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
				override getBackendChatResource() { return session; }
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
			pluginService,
		));
		const resource = {
			sourceId: 'agentFinder',
			identifier: '["GitHub: github/awesome-copilot","awesome-copilot","azure"]',
			displayName: 'Azure',
			description: 'Azure tools',
			mediaType: 'application/vnd.github.copilot-plugin',
			tags: [],
			capabilities: [],
			representativeQueries: [],
			installation: { kind: 'providerPlugin' as const, name: 'azure', marketplace: 'awesome-copilot', marketplaceSource: 'GitHub: github/awesome-copilot' },
		};

		assert.strictEqual(provider.getInstallUnavailableMessage(resource), undefined);
		await provider.install(session, resource, CancellationToken.None);

		assert.deepStrictEqual(calls, [{
			provider: 'copilotcli',
			request: { source: 'azure@awesome-copilot' },
			session: session.toString(),
			chat: session.toString(),
		}]);
	});

	test('completes plugin mutations through SDK records without waiting for client discovery', async () => {
		let plugins: readonly IAgentPluginInstallation[] = [];
		const calls: unknown[] = [];
		const provider = store.add(createTestProvider(
			'copilotcli',
			async () => true,
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async installPlugin(): Promise<void> {
					plugins = [{ name: 'azure', marketplace: 'awesome-copilot' }];
				}
				override async listPluginInstallations() { return plugins; }
				override async uninstallPlugin(provider: string, request: IAgentPluginInstallation, session?: URI, chat?: URI): Promise<void> {
					calls.push({ provider, request, session, chat });
					plugins = [];
				}
			}(),
			new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResourceIdentity(session: URI) {
					return { connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, backendSession: session };
				}
			}(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
			pluginService,
		));
		const resource = {
			sourceId: 'agentFinder',
			identifier: '["GitHub: github/awesome-copilot","awesome-copilot","azure"]',
			displayName: 'Azure',
			description: 'Azure tools',
			mediaType: 'application/vnd.github.copilot-plugin',
			tags: [],
			capabilities: [],
			representativeQueries: [],
			installation: { kind: 'providerPlugin' as const, name: 'azure', marketplace: 'awesome-copilot', marketplaceSource: 'GitHub: github/awesome-copilot' },
		};
		const session = URI.parse('agent-host-copilotcli:/frontend-session');
		await provider.install(session, resource, CancellationToken.None);
		const installations = await provider.getInstallations(session, CancellationToken.None);
		await provider.uninstall(session, installations[0], CancellationToken.None);
		assert.deepStrictEqual({ calls, remaining: await provider.getInstallations(session, CancellationToken.None) }, {
			calls: [{ provider: 'copilotcli', request: { name: 'azure', marketplace: 'awesome-copilot', directSourceId: undefined }, session, chat: undefined }],
			remaining: [],
		});
	});

	test('preserves SDK plugin inventory when session-bound receipt inventory is unavailable', async () => {
		const session = URI.parse('agent-host-copilotcli:/frontend-session');
		const provider = store.add(createTestProvider(
			'copilotcli',
			async () => true,
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async listCustomizationInstallations(): Promise<readonly IAgentCustomizationInstallation[]> { throw new Error('Policy session unavailable'); }
				override async listPluginInstallations() { return [{ name: 'spark', marketplace: 'copilot-plugins' }]; }
			}(),
			new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResourceIdentity() {
					return { connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, backendSession: URI.parse('ahp-session:/backend-session') };
				}
			}(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
			pluginService,
		));

		const installations = await provider.getInstallations(session, CancellationToken.None);

		assert.deepStrictEqual(installations.map(installation => ({
			installationId: installation.installationId,
			installation: installation.resource.installation,
			state: installation.state.kind,
		})), [{
			installationId: '["plugin","copilot-plugins","spark"]',
			installation: { kind: 'configuredPlugin', name: 'spark', marketplace: 'copilot-plugins' },
			state: 'installed',
		}]);
	});

	test('uses SDK direct-source IDs for same-name uninstall and refreshes through the selected backend', async () => {
		const frontend = URI.parse('agent-host-copilotcli:/frontend');
		const backend = URI.parse('vendor-session://host/opaque');
		const chat = URI.parse('vendor-chat://host/opaque-peer');
		const first = { name: 'same-name', marketplace: '', directSourceId: 'first-source' };
		const second = { name: 'same-name', marketplace: '', directSourceId: 'second-source' };
		let plugins: readonly IAgentPluginInstallation[] = [first, second];
		let failInventory = false;
		const calls: unknown[] = [];
		let changes = 0;
		const provider = store.add(createTestProvider(
			'copilotcli',
			async () => true,
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async listPluginInstallations(provider: string, session?: URI, operationChat?: URI) {
					calls.push(['list', provider, session, operationChat]);
					if (failInventory) {
						throw new Error('SDK inventory unavailable');
					}
					return plugins;
				}
				override async uninstallPlugin(provider: string, request: IAgentPluginInstallation, session?: URI, operationChat?: URI) {
					calls.push(['uninstall', provider, request, session, operationChat]);
					plugins = [first];
				}
			}(),
			new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResourceIdentity() {
					return { connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, backendSession: backend };
				}
			}(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
				override getBackendChatResource() { return chat; }
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
			pluginService,
		));
		store.add(provider.onDidChange(() => changes++));
		const installations = await provider.getInstallations(frontend, CancellationToken.None);
		const renamedSecond = { ...second, name: 'resolved-manifest-name' };
		plugins = [first, renamedSecond];
		await provider.uninstall(frontend, installations[1], CancellationToken.None);
		const remaining = await provider.getInstallations(frontend, CancellationToken.None);
		assert.deepStrictEqual({ calls, changes, identities: installations.map(item => item.installationId), remaining: remaining.map(item => item.resource.identifier) }, {
			calls: [
				['list', 'copilotcli', backend, chat],
				['list', 'copilotcli', backend, chat],
				['uninstall', 'copilotcli', renamedSecond, backend, chat],
				['list', 'copilotcli', backend, chat],
			],
			changes: 1,
			identities: ['["plugin","direct","first-source"]', '["plugin","direct","second-source"]'],
			remaining: ['first-source'],
		});

		await assert.rejects(provider.uninstall(frontend, installations[1], CancellationToken.None), /installation identity is unavailable/);
		for (const invalidInventory of [
			[{ name: 'same-name', marketplace: '' }],
			[{ name: 'same-name', marketplace: '', directSourceId: '' }],
			[first, first],
			[{ name: 'same-name', marketplace: 'duplicate' }, { name: 'same-name', marketplace: 'duplicate' }],
			[
				{ name: 'same-name', marketplace: '', verifiedSource: { repository: 'owner/first', revision: 'abc' } },
				{ name: 'same-name', marketplace: '', verifiedSource: { repository: 'owner/second', revision: 'def' } },
			],
		]) {
			plugins = invalidInventory;
			const invalidInstallations = await provider.getInstallations(frontend, CancellationToken.None);
			assert.ok(invalidInstallations[0].state.kind === 'installed' && invalidInstallations[0].state.uninstallUnavailableMessage);
			await assert.rejects(provider.uninstall(frontend, invalidInstallations[0], CancellationToken.None), /unique plugin installation identity/);
		}
		assert.strictEqual(calls.filter(call => Array.isArray(call) && call[0] === 'uninstall').length, 1);
		failInventory = true;
		await assert.rejects(provider.getInstallations(frontend, CancellationToken.None), /SDK inventory unavailable/);
		await assert.rejects(provider.uninstall(frontend, installations[0], CancellationToken.None), /SDK inventory unavailable/);
	});

	test('reconstructs direct plugin source and target after restart and delayed discovery without inventing installations', async () => {
		const session = URI.parse('agent-host-copilotcli:/frontend');
		const direct = { name: 'temporary-name', marketplace: '', directSourceId: 'direct-source', version: '1.0.0' };
		const marketplace = { name: 'token-pacman', marketplace: 'awesome-copilot', version: '1.0.0' };
		let inventory: readonly IAgentPluginInstallation[] = [direct, marketplace];
		const hostService = new class extends mock<IAgentHostService>() {
			override readonly onAgentHostStart = Event.None;
			override readonly onAgentHostExit = Event.None;
			override async listPluginInstallations() { return inventory; }
		}();
		const createProvider = () => store.add(createTestProvider(
			'copilotcli', async () => true, hostService,
			new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResourceIdentity() { return undefined; }
			}(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(), pluginService,
		));
		const provider = createProvider();
		const before = await provider.getInstallations(session, CancellationToken.None);
		const plugin = new class extends mock<IAgentPlugin>() {
			override readonly uri = URI.file('/plugins/_direct/cache-id');
			override readonly label = 'token-pacman';
			override readonly copilotCliInstallation = {
				name: 'token-pacman', marketplace: '', directSourceId: 'direct-source',
				source: { kind: 'github' as const, repository: 'github/awesome-copilot', sha: 'abc123', path: 'plugins/token-pacman' },
			};
		}();
		let changes = 0;
		store.add(provider.onDidChange(() => changes++));
		discoveredPlugins.set([plugin], undefined);
		const after = await provider.getInstallations(session, CancellationToken.None);
		provider.dispose();
		const restartedProvider = createProvider();
		const restarted = await restartedProvider.getInstallations(session, CancellationToken.None);
		inventory = [];
		const removed = await restartedProvider.getInstallations(session, CancellationToken.None);

		assert.deepStrictEqual({
			changes,
			stableId: before[0].installationId === after[0].installationId,
			resource: { name: after[0].resource.displayName, installation: after[0].resource.installation },
			target: after[0].state.target,
			marketplace: after[1].resource.installation,
			restarted,
			removed,
		}, {
			changes: 1,
			stableId: true,
			resource: { name: 'token-pacman', installation: { kind: 'plugin', repository: 'github/awesome-copilot', ref: 'abc123', path: 'plugins/token-pacman' } },
			target: { kind: 'plugin', name: 'token-pacman', uri: plugin.uri },
			marketplace: { kind: 'configuredPlugin', name: 'token-pacman', marketplace: 'awesome-copilot' },
			restarted: after,
			removed: [],
		});
	});

	test('accepts only valid HTTPS SDK plugin icons without credentials', async () => {
		const iconUrls = [
			'https://raw.githubusercontent.com/owner/repo/main/icon.png',
			'http://example.test/icon.png',
			'file:///tmp/icon.png',
			'command:example',
			'data:image/png;base64,AAAA',
			'not a URL',
			'https://',
			'https://user:password@example.test/icon.png',
			'',
			undefined,
		];
		const warnings: string[] = [];
		const provider = store.add(createTestProvider(
			'copilotcli',
			async () => true,
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async listPluginInstallations() {
					return iconUrls.map((iconUrl, index) => ({ name: `plugin-${index}`, marketplace: 'marketplace', iconUrl }));
				}
			}(),
			new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResourceIdentity() { return undefined; }
			}(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
			}(),
			new class extends mock<IDialogService>() { }(),
			new class extends NullLogService {
				override warn(message: string) { warnings.push(message); }
			}(),
			pluginService,
		));
		const inventory = await provider.getInstallations(URI.parse('vendor-session:/opaque'), CancellationToken.None);
		assert.deepStrictEqual({
			icons: inventory.map(item => URI.isUri(item.resource.icon) ? item.resource.icon.toString() : undefined),
			warnings,
		}, {
			icons: [iconUrls[0], ...Array(9).fill(undefined)],
			warnings: Array(8).fill('[AgentHostCustomizationMarketplace] Ignoring an invalid SDK plugin icon URL'),
		});
	});

	test('does not read local SDK inventory for a remote host session', async () => {
		let localReads = 0;
		const provider = store.add(createTestProvider(
			'copilotcli',
			async () => true,
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async listPluginInstallations() {
					localReads++;
					return [{ name: 'local-only', marketplace: 'marketplace' }];
				}
			}(),
			new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResourceIdentity() {
					return { connectionAuthority: 'remote-host', backendSession: URI.parse('vendor-session://remote/opaque') };
				}
			}(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
			pluginService,
		));
		await assert.rejects(provider.getInstallations(URI.parse('vendor-session://remote/frontend'), CancellationToken.None), /selected local Agent Host session is unavailable/);
		assert.strictEqual(localReads, 0);
	});
	suite('configured MCP installation', () => {
		const sentinels = { region: 'SENTINEL-REGION-a1', tenant: 'SENTINEL-TENANT-b2', secret: 'SENTINEL-SECRET-c3' };
		const backendSession = URI.parse('copilotcli:/backend-session');
		const configuration: IAgentCustomizationInstallationConfigurationRequest = {
			kind: 'configuration', operationId: 'preparation', hostGeneration: 'generation', ownershipToken: 'token', displayName: 'Configured MCP', serverName: 'owner/configured',
			target: 'owner/configured', recommendedChoiceId: 'remote:1',
			choices: [
				{ choiceId: 'remote:0', transport: 'sse', endpointSummary: 'https://example.test/sse', configurationFields: ['url'], values: [], secrets: [] },
				{
					choiceId: 'remote:1', transport: 'streamable-http', endpointSummary: 'https://example.test/eu/mcp', configurationFields: ['headers', 'url'],
					values: [
						{ key: 'X-Region', category: 'header', valueType: 'enum', required: true, isRepeated: false, enumValues: ['eu', sentinels.region] },
						{ key: 'TENANT', category: 'url-variable', valueType: 'string', required: false, isRepeated: false, defaultValue: 'common' },
						{ key: 'LIMIT', category: 'url-variable', valueType: 'number', required: false, isRepeated: false, defaultValue: '10' },
					],
					secrets: [{ key: 'API_KEY', placeholder: '${secret:a}', title: 'API key' }],
				},
			],
		};
		const resource = {
			sourceId: 'agentFinder', identifier: 'selection', displayName: 'Configured MCP', description: '', mediaType: 'application/mcp-server+json',
			tags: [], capabilities: [], representativeQueries: [],
			installation: { kind: 'providerCatalog', resourceKind: 'mcp', selectionId: 'selection' },
		} as const;

		/** One quick input step as the user saw it. */
		interface IShownStep {
			readonly step: string | undefined;
			readonly back: boolean;
			readonly description: string | undefined;
			readonly prompt: string | undefined;
			readonly placeholder: string | undefined;
			/** The pre-filled text, or the label of the preselected item. */
			readonly value: string | undefined;
		}

		function createFlow(options: { readonly trusted?: boolean; readonly grantTrust?: boolean; readonly confirm?: boolean; readonly cancelAt?: string; readonly backAt?: readonly number[]; readonly configuration?: IAgentCustomizationInstallationConfigurationRequest; readonly entries?: string[] } = {}) {
			const calls: unknown[] = [];
			const details: string[] = [];
			const validation: (string | undefined)[] = [];
			const secretValidation: (string | undefined)[] = [];
			const shown: IShownStep[] = [];
			const host = new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async prepareCustomizationInstallation(_provider: string, session: URI) {
					calls.push(['prepare', session.toString()]);
					return options.configuration ?? configuration;
				}
				override async applyCustomizationInstallation(_provider: string, request: IAgentCustomizationInstallationApplyRequest) {
					calls.push(['apply', request]);
					return { kind: 'receipt' as const, installationId: 'installation' };
				}
			}();
			const backButton: IQuickInputButton = { tooltip: 'Back' };
			/** Records a step; returns whether the user goes back from it. */
			const show = (step: IShownStep) => {
				shown.push(step);
				return options.backAt?.includes(shown.length - 1) ?? false;
			};
			const stepOf = (input: { readonly step: number | undefined; readonly totalSteps: number | undefined }) => input.step !== undefined ? `${input.step}/${input.totalSteps}` : undefined;
			const quickInput = new class extends mock<IQuickInputService>() {
				override readonly backButton = backButton;
				override createQuickPick<T extends IQuickPickItem>(options: { useSeparators: true }): IQuickPick<T, { useSeparators: true }>;
				override createQuickPick<T extends IQuickPickItem>(options?: { useSeparators: boolean }): IQuickPick<T, { useSeparators: false }>;
				override createQuickPick<T extends IQuickPickItem>(_options?: { useSeparators: boolean }): IQuickPick<T, { useSeparators: true }> | IQuickPick<T, { useSeparators: false }> {
					const disposables = new DisposableStore();
					const accept = disposables.add(new Emitter<IQuickPickDidAcceptEvent>());
					const button = disposables.add(new Emitter<IQuickInputButton>());
					return new class extends mock<IQuickPick<T>>() {
						override title: string | undefined;
						override description: string | undefined;
						override step: number | undefined;
						override totalSteps: number | undefined;
						override placeholder: string | undefined;
						override buttons: readonly IQuickInputButton[] = [];
						override items: readonly T[] = [];
						override activeItems: readonly T[] = [];
						override selectedItems: readonly T[] = [];
						override ignoreFocusOut = false;
						override readonly onDidAccept = accept.event;
						override readonly onDidTriggerButton = button.event;
						override readonly onDidHide = Event.None;
						override show(): void {
							const items = this.items as readonly (T & { readonly value?: string })[];
							calls.push(['pick', items.map(item => item.label)]);
							if (show({ step: stepOf(this), back: this.buttons.includes(backButton), description: this.description, prompt: undefined, placeholder: this.placeholder, value: this.activeItems[0]?.label })) {
								button.fire(backButton);
								return;
							}
							// The transport pick preselects the recommendation; value picks choose the enum's sentinel.
							this.selectedItems = [this.activeItems[0] ?? items.find(item => item.value === sentinels.region)!];
							accept.fire({ inBackground: false });
						}
						override dispose(): void {
							disposables.dispose();
						}
					}();
				}
				override createInputBox(): IInputBox {
					const disposables = new DisposableStore();
					const accept = disposables.add(new Emitter<void>());
					const change = disposables.add(new Emitter<string>());
					const hide = disposables.add(new Emitter<IQuickInputHideEvent>());
					const button = disposables.add(new Emitter<IQuickInputButton>());
					const cancelAt = options.cancelAt;
					return new class extends mock<IInputBox>() {
						override title: string | undefined;
						override description: string | undefined;
						override step: number | undefined;
						override totalSteps: number | undefined;
						override placeholder: string | undefined;
						override prompt: string | undefined;
						override buttons: readonly IQuickInputButton[] = [];
						override value = '';
						override password = false;
						override validationMessage: string | undefined;
						override ignoreFocusOut = false;
						override readonly onDidAccept = accept.event;
						override readonly onDidChangeValue = change.event;
						override readonly onDidHide = hide.event;
						override readonly onDidTriggerButton = button.event;
						private enter(value: string): void {
							this.value = value;
							change.fire(value);
						}
						override show(): void {
							if (show({ step: stepOf(this), back: this.buttons.includes(backButton), description: this.description, prompt: this.prompt, placeholder: this.placeholder, value: this.password ? undefined : this.value })) {
								button.fire(backButton);
								return;
							}
							if (this.password) {
								if (cancelAt === 'secret') {
									hide.fire({ reason: QuickInputHideReason.Other });
									return;
								}
								for (const probe of ['', 'a\0b', 'x'.repeat(8193)]) {
									this.enter(probe);
									secretValidation.push(this.validationMessage);
								}
								this.enter(sentinels.secret);
								secretValidation.push(this.validationMessage);
								accept.fire();
								return;
							}
							if (options.entries) {
								this.enter(options.entries.shift() ?? '');
								accept.fire();
								return;
							}
							const tenant = this.prompt?.includes(`'TENANT'`);
							for (const probe of tenant ? ['$HOME', '${HOME}', sentinels.tenant, ''] : ['1.0', ' 1', '0x1', '-1.5e3']) {
								this.enter(probe);
								validation.push(this.validationMessage);
							}
							this.enter(tenant ? sentinels.tenant : '');
							accept.fire();
						}
						override dispose(): void {
							disposables.dispose();
						}
					}();
				}
			}();
			const provider = store.add(createTestProvider(
				'copilotcli', async () => true,
				host,
				new class extends mock<IAgentHostConnectionsService>() {
					override resolveSessionResourceIdentity() { return { connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, backendSession }; }
				}(),
				new class extends mock<IAgentHostCustomizationService>() {
					override readonly onDidChangeCustomizations = Event.None;
				}(),
				new class extends mock<IDialogService>() {
					override readonly confirm: IDialogService['confirm'] = async confirmation => {
						details.push(typeof confirmation.detail === 'string' ? confirmation.detail : '');
						return { confirmed: options.confirm ?? true };
					};
				}(),
				new NullLogService(),
				pluginService,
				{
					quickInput, trusted: options.trusted,
					requestTrust: async () => { calls.push('requestTrust'); return options.grantTrust; },
				},
			));
			return { provider, calls, details, validation, secretValidation, shown, quickInput };
		}

		test('installs once through the local host with exact submitted values after a sanitized review', async () => {
			const { provider, calls, details, validation } = createFlow();
			await provider.install(URI.parse('agent-host-copilotcli:/frontend'), resource, CancellationToken.None);
			assert.ok(!details.join().includes(sentinels.region) && !details.join().includes(sentinels.tenant) && !details.join().includes(sentinels.secret));
			assert.deepStrictEqual({ calls, validation, detail: details[0].split('\n').slice(2) }, {
				calls: [
					['prepare', backendSession.toString()],
					['pick', ['sse', 'streamable-http']],
					['pick', ['eu', sentinels.region]],
					['apply', {
						hostGeneration: 'generation', ownershipToken: 'token', operationId: 'preparation',
						answers: {
							choiceId: 'remote:1',
							inputs: [{ key: 'X-Region', category: 'header', value: sentinels.region }, { key: 'TENANT', category: 'url-variable', value: sentinels.tenant }],
							secrets: [{ placeholder: '${secret:a}', value: sentinels.secret }],
						},
					}],
				],
				validation: [
					'Variable references such as $NAME or ${NAME} are not allowed.', 'Variable references such as $NAME or ${NAME} are not allowed.', undefined, undefined,
					undefined, 'Enter a number, for example 42 or -1.5e3.', 'Enter a number, for example 42 or -1.5e3.', undefined,
				],
				detail: [
					'Server: owner/configured',
					'Destination: owner/configured',
					'Endpoint (from the installation plan): https://example.test/eu/mcp',
					'Configured values: X-Region (header), TENANT (url-variable)',
					'Secrets: API_KEY',
					'Configuration fields: headers, url',
				],
			});
		});

		test('rejects secrets the host would refuse while the prompt is still open', async () => {
			const { provider, secretValidation } = createFlow();
			await provider.install(URI.parse('agent-host-copilotcli:/frontend'), resource, CancellationToken.None);
			assert.deepStrictEqual(secretValidation, [
				'A value is required.',
				'This secret contains characters that are not allowed.',
				'This secret is longer than 8192 bytes.',
				undefined,
			]);
		});

		test('shows command links from untrusted plan text as plain text', async () => {
			const link = '[Continue setup](command:workbench.action.files.newUntitledFile)';
			const { provider, shown } = createFlow({
				configuration: {
					...configuration,
					recommendedChoiceId: undefined,
					choices: [{
						choiceId: 'remote:0', transport: 'streamable-http', endpointSummary: 'https://example.test/mcp', configurationFields: ['headers'],
						values: [{ key: 'X-Region', category: 'header', valueType: 'enum', required: true, isRepeated: false, enumValues: ['eu', sentinels.region], title: link, description: link }],
						secrets: [{ key: 'API_KEY', placeholder: '${secret:a}', title: link }],
					}],
				},
			});
			await provider.install(URI.parse('agent-host-copilotcli:/frontend'), resource, CancellationToken.None);
			const links = (text: string | undefined) => parseLinkedText(text ?? '').nodes.filter(node => typeof node !== 'string').length;
			assert.deepStrictEqual(shown.map(step => links(step.prompt) + links(step.placeholder) + links(step.description)), [0, 0]);
		});

		test('reviews a local package choice by its command and sends its values once', async () => {
			const { provider, calls, details, shown } = createFlow({
				configuration: {
					...configuration,
					recommendedChoiceId: undefined,
					choices: [{
						choiceId: 'package:0', transport: 'stdio', command: 'npx @example/local@1.2.3 --port ${input:port} -d ${input:domain}', env: { NODE_OPTIONS: '--max-old-space-size=64', LOG_LEVEL: '${input:LOG_LEVEL}' }, configurationFields: ['args', 'command', 'env'],
						values: [
							{ key: 'LOG_LEVEL', category: 'environment-variable', valueType: 'enum', required: true, isRepeated: false, enumValues: ['info', sentinels.region] },
							{ key: '--port', category: 'package-argument', valueType: 'number', required: false, isRepeated: false, defaultValue: '3000' },
							{ key: '-d', category: 'package-argument', valueType: 'string', required: false, isRepeated: false },
						],
						secrets: [],
					}],
				},
			});
			await provider.install(URI.parse('agent-host-copilotcli:/frontend'), resource, CancellationToken.None);
			assert.deepStrictEqual({ shown, apply: calls.find(call => Array.isArray(call) && call[0] === 'apply'), detail: details[0].split('\n').slice(2) }, {
				shown: [
					{ step: '1/3', back: false, description: 'Command: npx @example/local@1.2.3 --port <port> -d <domain>', prompt: undefined, placeholder: `Environment variable 'LOG_LEVEL'`, value: undefined },
					{ step: '2/3', back: true, description: 'Command: npx @example/local@1.2.3 --port ▶<port> -d <domain>', prompt: `Value for command-line option '--port'. Leave empty to use the default.`, placeholder: 'Default: 3000', value: '' },
					{ step: '3/3', back: true, description: 'Command: npx @example/local@1.2.3 --port <port> ▶-d <domain>', prompt: `Value for command-line option '-d'. Optional: leave empty to skip.`, placeholder: 'Optional', value: '' },
				],
				apply: ['apply', {
					hostGeneration: 'generation', ownershipToken: 'token', operationId: 'preparation',
					answers: { choiceId: 'package:0', inputs: [{ key: 'LOG_LEVEL', category: 'environment-variable', value: sentinels.region }], secrets: [] },
				}],
				detail: [
					'Server: owner/configured',
					'Destination: owner/configured',
					'Command (your values replace the placeholders): npx @example/local@1.2.3 --port ${input:port} -d ${input:domain}',
					'Environment: {"NODE_OPTIONS":"--max-old-space-size=64","LOG_LEVEL":"${input:LOG_LEVEL}"}',
					'Configured values: LOG_LEVEL (environment-variable)',
					'Configuration fields: args, command, env',
				],
			});
		});

		test('reviews a long package command in full', async () => {
			const command = `npx @example/local@1.2.3 ${'--flag '.repeat(40)}--last-option`;
			const { provider, details } = createFlow({
				configuration: {
					...configuration,
					recommendedChoiceId: undefined,
					choices: [{ choiceId: 'package:0', transport: 'stdio', command, configurationFields: ['args', 'command'], values: [], secrets: [] }],
				},
			});
			await provider.install(URI.parse('agent-host-copilotcli:/frontend'), resource, CancellationToken.None);
			assert.ok(details[0].includes(`Command (your values replace the placeholders): ${command}\n`));
		});

		test('collects a repeated value one entry at a time and sends each entry', async () => {
			const { provider, calls, shown, details } = createFlow({
				entries: ['src', 'test', ''],
				configuration: {
					...configuration,
					recommendedChoiceId: undefined,
					choices: [{
						choiceId: 'package:0', transport: 'stdio', command: 'npx @example/local@1.2.3 --include ${input:include}', configurationFields: ['args', 'command'],
						values: [{ key: '--include', category: 'package-argument', valueType: 'string', required: true, isRepeated: true }],
						secrets: [],
					}],
				},
			});
			await provider.install(URI.parse('agent-host-copilotcli:/frontend'), resource, CancellationToken.None);
			assert.deepStrictEqual({ prompts: shown.map(step => [step.step, step.prompt]), apply: calls.find(call => Array.isArray(call) && call[0] === 'apply'), values: details[0].split('\n').find(line => line.startsWith('Configured values')) }, {
				prompts: [
					['1/1', `Value for command-line option '--include'. Can be given more than once; enter the first value.`],
					['1/1', `Value for command-line option '--include'. Added: src. Enter another value, or leave empty to finish.`],
					['1/1', `Value for command-line option '--include'. Added: src, test. Enter another value, or leave empty to finish.`],
				],
				apply: ['apply', {
					hostGeneration: 'generation', ownershipToken: 'token', operationId: 'preparation',
					answers: { choiceId: 'package:0', inputs: [{ key: '--include', category: 'package-argument', value: 'src' }, { key: '--include', category: 'package-argument', value: 'test' }], secrets: [] },
				}],
				values: 'Configured values: --include (package-argument)',
			});
		});

		test('going back returns to the previous step with its answer kept', async () => {
			// Back from the first value returns to the transport pick; back from LIMIT returns to TENANT.
			const { provider, calls, shown } = createFlow({ backAt: [1, 5] });
			await provider.install(URI.parse('agent-host-copilotcli:/frontend'), resource, CancellationToken.None);
			assert.deepStrictEqual({ shown: shown.map(step => [step.step, step.back, step.value]), apply: calls.find(call => Array.isArray(call) && call[0] === 'apply') }, {
				shown: [
					[undefined, false, 'streamable-http'],
					['2/5', true, undefined],
					[undefined, false, 'streamable-http'],
					['2/5', true, undefined],
					['3/5', true, ''],
					['4/5', true, ''],
					['3/5', true, sentinels.tenant],
					['4/5', true, ''],
					['5/5', true, undefined],
				],
				apply: ['apply', {
					hostGeneration: 'generation', ownershipToken: 'token', operationId: 'preparation',
					answers: {
						choiceId: 'remote:1',
						inputs: [{ key: 'X-Region', category: 'header', value: sentinels.region }, { key: 'TENANT', category: 'url-variable', value: sentinels.tenant }],
						secrets: [{ placeholder: '${secret:a}', value: sentinels.secret }],
					},
				}],
			});
		});

		test('declining workspace trust stops before any connection call', async () => {
			const { provider, calls } = createFlow({ trusted: false, grantTrust: false });
			await assert.rejects(provider.install(URI.parse('agent-host-copilotcli:/frontend'), resource, CancellationToken.None), /Canceled/);
			assert.deepStrictEqual(calls, ['requestTrust']);
		});

		test('sends nothing when the user cancels a prompt or declines the review', async () => {
			const results: unknown[] = [];
			for (const scenario of [{ cancelAt: 'secret', confirm: true }, { cancelAt: undefined, confirm: false }]) {
				const { provider, calls, details } = createFlow(scenario);
				await assert.rejects(provider.install(URI.parse('agent-host-copilotcli:/frontend'), resource, CancellationToken.None), /Canceled/);
				results.push({ sent: calls.filter(call => Array.isArray(call) && call[0] === 'apply'), reviewed: details.length });
			}
			assert.deepStrictEqual(results, [{ sent: [], reviewed: 0 }, { sent: [], reviewed: 1 }]);
		});
	});
});
