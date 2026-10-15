/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { timeout } from '../../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IAgentCustomizationInstallation } from '../../../../../../../platform/agentHost/common/agent.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService } from '../../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostService } from '../../../../../../../platform/agentHost/common/agentService.js';
import { CustomizationMarketplaceRecoveryGroup } from '../../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceSources } from '../../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IDialogService } from '../../../../../../../platform/dialogs/common/dialogs.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { type IMcpServerConfiguration, McpServerType } from '../../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { AgentHostCustomizationMarketplaceInstallProvider } from '../../../../browser/agentSessions/agentHost/agentHostCustomizationMarketplaceInstallProvider.js';
import { IAgentHostCustomizationService } from '../../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IAgentPlugin, IAgentPluginService } from '../../../../common/plugins/agentPluginService.js';

suite('AgentHostCustomizationMarketplaceInstallProvider', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('routes marketplace management through the Agent Host provider', async () => {
		const calls: { readonly operation: string; readonly args: readonly unknown[] }[] = [];
		const frontendSession = URI.parse('agent-host-copilotcli:/frontend-session');
		const backendSession = URI.parse('agent-host-copilotcli:/backend-session');
		const backendChat = URI.parse('vendor-chat://opaque-host/peer-chat');
		const provider = store.add(new AgentHostCustomizationMarketplaceInstallProvider(
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
				override readonly onDidChangeCustomizations = Event.None;
				override getBackendChatResource() { return backendChat; }
			}(),
			new class extends mock<IAgentPluginService>() {
				override readonly plugins = observableValue<readonly IAgentPlugin[]>('plugins', []);
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
		));
		let changeCount = 0;
		store.add(provider.onDidChange(() => changeCount++));

		const listed = await provider.list(frontendSession);
		const added = await provider.add(frontendSession, 'owner/repository');
		const page = await provider.queryMarketplace(frontendSession, listed[0], { pageSize: 1 }, CancellationToken.None);
		const nextPage = await provider.queryMarketplace(frontendSession, listed[0], { pageSize: 1, cursor: page.nextCursor }, CancellationToken.None);
		const refused = await provider.remove(frontendSession, 'marketplace');
		const removed = await provider.remove(frontendSession, 'marketplace', true);
		const refreshed = await provider.refresh(frontendSession, 'marketplace');
		await provider.addGlobal('demo', { type: McpServerType.REMOTE, url: 'https://example.com/mcp' });

		assert.deepStrictEqual({
			listed,
			added,
			page,
			nextPage,
			refused,
			removed,
			refreshed,
			changeCount,
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
			changeCount: 3,
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
		const provider = store.add(new AgentHostCustomizationMarketplaceInstallProvider(
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
			new class extends mock<IAgentPluginService>() {
				override readonly plugins = observableValue<readonly IAgentPlugin[]>('plugins', []);
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
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

	test('projects SDK catalog searches and featured plugin browse results', async () => {
		const frontendSession = URI.parse('agent-host-copilotcli:/frontend-session');
		const backendSession = URI.parse('ahp-session:/backend-session');
		const calls: { readonly provider: string; readonly session: string; readonly query: string }[] = [];
		const provider = store.add(new AgentHostCustomizationMarketplaceInstallProvider(
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
								installable: true,
							},
							{
								selectionId: 'plugin:diagram',
								kind: 'plugin' as const,
								displayName: 'Diagram Canvas',
								description: 'Interactive architecture diagrams.',
								publisher: 'octo-org',
								version: '1.2.3',
								repository: 'owner/repository',
								path: '.github/plugin/plugin.json',
								tags: ['canvas', 'canvas-only'],
								installable: false,
								unavailableMessage: 'Install this plugin from a configured marketplace or its repository.',
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
			new class extends mock<IAgentPluginService>() {
				override readonly plugins = observableValue<readonly IAgentPlugin[]>('plugins', []);
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
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
					identifier: 'selection',
					displayName: 'Demo Skill',
					description: 'Demo',
					mediaType: 'application/ai-skill',
					tags: [],
					capabilities: [],
					representativeQueries: [],
					version: undefined,
					repository: undefined,
					publisher: 'octo-org',
					publisherUrl: 'https://github.com/octo-org',
					icon: 'https://github.com/octo-org.png',
					installation: { kind: 'providerCatalog', resourceKind: 'skill', selectionId: 'selection', itemUrl: undefined },
				}, {
					identifier: 'https://api.mcp.github.com/oss/v0.1/servers/microsoft%2Fplaywright-mcp/versions/latest',
					displayName: 'Playwright',
					description: 'Browser automation',
					mediaType: 'application/mcp-server+json',
					tags: [],
					capabilities: [],
					representativeQueries: [],
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
					},
				}, {
					identifier: 'plugin:diagram',
					displayName: 'Diagram Canvas',
					description: 'Interactive architecture diagrams.',
					mediaType: 'application/vnd.github.copilot-plugin',
					tags: ['canvas', 'canvas-only'],
					capabilities: [],
					representativeQueries: [],
					version: '1.2.3',
					repository: URI.parse('https://github.com/owner/repository'),
					publisher: 'octo-org',
					publisherUrl: 'https://github.com/octo-org',
					icon: 'https://github.com/octo-org.png',
					installation: {
						kind: 'providerCatalog',
						resourceKind: 'plugin',
						selectionId: 'plugin:diagram',
						itemUrl: undefined,
					},
				}],
				nextCursor: 'next',
			},
		});
	});

	test('offers explicit sign-in before retrying SDK catalog search', async () => {
		let authenticationRequests = 0;
		let searchRequests = 0;
		const provider = store.add(new AgentHostCustomizationMarketplaceInstallProvider(
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
			new class extends mock<IAgentPluginService>() {
				override readonly plugins = observableValue<readonly IAgentPlugin[]>('plugins', []);
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
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
		const provider = store.add(new AgentHostCustomizationMarketplaceInstallProvider(
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
			new class extends mock<IAgentPluginService>() {
				override readonly plugins = observableValue<readonly IAgentPlugin[]>('plugins', []);
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
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
		const provider = store.add(new AgentHostCustomizationMarketplaceInstallProvider(
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
					return {
						operationId: 'operation',
						action: 'install' as const,
						kind: 'skill' as const,
						displayName: 'Demo Skill',
						source: 'owner/repo@revision/skills/demo',
						target: 'skills/demo',
						fileCount: 1,
						totalBytes: 10,
					};
				}
				override async applyCustomizationInstallation(_provider: string, operationId: string) {
					applied.push(operationId);
					installed = true;
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
			new class extends mock<IAgentPluginService>() {
				override readonly plugins = observableValue<readonly IAgentPlugin[]>('plugins', []);
			}(),
			new class extends mock<IDialogService>() {
				override async confirm() { return { confirmed: true }; }
			}(),
			new NullLogService(),
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

	test('routes MCP Gallery installation through the Agent Host SDK card flow', async () => {
		const session = URI.parse('agent-host-copilotcli:/frontend-session');
		const calls: string[] = [];
		const requests: unknown[] = [];
		const provider = store.add(new AgentHostCustomizationMarketplaceInstallProvider(
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
					return {
						operationId: 'operation',
						action: 'install' as const,
						kind: 'mcp' as const,
						displayName: 'Demo MCP',
						serverName: 'owner/demo',
						target: 'owner/demo',
						configurationFields: [],
					};
				}
				override async applyCustomizationInstallation() {
					calls.push('apply');
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
			new class extends mock<IAgentPluginService>() {
				override readonly plugins = observableValue<readonly IAgentPlugin[]>('plugins', []);
			}(),
			new class extends mock<IDialogService>() {
				override async confirm() { return { confirmed: true }; }
			}(),
			new NullLogService(),
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

		assert.deepStrictEqual({ calls, requests }, {
			calls: ['authenticate', 'prepare', 'apply'],
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
		const provider = store.add(new AgentHostCustomizationMarketplaceInstallProvider(
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
			new class extends mock<IAgentPluginService>() {
				override readonly plugins = observableValue<readonly IAgentPlugin[]>('plugins', []);
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
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
		const plugins = observableValue<readonly IAgentPlugin[]>('plugins', []);
		const provider = store.add(new AgentHostCustomizationMarketplaceInstallProvider(
			'copilotcli',
			async () => true,
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async installPlugin(provider: string, request: { readonly source: string }, session?: URI, chat?: URI): Promise<void> {
					calls.push({ provider, request, session: session?.toString(), chat: chat?.toString() });
					plugins.set([new class extends mock<IAgentPlugin>() {
						override readonly uri = URI.file('/plugins/azure');
						override readonly label = 'Azure';
						override readonly copilotCliInstallation = { name: 'azure', marketplace: 'awesome-copilot' };
					}()], undefined);
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
			new class extends mock<IAgentPluginService>() {
				override readonly plugins = plugins;
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
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

	test('keeps featured plugin mutations pending until SDK inventory publishes them', async () => {
		const plugins = observableValue<readonly IAgentPlugin[]>('plugins', []);
		const installedPlugin = new class extends mock<IAgentPlugin>() {
			override readonly uri = URI.file('/plugins/azure');
			override readonly label = 'Azure';
			override readonly copilotCliInstallation = { name: 'azure', marketplace: 'awesome-copilot' };
		}();
		const provider = store.add(new AgentHostCustomizationMarketplaceInstallProvider(
			'copilotcli',
			async () => true,
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async installPlugin(): Promise<void> { }
				override async uninstallPlugin(): Promise<void> { }
			}(),
			new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResourceIdentity(session: URI) {
					return { connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, backendSession: session };
				}
			}(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
			}(),
			new class extends mock<IAgentPluginService>() {
				override readonly plugins = plugins;
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
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
		let settled = false;
		const install = provider.install(URI.parse('agent-host-copilotcli:/frontend-session'), resource, CancellationToken.None)
			.then(() => settled = true);

		await timeout(0);
		const installSettledBeforeInventory = settled;
		plugins.set([installedPlugin], undefined);
		await install;
		const installation = (await provider.getInstallations(URI.parse('agent-host-copilotcli:/frontend-session'), CancellationToken.None))[0];
		settled = false;
		const uninstall = provider.uninstall(URI.parse('agent-host-copilotcli:/frontend-session'), installation, CancellationToken.None)
			.then(() => settled = true);
		await timeout(0);
		const uninstallSettledBeforeInventory = settled;
		plugins.set([], undefined);
		await uninstall;

		assert.deepStrictEqual({ installSettledBeforeInventory, uninstallSettledBeforeInventory, settled }, {
			installSettledBeforeInventory: false,
			uninstallSettledBeforeInventory: false,
			settled: true,
		});
	});

	test('preserves SDK plugin inventory when session-bound receipt inventory is unavailable', async () => {
		const session = URI.parse('agent-host-copilotcli:/frontend-session');
		const plugin = new class extends mock<IAgentPlugin>() {
			override readonly uri = URI.file('/plugins/spark');
			override readonly label = 'Spark';
			override readonly copilotCliInstallation = { name: 'spark', marketplace: 'copilot-plugins' };
		}();
		const provider = store.add(new AgentHostCustomizationMarketplaceInstallProvider(
			'copilotcli',
			async () => true,
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onAgentHostExit = Event.None;
				override async listCustomizationInstallations(): Promise<readonly IAgentCustomizationInstallation[]> { throw new Error('Policy session unavailable'); }
			}(),
			new class extends mock<IAgentHostConnectionsService>() {
				override resolveSessionResourceIdentity() {
					return { connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, backendSession: URI.parse('ahp-session:/backend-session') };
				}
			}(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
			}(),
			new class extends mock<IAgentPluginService>() {
				override readonly plugins = observableValue<readonly IAgentPlugin[]>('plugins', [plugin]);
			}(),
			new class extends mock<IDialogService>() { }(),
			new NullLogService(),
		));

		const installations = await provider.getInstallations(session, CancellationToken.None);

		assert.deepStrictEqual(installations.map(installation => ({
			installationId: installation.installationId,
			installation: installation.resource.installation,
			state: installation.state.kind,
		})), [{
			installationId: 'plugin:copilot-plugins:spark',
			installation: { kind: 'configuredPlugin', name: 'spark', marketplace: 'copilot-plugins' },
			state: 'installed',
		}]);
	});
});
