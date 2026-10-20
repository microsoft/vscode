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
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyValue, IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { InputFocusedContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { IConfirmation, IConfirmationResult, IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { RawWorkbenchListFocusContextKey } from '../../../../../platform/list/browser/listService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { FocusedViewContext, IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { IView } from '../../../../../workbench/common/views.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { SESSIONS_MARK_AS_DONE_CONFETTI_SETTING } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { ARCHIVE_SESSION_COMMAND_ID, MARK_SESSION_READ_COMMAND_ID, MARK_SESSION_UNREAD_COMMAND_ID, RENAME_CHAT_COMMAND_ID, RENAME_SESSION_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { SessionActiveChatIsDeletableContext, SessionFocusedChatIsRenameTargetContext, SessionSupportsRenameContext, SessionsFocusContext } from '../../../../common/contextkeys.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { SessionView } from '../../../../browser/parts/sessionView.js';
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

	test('scopes read and unread shortcuts to the Sessions list on every platform', () => {
		const sessionsList = {
			[IsSessionsWindowContext.key]: true,
			[FocusedViewContext.key]: SessionsViewId,
			[RawWorkbenchListFocusContextKey.key]: true,
		};
		for (const operatingSystem of [OperatingSystem.Windows, OperatingSystem.Macintosh, OperatingSystem.Linux]) {
			for (const [commandId, keyCode] of [[MARK_SESSION_READ_COMMAND_ID, KeyCode.KeyI], [MARK_SESSION_UNREAD_COMMAND_ID, KeyCode.KeyU]] as const) {
				const rule = getKeybindingRule(commandId, KeyMod.Shift | keyCode, operatingSystem);
				assert.ok(rule?.when);
				assert.deepStrictEqual({
					weight: rule.weight1,
					sessionsList: rule.when.evaluate(context(sessionsList)),
					nestedSession: rule.when.evaluate(context({ ...sessionsList, [SessionsListFocusedChatItemContext.key]: true })),
					input: rule.when.evaluate(context({ ...sessionsList, [InputFocusedContext.key]: true })),
					otherWindow: rule.when.evaluate(context({ ...sessionsList, [IsSessionsWindowContext.key]: false })),
					otherView: rule.when.evaluate(context({ ...sessionsList, [FocusedViewContext.key]: 'otherView' })),
					noListFocus: rule.when.evaluate(context({ ...sessionsList, [RawWorkbenchListFocusContextKey.key]: false })),
				}, {
					weight: KeybindingWeight.SessionsContrib,
					sessionsList: true,
					nestedSession: true,
					input: false,
					otherWindow: false,
					otherView: false,
					noListFocus: false,
				});
			}
		}
	});

	test('read and unread commands target list selection or explicit context, never an unrelated active session', async () => {
		const first = createTestSession('First').session;
		const second = createTestSession('Second').session;
		const active = upcastPartial<IActiveSession>(createTestSession('Other active').session);
		const harness = createActionHarness([first, second], active);
		const noSelection = createActionHarness([], active);
		const noListFocus = createActionHarness(undefined, active);
		const calls: { commandId: string; sessionId: string }[] = [];
		for (const target of [harness, noSelection, noListFocus]) {
			target.instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
				markRead: async session => { calls.push({ commandId: MARK_SESSION_READ_COMMAND_ID, sessionId: session.sessionId }); },
				markUnread: async session => { calls.push({ commandId: MARK_SESSION_UNREAD_COMMAND_ID, sessionId: session.sessionId }); },
			}));
		}

		for (const commandId of [MARK_SESSION_READ_COMMAND_ID, MARK_SESSION_UNREAD_COMMAND_ID]) {
			const handler = CommandsRegistry.getCommand(commandId)?.handler;
			assert.ok(handler);
			await handler(harness.instantiationService);
			await handler(harness.instantiationService, active);
			await handler(harness.instantiationService, [second, first]);
			await handler(noSelection.instantiationService);
			await handler(noListFocus.instantiationService);
		}

		assert.deepStrictEqual(calls, [MARK_SESSION_READ_COMMAND_ID, MARK_SESSION_UNREAD_COMMAND_ID].flatMap(commandId =>
			[first, second, active, second, first].map(session => ({ commandId, sessionId: session.sessionId }))));
	});

	test('preserves legacy Agents window read commands as aliases of the shared commands', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const session = createTestSession('Target').session;
		const calls: { commandId: string; args: readonly ISession[] }[] = [];
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() { }(), 'executeCommand', async (commandId: string, ...args: ISession[]) => {
			calls.push({ commandId, args });
		});
		for (const commandId of ['sessionsViewPane.markRead', 'sessionsViewPane.markUnread']) {
			const handler = CommandsRegistry.getCommand(commandId)?.handler;
			assert.ok(handler);
			await handler(instantiationService, session);
		}
		assert.deepStrictEqual(calls, [
			{ commandId: 'agentSession.markRead', args: [session] },
			{ commandId: 'agentSession.markUnread', args: [session] },
		]);
	});

	test('read shortcuts target selected nested chats without changing their parent or the active session', async () => {
		const parent = createTestSession('Parent').session;
		const peer = upcastPartial<IChat>({ resource: URI.parse('test:/peer') });
		const second = upcastPartial<IChat>({ resource: URI.parse('test:/second') });
		const active = upcastPartial<IActiveSession>(createTestSession('Other active').session);
		const selected = [{ session: parent, chat: peer }, { session: parent, chat: second }];
		const harness = createActionHarness([], active, selected[0], undefined, false, { focusedChats: selected });
		const calls: { sessionId: string; chat: string; read: boolean }[] = [];
		harness.instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			markChatRead: async (session, chat) => { calls.push({ sessionId: session.sessionId, chat: chat.resource.toString(), read: true }); },
			markChatUnread: async (session, chat) => { calls.push({ sessionId: session.sessionId, chat: chat.resource.toString(), read: false }); },
		}));

		for (const commandId of [MARK_SESSION_READ_COMMAND_ID, MARK_SESSION_UNREAD_COMMAND_ID]) {
			const handler = CommandsRegistry.getCommand(commandId)?.handler;
			assert.ok(handler);
			await handler(harness.instantiationService);
		}

		assert.deepStrictEqual(calls, [true, false].flatMap(read =>
			[peer, second].map(chat => ({ sessionId: parent.sessionId, chat: chat.resource.toString(), read }))));
	});

	test('scopes Rename and Archive keybindings to their Agents Window surfaces', () => {
		const renameRule = getKeybindingRule(RENAME_SESSION_COMMAND_ID, KeyCode.F2);
		const renameChatRule = getKeybindingRule(RENAME_CHAT_COMMAND_ID, KeyCode.F2);
		const renameHeaderRule = getKeybindingRule('sessions.sessionHeader.rename', KeyCode.F2);
		const archiveSessionRule = getKeybindingRule(ARCHIVE_SESSION_COMMAND_ID, KeyCode.Delete);
		const archiveSessionMacRule = getKeybindingRule(ARCHIVE_SESSION_COMMAND_ID, KeyMod.CtrlCmd | KeyCode.Backspace, OperatingSystem.Macintosh);
		const deleteSessionRule = getKeybindingRule('sessionsViewPane.deleteSession', KeyCode.Delete);
		const deleteChatRule = getKeybindingRule(DELETE_CHAT_COMMAND_ID, KeyCode.Delete);
		assert.ok(renameRule?.when);
		assert.ok(renameChatRule?.when);
		assert.ok(renameHeaderRule?.when);
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
			[SessionFocusedChatIsRenameTargetContext.key]: false,
		};
		const peerChatTranscript = { ...chatTranscript, [SessionFocusedChatIsRenameTargetContext.key]: true };
		const peerChatTab = {
			...sessionsWindow,
			[SessionsFocusContext.key]: true,
			[SessionFocusedChatIsRenameTargetContext.key]: true,
		};
		const nestedChat = { ...sessionsList, [SessionsListFocusedChatItemContext.key]: true };

		assert.deepStrictEqual({
			renameWeight: renameRule.weight1,
			renameChatWeight: renameChatRule.weight1,
			renameHeaderWeight: renameHeaderRule.weight1,
			renameSessionRow: evaluate(renameRule, sessionsList),
			renameChatOnSessionRow: evaluate(renameChatRule, sessionsList),
			renameHeaderOnSessionRow: evaluate(renameHeaderRule, sessionsList),
			renameNestedChatAsSession: evaluate(renameRule, nestedChat),
			renameNestedChat: evaluate(renameChatRule, nestedChat),
			renameInListFindInput: evaluate(renameRule, { ...sessionsList, [InputFocusedContext.key]: true }),
			renameChatInListFindInput: evaluate(renameChatRule, { ...nestedChat, [InputFocusedContext.key]: true }),
			renameMainTranscriptAsSession: evaluate(renameRule, chatTranscript),
			renameMainTranscriptAsChat: evaluate(renameChatRule, chatTranscript),
			renamePeerTranscriptAsSession: evaluate(renameRule, peerChatTranscript),
			renamePeerTranscriptAsChat: evaluate(renameChatRule, peerChatTranscript),
			renamePeerTabAsChat: evaluate(renameChatRule, peerChatTab),
			renameHeaderInMainTranscript: evaluate(renameHeaderRule, chatTranscript),
			renameHeaderInPeerTranscript: evaluate(renameHeaderRule, peerChatTranscript),
			renamePeerChatInput: evaluate(renameChatRule, { ...peerChatTranscript, [ChatContextKeys.inChatInput.key]: true, [InputFocusedContext.key]: true }),
			renameUnsupportedPeerAsChat: evaluate(renameChatRule, { ...peerChatTranscript, [SessionSupportsRenameContext.key]: false }),
			renameOutsideAgentsWindow: evaluate(renameRule, { [ChatContextKeys.inChatSession.key]: true, [SessionSupportsRenameContext.key]: true }),
			renameChatOutsideAgentsWindow: evaluate(renameChatRule, { [ChatContextKeys.inChatSession.key]: true, [SessionFocusedChatIsRenameTargetContext.key]: true }),
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
			renameHeaderWeight: KeybindingWeight.SessionsContrib + 1,
			renameSessionRow: true,
			renameChatOnSessionRow: false,
			renameHeaderOnSessionRow: false,
			renameNestedChatAsSession: true,
			renameNestedChat: true,
			renameInListFindInput: false,
			renameChatInListFindInput: false,
			renameMainTranscriptAsSession: true,
			renameMainTranscriptAsChat: false,
			renamePeerTranscriptAsSession: true,
			renamePeerTranscriptAsChat: true,
			renamePeerTabAsChat: true,
			renameHeaderInMainTranscript: true,
			renameHeaderInPeerTranscript: false,
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

	function createActionHarness(
		focusedSessions: readonly ISession[] | undefined,
		activeSession: IActiveSession | undefined,
		focusedChat?: ISessionChatItem,
		focusedGroupChat?: IChat,
		renameFocusedTab = false,
		options: { confettiEnabled?: boolean; reducedMotion?: boolean; focusedChats?: readonly ISessionChatItem[] } = {},
	) {
		const instantiationService = disposables.add(new TestInstantiationService());
		const managementService = new TestSessionsManagementService([]);
		const playedSignals: AccessibilitySignal[] = [];
		const dialogService = new class extends mock<IDialogService>() {
			readonly confirmations: IConfirmation[] = [];

			override async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
				this.confirmations.push(confirmation);
				return { confirmed: false };
			}
		}();
		const inlineRenamedSessions: ISession[] = [];
		const inlineRenamedChats: ISessionChatItem[] = [];
		const inlineRenamedTabs: URI[] = [];
		let inlineRenamedFocusedTabs = 0;
		const sessionsControl = upcastPartial<SessionsList>({
			getFocusedSessions: () => focusedSessions,
			getFocusedChatItem: () => focusedChat,
			getFocusedChatItems: () => options.focusedChats ?? (focusedChat ? [focusedChat] : []),
			beginRenameSession: session => {
				inlineRenamedSessions.push(session);
				return true;
			},
			beginRenameChat: item => {
				inlineRenamedChats.push(item);
				return true;
			},
		});
		const sessionsView = upcastPartial<SessionsView>({ sessionsControl });
		const getViewWithId = <T extends IView>(id: string): T | null => id === SessionsViewId ? sessionsView as unknown as T : null;

		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({ getViewWithId }));
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({
			activeSession: constObservable<IActiveSession | undefined>(activeSession ? upcastPartial<IActiveSession>(activeSession) : undefined),
		}));
		const sessionView = activeSession ? upcastPartial<SessionView>({
			getSession: () => activeSession,
			getFocusedChat: () => focusedGroupChat,
			startChatTitleEditing: chatResource => {
				inlineRenamedTabs.push(chatResource);
				return true;
			},
			startFocusedChatTitleEditing: () => {
				if (!renameFocusedTab) {
					return false;
				}
				inlineRenamedFocusedTabs++;
				return true;
			},
		}) : undefined;
		instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() {
			override getSessionView(sessionId: string | undefined): SessionView | undefined {
				return sessionView?.getSession()?.sessionId === sessionId ? sessionView : undefined;
			}
			override getFocusedSessionView(): SessionView | undefined {
				return focusedGroupChat ? sessionView : undefined;
			}
		}());
		instantiationService.stub(ISessionsManagementService, managementService);
		instantiationService.stub(IConfigurationService, new TestConfigurationService({
			[SESSIONS_MARK_AS_DONE_CONFETTI_SETTING]: options.confettiEnabled ?? true,
		}));
		instantiationService.stub(IAccessibilityService, new class extends mock<IAccessibilityService>() {
			override isMotionReduced(): boolean {
				return options.reducedMotion ?? false;
			}
		}());
		instantiationService.stub(IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() {
			override async playSignal(signal: AccessibilitySignal): Promise<void> {
				playedSignals.push(signal);
			}
		}());
		instantiationService.stub(IDialogService, dialogService);
		instantiationService.stub(IUriIdentityService, upcastPartial<IUriIdentityService>({ extUri }));
		instantiationService.stub(IQuickInputService, upcastPartial<IQuickInputService>({
			input: async () => 'Renamed',
		}));

		return { instantiationService, managementService, dialogService, playedSignals, inlineRenamedSessions, inlineRenamedChats, inlineRenamedTabs, inlineRenamedFocusedTabs: () => inlineRenamedFocusedTabs };
	}

	test('archives active sessions without confirmation', async () => {
		const active = createTestSession('Running', { status: SessionStatus.InProgress }).session;
		const waiting = createTestSession('Waiting', { status: SessionStatus.NeedsInput }).session;
		const completed = createTestSession('Completed').session;
		const harness = createActionHarness([active, waiting, completed], undefined);

		await harness.instantiationService.invokeFunction(accessor => new ArchiveSessionAction().run(accessor));

		assert.deepStrictEqual({
			confirmations: harness.dialogService.confirmations,
			archived: harness.managementService.archived.map(session => session.sessionId),
		}, {
			confirmations: [],
			archived: [active.sessionId, waiting.sessionId, completed.sessionId],
		});
	});

	test('plays the confetti signal after keyboard archive when animation is enabled', async () => {
		const enabled = createActionHarness([createTestSession('Enabled').session], undefined);
		const disabled = createActionHarness([createTestSession('Disabled').session], undefined, undefined, undefined, false, { confettiEnabled: false });
		const reducedMotion = createActionHarness([createTestSession('Reduced motion').session], undefined, undefined, undefined, false, { reducedMotion: true });

		await enabled.instantiationService.invokeFunction(accessor => new ArchiveSessionAction().run(accessor));
		await disabled.instantiationService.invokeFunction(accessor => new ArchiveSessionAction().run(accessor));
		await reducedMotion.instantiationService.invokeFunction(accessor => new ArchiveSessionAction().run(accessor));

		assert.deepStrictEqual({
			enabled: enabled.playedSignals,
			disabled: disabled.playedSignals,
			reducedMotion: reducedMotion.playedSignals,
		}, {
			enabled: [AccessibilitySignal.confetti],
			disabled: [],
			reducedMotion: [],
		});
	});

	test('routes session and chat rename commands to their focused targets', async () => {
		const listSession = createTestSession('List').session;
		const listActiveSession = upcastPartial<IActiveSession>(createTestSession('Other active').session);
		const listHarness = createActionHarness([listSession], listActiveSession);
		const base = createTestSession('Explore Jitter Issue').session;
		const mainChat = base.mainChat.get();
		const peerChat = upcastPartial<IChat>({
			resource: URI.parse('test-chat:///grill-and-plan'),
			workspace: constObservable(undefined),
			title: constObservable('Grill and Plan'),
			status: constObservable(SessionStatus.Completed),
			interactivity: constObservable(ChatInteractivity.Full),
			capabilities: constObservable({ canRename: true, canArchive: true, canDelete: true }),
		});
		const activeSession = upcastPartial<IActiveSession>({
			...base,
			chats: constObservable([mainChat, peerChat]),
			mainChat: constObservable(mainChat),
			activeChat: constObservable(peerChat),
		});
		const chatHarness = createActionHarness(undefined, activeSession, undefined, peerChat);
		const chatTabHarness = createActionHarness(undefined, activeSession, undefined, peerChat, true);
		const chatTabMenuHarness = createActionHarness(undefined, activeSession);
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
		await renameChatHandler(chatTabHarness.instantiationService);
		await renameChatHandler(chatTabMenuHarness.instantiationService, { session: activeSession, chat: peerChat, inline: true });
		await renameChatHandler(nestedChatHarness.instantiationService);
		await archiveHarness.instantiationService.invokeFunction(accessor => new ArchiveSessionAction().run(accessor));
		await inactiveArchiveHarness.instantiationService.invokeFunction(accessor => new ArchiveSessionAction().run(accessor));

		assert.deepStrictEqual({
			listInlineRename: listHarness.inlineRenamedSessions.map(session => session.sessionId),
			listPromptRename: listHarness.managementService.renamed,
			sessionRenameFromChat: chatHarness.managementService.renamed.map(({ session, title }) => ({ sessionId: session.sessionId, title })),
			activeChatRename: chatHarness.managementService.renamedChats.map(({ session, chatResource, title }) => ({ sessionId: session.sessionId, chatResource: chatResource.toString(), title })),
			activeChatTabInlineRename: chatTabHarness.inlineRenamedFocusedTabs(),
			activeChatTabPromptRename: chatTabHarness.managementService.renamedChats,
			chatTabMenuInlineRename: chatTabMenuHarness.inlineRenamedTabs.map(resource => resource.toString()),
			chatTabMenuPromptRename: chatTabMenuHarness.managementService.renamedChats,
			nestedChatInlineRename: nestedChatHarness.inlineRenamedChats.map(item => item.chat.resource.toString()),
			nestedChatPromptRename: nestedChatHarness.managementService.renamedChats,
			archived: archiveHarness.managementService.archived.map(session => session.sessionId),
			inactiveArchived: inactiveArchiveHarness.managementService.archived,
		}, {
			listInlineRename: [listSession.sessionId],
			listPromptRename: [],
			sessionRenameFromChat: [{ sessionId: activeSession.sessionId, title: 'Renamed' }],
			activeChatRename: [{ sessionId: activeSession.sessionId, chatResource: peerChat.resource.toString(), title: 'Renamed' }],
			activeChatTabInlineRename: 1,
			activeChatTabPromptRename: [],
			chatTabMenuInlineRename: [peerChat.resource.toString()],
			chatTabMenuPromptRename: [],
			nestedChatInlineRename: [peerChat.resource.toString()],
			nestedChatPromptRename: [],
			archived: [archiveSession.sessionId],
			inactiveArchived: [],
		});
	});
});
