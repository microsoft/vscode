/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ChatPetCustomizationAchievementContribution } from '../../browser/chatPetAchievements.contribution.js';
import { IAICustomizationItemSource, IAICustomizationListItem } from '../../browser/aiCustomization/aiCustomizationItemSource.js';
import { IAICustomizationItemsModel, ItemsModelSection } from '../../browser/aiCustomization/aiCustomizationItemsModel.js';
import { ChatPetAchievementId, ChatPetAchievementIds } from '../../browser/chatPetAchievements.js';
import { IChatPetService } from '../../browser/chatPetService.js';
import { AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer } from '../../../mcp/common/mcpTypes.js';

suite('Chat Pet Customization Achievements', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function customization(id: string, section: PromptsType): IAICustomizationListItem {
		return {
			id,
			uri: URI.file(`/customizations/${id}.md`),
			name: id,
			filename: `${id}.md`,
			source: 'user',
			promptType: section,
			disabled: false,
		};
	}

	function mcpServer(id: string): IWorkbenchMcpServer {
		return new class extends mock<IWorkbenchMcpServer>() {
			override readonly id = id;
		}();
	}

	test('defers observation until enabled and unlocks only added customization identities', async () => {
		const skills = observableValue<readonly IAICustomizationListItem[]>('skills', []);
		const instructions = observableValue<readonly IAICustomizationListItem[]>('instructions', []);
		const customizationsLoaded = new DeferredPromise<void>();
		const mcpLoaded = new DeferredPromise<void>();
		const mcpChanged = disposables.add(new Emitter<IWorkbenchMcpServer | undefined>());
		const activeSessionResource = observableValue('activeSessionResource', URI.parse('test://session/one'));
		let activeSource = new class extends mock<IAICustomizationItemSource>() { }();
		let servers: IWorkbenchMcpServer[] = [];
		let getItemsCalls = 0;
		let queryLocalCalls = 0;
		const unlockedAchievements = observableValue<readonly ChatPetAchievementId[]>('unlockedAchievements', []);
		const unlocked: ChatPetAchievementId[] = [];
		const itemsModel = new class extends mock<IAICustomizationItemsModel>() {
			override getItems(section: ItemsModelSection) {
				getItemsCalls++;
				return section === AICustomizationManagementSection.Skills ? skills : instructions;
			}
			override getActiveItemSource(): IAICustomizationItemSource {
				return activeSource;
			}
			override whenSectionLoaded(): Promise<void> {
				return customizationsLoaded.p;
			}
		}();
		const customizationHarnessService = new class extends mock<ICustomizationHarnessService>() {
			override readonly activeSessionResource = activeSessionResource;
			override readonly availableHarnesses = constObservable([]);
		}();
		const mcpWorkbenchService = new class extends mock<IMcpWorkbenchService>() {
			override readonly onChange = mcpChanged.event;
			override readonly onReset = Event.None;
			override get local(): readonly IWorkbenchMcpServer[] {
				return servers;
			}
			override async queryLocal(): Promise<IWorkbenchMcpServer[]> {
				queryLocalCalls++;
				await mcpLoaded.p;
				return servers;
			}
		}();
		const enabled = observableValue('enabled', false);
		const chatPetService = new class extends mock<IChatPetService>() {
			override readonly enabled = enabled;
			override readonly unlockedAchievements = unlockedAchievements;
			override unlockAchievement(id: ChatPetAchievementId): boolean {
				unlocked.push(id);
				unlockedAchievements.set([...unlocked], undefined);
				return true;
			}
		}();
		const logService = new class extends mock<ILogService>() { }();
		disposables.add(new ChatPetCustomizationAchievementContribution(
			chatPetService,
			itemsModel,
			customizationHarnessService,
			mcpWorkbenchService,
			logService,
		));

		skills.set([customization('existing-skill', PromptsType.skill)], undefined);
		instructions.set([customization('existing-instructions', PromptsType.instructions)], undefined);
		servers = [mcpServer('existing-server')];
		const callsBeforeEnablement = { getItemsCalls, queryLocalCalls };
		enabled.set(true, undefined);
		customizationsLoaded.complete();
		mcpLoaded.complete();
		await timeout(0);
		const startupUnlocks = [...unlocked];

		activeSource = new class extends mock<IAICustomizationItemSource>() { }();
		activeSessionResource.set(URI.parse('test://session/two'), undefined);
		skills.set([customization('other-existing-skill', PromptsType.skill)], undefined);
		instructions.set([customization('other-existing-instructions', PromptsType.instructions)], undefined);
		await timeout(0);
		const sourceSwitchUnlocks = [...unlocked];

		mcpChanged.fire(servers[0]);
		const enablementChangeUnlocks = [...unlocked];
		servers = [servers[0], mcpServer('new-disabled-server')];
		mcpChanged.fire(servers[1]);
		skills.set([
			customization('other-existing-skill', PromptsType.skill),
			customization('new-skill', PromptsType.skill),
		], undefined);
		instructions.set([
			customization('other-existing-instructions', PromptsType.instructions),
			customization('new-instructions', PromptsType.instructions),
		], undefined);

		assert.deepStrictEqual({
			callsBeforeEnablement,
			callsAfterEnablement: { getItemsCalls, queryLocalCalls },
			startupUnlocks,
			sourceSwitchUnlocks,
			enablementChangeUnlocks,
			unlocked,
		}, {
			callsBeforeEnablement: { getItemsCalls: 0, queryLocalCalls: 0 },
			callsAfterEnablement: { getItemsCalls: 2, queryLocalCalls: 1 },
			startupUnlocks: [],
			sourceSwitchUnlocks: [],
			enablementChangeUnlocks: [],
			unlocked: [
				ChatPetAchievementIds.McpServerPresent,
				ChatPetAchievementIds.CustomSkillPresent,
				ChatPetAchievementIds.InstructionPresent,
			],
		});
	});
});
