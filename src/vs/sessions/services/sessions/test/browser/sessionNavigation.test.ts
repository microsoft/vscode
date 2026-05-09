/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IActiveSession, ISessionsManagementService } from '../../common/sessionsManagement.js';
import { IChat, ISession, ISessionType, SessionStatus } from '../../common/session.js';
import { SessionsNavigation } from '../../browser/sessionNavigation.js';
import { Event } from '../../../../../base/common/event.js';
import { ISendRequestOptions } from '../../common/sessionsProvider.js';

const stubChat: IChat = {
	resource: URI.parse('test:///chat'),
	createdAt: new Date(),
	title: constObservable('Chat'),
	updatedAt: constObservable(new Date()),
	status: constObservable(0),
	changesets: constObservable([]),
	changes: constObservable([]),
	modelId: constObservable(undefined),
	mode: constObservable(undefined),
	isArchived: constObservable(false),
	isRead: constObservable(true),
	description: constObservable(undefined),
	lastTurnEnd: constObservable(undefined),
};

function stubSession(id: string, status: SessionStatus = SessionStatus.Completed): ISession {
	return {
		sessionId: id,
		resource: URI.parse(`test:///${id}`),
		providerId: 'test',
		sessionType: 'test',
		icon: Codicon.vm,
		createdAt: new Date(),
		workspace: constObservable(undefined),
		title: constObservable(`Session ${id}`),
		updatedAt: constObservable(new Date()),
		status: constObservable(status),
		changesets: constObservable([]),
		changes: constObservable([]),
		modelId: constObservable(undefined),
		mode: constObservable(undefined),
		loading: constObservable(false),
		isArchived: constObservable(false),
		isRead: constObservable(true),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
		gitHubInfo: constObservable(undefined),
		chats: constObservable([stubChat]),
		mainChat: stubChat,
		capabilities: { supportsMultipleChats: false },
	};
}

class MockSessionStore implements ISessionsManagementService {

	readonly _serviceBrand: undefined;

	readonly activeSession = observableValue<IActiveSession | undefined>('test.activeSession', undefined);
	readonly onDidChangeSessions = Event.None;
	readonly onDidChangeSessionTypes = Event.None;

	private readonly _sessions = new Map<string, ISession>();
	private _openedResource: URI | undefined;
	private _openedNewSession = false;

	get lastOpenedResource(): URI | undefined { return this._openedResource; }
	get lastOpenedNewSession(): boolean { return this._openedNewSession; }

	setActiveSession(session: ISession | undefined): void {
		if (session) {
			const active: IActiveSession = {
				...session,
				activeChat: constObservable(stubChat),
			};
			this.activeSession.set(active, undefined);
		} else {
			this.activeSession.set(undefined, undefined);
		}
	}

	addSession(session: ISession): void {
		this._sessions.set(session.resource.toString(), session);
	}

	getSessions(): ISession[] { return [...this._sessions.values()]; }

	getSession(resource: URI): ISession | undefined {
		return this._sessions.get(resource.toString());
	}

	getAllSessionTypes(): ISessionType[] { return []; }

	async openSession(sessionResource: URI): Promise<void> {
		this._openedResource = sessionResource;
		this._openedNewSession = false;
		const session = this._sessions.get(sessionResource.toString());
		if (session) {
			this.setActiveSession(session);
		}
	}

	openNewSessionView(): void {
		this._openedNewSession = true;
		this._openedResource = undefined;
		this.setActiveSession(undefined);
	}

	openChat(_session: ISession, _chatUri: URI): Promise<void> { throw new Error('not implemented'); }
	restoreLastActiveSession(): Promise<void> { throw new Error('not implemented'); }
	createNewSession(_providerId: string, _workspaceUri: URI, _sessionTypeId?: string): ISession { throw new Error('not implemented'); }
	unsetNewSession(): void { throw new Error('not implemented'); }
	sendAndCreateChat(_session: ISession, _options: ISendRequestOptions): Promise<void> { throw new Error('not implemented'); }
	sendRequest(_session: ISession, _chat: IChat, _options: ISendRequestOptions): Promise<void> { throw new Error('not implemented'); }
	openNewChatInSession(_session: ISession): void { throw new Error('not implemented'); }
	openPreviousSession(): Promise<void> { throw new Error('not implemented'); }
	openNextSession(): Promise<void> { throw new Error('not implemented'); }
	archiveSession(_session: ISession): Promise<void> { throw new Error('not implemented'); }
	unarchiveSession(_session: ISession): Promise<void> { throw new Error('not implemented'); }
	deleteSession(_session: ISession): Promise<void> { throw new Error('not implemented'); }
	deleteChat(_session: ISession, _chatUri: URI): Promise<void> { throw new Error('not implemented'); }
	renameChat(_session: ISession, _chatUri: URI, _title: string): Promise<void> { throw new Error('not implemented'); }
}

suite('SessionsNavigation', () => {

	const ds = ensureNoDisposablesAreLeakedInTestSuite();
	let store: MockSessionStore;
	let nav: SessionsNavigation;
	let contextKeyService: MockContextKeyService;

	setup(() => {
		const disposables = ds.add(new DisposableStore());
		store = new MockSessionStore();

		contextKeyService = disposables.add(new MockContextKeyService());

		nav = disposables.add(new SessionsNavigation(
			store,
			contextKeyService,
			new NullLogService(),
		));
	});

	function canGoBack(): boolean {
		return contextKeyService.getContextKeyValue('sessionsCanGoBack') ?? false;
	}

	function canGoForward(): boolean {
		return contextKeyService.getContextKeyValue('sessionsCanGoForward') ?? false;
	}

	test('initially cannot go back or forward', () => {
		assert.strictEqual(canGoBack(), false);
		assert.strictEqual(canGoForward(), false);
	});

	test('can go back after navigating to two sessions', () => {
		const s1 = stubSession('s1');
		const s2 = stubSession('s2');
		store.addSession(s1);
		store.addSession(s2);

		store.setActiveSession(s1);
		store.setActiveSession(s2);

		assert.strictEqual(canGoBack(), true);
		assert.strictEqual(canGoForward(), false);
	});

	test('goBack restores previous session', async () => {
		const s1 = stubSession('s1');
		const s2 = stubSession('s2');
		store.addSession(s1);
		store.addSession(s2);

		store.setActiveSession(s1);
		store.setActiveSession(s2);

		await nav.goBack();

		assert.strictEqual(store.lastOpenedResource?.toString(), s1.resource.toString());
		assert.strictEqual(canGoBack(), false);
		assert.strictEqual(canGoForward(), true);
	});

	test('goForward restores next session after goBack', async () => {
		const s1 = stubSession('s1');
		const s2 = stubSession('s2');
		store.addSession(s1);
		store.addSession(s2);

		store.setActiveSession(s1);
		store.setActiveSession(s2);

		await nav.goBack();
		await nav.goForward();

		assert.strictEqual(store.lastOpenedResource?.toString(), s2.resource.toString());
		assert.strictEqual(canGoBack(), true);
		assert.strictEqual(canGoForward(), false);
	});

	test('navigating to a new session after goBack clears forward history', async () => {
		const s1 = stubSession('s1');
		const s2 = stubSession('s2');
		const s3 = stubSession('s3');
		store.addSession(s1);
		store.addSession(s2);
		store.addSession(s3);

		store.setActiveSession(s1);
		store.setActiveSession(s2);

		await nav.goBack();
		// Now navigate to s3 instead of going forward
		store.setActiveSession(s3);

		assert.strictEqual(canGoBack(), true);
		assert.strictEqual(canGoForward(), false);

		// Going back should go to s1 (s2 is no longer in forward history)
		await nav.goBack();
		assert.strictEqual(store.lastOpenedResource?.toString(), s1.resource.toString());
	});

	test('reopening an earlier session removes it from history and appends at end (no duplicates)', async () => {
		// Regression: A→B→C, back→back→fwd→fwd, open A again
		// should produce history [B,C,A] not [A,B,C,A]
		const s1 = stubSession('s1');
		const s2 = stubSession('s2');
		const s3 = stubSession('s3');
		store.addSession(s1);
		store.addSession(s2);
		store.addSession(s3);

		store.setActiveSession(s1); // history=[s1], idx=0
		store.setActiveSession(s2); // history=[s1,s2], idx=1
		store.setActiveSession(s3); // history=[s1,s2,s3], idx=2

		await nav.goBack();  // idx=1
		await nav.goBack();  // idx=0
		await nav.goForward(); // idx=1
		await nav.goForward(); // idx=2

		// Now open s1 again — should deduplicate: history=[s2,s3,s1]
		store.setActiveSession(s1);

		// Back once: s3
		await nav.goBack();
		assert.strictEqual(store.lastOpenedResource?.toString(), s3.resource.toString());

		// Back once more: s2
		await nav.goBack();
		assert.strictEqual(store.lastOpenedResource?.toString(), s2.resource.toString());

		// No further back
		assert.strictEqual(canGoBack(), false);
	});

	test('navigating to new-session view after a session enables go back', async () => {
		const s1 = stubSession('s1');
		store.addSession(s1);

		store.setActiveSession(s1);
		store.setActiveSession(undefined); // user explicitly went to new-session view

		assert.strictEqual(canGoBack(), true);
		assert.strictEqual(canGoForward(), false);

		await nav.goBack();
		assert.strictEqual(store.lastOpenedResource?.toString(), s1.resource.toString());
	});

	test('navigating to new-session view with no history does not enable go back', () => {
		store.setActiveSession(undefined); // new-session view with empty history

		assert.strictEqual(canGoBack(), false);
	});

	test('duplicate consecutive session is not added to history', () => {
		const s1 = stubSession('s1');
		store.addSession(s1);

		store.setActiveSession(s1);
		store.setActiveSession(s1); // duplicate

		// Only one entry for s1, cannot go back
		assert.strictEqual(canGoBack(), false);
	});

	test('removed sessions are cleaned from history', async () => {
		const s1 = stubSession('s1');
		const s2 = stubSession('s2');
		const s3 = stubSession('s3');
		store.addSession(s1);
		store.addSession(s2);
		store.addSession(s3);

		store.setActiveSession(s1);
		store.setActiveSession(s2);
		store.setActiveSession(s3);

		// Remove s2 from history
		nav.onDidRemoveSessions({ added: [], removed: [s2], changed: [] });

		// Going back from s3 should skip s2 and go to s1
		await nav.goBack();
		assert.strictEqual(store.lastOpenedResource?.toString(), s1.resource.toString());
	});

	test('untitled (new) session is not recorded in history and does not enable go back', () => {
		const pending = stubSession('pending', SessionStatus.Untitled);
		store.addSession(pending);
		store.setActiveSession(pending); // untitled on startup — must not be recorded or set beyondHistory

		assert.strictEqual(canGoBack(), false);

		// Opening a real session: history is [s1], cannot go back
		const s1 = stubSession('s1');
		store.addSession(s1);
		store.setActiveSession(s1);

		assert.strictEqual(canGoBack(), false);

		// Opening a second real session: history is [s1, s2], can go back
		const s2 = stubSession('s2');
		store.addSession(s2);
		store.setActiveSession(s2);

		assert.strictEqual(canGoBack(), true);
	});

	test('go to new-session, goBack, go to new-session again still enables back', async () => {
		// Regression: after goBack from new-session view, going to new-session again
		// must still enable back. The autorun must keep activeSession tracked even
		// when it returns early during navigation (_navigating=true).
		const s1 = stubSession('s1');
		store.addSession(s1);
		store.setActiveSession(s1); // history=[s1], idx=0

		store.setActiveSession(undefined); // go to new-session view
		assert.strictEqual(canGoBack(), true, 'back enabled after first new-session view');

		await nav.goBack(); // back to s1
		assert.strictEqual(canGoBack(), false, 'back disabled on s1');

		store.setActiveSession(undefined); // go to new-session view again
		assert.strictEqual(canGoBack(), true, 'back enabled after second new-session view');
	});
});
