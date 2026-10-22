/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IDialogService, IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { INotification, INotificationHandle, INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IInputBox, IInputOptions, IPickOptions, IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../../platform/quickinput/common/quickInput.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { InstallFromSourceAction, ManagePluginMarketplacesAction } from '../../../browser/actions/chatPluginActions.js';
import { getPluginCustomizationMarketplaceSourceId } from '../../../browser/aiCustomization/pluginCustomizationMarketplaceProvider.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../common/aiCustomizationWorkspaceService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ICustomizationHarnessService, ICustomizationMarketplaceManagementProvider, IHarnessDescriptor } from '../../../common/customizationHarnessService.js';
import { IAgentPluginRepositoryService } from '../../../common/plugins/agentPluginRepositoryService.js';
import { IPluginInstallService } from '../../../common/plugins/pluginInstallService.js';
import { IPluginMarketplaceService, parseMarketplaceReference } from '../../../common/plugins/pluginMarketplaceService.js';
import { isMarketplaceReferenceAllowed, StrictKnownMarketplaces } from '../../../common/plugins/strictKnownMarketplaces.js';

suite('ManagePluginMarketplacesAction', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	class UpdatingConfigurationService extends TestConfigurationService {
		readonly updates: { key: string; value: unknown }[] = [];

		override async updateValue(key: string, value: unknown): Promise<void> {
			this.updates.push({ key, value });
			await this.setUserConfiguration(key, value);
		}
	}

	class TestQuickInputService extends mock<IQuickInputService>() {
		readonly pickSnapshots: { id: string | undefined; label: string; type: string }[][] = [];
		readonly picks: QuickPickInput<IQuickPickItem>[][] = [];
		inputOptions: IInputOptions | undefined;
		inputValue: string | undefined;
		pickIds: (string | undefined)[] = [];
		buttonItemIds: string[] = [];
		readonly removedItemIds: string[] = [];

		override async pick<T extends IQuickPickItem>(picks: QuickPickInput<T>[], options?: IPickOptions<T>): Promise<T | undefined> {
			this.picks.push(picks);
			this.pickSnapshots.push(picks.map(pick => ({
				id: pick.id,
				label: pick.label ?? '',
				type: pick.type ?? 'item',
			})));
			const buttonItemId = this.buttonItemIds.shift();
			if (buttonItemId) {
				const item = picks.find((pick): pick is T => pick.type !== 'separator' && pick.id === buttonItemId);
				const button = item?.buttons?.[0];
				if (item && button) {
					await Promise.resolve(options?.onDidTriggerItemButton?.({
						item,
						button,
						removeItem: () => this.removedItemIds.push(buttonItemId),
					}));
				}
				return undefined;
			}
			const id = this.pickIds.shift();
			if (!id) {
				return undefined;
			}
			for (const pick of picks) {
				if (pick.type !== 'separator' && pick.id === id) {
					return pick;
				}
			}
			return undefined;
		}

		override async input(options?: IInputOptions): Promise<string | undefined> {
			this.inputOptions = options;
			return this.inputValue;
		}
	}

	function createFixture(configurationValues: Record<string, unknown>, githubFeedAvailable = false, marketplaceManagementProvider?: ICustomizationMarketplaceManagementProvider) {
		const instantiationService = workbenchInstantiationService({}, store);
		const configurationService = new UpdatingConfigurationService(configurationValues);
		const marketplacePolicy: { allowlist?: StrictKnownMarketplaces } = {};
		instantiationService.stub(IPluginMarketplaceService, new class extends mock<IPluginMarketplaceService>() {
			override isStrictMarketplacePolicyActive() { return marketplacePolicy.allowlist !== undefined; }
			override isMarketplaceTrusted(reference: Parameters<IPluginMarketplaceService['isMarketplaceTrusted']>[0]) {
				return isMarketplaceReferenceAllowed(marketplacePolicy.allowlist, reference);
			}
		}());
		const quickInputService = new TestQuickInputService();
		const notifications: INotification[] = [];
		const commands: { id: string; args: unknown[] }[] = [];
		const harness = {
			id: 'local',
			label: 'Local',
			icon: { id: 'vm' },
			marketplaceSearchProvider: githubFeedAvailable ? { query: async () => ({ items: [], total: 0 }) } : undefined,
			marketplaceManagementProvider,
		} satisfies IHarnessDescriptor;
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IQuickInputService, quickInputService);
		instantiationService.stub(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
			override readonly activeSessionResource = observableValue<URI>(this, URI.parse('local:/session'));
			override getDescriptorForSession() { return harness; }
			override getActiveDescriptor() { return harness; }
		}());
		instantiationService.stub(IAgentPluginRepositoryService, new class extends mock<IAgentPluginRepositoryService>() {
			override getRepositoryUri(): URI { return URI.file('/marketplace'); }
		}());
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
				commands.push({ id: commandId, args });
				return undefined;
			}
		}());
		instantiationService.stub(IFileService, new class extends mock<IFileService>() {
			override async exists(): Promise<boolean> { return false; }
		}());
		instantiationService.stub(IDialogService, new class extends mock<IDialogService>() {
			override async confirm() {
				return { confirmed: true };
			}
		}());
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
			override notify(notification: INotification): INotificationHandle {
				notifications.push(notification);
				return new class extends mock<INotificationHandle>() { };
			}
		}());
		return { instantiationService, configurationService, quickInputService, notifications, commands, marketplacePolicy };
	}

	test('adds a marketplace from the management quick pick', async () => {
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: ['github/awesome-copilot#marketplace'],
			[ChatConfiguration.ExtraMarketplaces]: {},
		});
		fixture.quickInputService.pickIds.push('addMarketplace');
		fixture.quickInputService.inputValue = 'microsoft/vscode-marketplace';

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual({
			firstPick: fixture.quickInputService.pickSnapshots[0],
			input: {
				title: fixture.quickInputService.inputOptions?.title,
				placeHolder: fixture.quickInputService.inputOptions?.placeHolder,
				prompt: fixture.quickInputService.inputOptions?.prompt,
			},
			updates: fixture.configurationService.updates,
			notifications: fixture.notifications,
		}, {
			firstPick: [
				{ id: 'addMarketplace', label: '$(add) Add Marketplace...', type: 'item' },
				{ id: undefined, label: 'Configured Marketplaces', type: 'separator' },
				{ id: parseMarketplaceReference('github/awesome-copilot#marketplace')!.canonicalId, label: 'github/awesome-copilot#marketplace', type: 'item' },
			],
			input: {
				title: 'Add Plugin Marketplace',
				placeHolder: 'owner/repo, Git URL, or local repository URI',
				prompt: 'Only add marketplaces you trust.',
			},
			updates: [{
				key: ChatConfiguration.PluginMarketplaces,
				value: ['github/awesome-copilot#marketplace', 'microsoft/vscode-marketplace'],
			}],
			notifications: [],
		});
	});

	test('stores Git and directory marketplaces in the local harness configuration', async () => {
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [],
			[ChatConfiguration.ExtraMarketplaces]: {},
		});
		fixture.quickInputService.pickIds.push('addMarketplace');
		fixture.quickInputService.inputValue = 'https://example.com/team/plugins.git#stable';

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		fixture.quickInputService.pickIds.push('addMarketplace');
		fixture.quickInputService.inputValue = 'file:///marketplaces/local-marketplace';
		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual(fixture.configurationService.updates, [{
			key: ChatConfiguration.PluginMarketplaces,
			value: ['https://example.com/team/plugins.git#stable'],
		}, {
			key: ChatConfiguration.PluginMarketplaces,
			value: ['https://example.com/team/plugins.git#stable', 'file:///marketplaces/local-marketplace'],
		}]);
	});

	test('uses provider inventory and force-removes dependent plugins', async () => {
		const removeCalls: { name: string; force?: boolean }[] = [];
		const provider: ICustomizationMarketplaceManagementProvider = {
			onDidChange: Event.None,
			list: async () => [{
				name: 'VS Code Marketplace',
				source: 'GitHub: microsoft/vscode-marketplace',
				isDefault: false,
				managed: false,
				available: true,
			}],
			add: async () => { throw new Error('Unexpected add'); },
			queryMarketplace: async () => ({ items: [], total: 0 }),
			remove: async (_session, name, force) => {
				removeCalls.push({ name, force });
				return force ? { removed: true } : { removed: false, dependentPlugins: ['sample-plugin'] };
			},
			refresh: async () => [],
		};
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: ['local/ignored-marketplace'],
			[ChatConfiguration.ExtraMarketplaces]: {},
		}, false, provider);
		fixture.quickInputService.pickIds.push('VS Code Marketplace', 'removeMarketplace', undefined);

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual({
			firstPick: fixture.quickInputService.pickSnapshots[0],
			actions: fixture.quickInputService.pickSnapshots[1],
			configurationUpdates: fixture.configurationService.updates,
			removeCalls,
		}, {
			firstPick: [
				{ id: 'addMarketplace', label: '$(add) Add Marketplace...', type: 'item' },
				{ id: undefined, label: 'Configured Marketplaces', type: 'separator' },
				{ id: 'VS Code Marketplace', label: 'VS Code Marketplace', type: 'item' },
			],
			actions: [
				{ id: 'refreshMarketplace', label: 'Refresh Marketplace', type: 'item' },
				{ id: 'removeMarketplace', label: 'Remove Marketplace', type: 'item' },
			],
			configurationUpdates: [],
			removeCalls: [
				{ name: 'VS Code Marketplace', force: undefined },
				{ name: 'VS Code Marketplace', force: true },
			],
		});
	});

	test('shows an inline remove action only for removable provider marketplaces', async () => {
		const removeCalls: string[] = [];
		const provider: ICustomizationMarketplaceManagementProvider = {
			onDidChange: Event.None,
			list: async () => [{
				name: 'removable-marketplace',
				source: 'GitHub: owner/removable-marketplace',
				isDefault: false,
				managed: false,
				available: true,
			}, {
				name: 'default-marketplace',
				source: 'GitHub: owner/default-marketplace',
				isDefault: true,
				managed: false,
				available: true,
			}, {
				name: 'managed-marketplace',
				source: 'GitHub: owner/managed-marketplace',
				isDefault: false,
				managed: true,
				available: true,
			}],
			add: async () => { throw new Error('Unexpected add'); },
			queryMarketplace: async () => ({ items: [], total: 0 }),
			remove: async (_session, name) => {
				removeCalls.push(name);
				return { removed: true };
			},
			refresh: async () => [],
		};
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [],
			[ChatConfiguration.ExtraMarketplaces]: {},
		}, false, provider);
		fixture.quickInputService.buttonItemIds.push('removable-marketplace');

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual({
			buttons: fixture.quickInputService.picks[0]
				.filter((pick): pick is IQuickPickItem => pick.type !== 'separator' && pick.id !== 'addMarketplace')
				.map(pick => [pick.id, pick.buttons?.map(button => button.tooltip)]),
			removeCalls,
			removedItemIds: fixture.quickInputService.removedItemIds,
		}, {
			buttons: [
				['removable-marketplace', ['Remove Marketplace']],
				['default-marketplace', undefined],
				['managed-marketplace', undefined],
			],
			removeCalls: ['removable-marketplace'],
			removedItemIds: ['removable-marketplace'],
		});
	});

	test('adds marketplaces through the provider without updating local configuration', async () => {
		const addCalls: string[] = [];
		const provider: ICustomizationMarketplaceManagementProvider = {
			onDidChange: Event.None,
			list: async () => [],
			add: async (_session, source) => {
				addCalls.push(source);
				return { name: 'provider-marketplace', source, isDefault: false, managed: false, available: true };
			},
			queryMarketplace: async () => ({ items: [], total: 0 }),
			remove: async () => ({ removed: true }),
			refresh: async () => [],
		};
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: ['local/ignored-marketplace'],
			[ChatConfiguration.ExtraMarketplaces]: {},
		}, false, provider);
		fixture.quickInputService.pickIds.push('addMarketplace', undefined);
		fixture.quickInputService.inputValue = 'provider/marketplace';

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual({
			addCalls,
			configurationUpdates: fixture.configurationService.updates,
		}, {
			addCalls: ['provider/marketplace'],
			configurationUpdates: [],
		});
	});

	test('shows plugins from a configured marketplace in Customizations', async () => {
		const marketplace = parseMarketplaceReference('anthropics/claude-code')!;
		const otherMarketplace = parseMarketplaceReference('microsoft/vscode-marketplace')!;
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [otherMarketplace.rawValue, marketplace.rawValue],
			[ChatConfiguration.ExtraMarketplaces]: {},
		});
		fixture.quickInputService.pickIds.push(marketplace.canonicalId, 'showPlugins');

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual({
			actions: fixture.quickInputService.pickSnapshots[1],
			commands: fixture.commands,
		}, {
			actions: [
				{ id: 'showPlugins', label: 'Show Plugins', type: 'item' },
				{ id: 'removeMarketplace', label: 'Remove Marketplace', type: 'item' },
			],
			commands: [{
				id: AICustomizationManagementCommands.OpenMarketplace,
				args: [{
					section: AICustomizationManagementSection.Plugins,
					sourceId: getPluginCustomizationMarketplaceSourceId(marketplace),
				}],
			}],
		});
	});

	test('shows plugins from the default marketplace using its public feed replacement', async () => {
		const marketplace = parseMarketplaceReference('github/awesome-copilot#marketplace')!;
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [marketplace.rawValue],
			[ChatConfiguration.ExtraMarketplaces]: {},
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: true,
		}, true);
		fixture.quickInputService.pickIds.push(marketplace.canonicalId, 'showPlugins');

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual(fixture.commands, [{
			id: AICustomizationManagementCommands.OpenMarketplace,
			args: [{
				section: AICustomizationManagementSection.Plugins,
				sourceId: CustomizationMarketplaceSources.AgentFinderPublicFeed.id,
			}],
		}]);
	});

	test('shows plugins from the default marketplace using its configured source under strict policy', async () => {
		const marketplace = parseMarketplaceReference('github/awesome-copilot#marketplace')!;
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [marketplace.rawValue],
			[ChatConfiguration.ExtraMarketplaces]: {},
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: true,
		}, true);
		fixture.marketplacePolicy.allowlist = [{ source: 'github', repo: 'github/awesome-copilot', ref: 'marketplace' }];
		fixture.quickInputService.pickIds.push(marketplace.canonicalId, 'showPlugins');

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual(fixture.commands, [{
			id: AICustomizationManagementCommands.OpenMarketplace,
			args: [{
				section: AICustomizationManagementSection.Plugins,
				sourceId: getPluginCustomizationMarketplaceSourceId(marketplace),
			}],
		}]);
	});

	test('shows plugins from the default marketplace using its configured source without a public feed', async () => {
		const marketplace = parseMarketplaceReference('github/awesome-copilot#marketplace')!;
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [marketplace.rawValue],
			[ChatConfiguration.ExtraMarketplaces]: {},
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: true,
		});
		fixture.quickInputService.pickIds.push(marketplace.canonicalId, 'showPlugins');

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual(fixture.commands, [{
			id: AICustomizationManagementCommands.OpenMarketplace,
			args: [{
				section: AICustomizationManagementSection.Plugins,
				sourceId: getPluginCustomizationMarketplaceSourceId(marketplace),
			}],
		}]);
	});

	test('disables marketplaces outside strict policy and labels organization-managed marketplaces', async () => {
		const defaultMarketplace = parseMarketplaceReference('github/awesome-copilot#marketplace')!;
		const managedMarketplace = parseMarketplaceReference('microsoft/vscode-team-kit')!;
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [defaultMarketplace.rawValue],
			[ChatConfiguration.ExtraMarketplaces]: {
				'vscode-team-kit': managedMarketplace.rawValue,
			},
		});
		fixture.marketplacePolicy.allowlist = [{ source: 'github', repo: managedMarketplace.rawValue }];

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual(
			fixture.quickInputService.picks[0]
				.filter((pick): pick is IQuickPickItem => pick.type !== 'separator' && pick.id !== 'addMarketplace')
				.map(pick => ({
					id: pick.id,
					label: pick.label,
					description: pick.description,
					disabled: pick.disabled,
					pickable: pick.pickable,
				})),
			[
				{
					id: defaultMarketplace.canonicalId,
					label: defaultMarketplace.displayLabel,
					description: 'Disabled by Organization',
					disabled: true,
					pickable: false,
				},
				{
					id: managedMarketplace.canonicalId,
					label: 'vscode-team-kit',
					description: 'Managed by Organization',
					disabled: false,
					pickable: true,
				},
			],
		);
	});

	test('disables organization-managed marketplaces outside strict policy', async () => {
		const managedMarketplace = parseMarketplaceReference('microsoft/vscode-team-kit')!;
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [],
			[ChatConfiguration.ExtraMarketplaces]: {
				'vscode-team-kit': managedMarketplace.rawValue,
			},
		});
		fixture.marketplacePolicy.allowlist = [{ source: 'github', repo: 'approved/catalog' }];

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual(
			fixture.quickInputService.picks[0]
				.filter((pick): pick is IQuickPickItem => pick.type !== 'separator' && pick.id !== 'addMarketplace')
				.map(pick => ({
					id: pick.id,
					label: pick.label,
					description: pick.description,
					disabled: pick.disabled,
					pickable: pick.pickable,
				})),
			[{
				id: managedMarketplace.canonicalId,
				label: 'vscode-team-kit',
				description: 'Managed by Organization, Disabled by Organization',
				disabled: true,
				pickable: false,
			}],
		);
	});

	for (const managedLockdown of [false, true]) {
		test(`stale user lockdown does not label a marketplace as organization-disabled (managed lockdown: ${managedLockdown})`, async () => {
			const fixture = createFixture({
				[ChatConfiguration.PluginMarketplaces]: [],
				[ChatConfiguration.ExtraMarketplaces]: { enterprise: 'enterprise/catalog' },
				'chat.plugins.strictMarketplaces': [],
			});
			fixture.marketplacePolicy.allowlist = managedLockdown ? [] : undefined;
			await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));
			assert.deepStrictEqual(fixture.quickInputService.picks[0]
				.filter((pick): pick is IQuickPickItem => pick.type !== 'separator' && pick.id !== 'addMarketplace')
				.map(pick => ({ description: pick.description, disabled: pick.disabled, pickable: pick.pickable })), [{
					description: managedLockdown ? 'Managed by Organization, Disabled by Organization' : 'Managed by Organization',
					disabled: managedLockdown,
					pickable: !managedLockdown,
				}]);
		});
	}

	test('stores local marketplaces outside strict policy without treating them as runtime managed', async () => {
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [],
			[ChatConfiguration.ExtraMarketplaces]: {},
		});
		fixture.marketplacePolicy.allowlist = [{ source: 'github', repo: 'approved/catalog' }];
		fixture.quickInputService.pickIds.push('addMarketplace');
		fixture.quickInputService.inputValue = 'blocked/catalog';

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual({
			updates: fixture.configurationService.updates,
			notifications: fixture.notifications.map(notification => notification.message),
		}, {
			updates: [{
				key: ChatConfiguration.PluginMarketplaces,
				value: ['blocked/catalog'],
			}],
			notifications: [],
		});
	});
});

suite('InstallFromSourceAction', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('opens chat customizations plugins view on successful install', async () => {
		const instantiationService = workbenchInstantiationService({}, store);
		const commands: { id: string; args: unknown[] }[] = [];
		const pluginUri = URI.file('/test/plugin');

		class TestInputBox extends mock<IInputBox>() {
			value = 'owner/repo';
			enabled = true;
			busy = false;
			validationMessage: string | undefined;
			ignoreFocusOut = false;
			placeholder: string | undefined;
			prompt: string | undefined;
			buttons: readonly any[] = [];
			private readonly _onDidAccept = store.add(new Emitter<void>());
			readonly onDidAccept = this._onDidAccept.event;
			private readonly _onDidChangeValue = store.add(new Emitter<string>());
			readonly onDidChangeValue = this._onDidChangeValue.event;
			private readonly _onDidHide = store.add(new Emitter<void>());
			readonly onDidHide = this._onDidHide.event;
			private readonly _onDidTriggerButton = store.add(new Emitter<any>());
			readonly onDidTriggerButton = this._onDidTriggerButton.event;
			override show() {
				queueMicrotask(() => this._onDidAccept.fire());
			}
			override hide() {}
			override dispose() {}
		}

		instantiationService.stub(IQuickInputService, new class extends mock<IQuickInputService>() {
			override createInputBox() { return new TestInputBox(); }
		}());
		instantiationService.stub(IPluginInstallService, new class extends mock<IPluginInstallService>() {
			override validatePluginSource() { return undefined; }
			override async installPluginFromSource() {
				return { success: true, installedUri: pluginUri };
			}
		}());
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
				commands.push({ id: commandId, args });
				return undefined;
			}
		}());
		instantiationService.stub(IFileDialogService, new class extends mock<IFileDialogService>() { });

		const installed = await instantiationService.invokeFunction(accessor => new InstallFromSourceAction().run(accessor));
		assert.strictEqual(installed, true);
		assert.deepStrictEqual(commands, [{
			id: AICustomizationManagementCommands.OpenEditor,
			args: [{
				section: AICustomizationManagementSection.Plugins,
				revealUri: pluginUri,
			}],
		}]);
	});

	test('falls back to getPluginInstallUri when matchedPlugin is returned without installedUri', async () => {
		const instantiationService = workbenchInstantiationService({}, store);
		const commands: { id: string; args: unknown[] }[] = [];
		const pluginUri = URI.file('/test/plugin-fallback');

		class TestInputBox extends mock<IInputBox>() {
			value = 'owner/repo';
			enabled = true;
			busy = false;
			validationMessage: string | undefined;
			ignoreFocusOut = false;
			placeholder: string | undefined;
			prompt: string | undefined;
			buttons: readonly any[] = [];
			private readonly _onDidAccept = store.add(new Emitter<void>());
			readonly onDidAccept = this._onDidAccept.event;
			private readonly _onDidChangeValue = store.add(new Emitter<string>());
			readonly onDidChangeValue = this._onDidChangeValue.event;
			private readonly _onDidHide = store.add(new Emitter<void>());
			readonly onDidHide = this._onDidHide.event;
			private readonly _onDidTriggerButton = store.add(new Emitter<any>());
			readonly onDidTriggerButton = this._onDidTriggerButton.event;
			override show() {
				queueMicrotask(() => this._onDidAccept.fire());
			}
			override hide() {}
			override dispose() {}
		}

		instantiationService.stub(IQuickInputService, new class extends mock<IQuickInputService>() {
			override createInputBox() { return new TestInputBox(); }
		}());
		instantiationService.stub(IPluginInstallService, new class extends mock<IPluginInstallService>() {
			override validatePluginSource() { return undefined; }
			override getPluginInstallUri() { return pluginUri; }
			override async installPluginFromSource() {
				return { success: true, matchedPlugin: { name: 'repo' } as any };
			}
		}());
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
				commands.push({ id: commandId, args });
				return undefined;
			}
		}());
		instantiationService.stub(IFileDialogService, new class extends mock<IFileDialogService>() { });

		const installed = await instantiationService.invokeFunction(accessor => new InstallFromSourceAction().run(accessor));
		assert.strictEqual(installed, true);
		assert.deepStrictEqual(commands, [{
			id: AICustomizationManagementCommands.OpenEditor,
			args: [{
				section: AICustomizationManagementSection.Plugins,
				revealUri: pluginUri,
			}],
		}]);
	});

	test('skips reveal when skipReveal option is true', async () => {
		const instantiationService = workbenchInstantiationService({}, store);
		const commands: { id: string; args: unknown[] }[] = [];

		class TestInputBox extends mock<IInputBox>() {
			value = 'owner/repo';
			enabled = true;
			busy = false;
			validationMessage: string | undefined;
			ignoreFocusOut = false;
			placeholder: string | undefined;
			prompt: string | undefined;
			buttons: readonly any[] = [];
			private readonly _onDidAccept = store.add(new Emitter<void>());
			readonly onDidAccept = this._onDidAccept.event;
			private readonly _onDidChangeValue = store.add(new Emitter<string>());
			readonly onDidChangeValue = this._onDidChangeValue.event;
			private readonly _onDidHide = store.add(new Emitter<void>());
			readonly onDidHide = this._onDidHide.event;
			private readonly _onDidTriggerButton = store.add(new Emitter<any>());
			readonly onDidTriggerButton = this._onDidTriggerButton.event;
			override show() {
				queueMicrotask(() => this._onDidAccept.fire());
			}
			override hide() {}
			override dispose() {}
		}

		instantiationService.stub(IQuickInputService, new class extends mock<IQuickInputService>() {
			override createInputBox() { return new TestInputBox(); }
		}());
		instantiationService.stub(IPluginInstallService, new class extends mock<IPluginInstallService>() {
			override validatePluginSource() { return undefined; }
			override async installPluginFromSource() {
				return { success: true, installedUri: URI.file('/test/plugin') };
			}
		}());
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
				commands.push({ id: commandId, args });
				return undefined;
			}
		}());
		instantiationService.stub(IFileDialogService, new class extends mock<IFileDialogService>() { });

		const installed = await instantiationService.invokeFunction(accessor => new InstallFromSourceAction().run(accessor, { skipReveal: true }));
		assert.strictEqual(installed, true);
		assert.deepStrictEqual(commands, []);
	});

	test('does not fail install or re-open input if reveal command fails', async () => {
		const instantiationService = workbenchInstantiationService({}, store);
		let showCount = 0;

		class TestInputBox extends mock<IInputBox>() {
			value = 'owner/repo';
			enabled = true;
			busy = false;
			validationMessage: string | undefined;
			ignoreFocusOut = false;
			placeholder: string | undefined;
			prompt: string | undefined;
			buttons: readonly any[] = [];
			private readonly _onDidAccept = store.add(new Emitter<void>());
			readonly onDidAccept = this._onDidAccept.event;
			private readonly _onDidChangeValue = store.add(new Emitter<string>());
			readonly onDidChangeValue = this._onDidChangeValue.event;
			private readonly _onDidHide = store.add(new Emitter<void>());
			readonly onDidHide = this._onDidHide.event;
			private readonly _onDidTriggerButton = store.add(new Emitter<any>());
			readonly onDidTriggerButton = this._onDidTriggerButton.event;
			override show() {
				showCount++;
				if (showCount === 1) {
					queueMicrotask(() => this._onDidAccept.fire());
				}
			}
			override hide() {}
			override dispose() {}
		}

		instantiationService.stub(IQuickInputService, new class extends mock<IQuickInputService>() {
			override createInputBox() { return new TestInputBox(); }
		}());
		instantiationService.stub(IPluginInstallService, new class extends mock<IPluginInstallService>() {
			override validatePluginSource() { return undefined; }
			override async installPluginFromSource() {
				return { success: true, installedUri: URI.file('/test/plugin') };
			}
		}());
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<T>(): Promise<T | undefined> {
				throw new Error('Failed to open editor');
			}
		}());
		instantiationService.stub(IFileDialogService, new class extends mock<IFileDialogService>() { });

		const installed = await instantiationService.invokeFunction(accessor => new InstallFromSourceAction().run(accessor));
		assert.strictEqual(installed, true);
		assert.strictEqual(showCount, 1);
	});
});

