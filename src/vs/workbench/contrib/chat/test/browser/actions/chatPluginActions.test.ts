/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { INotification, INotificationHandle, INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IInputBox, IInputOptions, IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../../platform/quickinput/common/quickInput.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { InstallFromSourceAction, ManagePluginMarketplacesAction } from '../../../browser/actions/chatPluginActions.js';
import { getPluginCustomizationMarketplaceSourceId } from '../../../browser/aiCustomization/pluginCustomizationMarketplaceProvider.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../common/aiCustomizationWorkspaceService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ICustomizationHarnessService, IHarnessDescriptor } from '../../../common/customizationHarnessService.js';
import { IAgentPluginRepositoryService } from '../../../common/plugins/agentPluginRepositoryService.js';
import { IPluginInstallService } from '../../../common/plugins/pluginInstallService.js';
import { parseMarketplaceReference } from '../../../common/plugins/pluginMarketplaceService.js';

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

		override async pick<T extends IQuickPickItem>(picks: QuickPickInput<T>[]): Promise<T | undefined> {
			this.picks.push(picks);
			this.pickSnapshots.push(picks.map(pick => ({
				id: pick.id,
				label: pick.label ?? '',
				type: pick.type ?? 'item',
			})));
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

	function createFixture(configurationValues: Record<string, unknown>, githubFeedAvailable = false) {
		const instantiationService = workbenchInstantiationService({}, store);
		const configurationService = new UpdatingConfigurationService(configurationValues);
		const quickInputService = new TestQuickInputService();
		const notifications: INotification[] = [];
		const commands: { id: string; args: unknown[] }[] = [];
		const harness = {
			id: 'local',
			label: 'Local',
			icon: { id: 'vm' },
			marketplaceSearchProvider: githubFeedAvailable ? { query: async () => ({ items: [], total: 0 }) } : undefined,
		} satisfies IHarnessDescriptor;
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IQuickInputService, quickInputService);
		instantiationService.stub(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
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
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
			override notify(notification: INotification): INotificationHandle {
				notifications.push(notification);
				return new class extends mock<INotificationHandle>() { };
			}
		}());
		return { instantiationService, configurationService, quickInputService, notifications, commands };
	}

	test('adds a marketplace from the management quick pick', async () => {
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: ['github/awesome-copilot#marketplace'],
			[ChatConfiguration.ExtraMarketplaces]: {},
			[ChatConfiguration.StrictMarketplaces]: null,
		});
		fixture.quickInputService.pickIds.push('addMarketplace', undefined);
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

	test('shows plugins from a configured marketplace in Customizations', async () => {
		const marketplace = parseMarketplaceReference('anthropics/claude-code')!;
		const otherMarketplace = parseMarketplaceReference('microsoft/vscode-marketplace')!;
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [otherMarketplace.rawValue, marketplace.rawValue],
			[ChatConfiguration.ExtraMarketplaces]: {},
			[ChatConfiguration.StrictMarketplaces]: null,
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
			[ChatConfiguration.StrictMarketplaces]: null,
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
			[ChatConfiguration.StrictMarketplaces]: [{ source: 'github', repo: 'github/awesome-copilot', ref: 'marketplace' }],
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: true,
		}, true);
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
			[ChatConfiguration.StrictMarketplaces]: null,
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
			[ChatConfiguration.StrictMarketplaces]: [{ source: 'github', repo: managedMarketplace.rawValue }],
		});

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
			[ChatConfiguration.StrictMarketplaces]: [{ source: 'github', repo: 'approved/catalog' }],
		});

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

	test('adds marketplaces outside strict policy as disabled', async () => {
		const blockedMarketplace = parseMarketplaceReference('blocked/catalog')!;
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [],
			[ChatConfiguration.ExtraMarketplaces]: {},
			[ChatConfiguration.StrictMarketplaces]: [{ source: 'github', repo: 'approved/catalog' }],
		});
		fixture.quickInputService.pickIds.push('addMarketplace');
		fixture.quickInputService.inputValue = 'blocked/catalog';

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual({
			updates: fixture.configurationService.updates,
			notifications: fixture.notifications.map(notification => notification.message),
			addedMarketplace: fixture.quickInputService.picks[1]
				.find((pick): pick is IQuickPickItem => pick.type !== 'separator' && pick.id === blockedMarketplace.canonicalId),
		}, {
			updates: [{
				key: ChatConfiguration.PluginMarketplaces,
				value: [blockedMarketplace.rawValue],
			}],
			notifications: [],
			addedMarketplace: {
				id: blockedMarketplace.canonicalId,
				label: blockedMarketplace.displayLabel,
				description: 'Disabled by Organization',
				detail: blockedMarketplace.cloneUrl,
				kind: 'marketplace',
				reference: blockedMarketplace,
				managedByPolicy: false,
				disabled: true,
				pickable: false,
			},
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
				return { success: true, matchedPlugin: { uri: pluginUri, name: 'repo' } as any };
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
				return { success: true, matchedPlugin: { uri: URI.file('/test/plugin'), name: 'repo' } as any };
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
});

