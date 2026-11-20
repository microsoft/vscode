/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { encodeBase64, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { isWeb } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceQuery, ICustomizationMarketplaceService } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationOverrides, IConfigurationService, IConfigurationUpdateOverrides } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfirmation, IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IPickOptions, IQuickInputService, IQuickPickItem } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IURLService } from '../../../../../../platform/url/common/url.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IHostService } from '../../../../../services/host/browser/host.js';
import { PluginUrlHandler } from '../../../browser/pluginUrlHandler.js';
import { ICopilotConnectorsService } from '../../../browser/aiCustomization/copilotConnectorsService.js';
import { CustomizationMarketplaceWorkbenchService, getProviderMarketplaceSourceId } from '../../../browser/aiCustomization/customizationMarketplaceWorkbenchService.js';
import { AICustomizationManagementCommands } from '../../../common/aiCustomizationWorkspaceService.js';
import { SessionType } from '../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ICustomizationHarnessService, ICustomizationMarketplaceManagementProvider, IHarnessDescriptor } from '../../../common/customizationHarnessService.js';
import { ICustomizationMarketplaceInstallProvider } from '../../../common/customizationMarketplaceInstallService.js';
import { IPluginInstallService } from '../../../common/plugins/pluginInstallService.js';
import { IPluginMarketplaceService } from '../../../common/plugins/pluginMarketplaceService.js';

suite('PluginUrlHandler', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const desktopTest = isWeb ? test.skip : test;
	const sessionResource = URI.parse(`${SessionType.AgentHostCopilot}:/existing`);

	function createHandler(options: {
		harness?: 'copilot' | 'vscode';
		cancelPicker?: boolean;
		confirmed?: boolean;
		confirmation?: Promise<boolean>;
		existingMarketplaceSource?: string;
		existingMarketplaceIsDefault?: boolean;
		existingMarketplaceManaged?: boolean;
		hidden?: boolean;
		disabledInWorkspace?: boolean;
		pluginsEnabled?: boolean;
		managementUnavailable?: boolean;
		installUnavailable?: boolean;
		marketplaceTrusted?: boolean;
		installResult?: { success: boolean; message?: string };
		remoteAuthority?: string;
		isSessionsWindow?: boolean;
		failure?: 'list' | 'add' | 'browse' | 'agentFinderQuery' | 'install';
		agentFinderAvailable?: boolean;
		agentFinderEnabled?: boolean;
		agentFinderMatchCount?: number;
		agentFinderIdentity?: string | null;
		agentFinderProviderPlugin?: boolean;
		agentFinderProviderPluginSource?: string;
		agentFinderBrowseError?: boolean;
		agentFinderBrowseDuplicate?: boolean;
		agentFinderPaginated?: boolean;
		agentFinderSourceError?: boolean;
		cancelled?: boolean;
	} = {}) {
		const instantiationService = store.add(new TestInstantiationService());
		const calls: unknown[] = [];
		const dialogs: IConfirmation[] = [];
		const errors: string[] = [];
		const commands: { id: string; args: unknown[] }[] = [];
		const picks: { items: readonly IQuickPickItem[]; activeLabel?: string }[] = [];
		const fail = (phase: typeof options.failure) => {
			if (phase === options.failure) {
				throw options.cancelled ? new CancellationError() : new Error(`${phase} failed`);
			}
		};
		let marketplaces = options.existingMarketplaceSource ? [{
			name: 'catalog', source: options.existingMarketplaceSource, isDefault: options.existingMarketplaceIsDefault ?? false, managed: options.existingMarketplaceManaged ?? false, available: true,
		}] : [];
		instantiationService.stub(IAgentHostService, {
			listPluginMarketplaces: options.managementUnavailable ? undefined : async (provider, session, chat) => {
				calls.push(['list', provider, session, chat]);
				fail('list');
				return marketplaces;
			},
			addPluginMarketplace: async (provider, session, source, chat) => {
				calls.push(['add', provider, session, source, chat]);
				fail('add');
				const marketplace = { name: 'catalog', source, isDefault: false, managed: false, available: true };
				marketplaces = [...marketplaces, marketplace];
				return marketplace;
			},
			browsePluginMarketplace: async (provider, session, name, chat) => {
				calls.push(['browse', provider, session, name, chat]);
				fail('browse');
				return [{ name: 'my-plugin' }, { name: 'other-plugin' }];
			},
			installPlugin: options.installUnavailable ? undefined : async (provider, request, session, chat) => {
				calls.push(['install', provider, request, session, chat]);
				fail('install');
			},
		});
		const marketplaceSources = options.agentFinderAvailable ? [CustomizationMarketplaceSources.AgentFinderPublicFeed] : [];
		const agentFinderProviderPlugin = {
			identifier: 'agentFinder/accessibility-agents',
			displayName: 'Accessibility Agents',
			description: '',
			mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
			sourceId: CustomizationMarketplaceSources.AgentFinderPublicFeed.id,
			tags: [],
			capabilities: [],
			representativeQueries: [],
			installation: {
				kind: 'providerPlugin' as const,
				name: 'accessibility-agents',
				marketplace: 'awesome-copilot',
				marketplaceSource: options.agentFinderProviderPluginSource ?? 'GitHub: github/awesome-copilot',
			},
		};
		instantiationService.stub(ICustomizationMarketplaceService, new class extends mock<ICustomizationMarketplaceService>() {
			override readonly sources = marketplaceSources;
			override async query(query: ICustomizationMarketplaceQuery) {
				calls.push(`agentFinderQuery:${query.query ?? ''}:${query.cursor?.token ?? ''}`);
				fail('agentFinderQuery');
				const paginatedFirstPage = options.agentFinderPaginated && !query.cursor;
				return {
					items: Array.from({ length: options.agentFinderMatchCount ?? 1 }, (_, index) => ({
						identifier: `agentFinder/my-plugin-${index}`,
						displayName: 'My Plugin',
						description: '',
						mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
						sourceId: CustomizationMarketplaceSources.AgentFinderPublicFeed.id,
						tags: [],
						capabilities: [],
						representativeQueries: [],
						installation: {
							kind: 'providerCatalog' as const,
							resourceKind: 'plugin' as const,
							selectionId: `my-plugin-${index}`,
							catalogIdentity: options.agentFinderIdentity === null ? undefined : options.agentFinderIdentity ?? `urn:air:github.com:github:awesome-copilot:${paginatedFirstPage ? 'other-plugin' : 'my-plugin'}`,
						},
					})),
					...(paginatedFirstPage ? { nextCursor: { token: 'next' } } : {}),
					...(options.agentFinderSourceError ? { sourceErrors: [{ sourceId: CustomizationMarketplaceSources.AgentFinderPublicFeed.id, message: 'feed failed' }] } : {}),
				};
			}
			override async getBrowseSections() {
				calls.push('agentFinderBrowse');
				return {
					sourceId: CustomizationMarketplaceSources.AgentFinderPublicFeed.id,
					sections: options.agentFinderProviderPlugin ? [
						{ id: 'featured', title: 'Featured', items: [agentFinderProviderPlugin] },
						...(options.agentFinderBrowseDuplicate ? [{ id: 'more', title: 'More', items: [agentFinderProviderPlugin] }] : []),
					] : [],
					...(options.agentFinderBrowseError ? { error: 'browse failed' } : {}),
				};
			}
		}());
		const marketplaceChanges = store.add(new Emitter<void>());
		const managementProvider = new class extends mock<ICustomizationMarketplaceManagementProvider>() {
			override readonly onDidChange = Event.None;
			override readonly onDidChangeMarketplaces = marketplaceChanges.event;
			override async list(session: URI) {
				return instantiationService.get(IAgentHostService).listPluginMarketplaces!('copilotcli', session);
			}
			override async add(session: URI | undefined, source: string) {
				const marketplace = await instantiationService.get(IAgentHostService).addPluginMarketplace!('copilotcli', session, source);
				marketplaceChanges.fire();
				return marketplace;
			}
		}();
		const installProvider = new class extends mock<ICustomizationMarketplaceInstallProvider>() {
			override readonly onDidChange = Event.None;
			override async install(session: URI, resource: Parameters<ICustomizationMarketplaceInstallProvider['install']>[1]) {
				calls.push(`install:${session}:${resource.identifier}`);
				fail('install');
			}
		}();
		const descriptor: IHarnessDescriptor = {
			id: SessionType.AgentHostCopilot, label: 'Copilot', icon: { id: 'copilot' }, marketplaceManagementProvider: managementProvider,
			marketplaceInstallProvider: options.installUnavailable ? undefined : installProvider,
		};
		const harnessService = instantiationService.stub(ICustomizationHarnessService, {
			activeHarness: observableValue('harness', descriptor.id),
			activeSessionResource: observableValue('activeSession', sessionResource),
			availableHarnesses: observableValue('harnesses', [descriptor]),
			getDescriptorForSession: () => descriptor,
			getSessionResourceForHarness: () => sessionResource,
		});
		instantiationService.stub(IPluginInstallService, {
			ensureMarketplaceTrusted: async reference => {
				calls.push(['trustMarketplace', reference.rawValue]);
				return options.marketplaceTrusted ?? true;
			},
			installPluginFromSource: async (source, installOptions) => {
				calls.push(['vscodeInstall', source, installOptions]);
				fail('install');
				return options.installResult ?? { success: true };
			},
		});
		instantiationService.stub(IQuickInputService, new class extends mock<IQuickInputService>() { }());
		instantiationService.stub(IQuickInputService, 'pick', async (items: IQuickPickItem[], pickOptions?: IPickOptions<IQuickPickItem>) => {
			const activeItem = await pickOptions?.activeItem;
			picks.push({ items, activeLabel: activeItem?.label });
			return options.cancelPicker ? undefined : options.harness
				? items.find(item => item.label === (options.harness === 'copilot' ? 'Copilot' : 'VS Code'))
				: activeItem;
		});
		instantiationService.stub(IURLService, { registerHandler: () => ({ dispose() { } }) });
		instantiationService.stub(IDialogService, {
			confirm: async confirmation => {
				dialogs.push(confirmation);
				return { confirmed: options.confirmation ? await options.confirmation : options.confirmed ?? true };
			},
		});
		const configuration = new class extends TestConfigurationService {
			override async updateValue(key: string, value: unknown, overridesOrTarget?: ConfigurationTarget | IConfigurationOverrides | IConfigurationUpdateOverrides): Promise<void> {
				assert.strictEqual(overridesOrTarget, ConfigurationTarget.USER);
				await this.setUserConfiguration(key, value);
			}
		}({
			[ChatConfiguration.PluginsEnabled]: options.pluginsEnabled ?? true,
			[ChatConfiguration.PluginMarketplaces]: options.existingMarketplaceSource ? [options.existingMarketplaceSource] : [],
			[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: true,
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: options.agentFinderEnabled ?? true,
		});
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IChatEntitlementService, { sentiment: { hidden: options.hidden, disabledInWorkspace: options.disabledInWorkspace } });
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() { }());
		instantiationService.stub(ICommandService, 'executeCommand', async (id: string, ...args: unknown[]) => {
			assert.strictEqual(id, AICustomizationManagementCommands.OpenEditor);
			commands.push({ id, args });
		});
		instantiationService.stub(IWorkspaceTrustManagementService, {
			isWorkspaceTrusted: () => false,
			onDidChangeTrust: Event.None,
			setWorkspaceTrust: async () => { throw new Error('Plugin links must not trust the workspace'); },
		});
		instantiationService.stub(IWorkbenchEnvironmentService, { remoteAuthority: options.remoteAuthority, isSessionsWindow: options.isSessionsWindow ?? false });
		instantiationService.stub(IHostService, { focus: async () => { } });
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(INotificationService, { error: message => { errors.push(String(message)); } });
		return { handler: store.add(instantiationService.createInstance(PluginUrlHandler)), calls, dialogs, errors, commands, picks, configuration, harnessService, instantiationService };
	}

	function uri(path = '/add-marketplace', query = 'ref=acme/plugins'): URI {
		return URI.from({ scheme: 'vscode', authority: 'chat-plugin', path, query });
	}

	test('ignores unrelated authorities and paths', async () => {
		const { handler } = createHandler();
		assert.deepStrictEqual([
			await handler.handleURL(URI.parse('vscode://other/install?source=acme/plugins')),
			await handler.handleURL(uri('/unknown')),
		], [false, false]);
	});

	(isWeb ? test : test.skip)('rejects web plugin links before selection, consent, or mutation', async () => {
		const fixture = createHandler();
		await fixture.handler.handleURL(uri('/install', 'source=acme/plugins&plugin=my-plugin&harness=copilot'));
		assert.deepStrictEqual({ picks: fixture.picks.length, dialogs: fixture.dialogs.length, calls: fixture.calls, commands: fixture.commands, errors: fixture.errors }, {
			picks: 0,
			dialogs: 0,
			calls: [],
			commands: [],
			errors: ['Unable to complete the plugin link: Open this plugin link in a local VS Code desktop window. Plugin links do not install into a remote workspace or web environment.'],
		});
	});

	desktopTest('refreshes Discover sources for an add-only link while Copilot is already selected', async () => {
		const fixture = createHandler();
		const activeSession = fixture.harnessService.activeSessionResource.get();
		const marketplaceService = store.add(new CustomizationMarketplaceWorkbenchService(
			fixture.configuration,
			new class extends mock<ICustomizationMarketplaceService>() {
				override readonly sources = [];
			}(),
			new class extends mock<IPluginMarketplaceService>() {
				override readonly onDidChangeMarketplaces = Event.None;
				override isStrictMarketplacePolicyActive() { return false; }
			}(),
			new class extends mock<ICopilotConnectorsService>() { }(),
			fixture.harnessService,
			fixture.instantiationService,
			new class extends mock<IDefaultAccountService>() {
				override readonly onDidChangeDefaultAccount = Event.None;
			}(),
			new class extends mock<IAuthenticationService>() {
				override readonly onDidChangeSessions = Event.None;
			}(),
			NullTelemetryService,
		));
		const sourceId = getProviderMarketplaceSourceId('catalog');
		const before = marketplaceService.sources.some(source => source.id === sourceId);
		const refreshed = new DeferredPromise<void>();
		store.add(marketplaceService.onDidChangeSources(() => {
			if (marketplaceService.sources.some(source => source.id === sourceId)) {
				refreshed.complete();
			}
		}));

		await fixture.handler.handleURL(uri('/add-marketplace', 'ref=acme/plugins&harness=copilot'));
		await refreshed.p;
		assert.deepStrictEqual({
			before,
			after: marketplaceService.sources.some(source => source.id === sourceId),
			sameSession: fixture.harnessService.activeSessionResource.get() === activeSession,
			errors: fixture.errors,
		}, { before: false, after: true, sameSession: true, errors: [] });
	});

	for (const [source, expectedSource] of [
		['acme/plugins', 'acme/plugins'],
		[encodeBase64(VSBuffer.fromString('acme/plugins')), 'acme/plugins'],
		['https://github.com/acme/plugins.git', 'https://github.com/acme/plugins.git'],
		['acme/plugins#feature/beta', 'acme/plugins#feature/beta'],
		[encodeBase64(VSBuffer.fromString('acme/plugins#feature/beta')), 'acme/plugins#feature/beta'],
		['https://github.com/acme/plugins.git#v1.2.3', 'https://github.com/acme/plugins.git#v1.2.3'],
	]) {
		for (const harness of ['copilot', 'vscode'] as const) {
			desktopTest(`adds the exact marketplace for ${harness}: ${source}`, async () => {
				const fixture = createHandler({ harness });
				await fixture.handler.handleURL(uri('/add-marketplace', `ref=${encodeURIComponent(source)}`));
				assert.deepStrictEqual({
					calls: fixture.calls,
					marketplaces: fixture.configuration.getValue(ChatConfiguration.PluginMarketplaces),
					errors: fixture.errors,
					commands: fixture.commands,
				}, {
					calls: harness === 'copilot'
						? [['list', 'copilotcli', undefined, undefined], ['add', 'copilotcli', undefined, expectedSource, undefined]]
						: [['trustMarketplace', expectedSource]],
					marketplaces: harness === 'copilot' ? [] : [expectedSource],
					errors: [],
					commands: [{
						id: AICustomizationManagementCommands.OpenEditor,
						args: [{ showDiscover: true, sessionType: harness === 'copilot' ? SessionType.AgentHostCopilot : SessionType.Local, searchQuery: '' }],
					}],
				});
			});
		}
	}

	for (const isSessionsWindow of [false, true]) {
		desktopTest(`installs the exact Copilot plugin without a session in a restricted workspace (Agents window: ${isSessionsWindow})`, async () => {
			const fixture = createHandler({ isSessionsWindow });
			await fixture.handler.handleURL(uri('/install', 'source=acme%2Fplugins%23feature%2Fbeta&plugin=my-plugin&harness=copilot'));
			assert.deepStrictEqual({ calls: fixture.calls, dialogs: fixture.dialogs.length, errors: fixture.errors }, {
				calls: [
					['list', 'copilotcli', undefined, undefined],
					['add', 'copilotcli', undefined, 'acme/plugins#feature/beta', undefined],
					['browse', 'copilotcli', undefined, 'catalog', undefined],
					['install', 'copilotcli', { source: 'my-plugin@catalog' }, undefined, undefined],
				],
				dialogs: 1,
				errors: [],
			});
			assert.ok(typeof fixture.dialogs[0].detail === 'string' && fixture.dialogs[0].detail.includes('Copilot\'s user installation on this machine'));
		});
	}

	desktopTest('uses the VS Code source installer with the exact plugin and revision', async () => {
		const fixture = createHandler();
		await fixture.handler.handleURL(uri('/install', 'source=acme%2Fplugins%23feature%2Fbeta&plugin=my-plugin&harness=vscode'));
		assert.deepStrictEqual({ calls: fixture.calls, errors: fixture.errors }, {
			calls: [['vscodeInstall', 'acme/plugins#feature/beta', { plugin: 'my-plugin' }]],
			errors: [],
		});
		assert.ok(typeof fixture.dialogs[0].detail === 'string' && fixture.dialogs[0].detail.includes('VS Code\'s shared plugin installation on this machine'));
	});

	for (const source of ['GitHub: acme/plugins', 'GitHub: acme/plugins#other']) {
		desktopTest(`does not confuse ${source} with the requested revision`, async () => {
			const fixture = createHandler({ existingMarketplaceSource: source });
			await fixture.handler.handleURL(uri('/add-marketplace', 'ref=acme%2Fplugins%23feature%2Fbeta'));
			assert.deepStrictEqual(fixture.calls, [
				['list', 'copilotcli', undefined, undefined],
				['add', 'copilotcli', undefined, 'acme/plugins#feature/beta', undefined],
			]);
		});
	}

	for (const source of ['acme/plugins#feature/beta', 'GitHub: acme/plugins#feature/beta', 'URL: https://github.com/ACME/plugins.git#feature/beta']) {
		desktopTest(`reuses an exact Copilot marketplace identity: ${source}`, async () => {
			const fixture = createHandler({ existingMarketplaceSource: source });
			await fixture.handler.handleURL(uri('/install', 'source=acme%2Fplugins%23feature%2Fbeta&plugin=my-plugin'));
			assert.deepStrictEqual(fixture.calls, [
				['list', 'copilotcli', undefined, undefined],
				['browse', 'copilotcli', undefined, 'catalog', undefined],
				['install', 'copilotcli', { source: 'my-plugin@catalog' }, undefined, undefined],
			]);
		});
	}

	for (const source of [
		'github/awesome-copilot',
		'GitHub:github/awesome-copilot',
		'GitHub: github/awesome-copilot',
		'URL:https://github.com/GitHub/Awesome-Copilot.git',
		'URL: https://github.com/GitHub/Awesome-Copilot.git',
	]) {
		desktopTest(`resolves a legacy Awesome Copilot plugin name through Agent Finder: ${source}`, async () => {
			const fixture = createHandler({ agentFinderAvailable: true, managementUnavailable: true, agentFinderIdentity: 'urn:air:github.com:github:awesome-copilot:MY-PLUGIN' });
			await fixture.handler.handleURL(uri('/install', `source=${encodeURIComponent(source)}&plugin=my-plugin`));
			assert.deepStrictEqual({
				calls: fixture.calls,
				errors: fixture.errors,
				commands: fixture.commands,
			}, {
				calls: [
					'agentFinderQuery:my-plugin:',
					`install:${sessionResource}:agentFinder/my-plugin-0`,
				],
				errors: [],
				commands: [{
					id: AICustomizationManagementCommands.OpenEditor,
					args: [{ showDiscover: true, sessionType: SessionType.AgentHostCopilot, searchQuery: 'my-plugin' }],
				}],
			});
		});
	}

	desktopTest('keeps an explicit VS Code target on its source installer when Agent Finder is available', async () => {
		const fixture = createHandler({ agentFinderAvailable: true });
		await fixture.handler.handleURL(uri('/install', 'source=github%2Fawesome-copilot&plugin=my-plugin&harness=vscode'));
		assert.deepStrictEqual({ calls: fixture.calls, errors: fixture.errors }, {
			calls: [['vscodeInstall', 'github/awesome-copilot', { plugin: 'my-plugin' }]],
			errors: [],
		});
	});

	desktopTest('adds an Awesome Copilot marketplace without using Agent Finder or creating a session', async () => {
		const fixture = createHandler({ agentFinderAvailable: true });
		await fixture.handler.handleURL(uri('/add-marketplace', 'ref=github%2Fawesome-copilot&harness=copilot'));
		assert.deepStrictEqual({ calls: fixture.calls, errors: fixture.errors }, {
			calls: [
				['list', 'copilotcli', undefined, undefined],
				['add', 'copilotcli', undefined, 'github/awesome-copilot', undefined],
			],
			errors: [],
		});
	});

	desktopTest('resolves a full Awesome Copilot catalog identity through Agent Finder', async () => {
		const catalogIdentity = 'urn:air:github.com:github:awesome-copilot:my-plugin';
		const fixture = createHandler({ agentFinderAvailable: true, managementUnavailable: true, agentFinderIdentity: catalogIdentity.toUpperCase() });
		await fixture.handler.handleURL(uri('/install', `source=github%2Fawesome-copilot&plugin=${encodeURIComponent(catalogIdentity)}`));
		assert.deepStrictEqual({
			calls: fixture.calls,
			errors: fixture.errors,
		}, {
			calls: [
				`agentFinderQuery:${catalogIdentity}:`,
				`install:${sessionResource}:agentFinder/my-plugin-0`,
			],
			errors: [],
		});
	});

	desktopTest('rejects an external listing with the same name from another Agent Finder marketplace', async () => {
		const fixture = createHandler({
			agentFinderAvailable: true,
			agentFinderMatchCount: 0,
			agentFinderProviderPlugin: true,
			agentFinderProviderPluginSource: 'GitHub: other/marketplace',
		});
		await fixture.handler.handleURL(uri('/install', 'source=github%2Fawesome-copilot&plugin=accessibility-agents'));
		assert.deepStrictEqual({
			calls: fixture.calls,
			errors: fixture.errors.length,
			commands: fixture.commands,
		}, {
			calls: [
				'agentFinderQuery:accessibility-agents:',
				'agentFinderBrowse',
			],
			errors: 1,
			commands: [],
		});
	});

	for (const options of [
		{ agentFinderAvailable: false },
		{ agentFinderAvailable: true, agentFinderEnabled: false },
	]) {
		desktopTest(`falls back to the configured Awesome Copilot marketplace when Agent Finder is unavailable: ${JSON.stringify(options)}`, async () => {
			const fixture = createHandler(options);
			await fixture.handler.handleURL(uri('/install', 'source=github%2Fawesome-copilot&plugin=my-plugin'));
			assert.deepStrictEqual({ calls: fixture.calls, errors: fixture.errors }, {
				calls: [
					['list', 'copilotcli', undefined, undefined],
					['add', 'copilotcli', undefined, 'github/awesome-copilot', undefined],
					['browse', 'copilotcli', undefined, 'catalog', undefined],
					['install', 'copilotcli', { source: 'my-plugin@catalog' }, undefined, undefined],
				],
				errors: [],
			});
		});
	}

	desktopTest('resolves an external Awesome Copilot listing through Agent Finder browse metadata', async () => {
		const fixture = createHandler({
			agentFinderAvailable: true,
			managementUnavailable: true,
			agentFinderMatchCount: 0,
			agentFinderProviderPlugin: true,
		});
		await fixture.handler.handleURL(uri('/install', 'source=github%2Fawesome-copilot&plugin=accessibility-agents'));
		assert.deepStrictEqual({
			calls: fixture.calls,
			errors: fixture.errors,
			commands: fixture.commands,
		}, {
			calls: [
				'agentFinderQuery:accessibility-agents:',
				'agentFinderBrowse',
				`install:${sessionResource}:agentFinder/accessibility-agents`,
			],
			errors: [],
			commands: [{
				id: AICustomizationManagementCommands.OpenEditor,
				args: [{ showDiscover: true, sessionType: SessionType.AgentHostCopilot, searchQuery: 'accessibility-agents' }],
			}],
		});
	});

	for (const options of [
		{ agentFinderMatchCount: 0 },
		{ agentFinderMatchCount: 2 },
		{ agentFinderMatchCount: 1, agentFinderIdentity: 'my-plugin' },
		{ agentFinderMatchCount: 1, agentFinderIdentity: 'other-plugin' },
		{ agentFinderMatchCount: 1, agentFinderIdentity: 'urn:air:github.com:other:awesome-copilot:my-plugin' },
		{ agentFinderMatchCount: 1, agentFinderIdentity: null },
		{ agentFinderMatchCount: 1, agentFinderSourceError: true },
	] as const) {
		desktopTest(`rejects invalid Agent Finder resolution without adding the legacy marketplace: ${JSON.stringify(options)}`, async () => {
			const fixture = createHandler({ agentFinderAvailable: true, ...options });
			await fixture.handler.handleURL(uri('/install', 'source=github%2Fawesome-copilot&plugin=my-plugin'));
			assert.deepStrictEqual({
				calls: fixture.calls,
				errors: fixture.errors.length,
				commands: fixture.commands,
			}, {
				calls: options.agentFinderMatchCount === 0 || options.agentFinderIdentity === 'my-plugin' ||
					options.agentFinderIdentity === 'other-plugin' ||
					options.agentFinderIdentity === 'urn:air:github.com:other:awesome-copilot:my-plugin' ||
					options.agentFinderIdentity === null
					? ['agentFinderQuery:my-plugin:', 'agentFinderBrowse']
					: ['agentFinderQuery:my-plugin:'],
				errors: 1,
				commands: [],
			});
		});
	}

	desktopTest('rejects a full Agent Finder identity from another repository', async () => {
		const catalogIdentity = 'urn:air:github.com:other:awesome-copilot:my-plugin';
		const fixture = createHandler({ agentFinderAvailable: true, agentFinderIdentity: catalogIdentity });
		await fixture.handler.handleURL(uri('/install', `source=github%2Fawesome-copilot&plugin=${encodeURIComponent(catalogIdentity)}`));
		assert.deepStrictEqual({
			calls: fixture.calls,
			errors: fixture.errors.length,
			commands: fixture.commands,
		}, {
			calls: [`agentFinderQuery:${catalogIdentity}:`],
			errors: 1,
			commands: [],
		});
	});

	desktopTest('surfaces Agent Finder browse failures without adding the legacy marketplace', async () => {
		const fixture = createHandler({
			agentFinderAvailable: true,
			agentFinderMatchCount: 0,
			agentFinderBrowseError: true,
		});
		await fixture.handler.handleURL(uri('/install', 'source=github%2Fawesome-copilot&plugin=my-plugin'));
		assert.deepStrictEqual({
			calls: fixture.calls,
			errors: fixture.errors.length,
			commands: fixture.commands,
		}, {
			calls: ['agentFinderQuery:my-plugin:', 'agentFinderBrowse'],
			errors: 1,
			commands: [],
		});
	});

	desktopTest('deduplicates an external Awesome Copilot listing across Agent Finder browse sections', async () => {
		const fixture = createHandler({
			agentFinderAvailable: true,
			managementUnavailable: true,
			agentFinderMatchCount: 0,
			agentFinderProviderPlugin: true,
			agentFinderBrowseDuplicate: true,
		});
		await fixture.handler.handleURL(uri('/install', 'source=github%2Fawesome-copilot&plugin=accessibility-agents'));
		assert.deepStrictEqual({
			calls: fixture.calls,
			errors: fixture.errors,
		}, {
			calls: [
				'agentFinderQuery:accessibility-agents:',
				'agentFinderBrowse',
				`install:${sessionResource}:agentFinder/accessibility-agents`,
			],
			errors: [],
		});
	});

	desktopTest('follows Agent Finder pagination to find an exact catalog identity', async () => {
		const fixture = createHandler({ agentFinderAvailable: true, agentFinderPaginated: true });
		await fixture.handler.handleURL(uri('/install', 'source=github%2Fawesome-copilot&plugin=my-plugin'));
		assert.deepStrictEqual({ calls: fixture.calls, errors: fixture.errors }, {
			calls: [
				'agentFinderQuery:my-plugin:',
				'agentFinderQuery:my-plugin:next',
				`install:${sessionResource}:agentFinder/my-plugin-0`,
			],
			errors: [],
		});
	});

	desktopTest('surfaces Agent Finder query failures without adding the legacy marketplace', async () => {
		const fixture = createHandler({ agentFinderAvailable: true, failure: 'agentFinderQuery' });
		await fixture.handler.handleURL(uri('/install', 'source=github%2Fawesome-copilot&plugin=my-plugin'));
		assert.deepStrictEqual({ calls: fixture.calls, errors: fixture.errors.length, commands: fixture.commands }, {
			calls: ['agentFinderQuery:my-plugin:'],
			errors: 1,
			commands: [],
		});
	});

	desktopTest('preserves a pinned Awesome Copilot reference on the configured marketplace path', async () => {
		const fixture = createHandler({ agentFinderAvailable: true });
		await fixture.handler.handleURL(uri('/install', 'source=github%2Fawesome-copilot%23v1.2.3&plugin=my-plugin'));
		assert.deepStrictEqual({ calls: fixture.calls, errors: fixture.errors }, {
			calls: [
				['list', 'copilotcli', undefined, undefined],
				['add', 'copilotcli', undefined, 'github/awesome-copilot#v1.2.3', undefined],
				['browse', 'copilotcli', undefined, 'catalog', undefined],
				['install', 'copilotcli', { source: 'my-plugin@catalog' }, undefined, undefined],
			],
			errors: [],
		});
	});

	for (const source of ['GitHub: github/awesome-copilot', 'URL: https://github.com/GitHub/Awesome-Copilot.git']) {
		for (const path of ['/install', '/add-marketplace']) {
			desktopTest(`reuses the built-in published Awesome Copilot marketplace for ${path}: ${source}`, async () => {
				const fixture = createHandler({
					existingMarketplaceSource: source,
					existingMarketplaceIsDefault: true,
					agentFinderAvailable: true,
					failure: 'add',
				});
				await fixture.handler.handleURL(uri(path, 'source=github%2Fawesome-copilot%23marketplace&ref=github%2Fawesome-copilot%23marketplace&plugin=my-plugin&harness=copilot'));
				assert.deepStrictEqual({ calls: fixture.calls, errors: fixture.errors }, {
					calls: [
						['list', 'copilotcli', undefined, undefined],
						...(path === '/install' ? [
							['browse', 'copilotcli', undefined, 'catalog', undefined],
							['install', 'copilotcli', { source: 'my-plugin@catalog' }, undefined, undefined],
						] : []),
					],
					errors: [],
				});
			});
		}
	}

	for (const [source, isDefault, revision, managed] of [
		['GitHub: github/awesome-copilot', true, 'feature/beta', false],
		['GitHub: github/awesome-copilot#other', true, 'marketplace', false],
		['GitHub: github/awesome-copilot', false, 'marketplace', false],
		['GitHub: github/awesome-copilot', true, 'marketplace', true],
	] as const) {
		desktopTest(`does not substitute ${source} for revision ${revision} (default: ${isDefault}, managed: ${managed})`, async () => {
			const fixture = createHandler({ existingMarketplaceSource: source, existingMarketplaceIsDefault: isDefault, existingMarketplaceManaged: managed, failure: 'add' });
			await fixture.handler.handleURL(uri('/install', `source=${encodeURIComponent(`github/awesome-copilot#${revision}`)}&plugin=my-plugin&harness=copilot`));
			assert.deepStrictEqual({ calls: fixture.calls, errors: fixture.errors.length }, {
				calls: [
					['list', 'copilotcli', undefined, undefined],
					['add', 'copilotcli', undefined, `github/awesome-copilot#${revision}`, undefined],
				],
				errors: 1,
			});
		});
	}

	desktopTest('does not duplicate a configured VS Code marketplace', async () => {
		const fixture = createHandler({ harness: 'vscode', existingMarketplaceSource: 'https://github.com/ACME/plugins.git#feature/beta' });
		await fixture.handler.handleURL(uri('/add-marketplace', 'ref=acme%2Fplugins%23feature%2Fbeta'));
		assert.deepStrictEqual(fixture.configuration.getValue(ChatConfiguration.PluginMarketplaces), ['https://github.com/ACME/plugins.git#feature/beta']);
	});

	for (const harness of ['copilot', 'vscode'] as const) {
		for (const path of ['/install', '/add-marketplace']) {
			desktopTest(`an explicit ${harness} target skips the picker but still requires consent for ${path}`, async () => {
				const fixture = createHandler({ harness: harness === 'copilot' ? 'vscode' : 'copilot', confirmed: false });
				await fixture.handler.handleURL(uri(path, `source=acme/plugins&ref=acme/plugins&plugin=my-plugin&harness=${harness}`));
				assert.deepStrictEqual({ picks: fixture.picks.length, dialogs: fixture.dialogs.length, calls: fixture.calls, commands: fixture.commands, errors: fixture.errors }, {
					picks: 0, dialogs: 1, calls: [], commands: [], errors: [],
				});
				assert.ok(typeof fixture.dialogs[0].detail === 'string' && fixture.dialogs[0].detail.includes(harness === 'copilot' ? 'Copilot\'s user installation' : 'VS Code\'s shared plugin installation'));
			});
		}
	}

	desktopTest('cancelling owner selection performs no mutations or confirmation', async () => {
		const fixture = createHandler({ cancelPicker: true });
		await fixture.handler.handleURL(uri());
		assert.deepStrictEqual({ calls: fixture.calls, dialogs: fixture.dialogs, errors: fixture.errors, commands: fixture.commands }, {
			calls: [], dialogs: [], errors: [], commands: [],
		});
	});

	desktopTest('does not mutate anything while consent is pending', async () => {
		const confirmation = new DeferredPromise<boolean>();
		const fixture = createHandler({ confirmation: confirmation.p });
		const handling = fixture.handler.handleURL(uri('/install', 'source=acme/plugins&plugin=my-plugin'));
		await Promise.resolve();
		assert.deepStrictEqual(fixture.calls, []);
		await confirmation.complete(false);
		await handling;
		assert.deepStrictEqual({ calls: fixture.calls, commands: fixture.commands, errors: fixture.errors }, { calls: [], commands: [], errors: [] });
	});

	desktopTest('rechecks plugin availability after consent', async () => {
		const confirmation = new DeferredPromise<boolean>();
		const fixture = createHandler({ confirmation: confirmation.p });
		const handling = fixture.handler.handleURL(uri('/install', 'source=acme/plugins&plugin=my-plugin'));
		await fixture.configuration.setUserConfiguration(ChatConfiguration.PluginsEnabled, false);
		await confirmation.complete(true);
		await handling;
		assert.deepStrictEqual({ calls: fixture.calls, commands: fixture.commands, errors: fixture.errors.length }, { calls: [], commands: [], errors: 1 });
	});

	for (const harness of ['copilot', 'vscode'] as const) {
		desktopTest(`declining consent does not access the ${harness} installer`, async () => {
			const fixture = createHandler({ harness, confirmed: false });
			await fixture.handler.handleURL(uri('/install', 'source=acme/plugins&plugin=my-plugin'));
			assert.deepStrictEqual({ calls: fixture.calls, commands: fixture.commands, errors: fixture.errors }, { calls: [], commands: [], errors: [] });
		});
	}

	for (const query of ['', 'ref=invalid', 'ref=file:///local/repo', 'ref=acme/plugins&ref=evil/plugins', 'ref=acme/plugins&harness=', 'ref=acme/plugins&harness=claude', 'ref=acme/plugins&harness=copilot&harness=vscode']) {
		test(`rejects invalid marketplace or harness input: ${query}`, async () => {
			const fixture = createHandler();
			await fixture.handler.handleURL(uri('/add-marketplace', query));
			assert.deepStrictEqual({ calls: fixture.calls, dialogs: fixture.dialogs.length, picks: fixture.picks.length, errors: fixture.errors.length }, {
				calls: [], dialogs: 0, picks: 0, errors: 1,
			});
		});
	}

	for (const query of ['source=acme/plugins', 'source=acme/plugins&plugin=', 'source=acme/plugins&plugin=one&plugin=two', 'source=acme/plugins&plugin=evil%40other', 'source=acme/plugins&plugin=evil%0Aname']) {
		test(`requires an unambiguous plugin name: ${query}`, async () => {
			const fixture = createHandler();
			await fixture.handler.handleURL(uri('/install', query));
			assert.deepStrictEqual({ calls: fixture.calls, dialogs: fixture.dialogs.length, errors: fixture.errors.length }, { calls: [], dialogs: 0, errors: 1 });
		});
	}

	for (const options of [{ hidden: true }, { disabledInWorkspace: true }, { pluginsEnabled: false }, { remoteAuthority: 'ssh-remote+host' }]) {
		test(`rejects disabled or nonlocal flows before owner selection: ${JSON.stringify(options)}`, async () => {
			const fixture = createHandler(options);
			await fixture.handler.handleURL(uri());
			assert.deepStrictEqual({ calls: fixture.calls, picks: fixture.picks.length, errors: fixture.errors.length }, { calls: [], picks: 0, errors: 1 });
		});
	}

	for (const options of [{ managementUnavailable: true }, { installUnavailable: true }]) {
		desktopTest(`reports unavailable Copilot capabilities without switching owners: ${JSON.stringify(options)}`, async () => {
			const fixture = createHandler(options);
			await fixture.handler.handleURL(uri('/install', 'source=acme/plugins&plugin=my-plugin'));
			assert.deepStrictEqual({ calls: fixture.calls, errors: fixture.errors.length, commands: fixture.commands }, { calls: [], errors: 1, commands: [] });
		});
	}

	desktopTest('reports a missing plugin without installing a different one', async () => {
		const fixture = createHandler();
		await fixture.handler.handleURL(uri('/install', 'source=acme/plugins&plugin=missing'));
		assert.deepStrictEqual({ calls: fixture.calls, errors: fixture.errors.length, commands: fixture.commands }, {
			calls: [['list', 'copilotcli', undefined, undefined], ['add', 'copilotcli', undefined, 'acme/plugins', undefined], ['browse', 'copilotcli', undefined, 'catalog', undefined]],
			errors: 1,
			commands: [],
		});
	});

	for (const failure of ['list', 'add', 'browse', 'install'] as const) {
		desktopTest(`surfaces ${failure} failures without switching owners`, async () => {
			const fixture = createHandler({ failure });
			await fixture.handler.handleURL(uri('/install', 'source=acme/plugins&plugin=my-plugin'));
			assert.deepStrictEqual({ errors: fixture.errors.length, commands: fixture.commands, usedVSCode: fixture.calls.some(call => Array.isArray(call) && call[0] === 'vscodeInstall') }, {
				errors: 1, commands: [], usedVSCode: false,
			});
		});
	}

	desktopTest('reports the VS Code installer error', async () => {
		const fixture = createHandler({ harness: 'vscode', installResult: { success: false, message: 'Installation failed' } });
		await fixture.handler.handleURL(uri('/install', 'source=acme/plugins&plugin=my-plugin'));
		assert.deepStrictEqual({ errors: fixture.errors, commands: fixture.commands }, { errors: ['Unable to complete the plugin link: Installation failed'], commands: [] });
	});

	desktopTest('respects marketplace trust refusal for VS Code', async () => {
		const fixture = createHandler({ harness: 'vscode', marketplaceTrusted: false });
		await fixture.handler.handleURL(uri());
		assert.deepStrictEqual({ marketplaces: fixture.configuration.getValue(ChatConfiguration.PluginMarketplaces), errors: fixture.errors, commands: fixture.commands }, {
			marketplaces: [], errors: [], commands: [],
		});
	});

	desktopTest('does not report user cancellation as an error', async () => {
		const fixture = createHandler({ failure: 'add', cancelled: true });
		await fixture.handler.handleURL(uri());
		assert.deepStrictEqual({ errors: fixture.errors, commands: fixture.commands }, { errors: [], commands: [] });
	});
});
