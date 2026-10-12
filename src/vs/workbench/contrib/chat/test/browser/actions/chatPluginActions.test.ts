/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { FileOperationError, FileOperationResult, IFileContent, IFileService } from '../../../../../../platform/files/common/files.js';
import { INotification, INotificationHandle, INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IPathService } from '../../../../../../platform/path/common/pathService.js';
import { IInputOptions, IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IJSONEditingService, IJSONValue } from '../../../../../services/configuration/common/jsonEditing.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ManagePluginMarketplacesAction } from '../../../browser/actions/chatPluginActions.js';
import { getPluginCustomizationMarketplaceSourceId } from '../../../browser/aiCustomization/pluginCustomizationMarketplaceProvider.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../common/aiCustomizationWorkspaceService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ICustomizationHarnessService, IHarnessDescriptor } from '../../../common/customizationHarnessService.js';
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

	function createFixture(configurationValues: Record<string, unknown>, githubFeedAvailable = false, copilotSettings?: object) {
		const instantiationService = workbenchInstantiationService({}, store);
		const configurationService = new UpdatingConfigurationService(configurationValues);
		const quickInputService = new TestQuickInputService();
		const notifications: INotification[] = [];
		const commands: { id: string; args: unknown[] }[] = [];
		const jsonWrites: { resource: URI; values: IJSONValue[]; save: boolean }[] = [];
		const userHome = URI.file('/home/testuser');
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
			override async readFile(): Promise<IFileContent> {
				if (!copilotSettings) {
					throw new FileOperationError('Not found', FileOperationResult.FILE_NOT_FOUND);
				}
				const value = VSBuffer.fromString(JSON.stringify(copilotSettings));
				return {
					resource: URI.file('/home/testuser/.copilot/settings.json'),
					name: 'settings.json',
					mtime: 0,
					ctime: 0,
					etag: '',
					size: value.byteLength,
					readonly: false,
					locked: false,
					executable: false,
					value,
				};
			}
		}());
		instantiationService.stub(IPathService, new class extends mock<IPathService>() {
			override userHome(options: { preferLocal: true }): URI;
			override userHome(options?: { preferLocal: boolean }): Promise<URI>;
			override userHome(options?: { preferLocal: boolean }): URI | Promise<URI> {
				return options?.preferLocal ? userHome : Promise.resolve(userHome);
			}
		}());
		instantiationService.stub(IJSONEditingService, new class extends mock<IJSONEditingService>() {
			override async write(resource: URI, values: IJSONValue[], save: boolean): Promise<void> {
				jsonWrites.push({ resource, values, save });
			}
		}());
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
			override notify(notification: INotification): INotificationHandle {
				notifications.push(notification);
				return new class extends mock<INotificationHandle>() { };
			}
		}());
		return { instantiationService, configurationService, quickInputService, notifications, commands, jsonWrites };
	}

	test('adds a marketplace from the management quick pick', async () => {
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: ['github/awesome-copilot#marketplace'],
			[ChatConfiguration.ExtraMarketplaces]: {},
			[ChatConfiguration.StrictMarketplaces]: null,
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
			jsonWrites: fixture.jsonWrites,
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
			updates: [],
			jsonWrites: [{
				resource: URI.file('/home/testuser/.copilot/settings.json'),
				values: [{
					path: ['extraKnownMarketplaces', 'vscode-marketplace'],
					value: {
						source: {
							source: 'github',
							repo: 'microsoft/vscode-marketplace',
						},
					},
				}],
				save: true,
			}],
			notifications: [],
		});
	});

	test('writes Git and directory marketplaces using Copilot settings source descriptors', async () => {
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [],
			[ChatConfiguration.ExtraMarketplaces]: {},
			[ChatConfiguration.StrictMarketplaces]: null,
		});
		fixture.quickInputService.pickIds.push('addMarketplace');
		fixture.quickInputService.inputValue = 'https://example.com/team/plugins.git#stable';

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		fixture.quickInputService.pickIds.push('addMarketplace');
		fixture.quickInputService.inputValue = 'file:///marketplaces/local-marketplace';
		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual(fixture.jsonWrites, [{
			resource: URI.file('/home/testuser/.copilot/settings.json'),
			values: [{
				path: ['extraKnownMarketplaces', 'plugins'],
				value: {
					source: {
						source: 'git',
						url: 'https://example.com/team/plugins.git',
						ref: 'stable',
					},
				},
			}],
			save: true,
		}, {
			resource: URI.file('/home/testuser/.copilot/settings.json'),
			values: [{
				path: ['extraKnownMarketplaces', 'local-marketplace'],
				value: {
					source: {
						source: 'directory',
						path: URI.file('/marketplaces/local-marketplace').fsPath,
					},
				},
			}],
			save: true,
		}]);
	});

	test('lists and removes marketplaces from Copilot settings', async () => {
		const marketplace = parseMarketplaceReference('microsoft/vscode-marketplace')!;
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [],
			[ChatConfiguration.ExtraMarketplaces]: {},
			[ChatConfiguration.StrictMarketplaces]: null,
		}, false, {
			extraKnownMarketplaces: {
				'VS Code Marketplace': {
					source: {
						source: 'github',
						repo: 'microsoft/vscode-marketplace',
					},
				},
			},
		});
		fixture.quickInputService.pickIds.push(marketplace.canonicalId, 'removeMarketplace', undefined);

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual({
			firstPick: fixture.quickInputService.pickSnapshots[0],
			actions: fixture.quickInputService.pickSnapshots[1],
			jsonWrites: fixture.jsonWrites,
			configurationUpdates: fixture.configurationService.updates,
		}, {
			firstPick: [
				{ id: 'addMarketplace', label: '$(add) Add Marketplace...', type: 'item' },
				{ id: undefined, label: 'Configured Marketplaces', type: 'separator' },
				{ id: marketplace.canonicalId, label: 'VS Code Marketplace', type: 'item' },
			],
			actions: [
				{ id: 'showPlugins', label: 'Show Plugins', type: 'item' },
				{ id: 'removeMarketplace', label: 'Remove Marketplace', type: 'item' },
			],
			jsonWrites: [{
				resource: URI.file('/home/testuser/.copilot/settings.json'),
				values: [{
					path: ['extraKnownMarketplaces', 'VS Code Marketplace'],
					value: undefined,
				}],
				save: true,
			}],
			configurationUpdates: [],
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

	test('writes marketplaces outside strict policy to Copilot settings', async () => {
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
			jsonWrites: fixture.jsonWrites,
			notifications: fixture.notifications.map(notification => notification.message),
		}, {
			updates: [],
			jsonWrites: [{
				resource: URI.file('/home/testuser/.copilot/settings.json'),
				values: [{
					path: ['extraKnownMarketplaces', 'catalog'],
					value: {
						source: {
							source: 'github',
							repo: 'blocked/catalog',
						},
					},
				}],
				save: true,
			}],
			notifications: [],
		});
	});
});
