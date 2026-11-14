/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { KeybindingsRegistry } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { SESSIONS_LIST_MARK_READ_COMMAND_ID, SESSIONS_LIST_MARK_UNREAD_COMMAND_ID } from '../../../../../common/chatSessionCommands.js';
import { FocusedViewContext, IsSessionsWindowContext } from '../../../../../common/contextkeys.js';
import { IChat, ISession } from '../../../../../services/sessions/common/session.js';
import { MarkAgentSessionReadAction, MarkAgentSessionUnreadAction } from '../../../../chat/browser/agentSessions/agentSessionsActions.js';
import { ChatContextKeys } from '../../../../chat/common/actions/chatContextKeys.js';
import { RawWorkbenchListFocusContextKey } from '../../../../../../platform/list/browser/listService.js';
import { SessionItemContextMenuId } from '../../../browser/views/sessionsList.js';
import { registerSessionsListActions, registerSessionsListReadStateMenus } from '../../../browser/views/sessionsListActions.js';
import { SessionsViewId } from '../../../browser/views/sessionsView.js';
import { ISessionsManagementService } from '../../../common/sessionsManagement.js';
import { RENAME_SESSION_COMMAND_ID } from '../../../common/sessionCommands.js';
import { buildTestSession } from '../../common/testSessionBuilder.js';
import { Context } from '../../../../../../platform/contextkey/browser/contextKeyService.js';

suite('Sessions list read state', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const built = buildTestSession({ id: 's1', title: 'Session' });
	const session: ISession = built.session;
	const main: IChat = built.mainChat.chat;
	const side: IChat = { ...main, resource: session.resource.with({ fragment: 'side' }) };

	test('in an editor window, the agent sessions\' commands mark what the Sessions view and the chat tabs target, through the list\'s commands', async () => {
		const readMenus = () => MenuRegistry.getMenuItems(SessionItemContextMenuId).filter(isIMenuItem).filter(item => item.command.id === SESSIONS_LIST_MARK_READ_COMMAND_ID || item.command.id === SESSIONS_LIST_MARK_UNREAD_COMMAND_ID).length;
		const listKeybindings = () => KeybindingsRegistry.getDefaultKeybindings().filter(rule => (rule.command === SESSIONS_LIST_MARK_READ_COMMAND_ID || rule.command === SESSIONS_LIST_MARK_UNREAD_COMMAND_ID) && rule.when?.serialize().includes('!isSessionsWindow')).length;
		const menusBefore = readMenus();
		const keybindingsBefore = listKeybindings();
		// As the Agents view registers them in an editor window, once the Sessions view shows
		const registrations = new DisposableStore();
		registrations.add(registerSessionsListActions());
		registrations.add(registerSessionsListReadStateMenus());
		const added = { menus: readMenus() - menusBefore, keybindings: listKeybindings() - keybindingsBefore };

		const marked: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			markRead: async target => { marked.push(`read ${target.sessionId}`); },
			markUnread: async target => { marked.push(`unread ${target.sessionId}`); },
			markChatRead: async (_target, chat) => { marked.push(`read chat ${chat.resource.fragment}`); },
			markChatUnread: async (_target, chat) => { marked.push(`unread chat ${chat.resource.fragment}`); },
		}));
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({
			executeCommand: async <R>(id: string, ...args: unknown[]) => instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor, ...args)) as R,
		}));
		// The editor window's own commands, as a chat tab, a session's main chat, a session row and a selection run them
		const read = new MarkAgentSessionReadAction();
		const unread = new MarkAgentSessionUnreadAction();
		for (const [action, context] of [[read, { session, chat: side }], [unread, { session, chat: main }], [read, session], [unread, [session]]] as const) {
			await instantiationService.invokeFunction(accessor => action.run(accessor, context as never));
		}
		registrations.dispose();

		assert.deepStrictEqual({ marked, added }, {
			marked: ['read chat side', 'unread s1', 'read s1', 'unread s1'],
			added: { menus: 2, keybindings: 2 },
		});
	});

	test('F2 renames in the sessions list of either window, and from a chat\'s input only in the Agents window', () => {
		const registrations = registerSessionsListActions();
		const rule = KeybindingsRegistry.getDefaultKeybindings().find(rule => rule.command === RENAME_SESSION_COMMAND_ID && rule.when?.keys().includes(FocusedViewContext.key));
		const evaluate = (sessionsWindow: boolean, inList: boolean) => {
			const context = new Context(1, null);
			context.setValue(IsSessionsWindowContext.key, sessionsWindow);
			if (inList) {
				context.setValue(FocusedViewContext.key, SessionsViewId);
				context.setValue(RawWorkbenchListFocusContextKey.key, true);
			} else {
				context.setValue(ChatContextKeys.inChatSession.key, true);
				context.setValue('sessionSupportsRename', true);
			}
			return !!rule?.when?.evaluate(context);
		};
		const result = { editorList: evaluate(false, true), editorChatInput: evaluate(false, false), agentsList: evaluate(true, true), agentsChatInput: evaluate(true, false) };
		registrations.dispose();

		assert.deepStrictEqual(result, { editorList: true, editorChatInput: false, agentsList: true, agentsChatInput: true });
	});
});
