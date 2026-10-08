/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { INotification, INotificationHandle, INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IInputOptions, IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../../platform/quickinput/common/quickInput.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ManagePluginMarketplacesAction } from '../../../browser/actions/chatPluginActions.js';
import { getPluginCustomizationMarketplaceSourceId } from '../../../browser/aiCustomization/pluginCustomizationMarketplaceProvider.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../common/aiCustomizationWorkspaceService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IAgentPluginRepositoryService } from '../../../common/plugins/agentPluginRepositoryService.js';
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
		inputOptions: IInputOptions | undefined;
		inputValue: string | undefined;
		pickIds: (string | undefined)[] = [];

		override async pick<T extends IQuickPickItem>(picks: QuickPickInput<T>[]): Promise<T | undefined> {
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

	function createFixture(configurationValues: Record<string, unknown>) {
		const instantiationService = workbenchInstantiationService({}, store);
		const configurationService = new UpdatingConfigurationService(configurationValues);
		const quickInputService = new TestQuickInputService();
		const notifications: INotification[] = [];
		const commands: { id: string; args: unknown[] }[] = [];
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IQuickInputService, quickInputService);
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
		});
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

	test('rejects marketplaces blocked by strict enterprise policy', async () => {
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
		}, {
			updates: [],
			notifications: ['This marketplace is not allowed by enterprise policy.'],
		});
	});
});
