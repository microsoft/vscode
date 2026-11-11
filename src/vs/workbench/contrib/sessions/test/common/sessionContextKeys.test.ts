/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { autorun, constObservable, IReader, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContextKeyValue, IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IsQuickChatSessionContext, SessionActiveChatCanArchiveContext, SessionActiveChatCanvasReferenceKeysContext, SessionActiveChatHasSideChatsContext, SessionActiveChatResourceContext, SessionHasCachedChangesContext, SessionHasChangesContext, SessionHasGitRepositoryContext, SessionHasMultipleCommittedChatsContext, SessionHasWorkspaceContext, SessionIsActiveContext, SessionIsCreatedContext, SessionIsReadContext, SessionProviderIdContext, SessionSupportsSideChatContext, SessionWorkspaceIsVirtualContext } from '../../common/contextkeys.js';
import { ChatInteractivity, ChatOriginKind, IChat, ISession, ISessionChangeset, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { setHostSessionContextKeys, setSessionContextKeys } from '../../common/sessionContextKeys.js';
import { ISessionChangesStatsCache, SessionChangesStatsCache } from '../../../../services/sessions/common/sessionChangesStatsCache.js';
import { getCanvasReferenceKey } from '../../../../common/canvasReference.js';
import { IChatSessionFileChange } from '../../../../common/chatSessionFileChange.js';
import { IPaneViewState } from '../../../../services/sessions/common/sessionPane.js';

/** What a pane shows: `chat` of `session`, with its tab strip of `tabs`, shown while `showTabs`. */
function paneShowing(session: ISession, chat: IChat, tabs: readonly IChat[], showTabs: boolean): { readonly session: ISession; readonly chat: IChat; readonly state: IPaneViewState } {
	return {
		session,
		chat,
		state: {
			sticky: constObservable(false),
			tabs: { openChats: constObservable(tabs), closedChats: constObservable([]), lastClosedChat: undefined, visibleChatTabs: constObservable(tabs), shouldShowChatTabs: constObservable(showTabs) },
			isDetached: false,
		},
	};
}

/** Sets the keys of the host of a pane that shows `shown`. */
function setPaneKeys(shown: ReturnType<typeof paneShowing>, contextKeyService: IContextKeyService, reader: IReader | undefined, changesStatsCache?: ISessionChangesStatsCache): void {
	setHostSessionContextKeys(shown.session, shown.chat, shown.state, contextKeyService, reader, changesStatsCache);
}

function createSession(hasGitRepository: ISettableObservable<boolean>): ISession {
	return upcastPartial<ISession>({
		sessionId: 'session',
		providerId: 'provider',
		sessionType: 'type',
		workspace: constObservable(undefined),
		hasGitRepository,
		isArchived: constObservable(false),
		isRead: constObservable(true),
		status: constObservable(SessionStatus.Completed),
		capabilities: constObservable({ supportsMultipleChats: false }),
		mainChat: constObservable(stubChat),
	});
}

const stubChat: IChat = {
	resource: URI.parse('test:///chat'),
	createdAt: new Date(),
	workspace: constObservable(undefined),
	title: constObservable('Chat'),
	updatedAt: constObservable(new Date()),
	status: constObservable(0),
	changes: constObservable([]),
	changesets: constObservable([]),
	checkpoints: constObservable(undefined),
	modelId: constObservable(undefined),
	modelSource: constObservable(undefined),
	mode: constObservable(undefined),
	isArchived: constObservable(false),
	isRead: constObservable(true),
	interactivity: constObservable(ChatInteractivity.Full),
	description: constObservable(undefined),
	lastTurnEnd: constObservable(undefined),
};

function stubSession(overrides: Partial<ISession> & Pick<ISession, 'sessionId'>): ISession {
	return {
		providerId: 'test',
		resource: URI.parse(`test:///${overrides.sessionId}`),
		sessionType: 'test',
		harness: 'copilot',
		environment: 'local',
		application: constObservable({ id: 'vscode', label: 'VS Code' }),
		icon: Codicon.vm,
		createdAt: new Date(),
		workspace: constObservable(undefined),
		title: constObservable('Test'),
		updatedAt: constObservable(new Date()),
		status: constObservable(0),
		modelId: constObservable(undefined),
		mode: constObservable(undefined),
		loading: constObservable(false),
		isArchived: constObservable(false),
		isRead: constObservable(true),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
		chats: constObservable([stubChat]),
		mainChat: constObservable(stubChat),
		capabilities: constObservable({ supportsMultipleChats: false }),
		...overrides,
	};
}

suite('Session Context Keys', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('publishes Git availability independently to scoped context key services', () => {
		const firstHasGit = observableValue('firstHasGit', false);
		const secondHasGit = observableValue('secondHasGit', true);
		const firstContext = new MockContextKeyService();
		const secondContext = new MockContextKeyService();
		const firstSession = createSession(firstHasGit);
		const secondSession = createSession(secondHasGit);

		store.add(autorun(reader => setSessionContextKeys(firstSession, firstContext, reader)));
		store.add(autorun(reader => setSessionContextKeys(secondSession, secondContext, reader)));
		firstHasGit.set(true, undefined);

		assert.deepStrictEqual({
			first: firstContext.getContextKeyValue(SessionHasGitRepositoryContext.key),
			second: secondContext.getContextKeyValue(SessionHasGitRepositoryContext.key),
		}, {
			first: true,
			second: true,
		});

		firstHasGit.set(false, undefined);

		assert.deepStrictEqual({
			first: firstContext.getContextKeyValue(SessionHasGitRepositoryContext.key),
			second: secondContext.getContextKeyValue(SessionHasGitRepositoryContext.key),
		}, {
			first: false,
			second: true,
		});
	});

	test('publishes whether the scoped session is active', () => {
		const contextKeyService = store.add(new MockContextKeyService());
		const status = observableValue('status', SessionStatus.Completed);
		const session = stubSession({ sessionId: 'a', status });

		store.add(autorun(reader => setSessionContextKeys(session, contextKeyService, reader)));
		const completed = SessionIsActiveContext.getValue(contextKeyService);
		status.set(SessionStatus.InProgress, undefined);
		const inProgress = SessionIsActiveContext.getValue(contextKeyService);
		status.set(SessionStatus.NeedsInput, undefined);
		const needsInput = SessionIsActiveContext.getValue(contextKeyService);
		status.set(SessionStatus.Error, undefined);
		const error = SessionIsActiveContext.getValue(contextKeyService);

		assert.deepStrictEqual({ completed, inProgress, needsInput, error }, {
			completed: false,
			inProgress: true,
			needsInput: true,
			error: false,
		});
	});

	test('publishes the main chat read state independently of the session aggregate', () => {
		const contextKeyService = store.add(new MockContextKeyService());
		const sessionIsRead = observableValue('sessionIsRead', false);
		const mainChatIsRead = observableValue('mainChatIsRead', true);
		const mainChat = { ...stubChat, isRead: mainChatIsRead };
		const session = stubSession({
			sessionId: 'a',
			isRead: sessionIsRead,
			mainChat: constObservable(mainChat),
		});

		store.add(autorun(reader => setSessionContextKeys(session, contextKeyService, reader)));
		const initially = SessionIsReadContext.getValue(contextKeyService);
		mainChatIsRead.set(false, undefined);
		const afterMainChatUnread = SessionIsReadContext.getValue(contextKeyService);
		sessionIsRead.set(true, undefined);

		assert.deepStrictEqual({
			initially,
			afterMainChatUnread,
			afterSessionRead: SessionIsReadContext.getValue(contextKeyService),
		}, {
			initially: true,
			afterMainChatUnread: false,
			afterSessionRead: false,
		});
	});

	test('publishes workspace keys from the active chat', () => {
		const contextKeyService = store.add(new MockContextKeyService());
		const sessionWorkspace = {
			uri: URI.file('/session'),
			label: 'session',
			icon: Codicon.rootFolder,
			folders: [{
				root: URI.file('/session'),
				workingDirectory: URI.file('/session'),
				name: 'session',
				description: undefined,
				gitRepository: {
					uri: URI.file('/session'),
					workTreeUri: undefined,
					baseBranchName: undefined,
					gitHubInfo: constObservable(undefined),
				},
			}],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		};
		const activeChat = {
			...stubChat,
			workspace: constObservable({
				uri: URI.file('/chat'),
				label: 'chat',
				icon: Codicon.rootFolder,
				folders: [{
					root: URI.file('/chat'),
					workingDirectory: URI.file('/chat'),
					name: 'chat',
					description: undefined,
				}],
				requiresWorkspaceTrust: false,
				isVirtualWorkspace: true,
			}),
		};
		const session = paneShowing(stubSession({
			sessionId: 'a',
			workspace: constObservable(sessionWorkspace),
			chats: constObservable([activeChat]),
			mainChat: constObservable(activeChat),
		}), activeChat, [activeChat], false);

		setPaneKeys(session, contextKeyService, undefined);

		assert.deepStrictEqual({
			hasWorkspace: SessionHasWorkspaceContext.getValue(contextKeyService),
			isVirtualWorkspace: SessionWorkspaceIsVirtualContext.getValue(contextKeyService),
			hasGitRepository: SessionHasGitRepositoryContext.getValue(contextKeyService),
		}, {
			hasWorkspace: true,
			isVirtualWorkspace: true,
			hasGitRepository: true,
		});
	});

	test('publishes the workspace of the session while no chat of it is known, such as the draft of a new-session composer, and that of the chat once it is', () => {
		const contextKeyService = store.add(new MockContextKeyService());
		const draftWorkspace: ISessionWorkspace = {
			uri: URI.file('/draft'),
			label: 'draft',
			icon: Codicon.rootFolder,
			folders: [{ root: URI.file('/draft'), workingDirectory: URI.file('/draft'), name: 'draft', description: undefined }],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		};
		const draft = stubSession({ sessionId: 'draft', workspace: constObservable(draftWorkspace) });
		const shownChat = observableValue<IChat | undefined>('shownChat', undefined);
		store.add(autorun(reader => setHostSessionContextKeys(draft, shownChat.read(reader), undefined, contextKeyService, reader)));
		const describe = () => ({
			hasWorkspace: SessionHasWorkspaceContext.getValue(contextKeyService),
			isVirtualWorkspace: SessionWorkspaceIsVirtualContext.getValue(contextKeyService),
			isQuickChat: IsQuickChatSessionContext.getValue(contextKeyService),
		});

		const noChat = describe();
		shownChat.set(stubChat, undefined);

		assert.deepStrictEqual({ noChat, chatWithoutWorkspace: describe() }, {
			noChat: { hasWorkspace: true, isVirtualWorkspace: false, isQuickChat: false },
			chatWithoutWorkspace: { hasWorkspace: false, isVirtualWorkspace: true, isQuickChat: false },
		});
	});

	test('publishes a chat of a quick chat that works in a folder of its own as a chat with a workspace', () => {
		const contextKeyService = store.add(new MockContextKeyService());
		const listContextKeyService = store.add(new MockContextKeyService());
		const parent = stubChat;
		const child = {
			...stubChat,
			resource: URI.parse('test:///child'),
			workspace: constObservable<ISessionWorkspace>({
				uri: URI.file('/child'),
				label: 'child',
				icon: Codicon.rootFolder,
				folders: [{ root: URI.file('/child'), workingDirectory: URI.file('/child'), name: 'child', description: undefined }],
				requiresWorkspaceTrust: false,
				isVirtualWorkspace: false,
			}),
		};
		const session = stubSession({ sessionId: 'quick', isQuickChat: constObservable(true), chats: constObservable([parent, child]) });
		const shownChat = observableValue<IChat>('shownChat', child);
		store.add(autorun(reader => setHostSessionContextKeys(session, shownChat.read(reader), undefined, contextKeyService, reader)));
		setSessionContextKeys(session, listContextKeyService, undefined);
		const describe = () => ({
			isQuickChat: IsQuickChatSessionContext.getValue(contextKeyService),
			hasWorkspace: SessionHasWorkspaceContext.getValue(contextKeyService),
		});

		const childShown = describe();
		shownChat.set(parent, undefined);

		assert.deepStrictEqual({ childShown, parentShown: describe(), session: IsQuickChatSessionContext.getValue(listContextKeyService) }, {
			childShown: { isQuickChat: false, hasWorkspace: true },
			parentShown: { isQuickChat: true, hasWorkspace: false },
			session: true,
		});
	});

	test('publishes the active chat Canvas references', () => {
		const contextKeyService = store.add(new MockContextKeyService());
		const canvas = {
			resource: URI.parse('canvas:/first'),
			instanceId: 'first',
			title: 'First',
			source: URI.parse('https://example.test/first'),
		};
		const canvases = observableValue('canvases', [canvas]);
		const activeChat = { ...stubChat, canvases };
		const session = paneShowing(stubSession({
			sessionId: 'canvases',
			chats: constObservable([activeChat]),
			mainChat: constObservable(activeChat),
		}), activeChat, [activeChat], false);

		store.add(autorun(reader => setPaneKeys(session, contextKeyService, reader)));
		const initial = SessionActiveChatCanvasReferenceKeysContext.getValue(contextKeyService);
		canvases.set([], undefined);

		assert.deepStrictEqual({
			initial,
			removed: SessionActiveChatCanvasReferenceKeysContext.getValue(contextKeyService),
		}, {
			initial: [getCanvasReferenceKey({
				providerId: session.session.providerId,
				session: session.session.resource,
				chat: activeChat.resource,
				canvas: canvas.resource,
			})],
			removed: [],
		});
	});

	test('does not advertise archive for an archived active chat', () => {
		const contextKeyService = store.add(new MockContextKeyService());
		const isArchived = observableValue('chatArchived', true);
		// The main chat can never be archived, so the active chat has to be another one.
		const activeChat: IChat = {
			...stubChat,
			resource: URI.parse('test:/archive-peer-chat'),
			isArchived,
			capabilities: constObservable({ canRename: true, canArchive: true, canDelete: true }),
		};
		const session = paneShowing(stubSession({
			sessionId: 'archive',
			chats: constObservable([activeChat]),
			mainChat: constObservable(stubChat),
		}), activeChat, [activeChat], false);

		store.add(autorun(reader => setPaneKeys(session, contextKeyService, reader)));
		const archived = SessionActiveChatCanArchiveContext.getValue(contextKeyService);
		isArchived.set(false, undefined);

		assert.deepStrictEqual({
			archived,
			active: SessionActiveChatCanArchiveContext.getValue(contextKeyService),
		}, {
			archived: false,
			active: true,
		});
	});
});

suite('setSessionContextKeys - changes', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const change: IChatSessionFileChange = { modifiedUri: URI.parse('test:///file.ts'), insertions: 3, deletions: 1 };

	test('publishes active session context keys atomically', () => {
		const contextKeyService = disposables.add(new class extends MockContextKeyService {
			private bufferDepth = 0;
			readonly unbufferedKeys: string[] = [];

			override createKey<T extends ContextKeyValue = ContextKeyValue>(key: string, defaultValue: T | undefined): IContextKey<T> {
				const contextKey = super.createKey(key, defaultValue);
				return {
					set: value => {
						if (this.bufferDepth === 0) {
							this.unbufferedKeys.push(key);
						}
						contextKey.set(value);
					},
					reset: () => {
						if (this.bufferDepth === 0) {
							this.unbufferedKeys.push(key);
						}
						contextKey.reset();
					},
					get: () => contextKey.get(),
				};
			}

			override bufferChangeEvents(callback: () => void): void {
				this.bufferDepth++;
				try {
					callback();
				} finally {
					this.bufferDepth--;
				}
			}
		});
		const createActiveSession = (sessionId: string, providerId: string, changes: readonly IChatSessionFileChange[]): ReturnType<typeof paneShowing> => {
			const chat = { ...stubChat, resource: URI.parse(`test:///${sessionId}/chat`), changes: constObservable(changes) };
			return paneShowing(stubSession({
				sessionId,
				providerId,
				mainChat: constObservable(chat),
				chats: constObservable([chat]),
			}), chat, [chat], false);
		};
		const first = createActiveSession('first', 'first-provider', [change]);
		const second = createActiveSession('second', 'second-provider', []);
		setPaneKeys(first, contextKeyService, undefined);
		setPaneKeys(second, contextKeyService, undefined);

		assert.deepStrictEqual({
			unbufferedKeys: contextKeyService.unbufferedKeys,
			providerId: SessionProviderIdContext.getValue(contextKeyService),
			hasChanges: SessionHasChangesContext.getValue(contextKeyService),
			isCreated: SessionIsCreatedContext.getValue(contextKeyService),
		}, {
			unbufferedKeys: [],
			providerId: 'second-provider',
			hasChanges: false,
			isCreated: false,
		});
	});

	test('hides the changes of the checkout that a session with a pending worktree was started from', () => {
		const contextKeyService = disposables.add(new MockContextKeyService());
		const worktreePending = observableValue('worktreePending', true);
		const mainChat = { ...stubChat, changes: constObservable([change]) };
		const session = stubSession({ sessionId: 'a', mainChat: constObservable(mainChat), worktreePending });

		disposables.add(autorun(reader => setSessionContextKeys(session, contextKeyService, reader)));
		const whilePending = SessionHasChangesContext.getValue(contextKeyService);

		worktreePending.set(false, undefined);

		assert.deepStrictEqual({ whilePending, afterWorktreeCreated: SessionHasChangesContext.getValue(contextKeyService) }, {
			whilePending: false,
			afterWorktreeCreated: true,
		});
	});

	test('reports the cached changes of a session until it reports its own', () => {
		const contextKeyService = disposables.add(new MockContextKeyService());
		const cache = disposables.add(new SessionChangesStatsCache(disposables.add(new TestStorageService())));
		cache.set('a', { files: 2, insertions: 5, deletions: 1 });
		const changesets = observableValue<readonly ISessionChangeset[] | undefined>('changesets', undefined);
		const mainChat = { ...stubChat, changesets };
		const session = stubSession({ sessionId: 'a', mainChat: constObservable(mainChat) });

		disposables.add(autorun(reader => setSessionContextKeys(session, contextKeyService, reader, cache)));
		const beforeReported = SessionHasCachedChangesContext.getValue(contextKeyService);

		changesets.set([], undefined);

		assert.deepStrictEqual({ beforeReported, afterReportedNoChanges: SessionHasCachedChangesContext.getValue(contextKeyService) }, {
			beforeReported: true,
			afterReportedNoChanges: false,
		});
	});

	test('does not report the cached changes of a quick chat on its main chat, which has no workspace', () => {
		const contextKeyService = disposables.add(new MockContextKeyService());
		const cache = disposables.add(new SessionChangesStatsCache(disposables.add(new TestStorageService())));
		cache.set('a', { files: 1, insertions: 4, deletions: 0 });
		const mainChat = { ...stubChat, changesets: constObservable<readonly ISessionChangeset[] | undefined>(undefined) };
		const session = (isQuickChat: boolean) => stubSession({ sessionId: 'a', mainChat: constObservable(mainChat), isQuickChat: constObservable(isQuickChat) });
		const hasCachedChanges = (isQuickChat: boolean) => {
			setHostSessionContextKeys(session(isQuickChat), mainChat, undefined, contextKeyService, undefined, cache);
			return SessionHasCachedChangesContext.getValue(contextKeyService);
		};

		assert.deepStrictEqual({ quickChat: hasCachedChanges(true), workspaceSession: hasCachedChanges(false) }, { quickChat: false, workspaceSession: true });
	});

	test('uses active chat changes in active session scopes', () => {
		const contextKeyService = disposables.add(new MockContextKeyService());
		const chatChanges = observableValue<readonly IChatSessionFileChange[]>('chatChanges', []);
		const activeChat = upcastPartial<IChat>({
			resource: URI.parse('chat:main'),
			status: constObservable(SessionStatus.InProgress),
			workspace: constObservable(upcastPartial<ISessionWorkspace>({ folders: [] })),
			changesets: constObservable([]),
			changes: chatChanges,
			isRead: constObservable(true),
		});
		const session = paneShowing({
			...stubSession({
				sessionId: 'a',
			}),
			chats: constObservable([activeChat]),
			mainChat: constObservable(activeChat),
		}, activeChat, [activeChat], false);

		disposables.add(autorun(reader => setPaneKeys(session, contextKeyService, reader)));
		const withoutChatChanges = SessionHasChangesContext.getValue(contextKeyService);
		chatChanges.set([change], undefined);

		assert.deepStrictEqual({
			withoutChatChanges,
			withChatChanges: SessionHasChangesContext.getValue(contextKeyService),
		}, {
			withoutChatChanges: false,
			withChatChanges: true,
		});
	});

	test('reports cached changes while active chat changes are unresolved', () => {
		const contextKeyService = disposables.add(new MockContextKeyService());
		const cache = disposables.add(new SessionChangesStatsCache(disposables.add(new TestStorageService())));
		cache.set('a', { files: 2, insertions: 5, deletions: 1 });
		const changesets = observableValue<readonly ISessionChangeset[] | undefined>('changesets', undefined);
		const activeChat = upcastPartial<IChat>({
			...stubChat,
			changesets,
		});
		const session = paneShowing({
			...stubSession({ sessionId: 'a', mainChat: constObservable(activeChat) }),
			chats: constObservable([activeChat]),
		}, activeChat, [activeChat], false);

		disposables.add(autorun(reader => setPaneKeys(session, contextKeyService, reader, cache)));
		const beforeReported = SessionHasCachedChangesContext.getValue(contextKeyService);
		changesets.set([], undefined);

		assert.deepStrictEqual({
			beforeReported,
			afterReportedNoChanges: SessionHasCachedChangesContext.getValue(contextKeyService),
		}, {
			beforeReported: true,
			afterReportedNoChanges: false,
		});
	});
});

suite('setSessionContextKeys - side chat', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('supportsSideChat reflects the session capability', () => {
		const contextKeyService = disposables.add(new MockContextKeyService());
		const session = stubSession({ sessionId: 'a', capabilities: constObservable({ supportsMultipleChats: true, supportsSideChat: true }) });

		setSessionContextKeys(session, contextKeyService, undefined);

		assert.strictEqual(SessionSupportsSideChatContext.getValue(contextKeyService), true);
	});

	test('supportsSideChat defaults to false when the capability is omitted', () => {
		const contextKeyService = disposables.add(new MockContextKeyService());
		const session = stubSession({ sessionId: 'a', capabilities: constObservable({ supportsMultipleChats: true }) });

		setSessionContextKeys(session, contextKeyService, undefined);

		assert.strictEqual(SessionSupportsSideChatContext.getValue(contextKeyService), false);
	});

	test('supportsSideChat resets to false for an undefined session', () => {
		const contextKeyService = disposables.add(new MockContextKeyService());
		const session = stubSession({ sessionId: 'a', capabilities: constObservable({ supportsMultipleChats: true, supportsSideChat: true }) });

		setSessionContextKeys(session, contextKeyService, undefined);
		assert.strictEqual(SessionSupportsSideChatContext.getValue(contextKeyService), true);

		setSessionContextKeys(undefined, contextKeyService, undefined);
		assert.strictEqual(SessionSupportsSideChatContext.getValue(contextKeyService), false);
	});

	test('counts side chats as committed chats but still excludes tool-origin chats', () => {
		const contextKeyService = disposables.add(new MockContextKeyService());
		const mainChat = { ...stubChat, resource: URI.parse('test:///chat/main'), status: constObservable(SessionStatus.Completed) };
		const peerChat = { ...stubChat, resource: URI.parse('test:///chat/peer'), status: constObservable(SessionStatus.Completed) };
		const sideChat = { ...stubChat, resource: URI.parse('test:///chat/side'), origin: { kind: ChatOriginKind.SideChat, parentChat: mainChat.resource }, status: constObservable(SessionStatus.Completed) };
		const toolChat = { ...stubChat, resource: URI.parse('test:///chat/tool'), origin: { kind: ChatOriginKind.Tool }, status: constObservable(SessionStatus.Completed) };

		const withSideChat = paneShowing(stubSession({ sessionId: 'side', chats: constObservable([mainChat, sideChat]), mainChat: constObservable(mainChat) }), mainChat, [mainChat, sideChat], true);
		setPaneKeys(withSideChat, contextKeyService, undefined);
		const withSideChatCommittedChats = SessionHasMultipleCommittedChatsContext.getValue(contextKeyService);
		const mainChatHasSideChats = SessionActiveChatHasSideChatsContext.getValue(contextKeyService);
		const mainChatResource = SessionActiveChatResourceContext.getValue(contextKeyService);

		const withUnrelatedActiveChat = paneShowing({ ...withSideChat.session, chats: constObservable([mainChat, peerChat, sideChat]) }, peerChat, [mainChat, sideChat], true);
		setPaneKeys(withUnrelatedActiveChat, contextKeyService, undefined);
		const peerChatHasSideChats = SessionActiveChatHasSideChatsContext.getValue(contextKeyService);
		const peerChatResource = SessionActiveChatResourceContext.getValue(contextKeyService);

		const withToolChat = paneShowing(stubSession({ sessionId: 'tool', chats: constObservable([mainChat, toolChat]), mainChat: constObservable(mainChat) }), mainChat, [mainChat], false);
		setPaneKeys(withToolChat, contextKeyService, undefined);
		assert.deepStrictEqual({
			withSideChatCommittedChats,
			mainChatHasSideChats,
			mainChatResource,
			peerChatHasSideChats,
			peerChatResource,
			withToolChatCommittedChats: SessionHasMultipleCommittedChatsContext.getValue(contextKeyService),
			withToolChatHasSideChats: SessionActiveChatHasSideChatsContext.getValue(contextKeyService),
		}, {
			withSideChatCommittedChats: true,
			mainChatHasSideChats: true,
			mainChatResource: mainChat.resource.toString(),
			peerChatHasSideChats: false,
			peerChatResource: peerChat.resource.toString(),
			withToolChatCommittedChats: false,
			withToolChatHasSideChats: false,
		});
	});

});
