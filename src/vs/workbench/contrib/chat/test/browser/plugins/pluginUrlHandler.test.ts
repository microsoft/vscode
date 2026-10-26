/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { encodeBase64, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CustomizationMarketplaceMediaType } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { IConfirmation, IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IURLService } from '../../../../../../platform/url/common/url.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IHostService } from '../../../../../services/host/browser/host.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IAgentSessionsModel, IAgentSession } from '../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../browser/agentSessions/agentSessionsService.js';
import { IAgentHostNewSessionFolderService } from '../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { PluginUrlHandler } from '../../../browser/pluginUrlHandler.js';
import { AICustomizationManagementCommands } from '../../../common/aiCustomizationWorkspaceService.js';
import { IChatSessionsService, NEW_SESSION_IN_AGENTS_WINDOW_COMMAND_ID, SessionType } from '../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ICustomizationHarnessService, ICustomizationMarketplaceManagementProvider, IHarnessDescriptor } from '../../../common/customizationHarnessService.js';
import { ICustomizationMarketplaceInstallProvider } from '../../../common/customizationMarketplaceInstallService.js';

suite('PluginUrlHandler', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sessionResource = URI.parse(`${SessionType.AgentHostCopilot}:/existing`);
	const draftResource = URI.parse(`${SessionType.AgentHostCopilot}:/untitled-new`);
	const backendResource = URI.parse('ahp-session:/opaque-backend');
	const agentsDraftResource = URI.parse(`${SessionType.AgentHostCopilot}:/agents-draft`);

	function createHandler(options: {
		activeResource?: URI;
		existingSession?: boolean;
		existingMarketplaceSource?: string;
		archivedSession?: boolean;
		provisional?: URI;
		confirmations?: boolean[];
		confirmation?: Promise<boolean>;
		hidden?: boolean;
		disabledInWorkspace?: boolean;
		pluginsEnabled?: boolean;
		available?: boolean;
		managementUnavailable?: boolean;
		installUnavailable?: boolean;
		pluginMissing?: boolean;
		paginated?: boolean;
		createFailed?: boolean;
		isSessionsWindow?: boolean;
		backendFailed?: boolean;
		failure?: 'list' | 'add' | 'query' | 'install';
		cancelled?: boolean;
	} = {}) {
		const instantiationService = store.add(new TestInstantiationService());
		const calls: string[] = [];
		const dialogs: IConfirmation[] = [];
		const errors: string[] = [];
		const commands: { id: string; args: unknown[] }[] = [];
		const confirmations = [...(options.confirmations ?? [true, true])];
		const fail = (phase: typeof options.failure) => {
			if (phase === options.failure) {
				throw options.cancelled ? new CancellationError() : new Error(`${phase} failed`);
			}
		};

		const managementProvider: ICustomizationMarketplaceManagementProvider = {
			onDidChange: Event.None,
			list: async () => {
				fail('list');
				return options.existingMarketplaceSource ? [{
					name: 'catalog',
					source: options.existingMarketplaceSource,
					isDefault: false,
					managed: false,
					available: true,
				}] : [];
			},
			add: async (session, source) => {
				calls.push(`add:${session}:${source}`);
				fail('add');
				return { name: 'catalog', source, isDefault: false, managed: false, available: true };
			},
			queryMarketplace: async (session, marketplace, query) => {
				calls.push(`query:${session}:${marketplace.name}:${query.cursor ?? ''}`);
				fail('query');
				return {
					items: options.pluginMissing || (options.paginated && !query.cursor) ? [] : [{
						identifier: 'catalog/my-plugin',
						displayName: 'My Plugin',
						description: '',
						mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
						tags: [],
						capabilities: [],
						representativeQueries: [],
						installation: { kind: 'providerPlugin', name: 'my-plugin', marketplace: marketplace.name, marketplaceSource: marketplace.source },
					}],
					nextCursor: options.paginated && !query.cursor ? 'next' : undefined,
				};
			},
			remove: async () => ({ removed: false }),
			refresh: async () => [],
		};
		const installProvider: ICustomizationMarketplaceInstallProvider = {
			onDidChange: Event.None,
			getInstallations: async () => [],
			install: async (session, resource) => {
				calls.push(`install:${session}:${resource.identifier}`);
				fail('install');
			},
			repair: async () => { },
			uninstall: async () => { },
		};
		const harness: IHarnessDescriptor = {
			id: SessionType.AgentHostCopilot,
			label: 'Copilot',
			icon: { id: 'copilot' },
			marketplaceManagementProvider: options.managementUnavailable ? undefined : managementProvider,
			marketplaceInstallProvider: options.installUnavailable ? undefined : installProvider,
		};
		instantiationService.stub(ICustomizationHarnessService, {
			activeSessionResource: observableValue('activeSession', options.activeResource ?? sessionResource),
			getDescriptorForSession: () => harness,
		});
		const existing = new class extends mock<IAgentSession>() {
			override readonly resource = sessionResource;
			override readonly providerType = SessionType.AgentHostCopilot;
			override isArchived() { return options.archivedSession ?? false; }
		}();
		instantiationService.stub(IAgentSessionsService, {
			model: new class extends mock<IAgentSessionsModel>() {
				override readonly sessions = options.existingSession ? [existing] : [];
				override async resolve() { calls.push('resolve'); }
			}(),
		});
		instantiationService.stub(IChatSessionsService, {
			canResolveChatSession: async type => {
				assert.strictEqual(type, SessionType.AgentHostCopilot);
				return options.available ?? true;
			},
		});
		instantiationService.stub(IAgentHostUntitledProvisionalSessionService, {
			get: () => options.provisional,
			getOrCreate: async (resource, provider, folder) => {
				calls.push(`create:${resource}:${provider}:${folder}`);
				return options.backendFailed ? undefined : backendResource;
			},
		});
		instantiationService.stub(IAgentHostNewSessionFolderService, {
			resolveNewSessionPrimary: () => URI.file('/workspace'),
		});
		instantiationService.stub(IURLService, { registerHandler: () => ({ dispose() { } }) });
		instantiationService.stub(IDialogService, {
			confirm: async confirmation => {
				dialogs.push(confirmation);
				return { confirmed: options.confirmation ? await options.confirmation : confirmations.shift() ?? false };
			},
		});
		instantiationService.stub(IConfigurationService, new TestConfigurationService({
			[ChatConfiguration.PluginsEnabled]: options.pluginsEnabled ?? true,
		}));
		instantiationService.stub(IChatEntitlementService, { sentiment: { hidden: options.hidden, disabledInWorkspace: options.disabledInWorkspace } });
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() { }());
		instantiationService.stub(ICommandService, 'executeCommand', async (id: string, ...args: unknown[]) => {
			commands.push({ id, args });
			if (id === NEW_SESSION_IN_AGENTS_WINDOW_COMMAND_ID) {
				return options.createFailed ? undefined : agentsDraftResource;
			}
			if (id === `workbench.action.chat.openNewSessionEditor.${SessionType.AgentHostCopilot}`) {
				return options.createFailed ? undefined : draftResource;
			}
			assert.strictEqual(id, AICustomizationManagementCommands.OpenEditor);
			return undefined;
		});
		instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow: options.isSessionsWindow ?? false });
		instantiationService.stub(IHostService, { focus: async () => { } });
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(INotificationService, { error: message => { errors.push(String(message)); } });
		return { handler: store.add(instantiationService.createInstance(PluginUrlHandler)), calls, dialogs, errors, commands };
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

	for (const source of ['acme/plugins', encodeBase64(VSBuffer.fromString('acme/plugins')), 'https://github.com/acme/plugins.git']) {
		test(`adds marketplace through the active harness: ${source}`, async () => {
			const fixture = createHandler();
			assert.strictEqual(await fixture.handler.handleURL(uri('/add-marketplace', `ref=${encodeURIComponent(source)}`)), true);
			assert.deepStrictEqual({
				calls: fixture.calls,
				dialogs: fixture.dialogs.length,
				errors: fixture.errors,
				commands: fixture.commands,
			}, {
				calls: [`add:${sessionResource}:${source.startsWith('https:') ? source : 'acme/plugins'}`],
				dialogs: 1,
				errors: [],
				commands: [{
					id: AICustomizationManagementCommands.OpenEditor,
					args: [{ showDiscover: true, sessionResource, searchQuery: '' }],
				}],
			});
		});
	}

	test('adds the marketplace before installing the exact catalog plugin', async () => {
		const fixture = createHandler({ paginated: true });
		await fixture.handler.handleURL(uri('/install', 'source=acme/plugins&plugin=my-plugin'));
		assert.deepStrictEqual(fixture.calls, [
			`add:${sessionResource}:acme/plugins`,
			`query:${sessionResource}:catalog:`,
			`query:${sessionResource}:catalog:next`,
			`install:${sessionResource}:catalog/my-plugin`,
		]);
		assert.ok(fixture.dialogs[0].message.includes('my-plugin'));
		assert.deepStrictEqual(fixture.errors, []);
	});

	for (const existingMarketplaceSource of ['acme/plugins', 'https://github.com/ACME/plugins.git', 'GitHub: acme/plugins', 'URL: https://github.com/ACME/plugins.git']) {
		test(`reuses the registered marketplace and opens customizations in the Agents window: ${existingMarketplaceSource}`, async () => {
			const fixture = createHandler({ existingMarketplaceSource, isSessionsWindow: true });
			await fixture.handler.handleURL(uri('/install', 'source=acme/plugins&plugin=my-plugin'));
			assert.deepStrictEqual({
				calls: fixture.calls,
				commands: fixture.commands,
				errors: fixture.errors,
			}, {
				calls: [`query:${sessionResource}:catalog:`, `install:${sessionResource}:catalog/my-plugin`],
				commands: [{
					id: AICustomizationManagementCommands.OpenEditor,
					args: [{ showDiscover: true, sessionResource, searchQuery: 'my-plugin' }],
				}],
				errors: [],
			});
		});
	}

	test('opens customizations for an already registered add-only marketplace', async () => {
		const fixture = createHandler({ existingMarketplaceSource: 'GitHub: acme/plugins', isSessionsWindow: true });
		await fixture.handler.handleURL(uri());
		assert.deepStrictEqual({ calls: fixture.calls, commands: fixture.commands, errors: fixture.errors }, {
			calls: [],
			commands: [{
				id: AICustomizationManagementCommands.OpenEditor,
				args: [{ showDiscover: true, sessionResource, searchQuery: '' }],
			}],
			errors: [],
		});
	});

	test('does not reuse a registered marketplace at a different revision', async () => {
		const fixture = createHandler({ existingMarketplaceSource: 'GitHub: acme/plugins#other' });
		await fixture.handler.handleURL(uri());
		assert.deepStrictEqual({ calls: fixture.calls, errors: fixture.errors }, {
			calls: [`add:${sessionResource}:acme/plugins`],
			errors: [],
		});
	});

	test('does not mutate anything while consent is pending', async () => {
		const confirmation = new DeferredPromise<boolean>();
		const fixture = createHandler({ confirmation: confirmation.p });
		const handling = fixture.handler.handleURL(uri('/install', 'source=acme/plugins&plugin=my-plugin'));
		await Promise.resolve();
		assert.deepStrictEqual(fixture.calls, []);
		await confirmation.complete(false);
		await handling;
		assert.deepStrictEqual({ calls: fixture.calls, commands: fixture.commands, errors: fixture.errors }, { calls: [], commands: [], errors: [] });
	});

	for (const path of ['/add-marketplace', '/install']) {
		test(`declining ${path} does not access the harness or create a session`, async () => {
			const fixture = createHandler({ activeResource: URI.parse('local:/session'), confirmations: [false] });
			await fixture.handler.handleURL(uri(path, 'ref=acme/plugins&source=acme/plugins&plugin=my-plugin'));
			assert.deepStrictEqual({ calls: fixture.calls, commands: fixture.commands, errors: fixture.errors }, { calls: [], commands: [], errors: [] });
		});
	}

	for (const query of ['', 'ref=invalid', 'ref=file:///local/repo', 'ref=acme/plugins&ref=evil/plugins']) {
		test(`rejects invalid marketplace input: ${query}`, async () => {
			const fixture = createHandler();
			await fixture.handler.handleURL(uri('/add-marketplace', query));
			assert.deepStrictEqual({ calls: fixture.calls, dialogs: fixture.dialogs.length, errors: fixture.errors.length }, { calls: [], dialogs: 0, errors: 1 });
		});
	}

	for (const query of ['source=acme/plugins', 'source=acme/plugins&plugin=', 'source=acme/plugins&plugin=one&plugin=two', 'source=acme/plugins&plugin=evil%40other', 'source=acme/plugins&plugin=evil%0Aname']) {
		test(`requires an unambiguous plugin name: ${query}`, async () => {
			const fixture = createHandler();
			await fixture.handler.handleURL(uri('/install', query));
			assert.deepStrictEqual({ calls: fixture.calls, dialogs: fixture.dialogs.length, errors: fixture.errors.length }, { calls: [], dialogs: 0, errors: 1 });
		});
	}

	test('reuses an existing Copilot session rather than the non-Copilot active harness', async () => {
		const fixture = createHandler({ activeResource: URI.parse(`${SessionType.AgentHostClaude}:/session`), existingSession: true });
		await fixture.handler.handleURL(uri());
		assert.deepStrictEqual({ calls: fixture.calls, dialogs: fixture.dialogs.length }, {
			calls: ['resolve', `add:${sessionResource}:acme/plugins`],
			dialogs: 1,
		});
	});

	test('uses an existing provisional backend identity unchanged', async () => {
		const fixture = createHandler({ activeResource: draftResource, provisional: backendResource });
		await fixture.handler.handleURL(uri());
		assert.deepStrictEqual(fixture.calls, [`add:${backendResource}:acme/plugins`]);
	});

	test('asks before creating a session and uses its backend identity', async () => {
		const fixture = createHandler({ activeResource: URI.parse('local:/session') });
		await fixture.handler.handleURL(uri('/install', 'source=acme/plugins&plugin=my-plugin'));
		assert.deepStrictEqual({
			calls: fixture.calls,
			dialogs: fixture.dialogs.length,
			firstCommand: fixture.commands[0].id,
			errors: fixture.errors,
		}, {
			calls: ['resolve', `create:${draftResource}:copilotcli:file:///workspace`, `add:${backendResource}:acme/plugins`, `query:${backendResource}:catalog:`, `install:${backendResource}:catalog/my-plugin`],
			dialogs: 2,
			firstCommand: `workbench.action.chat.openNewSessionEditor.${SessionType.AgentHostCopilot}`,
			errors: [],
		});
	});

	test('declining session creation does not add a marketplace', async () => {
		const fixture = createHandler({ activeResource: draftResource, confirmations: [true, false] });
		await fixture.handler.handleURL(uri());
		assert.deepStrictEqual({ calls: fixture.calls, commands: fixture.commands, errors: fixture.errors }, { calls: ['resolve'], commands: [], errors: [] });
	});

	test('uses the Agents-window new session command without creating a second backend', async () => {
		const fixture = createHandler({ activeResource: URI.parse('local:/session'), isSessionsWindow: true });
		await fixture.handler.handleURL(uri('/install', 'source=acme/plugins&plugin=my-plugin'));
		assert.deepStrictEqual({
			calls: fixture.calls,
			dialogs: fixture.dialogs.length,
			commands: fixture.commands,
			errors: fixture.errors,
		}, {
			calls: ['resolve', `add:${agentsDraftResource}:acme/plugins`, `query:${agentsDraftResource}:catalog:`, `install:${agentsDraftResource}:catalog/my-plugin`],
			dialogs: 2,
			commands: [{
				id: NEW_SESSION_IN_AGENTS_WINDOW_COMMAND_ID,
				args: [{ noWorkspace: true, agentHostProvider: 'copilotcli' }],
			}, {
				id: AICustomizationManagementCommands.OpenEditor,
				args: [{ showDiscover: true, sessionResource: agentsDraftResource, searchQuery: 'my-plugin' }],
			}],
			errors: [],
		});
	});

	test('declining session creation in the Agents window does not invoke a command', async () => {
		const fixture = createHandler({ activeResource: draftResource, isSessionsWindow: true, confirmations: [true, false] });
		await fixture.handler.handleURL(uri());
		assert.deepStrictEqual({ commands: fixture.commands, calls: fixture.calls, errors: fixture.errors }, { commands: [], calls: ['resolve'], errors: [] });
	});

	test('does not reuse archived sessions without asking to create a new one', async () => {
		const fixture = createHandler({ activeResource: URI.parse('local:/session'), existingSession: true, archivedSession: true, confirmations: [true, false] });
		await fixture.handler.handleURL(uri());
		assert.deepStrictEqual({ calls: fixture.calls, dialogs: fixture.dialogs.length, commands: fixture.commands }, { calls: ['resolve'], dialogs: 2, commands: [] });
	});

	for (const options of [
		{ hidden: true },
		{ disabledInWorkspace: true },
		{ pluginsEnabled: false },
		{ activeResource: draftResource, available: false },
		{ activeResource: draftResource, createFailed: true },
		{ activeResource: draftResource, isSessionsWindow: true, createFailed: true },
		{ activeResource: draftResource, backendFailed: true },
		{ managementUnavailable: true },
		{ installUnavailable: true },
	]) {
		test(`reports unsupported or unavailable flows: ${JSON.stringify(options)}`, async () => {
			const fixture = createHandler(options);
			await fixture.handler.handleURL(uri('/install', 'source=acme/plugins&plugin=my-plugin'));
			assert.deepStrictEqual({ mutations: fixture.calls.filter(call => /^(add|install):/.test(call)), errors: fixture.errors.length }, { mutations: [], errors: 1 });
		});
	}

	test('reports a missing exact plugin without installing another plugin', async () => {
		const fixture = createHandler();
		await fixture.handler.handleURL(uri('/install', 'source=acme/plugins&plugin=missing'));
		assert.deepStrictEqual({
			calls: fixture.calls,
			errors: fixture.errors.length,
			commands: fixture.commands,
		}, {
			calls: [`add:${sessionResource}:acme/plugins`, `query:${sessionResource}:catalog:`],
			errors: 1,
			commands: [],
		});
	});

	for (const failure of ['list', 'add', 'query', 'install'] as const) {
		test(`surfaces ${failure} failures without a legacy fallback`, async () => {
			const fixture = createHandler({ failure });
			await fixture.handler.handleURL(uri('/install', 'source=acme/plugins&plugin=my-plugin'));
			assert.deepStrictEqual({ errors: fixture.errors.length, commands: fixture.commands }, { errors: 1, commands: [] });
		});
	}

	test('does not report user cancellation as an error', async () => {
		const fixture = createHandler({ failure: 'add', cancelled: true });
		await fixture.handler.handleURL(uri());
		assert.deepStrictEqual({ errors: fixture.errors, commands: fixture.commands }, { errors: [], commands: [] });
	});
});
