/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Action } from '../../../../../base/common/actions.js';
import { timeout } from '../../../../../base/common/async.js';
import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { IMenu, IMenuService, isIMenuItem, MenuItemAction, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { HoverService } from '../../../../../platform/hover/browser/hoverService.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { CHAT_SETUP_ACTION_ID } from '../../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ChatPetAccessoryId, ChatPetAccessoryIds, ChatPetAchievementId, ChatPetAchievementIds } from '../../../../../workbench/contrib/chat/browser/chatPetAchievements.js';
import { ChatPetAppearanceTarget, ChatPetVariant, IChatPetService } from '../../../../../workbench/contrib/chat/browser/chatPetService.js';
import { ChatPetCustomizationTab } from '../../../../../workbench/contrib/chat/browser/chatPetAchievementsEditorInput.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ICodexAccountService } from '../../../../../workbench/services/agentHost/browser/codexAccountService.js';
import { IAuthenticationService } from '../../../../../workbench/services/authentication/common/authentication.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { AgentsWindowMenus } from '../../../../browser/agentsWindowMenus.js';
import { getChatGPTRateLimitResetHover, shouldShowAccountPanelSummary, TitleBarAccountWidget } from '../../browser/account.contribution.js';
import { getSessionsChatPetAchievementBadges, SessionsChatPetAchievementBadges } from '../../browser/chatPetAchievementBadges.js';

suite('Sessions - Account Menu', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const [key, keyCode, signedIn, screenReader, disabledSignIn] of [
		['Enter', 13, false, false, false], [' ', 32, false, true, false],
		['Enter', 13, true, false, false], [' ', 32, true, true, false],
		['Enter', 13, false, false, true],
	] as const) {
		test(`focuses the profile panel actions with ${key === ' ' ? 'Space' : key} (signed in: ${signedIn}, screen reader: ${screenReader}, sign-in disabled: ${disabledSignIn})`, async () => {
			const container = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
			container.style.setProperty('--vscode-focusBorder', '#007acc');
			container.style.setProperty('--vscode-strokeThickness', '1px');
			store.add(toDisposable(() => container.remove()));
			const instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(IContextKeyService, { contextMatchesRules: () => !disabledSignIn });
			const executedCommands: string[] = [];
			instantiationService.stub(ICommandService, {
				executeCommand: async (id: string) => { executedCommands.push(id); },
			});
			const configurationService = new TestConfigurationService();
			configurationService.setUserConfiguration('workbench.hover.delay', 10);
			store.add(configurationService.onDidChangeConfigurationEmitter);
			instantiationService.stub(IConfigurationService, configurationService);
			instantiationService.stub(IContextMenuService, { onDidShowContextMenu: Event.None });
			instantiationService.stub(IKeybindingService, new MockKeybindingService());
			instantiationService.stub(ILayoutService, {
				activeContainer: container,
				mainContainer: container,
				getContainer: () => container,
				onDidLayoutContainer: Event.None,
			});
			instantiationService.stub(IAccessibilityService, new class extends TestAccessibilityService {
				override isScreenReaderOptimized(): boolean { return screenReader; }
			}());
			instantiationService.stub(IMarkdownRendererService, {});
			const hoverService = store.add(instantiationService.createInstance(HoverService));
			const actionHovers: string[] = [];
			hoverService.showDelayedHover = options => {
				if (typeof options.content === 'string') {
					actionHovers.push(options.content);
				}
				return undefined;
			};
			instantiationService.stub(IHoverService, hoverService);
			instantiationService.stub(IDefaultAccountService, new class extends mock<IDefaultAccountService>() {
				override readonly onDidChangeDefaultAccount = Event.None;
				override readonly currentDefaultAccount = null;
				override async getDefaultAccount() { return null; }
			}());
			instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
				override readonly onDidChangeSessions = Event.None;
				override async getSessions() {
					return signedIn ? [{
						id: 'test-session',
						accessToken: 'test-token',
						account: { id: 'test-account', label: 'Test Account' },
						scopes: [],
					}] : [];
				}
			}());
			instantiationService.stub(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
				override readonly entitlement = ChatEntitlement.Unknown;
				override readonly sentiment = { hidden: true };
				override readonly quotas = {};
				override readonly onDidChangeEntitlement = Event.None;
				override readonly onDidChangeSentiment = Event.None;
				override readonly onDidChangeQuotaExceeded = Event.None;
				override readonly onDidChangeQuotaRemaining = Event.None;
			}());
			instantiationService.stub(ICodexAccountService, new class extends mock<ICodexAccountService>() {
				override readonly account = { status: 'signedOut' as const };
				override readonly onDidChangeAccount = Event.None;
			}());
			const menuActions = [signedIn ? 'Settings' : 'First Action', 'Second Action'].map((title, index) => instantiationService.createInstance(
				MenuItemAction, { id: signedIn && index === 0 ? 'workbench.action.openSettings' : `test.action${index}`, title }, undefined, undefined, undefined, undefined,
			));
			if (!signedIn) {
				const signIn = MenuRegistry.getMenuItems(AgentsWindowMenus.AccountMenu)
					.filter(isIMenuItem)
					.find(item => item.command.id === 'workbench.action.agenticSignIn');
				assert.ok(signIn);
				const command = disabledSignIn ? { ...signIn.command, precondition: ContextKeyExpr.false() } : signIn.command;
				menuActions.unshift(instantiationService.createInstance(MenuItemAction, command, undefined, undefined, undefined, undefined));
			}
			instantiationService.stub(IMenuService, new class extends mock<IMenuService>() {
				override createMenu() {
					return new class extends mock<IMenu>() {
						override getActions(): [string, MenuItemAction[]][] { return [['test', menuActions]]; }
						override dispose() { }
					}();
				}
			}());
			const action = store.add(new Action('sessions.action.titleBarAccountWidget', 'Agents Account and Status'));
			const actionBar = store.add(new ActionBar(container, {
				actionViewItemProvider: (action, options) => instantiationService.createInstance(TitleBarAccountWidget, action, options),
			}));
			actionBar.push(action);
			await timeout(0);
			const button = container.querySelector<HTMLElement>('.sessions-account-titlebar-widget');
			assert.ok(button);
			actionBar.focus(0);
			const focusedActions: (string | null | undefined)[] = [];
			for (let i = 0; i < 2; i++) {
				const didRun = Event.toPromise(actionBar.onDidRun);
				for (const type of ['keydown', 'keyup']) {
					button.dispatchEvent(new KeyboardEvent(type, { key, keyCode, bubbles: true }));
				}
				const result = await didRun;
				assert.ifError(result.error);
				const firstAction = mainWindow.document.activeElement;
				assert.ok(firstAction instanceof HTMLElement);
				const panelHover = firstAction.closest<HTMLElement>('.sessions-account-titlebar-panel-hover');
				assert.ok(panelHover);
				const beforePanel = panelHover.previousElementSibling;
				const afterPanel = panelHover.nextElementSibling;
				assert.ok(beforePanel instanceof HTMLElement);
				assert.ok(afterPanel instanceof HTMLElement);
				beforePanel.dispatchEvent(new FocusEvent('focus'));
				assert.ok(panelHover.contains(mainWindow.document.activeElement));
				afterPanel.dispatchEvent(new FocusEvent('focus'));
				assert.strictEqual(mainWindow.document.activeElement, panelHover);
				firstAction.classList.add('focus-visible', 'synthetic-focus');
				firstAction.focus();
				firstAction.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
				if (signedIn) {
					assert.strictEqual(actionHovers.at(-1), 'Manage Copilot Models');
				}
				const outline = mainWindow.getComputedStyle(firstAction);
				assert.deepStrictEqual([outline.outlineStyle, outline.outlineWidth], ['solid', '1px']);
				focusedActions.push(firstAction.getAttribute('aria-label'));
				if (!signedIn && !disabledSignIn) {
					firstAction.classList.remove('focus-visible', 'synthetic-focus');
					const otherAction = container.querySelector<HTMLElement>('.sessions-account-titlebar-panel-actions .action-label');
					assert.ok(otherAction);
					otherAction.focus();
					otherAction.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
					focusedActions.push(otherAction.getAttribute('aria-label'));
				}
				mainWindow.document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {
					key: signedIn ? 'ArrowRight' : 'ArrowDown', keyCode: signedIn ? 39 : 40, bubbles: true,
				}));
				focusedActions.push(mainWindow.document.activeElement?.getAttribute('aria-label'));
				if (signedIn) {
					const focusedAction = mainWindow.document.activeElement;
					assert.ok(focusedAction instanceof HTMLElement);
					focusedAction.classList.add('focus-visible');
					focusedAction.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
					assert.strictEqual(actionHovers.at(-1), 'Settings');
				}
				mainWindow.document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
				assert.deepStrictEqual({
					open: button.classList.contains('menu-visible'),
					focused: mainWindow.document.activeElement === button,
				}, { open: false, focused: true });
			}
			if (!signedIn && !disabledSignIn) {
				const didRun = Event.toPromise(actionBar.onDidRun);
				for (const type of ['keydown', 'keyup']) {
					button.dispatchEvent(new KeyboardEvent(type, { key, keyCode, bubbles: true }));
				}
				await didRun;
				const signIn = mainWindow.document.activeElement;
				for (const type of ['keydown', 'keyup']) {
					signIn?.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', keyCode: 13, bubbles: true }));
				}
				await timeout(0);
			}
			const clickButton = () => {
				for (const type of ['mousedown', 'mouseup', 'click']) {
					button.dispatchEvent(new MouseEvent(type, { button: 0, bubbles: true, cancelable: true }));
				}
			};
			clickButton();
			assert.deepStrictEqual({
				focusedActions,
				pointerOpened: button.classList.contains('menu-visible'),
				pointerFocus: mainWindow.document.activeElement?.classList.contains('monaco-hover'),
				executedCommands,
			}, {
				focusedActions: signedIn
					? ['Manage Copilot Models', 'Settings', 'Manage Copilot Models', 'Settings']
					: disabledSignIn
						? ['First Action', 'Second Action', 'First Action', 'Second Action']
						: ['Sign in with GitHub', 'First Action', 'Second Action', 'Sign in with GitHub', 'First Action', 'Second Action'],
				pointerOpened: true,
				pointerFocus: true,
				executedCommands: signedIn || disabledSignIn ? [] : ['workbench.action.agenticSignIn'],
			});
			clickButton();
			assert.strictEqual(button.classList.contains('menu-visible'), false);
			clickButton();
			const pointerPanelAction = container.querySelector<HTMLElement>('.sessions-account-titlebar-panel .action-label');
			assert.ok(pointerPanelAction);
			pointerPanelAction.focus();
			pointerPanelAction.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
			assert.deepStrictEqual({
				open: button.classList.contains('menu-visible'),
				focused: mainWindow.document.activeElement === button,
			}, { open: false, focused: true });
			clickButton();
			const outside = append(container, $('button', undefined, 'Outside'));
			outside.focus();
			outside.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
			await timeout(550);
			assert.deepStrictEqual({
				open: button.classList.contains('menu-visible'),
				focused: mainWindow.document.activeElement === outside,
			}, { open: false, focused: true });
		});
	}

	async function renderSignedInPanel(providerId: string, providerName: string, enterprise: boolean) {
		const container = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
		store.add(toDisposable(() => container.remove()));
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IContextKeyService, { contextMatchesRules: () => true });
		instantiationService.stub(ICommandService, { executeCommand: async () => undefined });
		const configurationService = new TestConfigurationService();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IContextMenuService, { onDidShowContextMenu: Event.None });
		instantiationService.stub(IKeybindingService, new MockKeybindingService());
		instantiationService.stub(ILayoutService, { activeContainer: container, mainContainer: container, getContainer: () => container, onDidLayoutContainer: Event.None });
		instantiationService.stub(IAccessibilityService, new TestAccessibilityService());
		instantiationService.stub(IMarkdownRendererService, {});
		const hoverService = store.add(instantiationService.createInstance(HoverService));
		hoverService.showDelayedHover = () => undefined;
		instantiationService.stub(IHoverService, hoverService);
		const defaultAccount: IDefaultAccount = { authenticationProvider: { id: providerId, name: providerName, enterprise }, accountName: 'Alex', sessionId: 'session', enterprise };
		instantiationService.stub(IDefaultAccountService, new class extends mock<IDefaultAccountService>() {
			override readonly onDidChangeDefaultAccount = Event.None;
			override readonly currentDefaultAccount = defaultAccount;
			override async getDefaultAccount() { return defaultAccount; }
		}());
		instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
			override readonly onDidChangeSessions = Event.None;
			override async getSessions() {
				return [{ id: 'session', accessToken: 'token', account: { id: 'account', label: 'Alex' }, scopes: [] }];
			}
		}());
		instantiationService.stub(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
			override readonly entitlement = ChatEntitlement.Pro;
			override readonly sentiment = { hidden: true };
			override readonly quotas = {};
			override readonly onDidChangeEntitlement = Event.None;
			override readonly onDidChangeSentiment = Event.None;
			override readonly onDidChangeQuotaExceeded = Event.None;
			override readonly onDidChangeQuotaRemaining = Event.None;
		}());
		instantiationService.stub(ICodexAccountService, new class extends mock<ICodexAccountService>() {
			override readonly account = { status: 'signedOut' as const };
			override readonly onDidChangeAccount = Event.None;
		}());
		const menuActions = [instantiationService.createInstance(MenuItemAction, { id: 'workbench.action.openSettings', title: 'Settings' }, undefined, undefined, undefined, undefined)];
		instantiationService.stub(IMenuService, new class extends mock<IMenuService>() {
			override createMenu() {
				return new class extends mock<IMenu>() {
					override getActions(): [string, MenuItemAction[]][] { return [['test', menuActions]]; }
					override dispose() { }
				}();
			}
		}());
		const action = store.add(new Action('sessions.action.titleBarAccountWidget', 'Agents Account and Status'));
		const actionBar = store.add(new ActionBar(container, {
			actionViewItemProvider: (action, options) => instantiationService.createInstance(TitleBarAccountWidget, action, options),
		}));
		actionBar.push(action);
		await timeout(0);
		const button = container.querySelector<HTMLElement>('.sessions-account-titlebar-widget');
		assert.ok(button);
		actionBar.focus(0);
		const didRun = Event.toPromise(actionBar.onDidRun);
		for (const type of ['keydown', 'keyup']) {
			button.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', keyCode: 13, bubbles: true }));
		}
		await didRun;
		const markClass = container.querySelector('.sessions-account-titlebar-panel-provider-icon')?.className ?? '';
		return {
			mark: /codicon-(github|account)\b/.exec(markClass)?.[1],
			usageRow: !!container.querySelector('.sessions-account-titlebar-panel-provider-usage'),
			summary: container.querySelector('.sessions-account-titlebar-panel-summary')?.textContent ?? undefined,
		};
	}

	test('shows the GitHub mark and usage row only for an account with a GitHub credential', async () => {
		assert.deepStrictEqual({
			github: await renderSignedInPanel('github', 'GitHub', false),
			enterprise: await renderSignedInPanel('github-enterprise', 'GitHub Enterprise', true),
			microsoft: await renderSignedInPanel('microsoft', 'Microsoft', false),
		}, {
			github: { mark: 'github', usageRow: true, summary: 'Signed in as Alex with GitHub' },
			enterprise: { mark: 'github', usageRow: true, summary: 'Signed in as Alex with GitHub Enterprise' },
			microsoft: { mark: 'account', usageRow: false, summary: 'Signed in as Alex with Microsoft' },
		});
	});

	test('labels the signed-out Copilot account action', () => {
		const signIn = MenuRegistry.getMenuItems(AgentsWindowMenus.AccountMenu)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'workbench.action.agenticSignIn');

		assert.ok(signIn);
		assert.strictEqual(typeof signIn.command.title === 'string' ? signIn.command.title : signIn.command.title.value, 'Sign in with GitHub');
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

	test('formats exact ChatGPT rate-limit reset hovers', () => {
		const weeklyReset = new Date(2026, 9, 5, 16, 59);
		const fiveHourReset = new Date(2026, 9, 5, 15, 6);
		assert.deepStrictEqual({
			weekly: getChatGPTRateLimitResetHover({ usedPercent: 1, windowDurationMins: 7 * 24 * 60, resetsAt: weeklyReset.getTime() / 1000 }),
			fiveHour: getChatGPTRateLimitResetHover({ usedPercent: 3, windowDurationMins: 5 * 60, resetsAt: fiveHourReset.getTime() / 1000 }),
		}, {
			weekly: 'Resets on Oct 5, 2026 at 4:59 PM',
			fiveHour: 'Resets at 3:06 PM',
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
				{ id: ChatPetAchievementIds.Blobby, unlocked: false },
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
				{ id: ChatPetAchievementIds.Blobby, unlocked: false },
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
		let selectedTarget: ChatPetAppearanceTarget | undefined;
		const chatPetService = new class extends mock<IChatPetService>() {
			override readonly enabled = constObservable(true);
			override readonly unlockedAchievements = constObservable<readonly ChatPetAchievementId[]>([ChatPetAchievementIds.FirstChatMessage]);
			override readonly selectedAccessory = selectedAccessory;
			override readonly color = variant;

			override getWindowAccessory() {
				return selectedAccessory;
			}

			override setAccessory(accessory: ChatPetAccessoryId | undefined, target?: ChatPetAppearanceTarget): void {
				selected = accessory;
				selectedTarget = target;
				selectedAccessory.set(accessory, undefined);
			}
		}();
		const hoverService = { ...NullHoverService };
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
			selectedTarget,
			unlockedButtonCount: parent.querySelectorAll('.sessions-chat-pet-achievement-badge.monaco-button').length,
			pressed: selectedBadge?.getAttribute('aria-pressed'),
			label: selectedBadge?.getAttribute('aria-label'),
			focusedAction: mainWindow.document.activeElement?.getAttribute('aria-label'),
		}, {
			selected: ChatPetAccessoryIds.CowboyHat,
			selectedTarget: undefined,
			unlockedButtonCount: 1,
			pressed: 'true',
			label: 'Welcome to the Wild West achievement badge: Cowboy Hat, wearing',
			focusedAction: 'View Pet Achievements',
		});
	});

	test('routes True Name and View Achievements through the account owner navigation callback', () => {
		const parent = mainWindow.document.createElement('div');
		store.add(toDisposable(() => parent.remove()));
		const openedTabs: ChatPetCustomizationTab[] = [];
		const seen: ChatPetAchievementId[] = [];
		const chatPetService = new class extends mock<IChatPetService>() {
			override readonly enabled = constObservable(true);
			override readonly unlockedAchievements = constObservable<readonly ChatPetAchievementId[]>([ChatPetAchievementIds.Blobby]);
			override readonly selectedAccessory = constObservable<ChatPetAccessoryId | undefined>(undefined);
			override readonly color = constObservable<ChatPetVariant>('stable');
			override markAchievementSeen(id: ChatPetAchievementId): boolean { seen.push(id); return true; }
		}();
		store.add(new SessionsChatPetAchievementBadges(
			parent,
			tab => openedTabs.push(tab),
			chatPetService,
			new TestThemeService(),
			NullHoverService,
			new NullLogService(),
		));
		parent.querySelector<HTMLElement>('[data-achievement-id="blobby"]')?.click();
		parent.querySelector<HTMLElement>('.sessions-chat-pet-achievement-badges-actions .monaco-button')?.click();
		assert.deepStrictEqual({ openedTabs, seen }, { openedTabs: ['color', 'achievements'], seen: [ChatPetAchievementIds.Blobby] });
	});
});
