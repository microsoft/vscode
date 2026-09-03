/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { decodeKeybinding } from '../../../../../base/common/keybindings.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyValue, IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { InputFocusedContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { RawWorkbenchListFocusContextKey } from '../../../../../platform/list/browser/listService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { FocusedViewContext, IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { IView } from '../../../../../workbench/common/views.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { ARCHIVE_SESSION_COMMAND_ID, RENAME_CHAT_COMMAND_ID, RENAME_SESSION_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { SessionActiveChatIsDeletableContext, SessionActiveChatIsRenameTargetContext, SessionSupportsRenameContext, SessionsFocusContext } from '../../../../common/contextkeys.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ChatInteractivity, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ArchiveSessionAction } from '../../browser/views/sessionsViewActions.js';
import { ISessionChatItem, SessionsList, SessionsListFocusedChatItemContext } from '../../browser/views/sessionsList.js';
import { SessionsView, SessionsViewId } from '../../browser/views/sessionsView.js';
import { createTestSession, TestSessionsManagementService } from './sessionsListTestUtils.js';
import '../../browser/sessionsActions.js';

const DELETE_CHAT_COMMAND_ID = 'sessions.chatCompositeBar.deleteChat';

function context(values: Record<string, ContextKeyValue>): IContext {
	return { getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined };
}

function getKeybindingRule(commandId: string, keybinding: number, operatingSystem = OperatingSystem.Windows) {
	const hash = decodeKeybinding(keybinding, operatingSystem)!.getHashCode();
	return KeybindingsRegistry.getDefaultKeybindingsForOS(operatingSystem)
		.find(item => item.command === commandId && item.keybinding?.getHashCode() === hash);
}

suite('Sessions - Session management actions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('scopes Rename and Archive keybindings to their Agents Window surfaces', () => {
		const renameRule = getKeybindingRule(RENAME_SESSION_COMMAND_ID, KeyCode.F2);
		const renameChatRule = getKeybindingRule(RENAME_CHAT_COMMAND_ID, KeyCode.F2);
		const archiveSessionRule = getKeybindingRule(ARCHIVE_SESSION_COMMAND_ID, KeyCode.Delete);
		const archiveSessionMacRule = getKeybindingRule(ARCHIVE_SESSION_COMMAND_ID, KeyMod.CtrlCmd | KeyCode.Backspace, OperatingSystem.Macintosh);
		const deleteSessionRule = getKeybindingRule('sessionsViewPane.deleteSession', KeyCode.Delete);
		const deleteChatRule = getKeybindingRule(DELETE_CHAT_COMMAND_ID, KeyCode.Delete);
		assert.ok(renameRule?.when);
		assert.ok(renameChatRule?.when);
		assert.ok(archiveSessionRule?.when);
		assert.ok(archiveSessionMacRule?.when);
		assert.ok(deleteChatRule?.when);

		const evaluate = (rule: NonNullable<typeof renameRule>, values: Record<string, ContextKeyValue>) => rule.when?.evaluate(context(values)) ?? true;
		const sessionsWindow = { [IsSessionsWindowContext.key]: true };
		const sessionsList = {
			...sessionsWindow,
			[FocusedViewContext.key]: SessionsViewId,
			[RawWorkbenchListFocusContextKey.key]: true,
			[SessionsListFocusedChatItemContext.key]: false,
		};
		const chatTranscript = {
			...sessionsWindow,
			[ChatContextKeys.inChatSession.key]: true,
			[SessionSupportsRenameContext.key]: true,
			[SessionsFocusContext.key]: true,
			[SessionActiveChatIsRenameTargetContext.key]: false,
		};
		const peerChatTranscript = { ...chatTranscript, [SessionActiveChatIsRenameTargetContext.key]: true };
		const nestedChat = { ...sessionsList, [SessionsListFocusedChatItemContext.key]: true };

		assert.deepStrictEqual({
			renameWeight: renameRule.weight1,
			renameChatWeight: renameChatRule.weight1,
			renameSessionRow: evaluate(renameRule, sessionsList),
			renameChatOnSessionRow: evaluate(renameChatRule, sessionsList),
			renameNestedChatAsSession: evaluate(renameRule, nestedChat),
			renameNestedChat: evaluate(renameChatRule, nestedChat),
			renameInListFindInput: evaluate(renameRule, { ...sessionsList, [InputFocusedContext.key]: true }),
			renameChatInListFindInput: evaluate(renameChatRule, { ...nestedChat, [InputFocusedContext.key]: true }),
			renameMainTranscriptAsSession: evaluate(renameRule, chatTranscript),
			renameMainTranscriptAsChat: evaluate(renameChatRule, chatTranscript),
			renamePeerTranscriptAsSession: evaluate(renameRule, peerChatTranscript),
			renamePeerTranscriptAsChat: evaluate(renameChatRule, peerChatTranscript),
			renamePeerChatInput: evaluate(renameChatRule, { ...peerChatTranscript, [ChatContextKeys.inChatInput.key]: true, [InputFocusedContext.key]: true }),
			renameUnsupportedPeerAsChat: evaluate(renameChatRule, { ...peerChatTranscript, [SessionSupportsRenameContext.key]: false }),
			renameOutsideAgentsWindow: evaluate(renameRule, { [ChatContextKeys.inChatSession.key]: true, [SessionSupportsRenameContext.key]: true }),
			renameChatOutsideAgentsWindow: evaluate(renameChatRule, { [ChatContextKeys.inChatSession.key]: true, [SessionActiveChatIsRenameTargetContext.key]: true }),
			archiveWeight: archiveSessionRule.weight1,
			archiveMacWeight: archiveSessionMacRule.weight1,
			archiveInList: evaluate(archiveSessionRule, sessionsList),
			archiveInListFindInput: evaluate(archiveSessionRule, { ...sessionsList, [InputFocusedContext.key]: true }),
			archiveInTranscript: evaluate(archiveSessionRule, chatTranscript),
			deleteSessionHasKeybinding: !!deleteSessionRule,
			deleteChatInList: evaluate(deleteChatRule, { ...sessionsList, [SessionActiveChatIsDeletableContext.key]: true }),
			deleteChatInTranscript: evaluate(deleteChatRule, { ...chatTranscript, [SessionActiveChatIsDeletableContext.key]: true }),
			deleteChatInInput: evaluate(deleteChatRule, { ...chatTranscript, [SessionActiveChatIsDeletableContext.key]: true, [InputFocusedContext.key]: true }),
		}, {
			renameWeight: KeybindingWeight.SessionsContrib,
			renameChatWeight: KeybindingWeight.SessionsContrib + 10,
			renameSessionRow: true,
			renameChatOnSessionRow: false,
			renameNestedChatAsSession: true,
			renameNestedChat: true,
			renameInListFindInput: false,
			renameChatInListFindInput: false,
			renameMainTranscriptAsSession: true,
			renameMainTranscriptAsChat: false,
			renamePeerTranscriptAsSession: true,
			renamePeerTranscriptAsChat: true,
			renamePeerChatInput: true,
			renameUnsupportedPeerAsChat: true,
			renameOutsideAgentsWindow: false,
			renameChatOutsideAgentsWindow: false,
			archiveWeight: KeybindingWeight.SessionsContrib,
			archiveMacWeight: KeybindingWeight.SessionsContrib,
			archiveInList: true,
			archiveInListFindInput: false,
			archiveInTranscript: false,
			deleteSessionHasKeybinding: false,
			deleteChatInList: false,
			deleteChatInTranscript: true,
			deleteChatInInput: false,
		});
	});

	function createActionHarness(focusedSessions: readonly ISession[] | undefined, activeSession: IActiveSession | undefined, focusedChat?: ISessionChatItem) {
		const instantiationService = disposables.add(new TestInstantiationService());
		const managementService = new TestSessionsManagementService([]);
		const sessionsControl = upcastPartial<SessionsList>({
			getFocusedSessions: () => focusedSessions,
			getFocusedChatItem: () => focusedChat,
		});
		const sessionsView = upcastPartial<SessionsView>({ sessionsControl });
		const getViewWithId = <T extends IView>(id: string): T | null => id === SessionsViewId ? sessionsView as unknown as T : null;

		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({ getViewWithId }));
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({
			activeSession: constObservable<IActiveSession | undefined>(activeSession ? upcastPartial<IActiveSession>(activeSession) : undefined),
		}));
		instantiationService.stub(ISessionsManagementService, managementService);
		instantiationService.stub(IUriIdentityService, upcastPartial<IUriIdentityService>({ extUri }));
		instantiationService.stub(IQuickInputService, upcastPartial<IQuickInputService>({
			input: async () => 'Renamed',
		}));

		return { instantiationService, managementService };
	}

	test('routes session and chat rename commands to their focused targets', async () => {
		const listSession = createTestSession('List').session;
		const listActiveSession = upcastPartial<IActiveSession>(createTestSession('Other active').session);
		const listHarness = createActionHarness([listSession], listActiveSession);
		const base = createTestSession('Explore Jitter Issue').session;
		const mainChat = base.mainChat.get();
		const peerChat = upcastPartial<IChat>({
			resource: URI.parse('test-chat:///grill-and-plan'),
			title: constObservable('Grill and Plan'),
			status: constObservable(SessionStatus.Completed),
			interactivity: constObservable(ChatInteractivity.Full),
			capabilities: constObservable({ canRename: true, canDelete: true }),
		});
		const activeSession = upcastPartial<IActiveSession>({
			...base,
			chats: constObservable([mainChat, peerChat]),
			mainChat: constObservable(mainChat),
			activeChat: constObservable(peerChat),
		});
		const chatHarness = createActionHarness(undefined, activeSession);
		const nestedChatHarness = createActionHarness([], listActiveSession, { session: activeSession, chat: peerChat });
		const archiveSession = createTestSession('Archive target').session;
		const archivedSession = createTestSession('Already archived', { isArchived: true }).session;
		const archiveHarness = createActionHarness([archiveSession, archivedSession], listActiveSession);
		const inactiveArchiveHarness = createActionHarness(undefined, listActiveSession);
		const renameSessionHandler = CommandsRegistry.getCommand(RENAME_SESSION_COMMAND_ID)?.handler;
		const renameChatHandler = CommandsRegistry.getCommand(RENAME_CHAT_COMMAND_ID)?.handler;
		assert.ok(renameSessionHandler);
		assert.ok(renameChatHandler);

		await renameSessionHandler(listHarness.instantiationService);
		await renameSessionHandler(chatHarness.instantiationService);
		await renameChatHandler(chatHarness.instantiationService);
		await renameChatHandler(nestedChatHarness.instantiationService);
		await archiveHarness.instantiationService.invokeFunction(accessor => new ArchiveSessionAction().run(accessor));
		await inactiveArchiveHarness.instantiationService.invokeFunction(accessor => new ArchiveSessionAction().run(accessor));

		assert.deepStrictEqual({
			listRename: listHarness.managementService.renamed.map(({ session, title }) => ({ sessionId: session.sessionId, title })),
			sessionRenameFromChat: chatHarness.managementService.renamed.map(({ session, title }) => ({ sessionId: session.sessionId, title })),
			activeChatRename: chatHarness.managementService.renamedChats.map(({ session, chatResource, title }) => ({ sessionId: session.sessionId, chatResource: chatResource.toString(), title })),
			nestedChatRename: nestedChatHarness.managementService.renamedChats.map(({ session, chatResource, title }) => ({ sessionId: session.sessionId, chatResource: chatResource.toString(), title })),
			archived: archiveHarness.managementService.archived.map(session => session.sessionId),
			inactiveArchived: inactiveArchiveHarness.managementService.archived,
		}, {
			listRename: [{ sessionId: listSession.sessionId, title: 'Renamed' }],
			sessionRenameFromChat: [{ sessionId: activeSession.sessionId, title: 'Renamed' }],
			activeChatRename: [{ sessionId: activeSession.sessionId, chatResource: peerChat.resource.toString(), title: 'Renamed' }],
			nestedChatRename: [{ sessionId: activeSession.sessionId, chatResource: peerChat.resource.toString(), title: 'Renamed' }],
			archived: [archiveSession.sessionId],
			inactiveArchived: [],
		});
	});
});
