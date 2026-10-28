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
import { nativeCopilotModelProviderMeta, nativeLokiActiveAccountMeta, nativeLokiAuthenticationMeta, NATIVE_EMU_PROTECTED_RESOURCE, NATIVE_LOKI_PROTECTED_RESOURCE, type INativeLokiProtectedResource } from '../../../../../platform/agentHost/common/meta/nativeLoki.js';
import type { RootState } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { CHAT_SETUP_ACTION_ID } from '../../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ChatPetAccessoryId, ChatPetAccessoryIds, ChatPetAchievementId, ChatPetAchievementIds } from '../../../../../workbench/contrib/chat/browser/chatPetAchievements.js';
import { ChatPetVariant, IChatPetService } from '../../../../../workbench/contrib/chat/browser/chatPetService.js';
import type { AuthenticationSession } from '../../../../../workbench/services/authentication/common/authentication.js';
import { Menus } from '../../../../browser/menus.js';
import { getAuthenticatedNativeMicrosoftAccount, getAuthenticatedNativeLokiAccountLabel, shouldShowAccountPanelSummary } from '../../browser/account.contribution.js';
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
			lokiAccount: shouldShowAccountPanelSummary({ source: 'account', kind: 'default' }, false, false, true),
		}, {
			signedOut: false,
			unavailable: true,
			loading: false,
			lokiAccount: false,
		});
	});

	test('shows only the account accepted by the Loki host, not the first Microsoft session or a configured pin', () => {
		const state = (resource: INativeLokiProtectedResource, provider = 'copilotcli'): RootState => ({
			agents: [{ provider, displayName: 'Copilot', description: '', models: [], protectedResources: [resource] }],
		});
		const pinned = { ...NATIVE_LOKI_PROTECTED_RESOURCE, _meta: nativeLokiAuthenticationMeta({ accountId: 'personal-id' }) };
		const active = { ...pinned, _meta: { ...pinned._meta, ...nativeLokiActiveAccountMeta('corporate-id') } };
		const sessions: AuthenticationSession[] = [
			{ id: 'personal', accessToken: 'unused', scopes: [], account: { id: 'personal-id', label: 'personal@example.com' } },
			{ id: 'corporate', accessToken: 'unused', scopes: [], account: { id: 'corporate-id', label: 'corporate@example.com' } },
		];

		assert.deepStrictEqual({
			pinnedOnly: getAuthenticatedNativeMicrosoftAccount(state(pinned)),
			active: getAuthenticatedNativeMicrosoftAccount(state(active)),
			activeLabel: getAuthenticatedNativeLokiAccountLabel(sessions, 'corporate-id'),
			missingLabel: getAuthenticatedNativeLokiAccountLabel(sessions, 'different-id'),
			signedOut: getAuthenticatedNativeMicrosoftAccount({ agents: [] }),
			reconnecting: getAuthenticatedNativeMicrosoftAccount(undefined),
			otherProvider: getAuthenticatedNativeMicrosoftAccount(state(active, 'codex')),
			otherResource: getAuthenticatedNativeMicrosoftAccount(state({ ...active, resource: 'https://example.com' })),
		}, {
			pinnedOnly: undefined,
			active: { id: 'corporate-id', githubCopilot: false, microsoft365Copilot: true },
			activeLabel: 'corporate@example.com',
			missingLabel: undefined,
			signedOut: undefined,
			reconnecting: undefined,
			otherProvider: undefined,
			otherResource: undefined,
		});
	});

	test('ties EMU, M365, and combined model availability to the accepted Microsoft account', () => {
		const accountId = 'corporate-id';
		const active = nativeLokiActiveAccountMeta(accountId);
		const loki = { ...NATIVE_LOKI_PROTECTED_RESOURCE, _meta: active };
		const emu = { ...NATIVE_EMU_PROTECTED_RESOURCE, _meta: active };
		const model = (id: string, providerId: string) => ({
			id, name: id, provider: 'copilotcli', _meta: nativeCopilotModelProviderMeta(providerId),
		});
		const capi = model('capi-gpt-5', 'copilot');
		const m365 = model('loki-gpt-5', `loki:${accountId}`);
		const state = (resources: INativeLokiProtectedResource[], models: RootState['agents'][number]['models']): RootState => ({
			agents: [{ provider: 'copilotcli', displayName: 'Copilot', description: '', models, protectedResources: resources }],
		});
		assert.deepStrictEqual({
			emuOnly: getAuthenticatedNativeMicrosoftAccount(state([NATIVE_LOKI_PROTECTED_RESOURCE, emu], [capi])),
			m365Only: getAuthenticatedNativeMicrosoftAccount(state([loki, NATIVE_EMU_PROTECTED_RESOURCE], [m365])),
			both: getAuthenticatedNativeMicrosoftAccount(state([loki, emu], [capi, m365])),
			autoOnly: getAuthenticatedNativeMicrosoftAccount(state([loki, emu], [model('auto', 'copilot'), m365])),
			noModels: getAuthenticatedNativeMicrosoftAccount(state([NATIVE_LOKI_PROTECTED_RESOURCE, emu], [])),
		}, {
			emuOnly: { id: accountId, githubCopilot: true, microsoft365Copilot: false },
			m365Only: { id: accountId, githubCopilot: false, microsoft365Copilot: true },
			both: { id: accountId, githubCopilot: true, microsoft365Copilot: true },
			autoOnly: { id: accountId, githubCopilot: false, microsoft365Copilot: true },
			noModels: { id: accountId, githubCopilot: false, microsoft365Copilot: false },
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
