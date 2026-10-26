/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { SessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { SessionSectionOrderService } from '../../../../services/sessions/browser/sessionSectionOrderService.js';
import { SessionsListModelService } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ChatInteractivity, IChat, ISession } from '../../../../services/sessions/common/session.js';
import { ISessionChatMoveTarget, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChatMovedEvent } from '../../../../services/sessions/common/sessionsProvider.js';
import { runSessionsListMove, SessionsListMove, SessionsListMoveNotice } from '../../browser/views/sessionsListChatMove.js';
import { createTestSession } from './sessionsListTestUtils.js';

suite('Sessions List - Undoing a move restores placement', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/** A session with one chat besides its main chat, which is where a session moved under it lands. */
	function sessionWithLandingChat(id: string): { readonly session: ISession; readonly landing: IChat } {
		const test = createTestSession(id);
		const landing = new class extends mock<IChat>() {
			override readonly resource = URI.parse(`test-chat://${id}-landing`);
			override readonly interactivity = constObservable(ChatInteractivity.Full);
		}();
		return { session: { ...test.session, chats: constObservable([test.session.mainChat.get(), landing]) }, landing };
	}

	function setup() {
		const nested = sessionWithLandingChat('S3');
		const target = sessionWithLandingChat('S2');
		const promotedTest = createTestSession('S3', { resourceId: 'S3-promoted' });
		const promoted: ISession = { ...promotedTest.session, chats: constObservable([promotedTest.session.mainChat.get()]) };
		let sessions: ISession[] = [nested.session, target.session];
		const chatMoved = store.add(new Emitter<IChatMovedEvent>());
		let reportPromotion: (() => void) | undefined;
		let reportPromotionLate = false;
		const management = new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = Event.None;
			override readonly onWillSendRequest = Event.None;
			override readonly onDidStartSession = Event.None;
			override readonly onDidArchiveSession = Event.None;
			override readonly onDidUnarchiveSession = Event.None;
			override readonly onDidDeleteSession = Event.None;
			override readonly onDidReplaceSession = Event.None;
			override readonly onDidReplaceNewDraftSession = Event.None;
			override readonly onDidDiscardNewSession = Event.None;
			override readonly onDidMoveChat = chatMoved.event;
			override getSessions() { return sessions; }
			override getInFlightNewSessionRequests() { return []; }
			override getSession(resource: URI) { return sessions.find(session => session.resource.toString() === resource.toString()); }
			override async moveSessionUnder(session: ISession, destination: ISession): Promise<void> {
				sessions = sessions.filter(candidate => candidate !== session);
				chatMoved.fire({ from: { session, chat: session.mainChat.get().resource }, to: { session: destination, chat: target.landing.resource } });
			}
			override async moveChat(session: ISession, chat: IChat, destination: ISessionChatMoveTarget): Promise<void> {
				assert.strictEqual(destination.kind, 'newSession');
				sessions = [...sessions, promoted];
				const report = () => chatMoved.fire({ from: { session, chat: chat.resource }, to: { session: promoted, chat: promoted.mainChat.get().resource } });
				if (reportPromotionLate) {
					reportPromotion = report;
				} else {
					report();
				}
			}
		}();
		const storage = store.add(new InMemoryStorageService());
		const groupsService = store.add(new SessionGroupsService(storage, management, store.add(new SessionSectionOrderService(storage))));
		const listModelService = store.add(new SessionsListModelService(storage, management));
		const placementOf = (session: ISession) => ({ pinned: listModelService.isSessionPinned(session), group: groupsService.getGroupOfSession(session.sessionId) });

		let undo: (() => Promise<void>) | undefined;
		const notice: SessionsListMoveNotice = {
			showProgress: () => { },
			show: result => { undo = result.undo; },
		};
		const run = (move: SessionsListMove) => runSessionsListMove(move, management, new class extends mock<INotificationService>() { }(), new NullLogService(), {
			notice,
			placementServices: { sessionsListModelService: listModelService, sessionGroupsService: groupsService },
		});
		const nest = () => run({ kind: 'session', session: nested.session, destination: target.session, after: target.landing });
		return { management, nested: nested.session, target: target.session, promoted, groupsService, listModelService, placementOf, nest, run, undo: () => undo!(), reportLate: () => { reportPromotionLate = true; return () => reportPromotion!(); } };
	}

	test('undoing a nest brings a pinned ungrouped session back pinned and ungrouped, not in the group of the session it was nested under', async () => {
		const { nested, target, promoted, groupsService, listModelService, placementOf, nest, undo } = setup();
		const targetGroup = groupsService.createGroup('TPI Group', [target.sessionId]);
		listModelService.pinSession(target);
		listModelService.pinSession(nested);

		await nest();
		await undo();

		assert.deepStrictEqual({ promoted: placementOf(promoted), targetGroup: groupsService.getSessionIdsInGroup(targetGroup.id) }, {
			promoted: { pinned: true, group: undefined },
			targetGroup: [target.sessionId],
		});
	});

	test('undoing a nest brings a pinned session of a custom group back to its group', async () => {
		const { nested, target, promoted, groupsService, listModelService, placementOf, nest, undo } = setup();
		const ownGroup = groupsService.createGroup('Own', [nested.sessionId]);
		groupsService.createGroup('Target', [target.sessionId]);
		listModelService.pinSession(nested);

		await nest();
		await undo();

		assert.deepStrictEqual(placementOf(promoted), { pinned: true, group: ownGroup.id });
	});

	test('undoing a nest leaves a session whose group was deleted meanwhile ungrouped, not in the other session\'s group', async () => {
		const { nested, target, promoted, groupsService, listModelService, placementOf, nest, undo } = setup();
		const ownGroup = groupsService.createGroup('Own', [nested.sessionId]);
		groupsService.createGroup('Target', [target.sessionId]);
		listModelService.pinSession(nested);

		await nest();
		groupsService.deleteGroup(ownGroup.id);
		await undo();

		assert.deepStrictEqual(placementOf(promoted), { pinned: true, group: undefined });
	});

	test('undoing a nest of an unpinned session in no group does not pin it', async () => {
		const { target, promoted, groupsService, placementOf, nest, undo } = setup();
		groupsService.createGroup('Target', [target.sessionId]);

		await nest();
		await undo();

		assert.deepStrictEqual(placementOf(promoted), { pinned: false, group: undefined });
	});

	test('the list never sees the new session anywhere but in its restored placement', async () => {
		const { nested, target, promoted, groupsService, listModelService, placementOf, nest, undo } = setup();
		groupsService.createGroup('TPI Group', [target.sessionId]);
		listModelService.pinSession(nested);
		const seen: object[] = [];
		const sample = () => queueMicrotask(() => seen.push(placementOf(promoted)));
		store.add(groupsService.onDidChange(sample));
		store.add(listModelService.onDidChange(sample));

		await nest();
		seen.length = 0;
		await undo();
		await Promise.resolve();

		assert.deepStrictEqual([...new Set(seen.map(placement => JSON.stringify(placement)))], [JSON.stringify({ pinned: true, group: undefined })]);
	});

	test('undoing a nest still restores the placement when the provider reports the move after it resolved', async () => {
		const { nested, target, promoted, groupsService, listModelService, placementOf, nest, undo, reportLate } = setup();
		groupsService.createGroup('TPI Group', [target.sessionId]);
		listModelService.pinSession(nested);
		await nest();
		const report = reportLate();

		await undo();
		report();

		assert.deepStrictEqual(placementOf(promoted), { pinned: true, group: undefined });
	});

	test('promoting a chat to a session still keeps the group of the session it came from', async () => {
		const { management, target, promoted, groupsService, placementOf } = setup();
		const targetGroup = groupsService.createGroup('Target', [target.sessionId]);

		await management.moveChat(target, target.chats.get()[1], { kind: 'newSession' });

		assert.deepStrictEqual(placementOf(promoted), { pinned: false, group: targetGroup.id });
	});
});
