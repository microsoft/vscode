/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { isIMenuItem, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceResource } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { AGENT_BUILTIN_CUSTOMIZATION_SCHEME } from '../../../../../../platform/agentHost/common/agentHostCustomizationUri.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import '../../../browser/aiCustomization/aiCustomizationManagement.contribution.js';
import {
	AI_CUSTOMIZATION_ITEM_PLUGIN_REQUIRED_KEY,
	AI_CUSTOMIZATION_ITEM_PLUGIN_URI_KEY,
	AI_CUSTOMIZATION_ITEM_STORAGE_KEY,
	AICustomizationManagementItemMenuId,
	AICustomizationManagementSyntheticItemMenuId,
	DELETE_AI_CUSTOMIZATION_ID,
	getAICustomizationManagementItemMenuId,
} from '../../../browser/aiCustomization/aiCustomizationManagement.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { aiCustomizationManagementSectionRegistry } from '../../../browser/aiCustomization/aiCustomizationManagementSectionRegistry.js';
import { AICustomizationManagementSection, AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { createCustomizationMarketplaceInstallationSnapshot, ICustomizationMarketplaceInstallService, RecordedCustomizationMarketplaceInstallState } from '../../../common/customizationMarketplaceInstallService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { IAgentPlugin, IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IConfirmationResult, IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';

suite('AI customization management contribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const fileActionIds = new Set([
		'aiCustomizationManagement.openFile',
		'aiCustomizationManagement.runPrompt',
		'aiCustomizationManagement.copyPath',
		'aiCustomizationManagement.delete',
		'aiCustomizationManagement.installChatCustomizationExtension',
	]);

	test('Marketplace is not registered as a separate management section', () => {
		assert.strictEqual(aiCustomizationManagementSectionRegistry.getDefault(AICustomizationManagementSection.Marketplace), undefined);
	});

	test('routes deletion of a recorded skill through marketplace uninstall', async () => {
		const uri = URI.file('/workspace/.github/skills/review/SKILL.md');
		const resource: ICustomizationMarketplaceResource = {
			sourceId: 'testSource',
			identifier: 'review',
			displayName: 'Review',
			description: 'Review changes',
			mediaType: CustomizationMarketplaceMediaType.Skill,
			tags: [],
			capabilities: [],
			representativeQueries: [],
		};
		const uninstallCalls: ICustomizationMarketplaceResource[] = [];
		const state: RecordedCustomizationMarketplaceInstallState = { kind: 'installed', target: { kind: 'skill', uri } };
		const installService = new class extends mock<ICustomizationMarketplaceInstallService>() {
			override readonly onDidChange = Event.None;
			override readonly installations = constObservable(createCustomizationMarketplaceInstallationSnapshot([{ resource, state }]));
			override async uninstall(candidate: ICustomizationMarketplaceResource): Promise<void> { uninstallCalls.push(candidate); }
		}();
		const instantiationService = workbenchInstantiationService({}, store);
		instantiationService.stub(ICustomizationMarketplaceInstallService, installService);
		const command = CommandsRegistry.getCommand(DELETE_AI_CUSTOMIZATION_ID);
		assert.ok(command);

		await instantiationService.invokeFunction(accessor => command.handler(accessor, {
			uri,
			name: 'Review',
			promptType: PromptsType.skill,
			storage: PromptsStorage.local,
		}));

		assert.deepStrictEqual(uninstallCalls, [resource]);
	});

	test('keeps Uninstall Plugin visible but disabled for items of a plugin the organization requires', async () => {
		const pluginUri = URI.file('/plugins/handy-commands');
		const removals: string[] = [];
		const plugin = new class extends mock<IAgentPlugin>() {
			override readonly uri = pluginUri;
			override readonly label = 'handy-commands';
			override readonly policyEnablement = constObservable<boolean | undefined>(true);
			override async remove(): Promise<boolean> {
				removals.push(this.label);
				return true;
			}
		}();
		const dialogs: string[] = [];
		const instantiationService = workbenchInstantiationService({}, store);
		instantiationService.stub(IAgentPluginService, new class extends mock<IAgentPluginService>() {
			override readonly plugins = constObservable([plugin]);
		}());
		instantiationService.stub(IDialogService, new class extends mock<IDialogService>() {
			override async info(message: string): Promise<void> { dialogs.push(message); }
			override async confirm(): Promise<IConfirmationResult> {
				dialogs.push('confirm');
				return { confirmed: true };
			}
		}());
		const context = { uri: URI.joinPath(pluginUri, 'commands', 'fix-issue.md'), name: 'fix-issue', promptType: PromptsType.prompt, storage: AICustomizationSources.plugin };
		for (const id of [DELETE_AI_CUSTOMIZATION_ID, 'aiCustomizationManagement.uninstallPlugin']) {
			await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor, context));
		}
		const menuItems = (required: boolean) => {
			const values: Record<string, string | boolean> = {
				[AI_CUSTOMIZATION_ITEM_STORAGE_KEY]: AICustomizationSources.plugin,
				[AI_CUSTOMIZATION_ITEM_PLUGIN_URI_KEY]: pluginUri.toString(),
				[AI_CUSTOMIZATION_ITEM_PLUGIN_REQUIRED_KEY]: required,
			};
			const itemContext = { getValue: <T>(key: string) => values[key] as T };
			return MenuRegistry.getMenuItems(AICustomizationManagementItemMenuId)
				.filter(isIMenuItem)
				.filter(item => item.command.id === 'aiCustomizationManagement.uninstallPlugin' && item.when?.evaluate(itemContext))
				.map(item => ({ group: item.group, enabled: item.command.precondition?.evaluate(itemContext) ?? true, tooltip: item.command.tooltip }));
		};

		assert.deepStrictEqual({ dialogs, removals, unmanaged: menuItems(false), required: menuItems(true) }, {
			dialogs: ['This plugin is managed by your organization.', 'This plugin is managed by your organization.'],
			removals: [],
			unmanaged: [
				{ group: 'inline', enabled: true, tooltip: undefined },
				{ group: '4_modify', enabled: true, tooltip: undefined },
			],
			required: [
				{ group: 'inline', enabled: false, tooltip: 'This plugin is managed by your organization.' },
				{ group: '4_modify', enabled: false, tooltip: undefined },
			],
		});
	});

	test('isolates synthetic items from extension-contributed item actions', () => {
		const disposables = store.add(new DisposableStore());
		disposables.add(MenuRegistry.appendMenuItem(AICustomizationManagementItemMenuId, {
			command: {
				id: 'test.extensionContributedAction',
				title: 'Extension Action',
			},
		}));

		const syntheticUri = toAgentHostUri(
			URI.from({ scheme: AGENT_BUILTIN_CUSTOMIZATION_SCHEME, path: '/skill/code-review' }),
			'remote'
		);
		const selectedMenuId = getAICustomizationManagementItemMenuId(syntheticUri);
		const syntheticActionIds = MenuRegistry.getMenuItems(selectedMenuId)
			.filter(isIMenuItem)
			.map(item => item.command.id);
		const regularActionIds = MenuRegistry.getMenuItems(AICustomizationManagementItemMenuId)
			.filter(isIMenuItem)
			.map(item => item.command.id);

		assert.deepStrictEqual({
			usesSyntheticMenu: selectedMenuId === AICustomizationManagementSyntheticItemMenuId,
			syntheticFileActions: syntheticActionIds.filter(id => fileActionIds.has(id)),
			syntheticExtensionActions: syntheticActionIds.filter(id => id === 'test.extensionContributedAction'),
			regularHasFileActions: [...fileActionIds].every(id => regularActionIds.includes(id)),
			readableUsesExtensibleMenu: getAICustomizationManagementItemMenuId(URI.file('/workspace/SKILL.md')) === AICustomizationManagementItemMenuId,
		}, {
			usesSyntheticMenu: true,
			syntheticFileActions: [],
			syntheticExtensionActions: [],
			regularHasFileActions: true,
			readableUsesExtensibleMenu: true,
		});
	});
});
