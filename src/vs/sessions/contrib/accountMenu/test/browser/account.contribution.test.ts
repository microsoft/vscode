/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IManagedHover } from '../../../../../base/browser/ui/hover/hover.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { CHAT_SETUP_ACTION_ID } from '../../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ChatPetAccessoryId, ChatPetAccessoryIds, ChatPetAchievementId, ChatPetAchievementIds } from '../../../../../workbench/contrib/chat/browser/chatPetAchievements.js';
import { ChatPetVariant, IChatPetService } from '../../../../../workbench/contrib/chat/browser/chatPetService.js';
import { Menus } from '../../../../browser/menus.js';
import { shouldShowAccountPanelSummary } from '../../browser/account.contribution.js';
import { getSessionsChatPetAchievementBadges, SessionsChatPetAchievementBadges } from '../../browser/chatPetAchievementBadges.js';

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
				{ id: ChatPetAchievementIds.AgentsWindowOpened, unlocked: false },
				{ id: ChatPetAchievementIds.CreatePullRequest, unlocked: false },
				{ id: ChatPetAchievementIds.AgentEditKept, unlocked: false },
				{ id: ChatPetAchievementIds.AgentChangesReviewed, unlocked: false },
				{ id: ChatPetAchievementIds.ChatReferenceOpened, unlocked: false },
				{ id: ChatPetAchievementIds.UsefulOutputCopied, unlocked: false },
				{ id: ChatPetAchievementIds.AutopilotEnabled, unlocked: false },
			],
			partial: [
				{ id: ChatPetAchievementIds.FirstChatMessage, unlocked: true },
				{ id: ChatPetAchievementIds.IntegratedBrowserShared, unlocked: true },
				{ id: ChatPetAchievementIds.RequestRevision, unlocked: false },
				{ id: ChatPetAchievementIds.ModelSwitch, unlocked: false },
				{ id: ChatPetAchievementIds.McpServerPresent, unlocked: false },
				{ id: ChatPetAchievementIds.CustomSkillPresent, unlocked: false },
				{ id: ChatPetAchievementIds.AgentsWindowOpened, unlocked: false },
				{ id: ChatPetAchievementIds.CreatePullRequest, unlocked: false },
				{ id: ChatPetAchievementIds.AgentEditKept, unlocked: false },
				{ id: ChatPetAchievementIds.AgentChangesReviewed, unlocked: false },
				{ id: ChatPetAchievementIds.ChatReferenceOpened, unlocked: false },
				{ id: ChatPetAchievementIds.UsefulOutputCopied, unlocked: false },
				{ id: ChatPetAchievementIds.AutopilotEnabled, unlocked: false },
			],
		});
	});

	test('selects an unlocked pet hat from its profile badge', async () => {
		const parent = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(parent);
		store.add(toDisposable(() => parent.remove()));
		const selectedAccessory = observableValue<ChatPetAccessoryId | undefined>(store, undefined);
		const variant = observableValue<ChatPetVariant>(store, 'stable');
		let selected: ChatPetAccessoryId | undefined;
		const chatPetService = new class extends mock<IChatPetService>() {
			override readonly enabled = constObservable(true);
			override readonly unlockedAchievements = constObservable<readonly ChatPetAchievementId[]>([ChatPetAchievementIds.FirstChatMessage]);
			override readonly selectedAccessory = selectedAccessory;
			override readonly variant = variant;

			override setAccessory(accessory: ChatPetAccessoryId | undefined): void {
				selected = accessory;
				selectedAccessory.set(accessory, undefined);
			}
		}();
		const hoverService = new class extends mock<IHoverService>() {
			override setupManagedHover(): IManagedHover {
				return {
					dispose() { },
					show() { },
					hide() { },
					update() { },
				};
			}
		}();
		store.add(new SessionsChatPetAchievementBadges(
			parent,
			() => { },
			chatPetService,
			new TestThemeService(),
			hoverService,
			store.add(new NullLogService()),
		));

		const cowboyHatBadge = parent.querySelector<HTMLElement>(`[data-accessory-id="${ChatPetAccessoryIds.CowboyHat}"]`);
		assert.ok(cowboyHatBadge);
		cowboyHatBadge.click();

		const selectedBadge = parent.querySelector<HTMLElement>(`[data-accessory-id="${ChatPetAccessoryIds.CowboyHat}"]`);
		const viewAchievements = parent.querySelector<HTMLElement>('.sessions-chat-pet-achievement-badges-actions .monaco-button');
		assert.ok(viewAchievements);
		viewAchievements.focus();
		variant.set('insiders', undefined);
		await Promise.resolve();
		assert.deepStrictEqual({
			selected,
			unlockedButtonCount: parent.querySelectorAll('.sessions-chat-pet-achievement-badge.monaco-button').length,
			pressed: selectedBadge?.getAttribute('aria-pressed'),
			label: selectedBadge?.getAttribute('aria-label'),
			focusedAction: mainWindow.document.activeElement?.getAttribute('aria-label'),
		}, {
			selected: ChatPetAccessoryIds.CowboyHat,
			unlockedButtonCount: 1,
			pressed: 'true',
			label: 'Welcome to the Wild West achievement badge: Cowboy Hat, wearing',
			focusedAction: 'View Pet Achievements',
		});
	});
});
