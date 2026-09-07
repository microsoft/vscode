/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, isISubmenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { KeybindingsRegistry } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { Menus } from '../../../../browser/menus.js';
import { SESSION_CONVERSATION_SIDE_CHATS_GROUP } from '../../../../browser/sessionConversationGroups.js';
import { SessionView } from '../../../../browser/parts/sessionView.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { type IOpenNewSessionOptions, type IOpenNewSessionResult, ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ChatOriginKind, IChat, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';

import { Action } from '../../../../../base/common/actions.js';
import { NewSessionActionViewItem, type NewSessionButtonStyle, SessionConversationActionsContribution } from '../../browser/sessionsActions.js';
import '../../../chat/browser/chat.contribution.js';
import { NEW_SESSION_ACTION_ID, UNIFIED_WORKSPACE_PICKER_SETTING } from '../../../chat/common/constants.js';
import '../../browser/views/sessionsViewActions.js';
import { createTestSession, TestCommandService } from './sessionsListTestUtils.js';

suite('Sessions - Actions', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('contributes New Chat to the session header overflow', () => {
		const action = MenuRegistry.getMenuItems(Menus.SessionBarToolbar)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'sessions.chatCompositeBar.addChat');

		assert.deepStrictEqual({
			title: action && (typeof action.command.title === 'string' ? action.command.title : action.command.title.value),
			group: action?.group,
			order: action?.order,
			when: action?.when?.serialize(),
		}, {
			title: 'New Chat in This Session',
			group: 'secondary/3_newChat',
			order: 10,
			when: 'sessionIsCreated && sessionSupportsMultipleChats && !isQuickChatSession && !sessionIsArchived',
		});
	});

	test('contributes New Chat to the session list item menu', () => {
		const action = MenuRegistry.getMenuItems(Menus.SessionItemContextMenu)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'sessions.chatCompositeBar.addChat');

		assert.deepStrictEqual({
			title: action && (typeof action.command.title === 'string' ? action.command.title : action.command.title.value),
			group: action?.group,
			order: action?.order,
			when: action?.when?.serialize(),
		}, {
			title: 'New Chat in This Session',
			group: '1_newChat',
			order: 0,
			when: 'sessionIsCreated && sessionSupportsMultipleChats && !isQuickChatSession && !sessionIsArchived',
		});
	});

	test('groups session management actions before creation and close', () => {
		const actions = MenuRegistry.getMenuItems(Menus.SessionBarToolbar)
			.filter(isIMenuItem)
			.filter(item => item.command.id === 'sessions.chatCompositeBar.togglePin' || item.command.id === 'sessions.sessionHeader.rename' || item.command.id === 'sessions.chatCompositeBar.addChat' || item.command.id === 'sessions.chatCompositeBar.close')
			.sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || (a.order ?? 0) - (b.order ?? 0))
			.map(item => ({ id: item.command.id, group: item.group }));

		assert.deepStrictEqual(actions, [
			{ id: 'sessions.sessionHeader.rename', group: 'secondary/1_session' },
			{ id: 'sessions.chatCompositeBar.addChat', group: 'secondary/3_newChat' },
			{ id: 'sessions.chatCompositeBar.togglePin', group: 'secondary/4_pin' },
			{ id: 'sessions.chatCompositeBar.close', group: 'secondary/4_pin' },
		]);
	});

	test('places the Side Chats submenu and New Chat in separate adjacent overflow groups', () => {
		const chats = MenuRegistry.getMenuItems(Menus.SessionBarToolbar)
			.filter(isISubmenuItem)
			.find(item => item.submenu === Menus.SessionConversations);
		const addChat = MenuRegistry.getMenuItems(Menus.SessionBarToolbar)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'sessions.chatCompositeBar.addChat');

		assert.deepStrictEqual({
			chatsTitle: chats && (typeof chats.title === 'string' ? chats.title : chats.title.value),
			chatsGroup: chats?.group,
			chatsOrder: chats?.order,
			chatsWhen: chats?.when?.serialize(),
			addChatGroup: addChat?.group,
			addChatOrder: addChat?.order,
		}, {
			chatsTitle: 'Side Chats',
			chatsGroup: 'secondary/2_chats',
			chatsOrder: 10,
			chatsWhen: 'sessionHasSideChats && sessionIsCreated && !sessionIsArchived',
			addChatGroup: 'secondary/3_newChat',
			addChatOrder: 10,
		});
	});

	test('uses a concise pin title in the session toolbar', () => {
		const pin = MenuRegistry.getMenuItems(Menus.SessionBarToolbar)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'sessions.chatCompositeBar.togglePin');

		assert.strictEqual(pin && (typeof pin.command.title === 'string' ? pin.command.title : pin.command.title.value), 'Pin');
	});

	test('keeps the Command Palette delete action explicit', () => {
		const deleteChat = MenuRegistry.getCommand('sessions.chatCompositeBar.deleteChat');

		assert.strictEqual(deleteChat && (typeof deleteChat.title === 'string' ? deleteChat.title : deleteChat.title.value), 'Delete Chat');
	});

	test('routes New Quick Chat through the new-session composer when remote workspaces are consolidated', async () => {
		const handler = CommandsRegistry.getCommand('sessionsView.newQuickChat')?.handler;
		assert.ok(handler);

		const run = async (consolidatedRemoteWorkspaces: boolean, quickChatAvailable = true) => {
			const instantiationService = disposables.add(new TestInstantiationService());
			const quickChat = upcastPartial<IActiveSession>({ sessionId: 'quick-chat' });
			const existingSession = upcastPartial<IActiveSession>({ sessionId: 'existing-session' });
			const activeSession = observableValue<IActiveSession | undefined>('activeSession', existingSession);
			let unsetNewSessionCalls = 0;
			let openQuickChatCalls = 0;
			let selectNoWorkspaceCalls = 0;
			let focusedSessionId: string | undefined;

			instantiationService.stub(IConfigurationService, new TestConfigurationService({
				[UNIFIED_WORKSPACE_PICKER_SETTING]: consolidatedRemoteWorkspaces,
			}));
			instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override isQuickChatTargetAvailable(): boolean {
					return quickChatAvailable;
				}
			});
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
				override readonly activeSession = activeSession;
				override unsetNewSession() {
					unsetNewSessionCalls++;
					activeSession.set(undefined, undefined);
				}
				override openQuickChat() {
					openQuickChatCalls++;
					activeSession.set(quickChat, undefined);
					return quickChat;
				}
			});
			instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() {
				override getSessionView(sessionId: string | undefined) {
					if (sessionId !== undefined) {
						return undefined;
					}
					return new class extends mock<SessionView>() {
						override selectNoWorkspace(): void {
							selectNoWorkspaceCalls++;
							activeSession.set(quickChat, undefined);
						}
					};
				}
				override focusSession(session: IActiveSession | undefined): void {
					focusedSessionId = session?.sessionId;
				}
			});

			await handler(instantiationService);
			return { unsetNewSessionCalls, openQuickChatCalls, selectNoWorkspaceCalls, focusedSessionId };
		};

		assert.deepStrictEqual({
			enabled: await run(true),
			enabledUnavailable: await run(true, false),
			disabled: await run(false),
		}, {
			enabled: { unsetNewSessionCalls: 1, openQuickChatCalls: 0, selectNoWorkspaceCalls: 1, focusedSessionId: 'quick-chat' },
			enabledUnavailable: { unsetNewSessionCalls: 0, openQuickChatCalls: 0, selectNoWorkspaceCalls: 0, focusedSessionId: 'existing-session' },
			disabled: { unsetNewSessionCalls: 0, openQuickChatCalls: 1, selectNoWorkspaceCalls: 0, focusedSessionId: 'quick-chat' },
		});
	});

	test('groups session toolbar actions with concise titles', () => {
		const actions = MenuRegistry.getMenuItems(Menus.SessionBarToolbar)
			.filter(isIMenuItem)
			.filter(item => ['sessions.chatCompositeBar.togglePin', 'sessions.chatCompositeBar.toggleMaximize', 'sessions.chatCompositeBar.close'].includes(item.command.id))
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
			.map(item => ({
				title: typeof item.command.title === 'string' ? item.command.title : item.command.title.value,
				group: item.group,
			}));

		assert.deepStrictEqual(actions, [
			{ title: 'Pin', group: 'secondary/4_pin' },
			{ title: 'Maximize', group: 'secondary/4_pin' },
			{ title: 'Close', group: 'secondary/4_pin' },
		]);
	});

	test('the Side Chats menu surfaces only side chats, not subagents or ordinary chats', () => {
		const instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
		const { session } = createTestSession('Session');
		const completed = constObservable(SessionStatus.Completed);
		const mainChat: IChat = { ...session.mainChat.get(), resource: URI.parse('test-chat://main'), title: constObservable('Main chat'), status: completed, origin: undefined };
		const peerChat: IChat = { ...mainChat, resource: URI.parse('test-chat://peer'), title: constObservable('Peer chat'), origin: { kind: ChatOriginKind.User } };
		const sideChat: IChat = { ...mainChat, resource: URI.parse('test-chat://side'), title: constObservable('Side chat'), origin: { kind: ChatOriginKind.SideChat } };
		const subagentChat: IChat = { ...mainChat, resource: URI.parse('test-chat://subagent'), title: constObservable('Subagent chat'), origin: { kind: ChatOriginKind.Tool, parentChat: mainChat.resource } };
		const allChats = [mainChat, peerChat, sideChat, subagentChat];

		const activeSession = upcastPartial<IActiveSession>({
			...session,
			chats: constObservable(allChats),
			activeChat: constObservable(mainChat),
			isCreated: constObservable(true),
			sticky: constObservable(false),
		});

		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly visibleSessions = constObservable([activeSession]);
		});

		disposables.add(instantiationService.createInstance(SessionConversationActionsContribution));

		const registered = MenuRegistry.getMenuItems(Menus.SessionConversations)
			.filter(isIMenuItem)
			.filter(item => item.command.id.startsWith(`sessions.openChat.${session.sessionId}.`))
			.map(item => ({
				title: typeof item.command.title === 'string' ? item.command.title : item.command.title.value,
				group: item.group,
			}));

		assert.deepStrictEqual(registered, [
			{ title: 'Side chat', group: SESSION_CONVERSATION_SIDE_CHATS_GROUP },
		]);
	});

	test('does not register a separate New Session to the Side command or shortcut', () => {
		const commandId = 'workbench.action.sessions.newChatToSide';
		assert.deepStrictEqual({
			command: CommandsRegistry.getCommand(commandId),
			keybindings: KeybindingsRegistry.getDefaultKeybindings().filter(binding => binding.command === commandId),
		}, {
			command: undefined,
			keybindings: [],
		});
	});

	test('New button hover only includes the existing keyboard shortcut', () => {
		class TestNewSessionActionViewItem extends NewSessionActionViewItem {
			override getHoverContent(keybindingLabel: string | undefined): string {
				return super.getHoverContent(keybindingLabel);
			}
		}

		const instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
		instantiationService.stub(ICommandService, new TestCommandService());
		const action = disposables.add(new Action(NEW_SESSION_ACTION_ID, 'New'));
		const item = disposables.add(instantiationService.createInstance(
			TestNewSessionActionViewItem, action, 'sidebar', constObservable<NewSessionButtonStyle>('default')
		));

		assert.deepStrictEqual({
			withKeybinding: item.getHoverContent('Ctrl+N'),
			withoutKeybinding: item.getHoverContent(undefined),
		}, {
			withKeybinding: 'New Session (Ctrl+N)',
			withoutKeybinding: 'New Session',
		});
	});

	for (const source of ['sidebar', 'titleBar'] as const) {
		test(`New button in the ${source} opens to the side only on Alt-click`, () => {
			const instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
			const commandService = new TestCommandService();
			instantiationService.stub(ICommandService, commandService);
			let primaryRuns = 0;
			const action = disposables.add(new Action(NEW_SESSION_ACTION_ID, 'New', undefined, true, async () => {
				primaryRuns++;
			}));
			const style = observableValue<NewSessionButtonStyle>('newButtonStyle', 'default');
			const item = disposables.add(instantiationService.createInstance(NewSessionActionViewItem, action, source, style));
			const container = document.createElement('div');
			item.render(container);

			const button = container.querySelector<HTMLElement>('.agent-sessions-compact-new-button.monaco-button');
			assert.ok(button);
			assert.deepStrictEqual({
				buttonCount: container.querySelectorAll('.monaco-button').length,
				dropdown: container.querySelector('.monaco-button-dropdown'),
				popup: button.getAttribute('aria-haspopup'),
				label: button.querySelector('.new-session-button-label')?.textContent,
			}, {
				buttonCount: 1,
				dropdown: null,
				popup: null,
				label: 'New',
			});

			button.click();
			button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
			button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true, cancelable: true }));
			button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true }));
			action.enabled = false;
			button.click();
			button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true }));

			assert.deepStrictEqual({ primaryRuns, commands: commandService.calls }, {
				primaryRuns: 3,
				commands: [{ commandId: NEW_SESSION_ACTION_ID, args: [{ toSide: true }] }],
			});

			style.set('lightweightWithKeybindingBackground', undefined);
			assert.deepStrictEqual({
				lightweight: button.classList.contains('lightweight'),
				keybindingBackground: button.classList.contains('lightweight-keybinding-background'),
			}, { lightweight: true, keybindingBackground: true });
			style.set('default', undefined);
			assert.deepStrictEqual({
				lightweight: button.classList.contains('lightweight'),
				keybindingBackground: button.classList.contains('lightweight-keybinding-background'),
			}, { lightweight: false, keybindingBackground: false });
		});
	}

	for (const toSide of [undefined, true]) {
		for (const scenario of [
			{ name: 'workspace', isQuickChat: false, targetAvailable: true },
			{ name: 'unavailable provider', isQuickChat: false, targetAvailable: false },
			{ name: 'quick chat', isQuickChat: true, targetAvailable: true },
		]) {
			test(`New Session preserves ${scenario.name} inheritance with toSide=${toSide}`, async () => {
				const instantiationService = disposables.add(new TestInstantiationService());
				const { session } = createTestSession('active');
				const activeSession = upcastPartial<IActiveSession>({
					...session,
					isQuickChat: constObservable(scenario.isQuickChat),
				});
				const requests: (IOpenNewSessionOptions | undefined)[] = [];
				instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
					override readonly activeSession = constObservable(activeSession);
					override async openNewSession(options?: IOpenNewSessionOptions): Promise<IOpenNewSessionResult> {
						requests.push(options);
						return { session: undefined, trustDeclined: false };
					}
				});
				instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
					override isNewSessionTargetAvailable(): boolean { return scenario.targetAvailable; }
				});

				const command = CommandsRegistry.getCommand(NEW_SESSION_ACTION_ID);
				assert.ok(command);
				await command.handler(instantiationService, toSide ? { toSide } : undefined);

				assert.deepStrictEqual(requests, [{
					folderUri: scenario.isQuickChat ? undefined : session.workspace.get()?.uri,
					toSide,
					...(!scenario.isQuickChat && scenario.targetAvailable ? {
						providerId: session.providerId,
						sessionTypeId: session.sessionType,
					} : {}),
				}]);
			});
		}
	}

	test('New Session propagates opening failures', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const error = new Error('Opening failed');
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(undefined);
			override async openNewSession(): Promise<IOpenNewSessionResult> {
				throw error;
			}
		});
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() { });
		const command = CommandsRegistry.getCommand(NEW_SESSION_ACTION_ID);
		assert.ok(command);
		await assert.rejects(async () => command.handler(instantiationService, { toSide: true }), error);
	});
});
