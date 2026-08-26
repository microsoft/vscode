/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { decodeKeybinding } from '../../../../../base/common/keybindings.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyValue, IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { InputFocusedContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { FocusedViewContext, IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { IView } from '../../../../../workbench/common/views.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { DELETE_SESSION_COMMAND_ID, RENAME_SESSION_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { SessionActiveChatIsDeletableContext, SessionSupportsRenameContext, SessionsFocusContext } from '../../../../common/contextkeys.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { SessionsList } from '../../browser/views/sessionsList.js';
import { SessionsView, SessionsViewId } from '../../browser/views/sessionsView.js';
import { createTestSession, TestSessionsManagementService } from './sessionsListTestUtils.js';
import '../../browser/sessionsActions.js';
import '../../browser/views/sessionsViewActions.js';

const DELETE_CHAT_COMMAND_ID = 'sessions.chatCompositeBar.deleteChat';

function context(values: Record<string, ContextKeyValue>): IContext {
	return { getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined };
}

function getKeybindingRule(commandId: string, keyCode: KeyCode) {
	const hash = decodeKeybinding(keyCode, OperatingSystem.Windows)!.getHashCode();
	return KeybindingsRegistry.getDefaultKeybindingsForOS(OperatingSystem.Windows)
		.find(item => item.command === commandId && item.keybinding?.getHashCode() === hash);
}

suite('Sessions - Session management actions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('scopes Rename and Delete keybindings to their Agents Window surfaces', () => {
		const renameRule = getKeybindingRule(RENAME_SESSION_COMMAND_ID, KeyCode.F2);
		const deleteSessionRule = getKeybindingRule(DELETE_SESSION_COMMAND_ID, KeyCode.Delete);
		const deleteChatRule = getKeybindingRule(DELETE_CHAT_COMMAND_ID, KeyCode.Delete);
		assert.ok(renameRule?.when);
		assert.ok(deleteSessionRule?.when);
		assert.ok(deleteChatRule?.when);

		const evaluate = (rule: NonNullable<typeof renameRule>, values: Record<string, ContextKeyValue>) => rule.when?.evaluate(context(values)) ?? true;
		const sessionsWindow = { [IsSessionsWindowContext.key]: true };
		const sessionsList = { ...sessionsWindow, [FocusedViewContext.key]: SessionsViewId };
		const chatTranscript = {
			...sessionsWindow,
			[ChatContextKeys.inChatSession.key]: true,
			[SessionSupportsRenameContext.key]: true,
			[SessionsFocusContext.key]: true,
		};

		assert.deepStrictEqual({
			renameWeight: renameRule.weight1,
			renameInList: evaluate(renameRule, sessionsList),
			renameInListFindInput: evaluate(renameRule, { ...sessionsList, [InputFocusedContext.key]: true }),
			renameInTranscript: evaluate(renameRule, chatTranscript),
			renameInChatInput: evaluate(renameRule, { ...chatTranscript, [ChatContextKeys.inChatInput.key]: true, [InputFocusedContext.key]: true }),
			renameUnsupportedChat: evaluate(renameRule, { ...chatTranscript, [SessionSupportsRenameContext.key]: false }),
			renameOutsideAgentsWindow: evaluate(renameRule, { [ChatContextKeys.inChatSession.key]: true, [SessionSupportsRenameContext.key]: true }),
			deleteWeight: deleteSessionRule.weight1,
			deleteInList: evaluate(deleteSessionRule, sessionsList),
			deleteInListFindInput: evaluate(deleteSessionRule, { ...sessionsList, [InputFocusedContext.key]: true }),
			deleteInTranscript: evaluate(deleteSessionRule, chatTranscript),
			deleteChatInList: evaluate(deleteChatRule, { ...sessionsList, [SessionActiveChatIsDeletableContext.key]: true }),
			deleteChatInTranscript: evaluate(deleteChatRule, { ...chatTranscript, [SessionActiveChatIsDeletableContext.key]: true }),
			deleteChatInInput: evaluate(deleteChatRule, { ...chatTranscript, [SessionActiveChatIsDeletableContext.key]: true, [InputFocusedContext.key]: true }),
		}, {
			renameWeight: KeybindingWeight.SessionsContrib,
			renameInList: true,
			renameInListFindInput: false,
			renameInTranscript: true,
			renameInChatInput: true,
			renameUnsupportedChat: false,
			renameOutsideAgentsWindow: false,
			deleteWeight: KeybindingWeight.SessionsContrib,
			deleteInList: true,
			deleteInListFindInput: false,
			deleteInTranscript: false,
			deleteChatInList: false,
			deleteChatInTranscript: true,
			deleteChatInInput: false,
		});
	});

	function createActionHarness(focusedSessions: readonly ISession[] | undefined, activeSession: ISession | undefined) {
		const instantiationService = disposables.add(new TestInstantiationService());
		const managementService = new TestSessionsManagementService([]);
		const sessionsControl = upcastPartial<SessionsList>({ getFocusedSessions: () => focusedSessions });
		const sessionsView = upcastPartial<SessionsView>({ sessionsControl });
		const getViewWithId = <T extends IView>(id: string): T | null => id === SessionsViewId ? sessionsView as unknown as T : null;

		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({ getViewWithId }));
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({
			activeSession: constObservable<IActiveSession | undefined>(activeSession ? upcastPartial<IActiveSession>(activeSession) : undefined),
		}));
		instantiationService.stub(ISessionsManagementService, managementService);
		instantiationService.stub(IQuickInputService, upcastPartial<IQuickInputService>({
			input: async () => 'Renamed',
		}));
		instantiationService.stub(IDialogService, new TestDialogService({ confirmed: true }));

		return { instantiationService, managementService };
	}

	test('routes keybinding invocations to the focused list session or active chat session', async () => {
		const listSession = createTestSession('List').session;
		const listActiveSession = createTestSession('Other active').session;
		const listHarness = createActionHarness([listSession], listActiveSession);
		const activeSession = createTestSession('Active chat').session;
		const chatHarness = createActionHarness(undefined, activeSession);
		const deleteCapabilities = createTestSession('Delete target');
		deleteCapabilities.capabilities.set({ supportsMultipleChats: false, supportsRename: true, supportsDelete: true }, undefined);
		const deleteHarness = createActionHarness([deleteCapabilities.session], listActiveSession);
		const renameHandler = CommandsRegistry.getCommand(RENAME_SESSION_COMMAND_ID)?.handler;
		const deleteHandler = CommandsRegistry.getCommand(DELETE_SESSION_COMMAND_ID)?.handler;
		assert.ok(renameHandler);
		assert.ok(deleteHandler);

		await renameHandler(listHarness.instantiationService);
		await renameHandler(chatHarness.instantiationService);
		await deleteHandler(deleteHarness.instantiationService);

		assert.deepStrictEqual({
			listRename: listHarness.managementService.renamed.map(({ session, title }) => ({ sessionId: session.sessionId, title })),
			chatRename: chatHarness.managementService.renamed.map(({ session, title }) => ({ sessionId: session.sessionId, title })),
			deleted: deleteHarness.managementService.deleted.map(sessions => sessions.map(session => session.sessionId)),
		}, {
			listRename: [{ sessionId: listSession.sessionId, title: 'Renamed' }],
			chatRename: [{ sessionId: activeSession.sessionId, title: 'Renamed' }],
			deleted: [[deleteCapabilities.session.sessionId]],
		});
	});
});
