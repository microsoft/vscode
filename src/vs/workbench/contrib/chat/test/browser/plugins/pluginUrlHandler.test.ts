/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { encodeBase64, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationOverrides, IConfigurationService, IConfigurationUpdateOverrides } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfirmation, IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IPickOptions, IQuickInputService, IQuickPickItem } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IURLService } from '../../../../../../platform/url/common/url.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IHostService } from '../../../../../services/host/browser/host.js';
import { PluginUrlHandler } from '../../../browser/pluginUrlHandler.js';
import { AICustomizationManagementCommands } from '../../../common/aiCustomizationWorkspaceService.js';
import { SessionType } from '../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IPluginInstallService } from '../../../common/plugins/pluginInstallService.js';

suite('PluginUrlHandler', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHandler(options: {
		harness?: 'copilot' | 'vscode';
		cancelPicker?: boolean;
		confirmed?: boolean;
		confirmation?: Promise<boolean>;
		existingMarketplaceSource?: string;
		hidden?: boolean;
		disabledInWorkspace?: boolean;
		pluginsEnabled?: boolean;
		managementUnavailable?: boolean;
		installUnavailable?: boolean;
		marketplaceTrusted?: boolean;
		installResult?: { success: boolean; message?: string };
		remoteAuthority?: string;
		isSessionsWindow?: boolean;
		failure?: 'list' | 'add' | 'browse' | 'install';
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
		instantiationService.stub(IAgentHostService, {
			listPluginMarketplaces: options.managementUnavailable ? undefined : async (provider, session, chat) => {
				calls.push(['list', provider, session, chat]);
				fail('list');
				return options.existingMarketplaceSource ? [{
					name: 'catalog',
					source: options.existingMarketplaceSource,
					isDefault: false,
					managed: false,
					available: true,
				}] : [];
			},
			addPluginMarketplace: async (provider, session, source, chat) => {
				calls.push(['add', provider, session, source, chat]);
				fail('add');
				return { name: 'catalog', source, isDefault: false, managed: false, available: true };
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
		return { handler: store.add(instantiationService.createInstance(PluginUrlHandler)), calls, dialogs, errors, commands, picks, configuration };
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
		for (const harness of ['copilot', 'vscode'] as const) {
			test(`adds the exact marketplace for ${harness}: ${source}`, async () => {
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
		test(`installs the exact Copilot plugin without a session in a restricted workspace (Agents window: ${isSessionsWindow})`, async () => {
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

	test('uses the VS Code source installer with the exact plugin and revision', async () => {
		const fixture = createHandler();
		await fixture.handler.handleURL(uri('/install', 'source=acme%2Fplugins%23feature%2Fbeta&plugin=my-plugin&harness=vscode'));
		assert.deepStrictEqual({ calls: fixture.calls, errors: fixture.errors }, {
			calls: [['vscodeInstall', 'acme/plugins#feature/beta', { plugin: 'my-plugin' }]],
			errors: [],
		});
		assert.ok(typeof fixture.dialogs[0].detail === 'string' && fixture.dialogs[0].detail.includes('VS Code\'s shared plugin installation on this machine'));
	});

	for (const source of ['GitHub: acme/plugins', 'GitHub: acme/plugins#other']) {
		test(`does not confuse ${source} with the requested revision`, async () => {
			const fixture = createHandler({ existingMarketplaceSource: source });
			await fixture.handler.handleURL(uri('/add-marketplace', 'ref=acme%2Fplugins%23feature%2Fbeta'));
			assert.deepStrictEqual(fixture.calls, [
				['list', 'copilotcli', undefined, undefined],
				['add', 'copilotcli', undefined, 'acme/plugins#feature/beta', undefined],
			]);
		});
	}

	for (const source of ['acme/plugins#feature/beta', 'GitHub: acme/plugins#feature/beta', 'URL: https://github.com/ACME/plugins.git#feature/beta']) {
		test(`reuses an exact Copilot marketplace identity: ${source}`, async () => {
			const fixture = createHandler({ existingMarketplaceSource: source });
			await fixture.handler.handleURL(uri('/install', 'source=acme%2Fplugins%23feature%2Fbeta&plugin=my-plugin'));
			assert.deepStrictEqual(fixture.calls, [
				['list', 'copilotcli', undefined, undefined],
				['browse', 'copilotcli', undefined, 'catalog', undefined],
				['install', 'copilotcli', { source: 'my-plugin@catalog' }, undefined, undefined],
			]);
		});
	}

	test('does not duplicate a configured VS Code marketplace', async () => {
		const fixture = createHandler({ harness: 'vscode', existingMarketplaceSource: 'https://github.com/ACME/plugins.git#feature/beta' });
		await fixture.handler.handleURL(uri('/add-marketplace', 'ref=acme%2Fplugins%23feature%2Fbeta'));
		assert.deepStrictEqual(fixture.configuration.getValue(ChatConfiguration.PluginMarketplaces), ['https://github.com/ACME/plugins.git#feature/beta']);
	});

	for (const harness of ['copilot', 'vscode'] as const) {
		for (const path of ['/install', '/add-marketplace']) {
			test(`an explicit ${harness} target skips the picker but still requires consent for ${path}`, async () => {
				const fixture = createHandler({ harness: harness === 'copilot' ? 'vscode' : 'copilot', confirmed: false });
				await fixture.handler.handleURL(uri(path, `source=acme/plugins&ref=acme/plugins&plugin=my-plugin&harness=${harness}`));
				assert.deepStrictEqual({ picks: fixture.picks.length, dialogs: fixture.dialogs.length, calls: fixture.calls, commands: fixture.commands, errors: fixture.errors }, {
					picks: 0, dialogs: 1, calls: [], commands: [], errors: [],
				});
				assert.ok(typeof fixture.dialogs[0].detail === 'string' && fixture.dialogs[0].detail.includes(harness === 'copilot' ? 'Copilot\'s user installation' : 'VS Code\'s shared plugin installation'));
			});
		}
	}

	test('cancelling owner selection performs no mutations or confirmation', async () => {
		const fixture = createHandler({ cancelPicker: true });
		await fixture.handler.handleURL(uri());
		assert.deepStrictEqual({ calls: fixture.calls, dialogs: fixture.dialogs, errors: fixture.errors, commands: fixture.commands }, {
			calls: [], dialogs: [], errors: [], commands: [],
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

	test('rechecks plugin availability after consent', async () => {
		const confirmation = new DeferredPromise<boolean>();
		const fixture = createHandler({ confirmation: confirmation.p });
		const handling = fixture.handler.handleURL(uri('/install', 'source=acme/plugins&plugin=my-plugin'));
		await fixture.configuration.setUserConfiguration(ChatConfiguration.PluginsEnabled, false);
		await confirmation.complete(true);
		await handling;
		assert.deepStrictEqual({ calls: fixture.calls, commands: fixture.commands, errors: fixture.errors.length }, { calls: [], commands: [], errors: 1 });
	});

	for (const harness of ['copilot', 'vscode'] as const) {
		test(`declining consent does not access the ${harness} installer`, async () => {
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
		test(`reports unavailable Copilot capabilities without switching owners: ${JSON.stringify(options)}`, async () => {
			const fixture = createHandler(options);
			await fixture.handler.handleURL(uri('/install', 'source=acme/plugins&plugin=my-plugin'));
			assert.deepStrictEqual({ calls: fixture.calls, errors: fixture.errors.length, commands: fixture.commands }, { calls: [], errors: 1, commands: [] });
		});
	}

	test('reports a missing plugin without installing a different one', async () => {
		const fixture = createHandler();
		await fixture.handler.handleURL(uri('/install', 'source=acme/plugins&plugin=missing'));
		assert.deepStrictEqual({ calls: fixture.calls, errors: fixture.errors.length, commands: fixture.commands }, {
			calls: [['list', 'copilotcli', undefined, undefined], ['add', 'copilotcli', undefined, 'acme/plugins', undefined], ['browse', 'copilotcli', undefined, 'catalog', undefined]],
			errors: 1,
			commands: [],
		});
	});

	for (const failure of ['list', 'add', 'browse', 'install'] as const) {
		test(`surfaces ${failure} failures without switching owners`, async () => {
			const fixture = createHandler({ failure });
			await fixture.handler.handleURL(uri('/install', 'source=acme/plugins&plugin=my-plugin'));
			assert.deepStrictEqual({ errors: fixture.errors.length, commands: fixture.commands, usedVSCode: fixture.calls.some(call => Array.isArray(call) && call[0] === 'vscodeInstall') }, {
				errors: 1, commands: [], usedVSCode: false,
			});
		});
	}

	test('reports the VS Code installer error', async () => {
		const fixture = createHandler({ harness: 'vscode', installResult: { success: false, message: 'Installation failed' } });
		await fixture.handler.handleURL(uri('/install', 'source=acme/plugins&plugin=my-plugin'));
		assert.deepStrictEqual({ errors: fixture.errors, commands: fixture.commands }, { errors: ['Unable to complete the plugin link: Installation failed'], commands: [] });
	});

	test('respects marketplace trust refusal for VS Code', async () => {
		const fixture = createHandler({ harness: 'vscode', marketplaceTrusted: false });
		await fixture.handler.handleURL(uri());
		assert.deepStrictEqual({ marketplaces: fixture.configuration.getValue(ChatConfiguration.PluginMarketplaces), errors: fixture.errors, commands: fixture.commands }, {
			marketplaces: [], errors: [], commands: [],
		});
	});

	test('does not report user cancellation as an error', async () => {
		const fixture = createHandler({ failure: 'add', cancelled: true });
		await fixture.handler.handleURL(uri());
		assert.deepStrictEqual({ errors: fixture.errors, commands: fixture.commands }, { errors: [], commands: [] });
	});
});
