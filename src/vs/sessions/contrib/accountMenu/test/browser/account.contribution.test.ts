/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionViewItemService, NullActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpression, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IUpdateService, State } from '../../../../../platform/update/common/update.js';
import { IsAuxiliaryWindowContext, InEditorZenModeContext } from '../../../../../workbench/common/contextkeys.js';
import { CHAT_SETUP_ACTION_ID } from '../../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ChatPetAchievementIds } from '../../../../../workbench/contrib/chat/browser/chatPetAchievements.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { UpdateTitleBarContribution } from '../../../../../workbench/contrib/update/browser/updateTitleBarEntry.js';
import { UpdateTooltip } from '../../../../../workbench/contrib/update/browser/updateTooltip.js';
import { UpdateTitleBarChatInProgressContext, UpdateTitleBarContext, UpdateTitleBarEditorVisibleContext } from '../../../../../workbench/contrib/update/common/update.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { Menus } from '../../../../browser/menus.js';
import { SessionHasChangesContext, SessionIsCreatedContext, SessionsWelcomeVisibleContext, SinglePaneLayoutEnabledContext } from '../../../../common/contextkeys.js';
import { shouldShowAccountPanelSummary } from '../../browser/account.contribution.js';
import { getSessionsChatPetAchievementBadges } from '../../browser/chatPetAchievementBadges.js';

class TestContextKeyService extends MockContextKeyService {
	override contextMatchesRules(rules: ContextKeyExpression): boolean {
		return rules.evaluate({ getValue: key => this.getContextKeyValue(key) });
	}
}

suite('Sessions - Account Menu', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('labels the signed-out Copilot account action', () => {
		const signIn = MenuRegistry.getMenuItems(Menus.AccountMenu)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'workbench.action.agenticSignIn');

		assert.ok(signIn);
		assert.strictEqual(typeof signIn.command.title === 'string' ? signIn.command.title : signIn.command.title.value, 'Sign in to use GitHub Copilot');
	});

	test('uses the shared Chat setup flow for Copilot sign-in', async () => {
		const executedCommands: string[] = [];
		const command = CommandsRegistry.getCommand('workbench.action.agenticSignIn');
		assert.ok(command);
		const accessor = {
			get: () => ({
				executeCommand: async (commandId: string) => {
					executedCommands.push(commandId);
				},
			}),
		} as ServicesAccessor;

		await command.handler(accessor);

		assert.deepStrictEqual(executedCommands, [CHAT_SETUP_ACTION_ID]);
	});

	test('shows Update during an active Agents session while the editor hides it', () => {
		const contextKeyService = new TestContextKeyService();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IActionViewItemService, new NullActionViewItemService());
		instantiationService.stub(IChatService, {
			requestInProgressObs: observableValue('requestInProgress', true),
		});
		instantiationService.stub(IConfigurationService, {
			onDidChangeConfiguration: Event.None,
			getValue: () => true,
		});
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IHostService, {
			hadLastFocus: async () => true,
		});
		instantiationService.stub(IStorageService, {
			getNumber: () => 0,
			store: () => { },
		});
		instantiationService.stub(IUpdateService, {
			onStateChange: Event.None,
			state: State.Ready({ version: 'next', productVersion: 'next' }, false, false),
		});
		instantiationService.stubInstance(UpdateTooltip, {
			dispose: () => { },
			domNode: mainWindow.document.createElement('div'),
			renderState: () => { },
		});
		store.add(instantiationService.createInstance(UpdateTitleBarContribution));

		UpdateTitleBarContext.bindTo(contextKeyService).set(true);
		UpdateTitleBarChatInProgressContext.bindTo(contextKeyService).set(true);
		InEditorZenModeContext.bindTo(contextKeyService).set(false);
		contextKeyService.createKey('inDebugMode', false);
		IsAuxiliaryWindowContext.bindTo(contextKeyService).set(false);
		SessionsWelcomeVisibleContext.bindTo(contextKeyService).set(false);
		SinglePaneLayoutEnabledContext.bindTo(contextKeyService).set(false);
		SessionIsCreatedContext.bindTo(contextKeyService).set(false);
		SessionHasChangesContext.bindTo(contextKeyService).set(false);

		const updateItem = MenuRegistry.getMenuItems(Menus.TitleBarUpdate)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'workbench.actions.updateIndicator');

		assert.deepStrictEqual({
			agents: updateItem?.when ? contextKeyService.contextMatchesRules(updateItem.when) : undefined,
			editor: contextKeyService.contextMatchesRules(UpdateTitleBarEditorVisibleContext),
		}, {
			agents: true,
			editor: false,
		});
	});

	test('omits the redundant signed-out summary', () => {
		assert.deepStrictEqual({
			signedOut: shouldShowAccountPanelSummary({ source: 'copilot', kind: 'prominent' }, false, false),
			unavailable: shouldShowAccountPanelSummary({ source: 'copilot', kind: 'warning' }, false, false),
			loading: shouldShowAccountPanelSummary({ source: 'account', kind: 'default' }, false, true),
		}, {
			signedOut: false,
			unavailable: true,
			loading: false,
		});
	});

	test('shows unlocked badges first while the pet is enabled', () => {
		assert.deepStrictEqual({
			disabled: getSessionsChatPetAchievementBadges(false, [ChatPetAchievementIds.FirstChatMessage]),
			empty: getSessionsChatPetAchievementBadges(true, [])?.map(badge => ({ id: badge.achievement.id, unlocked: badge.unlocked })),
			partial: getSessionsChatPetAchievementBadges(true, [
				ChatPetAchievementIds.IntegratedBrowserShared,
				ChatPetAchievementIds.FirstChatMessage,
			])?.map(badge => ({ id: badge.achievement.id, unlocked: badge.unlocked })),
		}, {
			disabled: undefined,
			empty: [
				{ id: ChatPetAchievementIds.RequestRevision, unlocked: false },
				{ id: ChatPetAchievementIds.FirstChatMessage, unlocked: false },
				{ id: ChatPetAchievementIds.IntegratedBrowserShared, unlocked: false },
				{ id: ChatPetAchievementIds.ModelSwitch, unlocked: false },
				{ id: ChatPetAchievementIds.McpServerPresent, unlocked: false },
				{ id: ChatPetAchievementIds.CustomSkillPresent, unlocked: false },
			],
			partial: [
				{ id: ChatPetAchievementIds.FirstChatMessage, unlocked: true },
				{ id: ChatPetAchievementIds.IntegratedBrowserShared, unlocked: true },
				{ id: ChatPetAchievementIds.RequestRevision, unlocked: false },
				{ id: ChatPetAchievementIds.ModelSwitch, unlocked: false },
				{ id: ChatPetAchievementIds.McpServerPresent, unlocked: false },
				{ id: ChatPetAchievementIds.CustomSkillPresent, unlocked: false },
			],
		});
	});
});
