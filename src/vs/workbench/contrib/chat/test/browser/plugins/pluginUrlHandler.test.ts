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
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CustomizationMarketplaceMediaType } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { IConfirmation, IDialogService, IPrompt } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IURLService } from '../../../../../../platform/url/common/url.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IHostService } from '../../../../../services/host/browser/host.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IAgentHostNewSessionFolderService } from '../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { PluginUrlHandler } from '../../../browser/pluginUrlHandler.js';
import { AICustomizationManagementCommands } from '../../../common/aiCustomizationWorkspaceService.js';
import { IChatSessionsService, NEW_SESSION_IN_AGENTS_WINDOW_COMMAND_ID, SessionType } from '../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ICustomizationHarnessService, ICustomizationMarketplaceManagementProvider, IHarnessDescriptor } from '../../../common/customizationHarnessService.js';
import { ICustomizationMarketplaceInstallProvider } from '../../../common/customizationMarketplaceInstallService.js';
import { IInstallPluginFromSourceResult, IPluginInstallService } from '../../../common/plugins/pluginInstallService.js';

suite('PluginUrlHandler', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sessionResource = URI.parse(`${SessionType.AgentHostCopilot}:/existing`);
	const draftResource = URI.parse(`${SessionType.AgentHostCopilot}:/untitled-new`);
	const backendResource = URI.parse('ahp-session:/opaque-backend');
	const agentsDraftResource = URI.parse(`${SessionType.AgentHostCopilot}:/agents-draft`);

	function createHandler(options: {
		activeResource?: URI;
		existingMarketplaceSource?: string;
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
		target?: 'vscode' | 'copilot' | 'manual' | 'cancel';
		copyManual?: boolean;
		remoteAuthority?: string;
		trusted?: boolean;
		legacyInstallResult?: IInstallPluginFromSourceResult;
		userMarketplaces?: readonly string[];
	} = {}) {
		const instantiationService = store.add(new TestInstantiationService());
		const calls: string[] = [];
		const dialogs: IConfirmation[] = [];
		const errors: string[] = [];
		const commands: { id: string; args: unknown[] }[] = [];
		const picks: (readonly IQuickPickItem[])[] = [];
		const activeItems: (string | undefined)[] = [];
		const manualPrompts: { message: string; detail: string | undefined }[] = [];
		const copied: string[] = [];
		const activeSessionResource = observableValue('activeSession', options.activeResource ?? sessionResource);
		const confirmations = [...(options.confirmations ?? [true, true])];
		const fail = (phase: typeof options.failure) => {
			if (phase === options.failure) {
				throw options.cancelled ? new CancellationError() : new Error(`${phase} failed`);
			}
		};

		const managementProvider: ICustomizationMarketplaceManagementProvider = {
			onDidChange: Event.None,
			onDidChangeMarketplaces: Event.None,
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
			activeSessionResource,
			getDescriptorForSession: () => harness,
		});
		instantiationService.stub(IQuickInputService, new class extends mock<IQuickInputService>() { }());
		instantiationService.stub(IQuickInputService, 'pick', async (items: readonly IQuickPickItem[], pickOptions: { activeItem?: IQuickPickItem }) => {
			picks.push([...items]);
			activeItems.push(pickOptions.activeItem?.id);
			return items.find(item => item.id === (options.target ?? 'copilot'));
		});
		instantiationService.stub(IClipboardService, { writeText: async text => { copied.push(text); } });
		instantiationService.stub(IPluginInstallService, {
			ensureMarketplaceTrusted: async reference => {
				calls.push(`trust:${reference.rawValue}`);
				return options.trusted ?? true;
			},
			installPluginFromSource: async (source, installOptions) => {
				calls.push(`legacyInstall:${source}:${installOptions?.plugin}`);
				return options.legacyInstallResult ?? { success: true };
			},
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
		instantiationService.stub(IDialogService, 'prompt', async (prompt: IPrompt<void>) => {
			assert.strictEqual(prompt.custom, true);
			manualPrompts.push({ message: prompt.message, detail: typeof prompt.detail === 'string' ? prompt.detail : prompt.detail?.value });
			if (options.copyManual) {
				await prompt.buttons?.[0].run({ checkboxChecked: false });
			}
			return { result: undefined };
		});
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.PluginsEnabled]: options.pluginsEnabled ?? true,
			[ChatConfiguration.PluginMarketplaces]: options.userMarketplaces ?? [],
		});
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IConfigurationService, 'updateValue', (key: string, value: readonly (string | object)[]) => configurationService.setUserConfiguration(key, value));
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
		instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow: options.isSessionsWindow ?? false, remoteAuthority: options.remoteAuthority });
		instantiationService.stub(IHostService, { focus: async () => { } });
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(INotificationService, { error: message => { errors.push(String(message)); }, info: () => { } });
		return { handler: store.add(instantiationService.createInstance(PluginUrlHandler)), calls, dialogs, errors, commands, picks, activeItems, manualPrompts, copied, configurationService, activeSessionResource };
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

	for (const [source, expectedSource] of [
		['acme/plugins', 'acme/plugins'],
		[encodeBase64(VSBuffer.fromString('acme/plugins')), 'acme/plugins'],
		['https://github.com/acme/plugins.git', 'https://github.com/acme/plugins.git'],
		['acme/plugins#feature/beta', 'acme/plugins#feature/beta'],
		[encodeBase64(VSBuffer.fromString('acme/plugins#feature/beta')), 'acme/plugins#feature/beta'],
		['https://github.com/acme/plugins.git#v1.2.3', 'https://github.com/acme/plugins.git#v1.2.3'],
	]) {
		test(`adds marketplace through the active harness: ${source}`, async () => {
			const fixture = createHandler();
			assert.strictEqual(await fixture.handler.handleURL(uri('/add-marketplace', `ref=${encodeURIComponent(source)}`)), true);
			assert.deepStrictEqual({
				calls: fixture.calls,
				dialogs: fixture.dialogs.length,
				errors: fixture.errors,
				commands: fixture.commands,
			}, {
				calls: [`add:${sessionResource}:${expectedSource}`],
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

	for (const existingMarketplaceSource of ['GitHub: acme/plugins', 'GitHub: acme/plugins#other']) {
		test(`registers the requested revision before installing from ${existingMarketplaceSource}`, async () => {
			const fixture = createHandler({ existingMarketplaceSource });
			await fixture.handler.handleURL(uri('/install', 'source=acme%2Fplugins%23feature%2Fbeta&plugin=my-plugin'));
			assert.deepStrictEqual({ calls: fixture.calls, errors: fixture.errors }, {
				calls: [
					`add:${sessionResource}:acme/plugins#feature/beta`,
					`query:${sessionResource}:catalog:`,
					`install:${sessionResource}:catalog/my-plugin`,
				],
				errors: [],
			});
		});
	}

	test('reuses an exact registered revision', async () => {
		const fixture = createHandler({ existingMarketplaceSource: 'GitHub: acme/plugins#feature/beta' });
		await fixture.handler.handleURL(uri('/install', 'source=acme%2Fplugins%23feature%2Fbeta&plugin=my-plugin'));
		assert.deepStrictEqual({ calls: fixture.calls, errors: fixture.errors }, {
			calls: [`query:${sessionResource}:catalog:`, `install:${sessionResource}:catalog/my-plugin`],
			errors: [],
		});
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
			calls: [`create:${draftResource}:copilotcli:file:///workspace`, `add:${backendResource}:acme/plugins`, `query:${backendResource}:catalog:`, `install:${backendResource}:catalog/my-plugin`],
			dialogs: 2,
			firstCommand: `workbench.action.chat.openNewSessionEditor.${SessionType.AgentHostCopilot}`,
			errors: [],
		});
	});

	test('declining session creation does not add a marketplace', async () => {
		const fixture = createHandler({ activeResource: draftResource, confirmations: [true, false] });
		await fixture.handler.handleURL(uri());
		assert.deepStrictEqual({ calls: fixture.calls, commands: fixture.commands, errors: fixture.errors }, { calls: [], commands: [], errors: [] });
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
			calls: [`add:${agentsDraftResource}:acme/plugins`, `query:${agentsDraftResource}:catalog:`, `install:${agentsDraftResource}:catalog/my-plugin`],
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
		assert.deepStrictEqual({ commands: fixture.commands, calls: fixture.calls, errors: fixture.errors }, { commands: [], calls: [], errors: [] });
	});

	test('does not choose an unrelated Copilot session when Claude is active', async () => {
		const fixture = createHandler({ activeResource: URI.parse(`${SessionType.AgentHostClaude}:/session`), confirmations: [true, false] });
		await fixture.handler.handleURL(uri());
		assert.deepStrictEqual({ calls: fixture.calls, dialogs: fixture.dialogs.length, commands: fixture.commands }, { calls: [], dialogs: 2, commands: [] });
	});

	for (const options of [
		{ hidden: true },
		{ disabledInWorkspace: true },
		{ pluginsEnabled: false },
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

	test('always asks for an installation owner before confirmation', async () => {
		const fixture = createHandler({ target: 'cancel' });
		await fixture.handler.handleURL(uri());
		assert.deepStrictEqual({
			targets: fixture.picks[0].map(item => ({ id: item.id, description: item.description })),
			calls: fixture.calls,
			dialogs: fixture.dialogs,
			commands: fixture.commands,
		}, {
			targets: [{ id: 'vscode', description: 'This machine' }, { id: 'copilot', description: 'This machine' }, { id: 'manual', description: undefined }],
			calls: [],
			dialogs: [],
			commands: [],
		});
	});

	test('does not offer or mutate a remote-workspace installation', async () => {
		const fixture = createHandler({ remoteAuthority: 'ssh-remote+host' });
		await fixture.handler.handleURL(uri());
		assert.deepStrictEqual({ picks: fixture.picks, dialogs: fixture.dialogs, calls: fixture.calls, errors: fixture.errors, manual: fixture.manualPrompts[0].detail?.includes('intended machine') }, {
			picks: [], dialogs: [], calls: [], errors: [], manual: true,
		});
	});

	for (const harness of ['copilot', 'vscode']) {
		test(`preselects ${harness} from a link without bypassing target selection`, async () => {
			const fixture = createHandler({ target: 'cancel' });
			await fixture.handler.handleURL(uri('/add-marketplace', `ref=acme/plugins&harness=${harness}`));
			assert.deepStrictEqual({ active: fixture.activeItems, dialogs: fixture.dialogs, calls: fixture.calls }, {
				active: [harness], dialogs: [], calls: [],
			});
		});
	}

	test('allows the user to override the requested harness before consent', async () => {
		const fixture = createHandler({ target: 'vscode' });
		await fixture.handler.handleURL(uri('/install', 'source=acme/plugins&plugin=my-plugin&harness=copilot'));
		assert.deepStrictEqual({
			active: fixture.activeItems,
			calls: fixture.calls,
			confirmedOwner: fixture.dialogs[0].message.includes('VS Code on This Machine'),
		}, { active: ['copilot'], calls: ['legacyInstall:acme/plugins:my-plugin'], confirmedOwner: true });
	});

	for (const harness of ['', 'claude', 'Copilot', 'copilot&harness=vscode', 'copilot&harness=copilot']) {
		test(`rejects invalid or repeated harness hints: ${harness}`, async () => {
			const fixture = createHandler();
			await fixture.handler.handleURL(uri('/add-marketplace', `ref=acme/plugins&harness=${harness}`));
			assert.deepStrictEqual({ picks: fixture.picks, dialogs: fixture.dialogs, calls: fixture.calls, actionable: fixture.errors[0]?.includes('must be specified once') }, {
				picks: [], dialogs: [], calls: [], actionable: true,
			});
		});
	}

	test('explains an unavailable requested harness without redirecting the installation', async () => {
		const fixture = createHandler({ available: false, target: 'vscode' });
		await fixture.handler.handleURL(uri('/install', 'source=acme/plugins&plugin=my-plugin&harness=copilot'));
		assert.deepStrictEqual({
			picks: fixture.picks, calls: fixture.calls, errors: fixture.errors,
			explanation: fixture.manualPrompts[0].detail?.includes('requested Copilot installation target is unavailable'),
			copied: fixture.copied,
		}, { picks: [], calls: [], errors: [], explanation: true, copied: [] });
	});

	test('copies exact pinned Copilot instructions without guessing the marketplace name or mutating an inventory', async () => {
		const fixture = createHandler({ target: 'manual', copyManual: true });
		await fixture.handler.handleURL(uri('/install', `source=${encodeURIComponent(encodeBase64(VSBuffer.fromString('acme/plugins#feature/beta')))}&plugin=my-plugin`));
		assert.deepStrictEqual({
			copied: fixture.copied, calls: fixture.calls, commands: fixture.commands, dialogs: fixture.dialogs,
			scopeExplained: fixture.manualPrompts[0].detail?.includes('not native Claude or Codex'),
		}, {
			copied: ['/plugin marketplace add acme/plugins#feature/beta\n/plugin marketplace list\n/plugin install my-plugin@<marketplace-name>'],
			calls: [], commands: [], dialogs: [], scopeExplained: true,
		});
	});

	test('does not copy manual commands when the instructions are dismissed', async () => {
		const fixture = createHandler({ target: 'manual' });
		await fixture.handler.handleURL(uri());
		assert.deepStrictEqual({ prompts: fixture.manualPrompts.length, copied: fixture.copied, calls: fixture.calls }, { prompts: 1, copied: [], calls: [] });
	});

	test('only copies marketplace commands for an add-only link', async () => {
		const fixture = createHandler({ target: 'manual', copyManual: true });
		await fixture.handler.handleURL(uri());
		assert.deepStrictEqual(fixture.copied, ['/plugin marketplace add acme/plugins\n/plugin marketplace list']);
	});

	test('keeps the selected Copilot target when the active session changes during consent', async () => {
		const confirmation = new DeferredPromise<boolean>();
		const fixture = createHandler({ confirmation: confirmation.p });
		const handling = fixture.handler.handleURL(uri());
		await Promise.resolve();
		await Promise.resolve();
		fixture.activeSessionResource.set(URI.parse(`${SessionType.AgentHostCopilot}:/other`), undefined);
		await confirmation.complete(true);
		await handling;
		assert.deepStrictEqual(fixture.calls, [`add:${sessionResource}:acme/plugins`]);
	});

	test('rechecks plugin availability after consent', async () => {
		const confirmation = new DeferredPromise<boolean>();
		const fixture = createHandler({ confirmation: confirmation.p });
		const handling = fixture.handler.handleURL(uri());
		await Promise.resolve();
		await fixture.configurationService.setUserConfiguration(ChatConfiguration.PluginsEnabled, false);
		await confirmation.complete(true);
		await handling;
		assert.deepStrictEqual({ calls: fixture.calls, errors: fixture.errors.length }, { calls: [], errors: 1 });
	});

	test('installs an exact pinned plugin in the explicitly chosen VS Code inventory', async () => {
		const fixture = createHandler({ target: 'vscode' });
		await fixture.handler.handleURL(uri('/install', 'source=acme%2Fplugins%23feature%2Fbeta&plugin=my-plugin'));
		assert.deepStrictEqual({
			calls: fixture.calls,
			errors: fixture.errors,
			destinationConfirmed: fixture.dialogs[0].message.includes('VS Code on This Machine'),
		}, {
			calls: ['legacyInstall:acme/plugins#feature/beta:my-plugin'],
			errors: [],
			destinationConfirmed: true,
		});
	});

	test('adds a pinned VS Code marketplace without requiring Copilot', async () => {
		const fixture = createHandler({ target: 'vscode', available: false });
		await fixture.handler.handleURL(uri('/add-marketplace', 'ref=acme%2Fplugins%23feature%2Fbeta'));
		assert.deepStrictEqual({
			calls: fixture.calls,
			marketplaces: fixture.configurationService.getValue(ChatConfiguration.PluginMarketplaces),
			targets: fixture.picks[0].map(item => item.id),
			errors: fixture.errors,
		}, {
			calls: ['trust:acme/plugins#feature/beta'],
			marketplaces: ['acme/plugins#feature/beta'],
			targets: ['vscode', 'manual'],
			errors: [],
		});
	});

	test('does not write a VS Code marketplace when trust is declined', async () => {
		const fixture = createHandler({ target: 'vscode', trusted: false });
		await fixture.handler.handleURL(uri());
		assert.deepStrictEqual({
			calls: fixture.calls,
			marketplaces: fixture.configurationService.getValue(ChatConfiguration.PluginMarketplaces),
			commands: fixture.commands,
		}, { calls: ['trust:acme/plugins'], marketplaces: [], commands: [] });
	});

	test('reports VS Code installation failures without trying another harness', async () => {
		const fixture = createHandler({ target: 'vscode', legacyInstallResult: { success: false, message: 'Installation failed' } });
		await fixture.handler.handleURL(uri('/install', 'source=acme/plugins&plugin=my-plugin'));
		assert.deepStrictEqual({ calls: fixture.calls, errors: fixture.errors.length, commands: fixture.commands }, {
			calls: ['legacyInstall:acme/plugins:my-plugin'], errors: 1, commands: [],
		});
	});

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
