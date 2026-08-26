/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable, observableValue, autorun, ISettableObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { IChatSessionFileChange } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { SessionActiveChatHasSubagentsContext, SessionHasCachedChangesContext, SessionHasChangesContext, SessionHasGitRepositoryContext, SessionHasMultipleCommittedChatsContext, SessionIsActiveContext, SessionSupportsSideChatContext } from '../../../../common/contextkeys.js';
import { ChatInteractivity, ChatOriginKind, IChat, ISession, ISessionChangeset, SessionStatus } from '../../common/session.js';
import { IActiveSession } from '../../common/sessionsManagement.js';
import { setActiveSessionContextKeys, setSessionContextKeys } from '../../common/sessionContextKeys.js';
import { SessionChangesStatsCache } from '../../common/sessionChangesStatsCache.js';

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
		changesets: constObservable(undefined),
		changes: constObservable([]),
	});
}

const stubChat: IChat = {
	resource: URI.parse('test:///chat'),
	createdAt: new Date(),
	title: constObservable('Chat'),
	updatedAt: constObservable(new Date()),
	status: constObservable(0),
	changes: constObservable([]),
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
		icon: Codicon.vm,
		createdAt: new Date(),
		workspace: constObservable(undefined),
		title: constObservable('Test'),
		updatedAt: constObservable(new Date()),
		status: constObservable(0),
		changesets: constObservable([]),
		changes: constObservable([]),
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
});

suite('setSessionContextKeys - changes', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const change: IChatSessionFileChange = { modifiedUri: URI.parse('test:///file.ts'), insertions: 3, deletions: 1 };

	test('hides the changes of the checkout that a session with a pending worktree was started from', () => {
		const contextKeyService = disposables.add(new MockContextKeyService());
		const worktreePending = observableValue('worktreePending', true);
		const session = stubSession({ sessionId: 'a', changesets: constObservable(undefined), changes: constObservable([change]), worktreePending });

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
		const session = stubSession({ sessionId: 'a', changesets, changes: constObservable([]) });

		disposables.add(autorun(reader => setSessionContextKeys(session, contextKeyService, reader, cache)));
		const beforeReported = SessionHasCachedChangesContext.getValue(contextKeyService);

		changesets.set([], undefined);

		assert.deepStrictEqual({ beforeReported, afterReportedNoChanges: SessionHasCachedChangesContext.getValue(contextKeyService) }, {
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
		const sideChat = { ...stubChat, resource: URI.parse('test:///chat/side'), origin: { kind: ChatOriginKind.SideChat }, status: constObservable(SessionStatus.Completed) };
		const toolChat = { ...stubChat, resource: URI.parse('test:///chat/tool'), origin: { kind: ChatOriginKind.Tool }, status: constObservable(SessionStatus.Completed) };

		const withSideChat = upcastPartial<IActiveSession>({
			...stubSession({ sessionId: 'side', chats: constObservable([mainChat, sideChat]), mainChat: constObservable(mainChat) }),
			isCreated: constObservable(true),
			sticky: constObservable(false),
			activeChat: constObservable(mainChat),
			visibleChatTabs: constObservable([mainChat, sideChat]),
			shouldShowChatTabs: constObservable(true),
		});
		setActiveSessionContextKeys(withSideChat, contextKeyService, undefined);
		assert.strictEqual(SessionHasMultipleCommittedChatsContext.getValue(contextKeyService), true);

		const withToolChat = upcastPartial<IActiveSession>({
			...stubSession({ sessionId: 'tool', chats: constObservable([mainChat, toolChat]), mainChat: constObservable(mainChat) }),
			isCreated: constObservable(true),
			sticky: constObservable(false),
			activeChat: constObservable(mainChat),
			visibleChatTabs: constObservable([mainChat]),
			shouldShowChatTabs: constObservable(false),
		});
		setActiveSessionContextKeys(withToolChat, contextKeyService, undefined);
		assert.strictEqual(SessionHasMultipleCommittedChatsContext.getValue(contextKeyService), false);
	});

	test('shows subagents only for the active chat scope', () => {
		const contextKeyService = disposables.add(new MockContextKeyService());
		const mainChat = { ...stubChat, resource: URI.parse('test:///chat/main') };
		const otherChat = { ...stubChat, resource: URI.parse('test:///chat/other') };
		const firstSubagent = { ...stubChat, resource: URI.parse('test:///chat/tool-1'), origin: { kind: ChatOriginKind.Tool, parentChat: mainChat.resource } };
		const secondSubagent = { ...stubChat, resource: URI.parse('test:///chat/tool-2'), origin: { kind: ChatOriginKind.Tool, parentChat: mainChat.resource } };
		const createActiveSession = (activeChat: IChat) => upcastPartial<IActiveSession>({
			...stubSession({ sessionId: 'tool', chats: constObservable([mainChat, otherChat, firstSubagent, secondSubagent]), mainChat: constObservable(mainChat) }),
			isCreated: constObservable(true),
			sticky: constObservable(false),
			activeChat: constObservable(activeChat),
			visibleChatTabs: constObservable([mainChat]),
			shouldShowChatTabs: constObservable(true),
		});

		setActiveSessionContextKeys(createActiveSession(mainChat), contextKeyService, undefined);
		const parentActive = SessionActiveChatHasSubagentsContext.getValue(contextKeyService);
		setActiveSessionContextKeys(createActiveSession(otherChat), contextKeyService, undefined);
		const unrelatedChatActive = SessionActiveChatHasSubagentsContext.getValue(contextKeyService);
		setActiveSessionContextKeys(createActiveSession(firstSubagent), contextKeyService, undefined);
		const subagentActive = SessionActiveChatHasSubagentsContext.getValue(contextKeyService);

		assert.deepStrictEqual({ parentActive, unrelatedChatActive, subagentActive }, {
			parentActive: true,
			unrelatedChatActive: false,
			subagentActive: true,
		});
	});
});
