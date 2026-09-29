/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { isIMenuItem, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceResource } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { AGENT_BUILTIN_CUSTOMIZATION_SCHEME } from '../../../../../../platform/agentHost/common/agentHostCustomizationUri.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import '../../../browser/aiCustomization/aiCustomizationManagement.contribution.js';
import {
	AICustomizationManagementItemMenuId,
	AICustomizationManagementSyntheticItemMenuId,
	DELETE_AI_CUSTOMIZATION_ID,
	getAICustomizationManagementItemMenuId,
} from '../../../browser/aiCustomization/aiCustomizationManagement.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { aiCustomizationManagementSectionRegistry } from '../../../browser/aiCustomization/aiCustomizationManagementSectionRegistry.js';
import { AICustomizationManagementSection } from '../../../common/aiCustomizationWorkspaceService.js';
import { CustomizationMarketplaceInstallState, ICustomizationMarketplaceInstallService, RecordedCustomizationMarketplaceInstallState } from '../../../common/customizationMarketplaceInstallService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';

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
			override getRecordedResources() { return [resource]; }
			override getRecordedResourcesWithState() { return [{ resource, state }]; }
			override getInstallState(): CustomizationMarketplaceInstallState { return state; }
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

	test('isolates synthetic items from extension-contributed item actions', () => {
		const disposables = new DisposableStore();
		try {
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
		} finally {
			disposables.dispose();
		}
	});
});
