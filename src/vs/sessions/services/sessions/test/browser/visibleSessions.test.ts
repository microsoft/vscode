/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IAgentSession, IAgentSessionsModel } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { VisibleSessions } from '../../browser/visibleSessions.js';
import { IChat, ISession } from '../../common/session.js';

const stubChat: IChat = {
	resource: URI.parse('test:///chat'),
	createdAt: new Date(),
	title: constObservable('Chat'),
	updatedAt: constObservable(new Date()),
	status: constObservable(0),
	changes: constObservable([]),
	checkpoints: constObservable(undefined),
	modelId: constObservable(undefined),
	mode: constObservable(undefined),
	isArchived: constObservable(false),
	isRead: constObservable(true),
	description: constObservable(undefined),
	lastTurnEnd: constObservable(undefined),
};

function stubSession(sessionId: string): ISession {
	return {
		sessionId,
		providerId: 'test',
		resource: URI.parse(`test:///${sessionId}`),
		sessionType: 'test',
		icon: Codicon.vm,
		createdAt: new Date(),
		workspace: constObservable(undefined),
		title: constObservable(sessionId),
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
		mainChat: stubChat,
		capabilities: { supportsMultipleChats: false },
	};
}

class TestAgentSessionsService extends mock<IAgentSessionsService>() {
	override readonly onDidChangeSessionArchivedState = Event.None;
	override readonly model: IAgentSessionsModel = {
		onWillResolve: Event.None,
		onDidResolve: Event.None,
		onDidChangeSessions: Event.None,
		onDidChangeSessionArchivedState: Event.None,
		resolved: true,
		sessions: [],
		getSession: () => undefined,
		observeSession: () => constObservable<IAgentSession | undefined>(undefined),
		resolve: async () => { },
	};
}

suite('VisibleSessions', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createModel() {
		const uriIdentity = new class extends mock<IUriIdentityService>() {
			override readonly extUri = extUriBiasedIgnorePathCase;
		};
		const agentSessions = new TestAgentSessionsService();
		const model = disposables.add(new VisibleSessions(
			session => session.mainChat,
			uriIdentity,
			agentSessions,
		));
		return model;
	}

	function snapshot(model: VisibleSessions): { visible: string[]; active: string | undefined; sticky: string[] } {
		const visible = model.visibleSessions.get();
		return {
			visible: visible.map(s => s.sessionId),
			active: model.activeSession.get()?.sessionId,
			sticky: visible.filter(s => s.sticky.get()).map(s => s.sessionId),
		};
	}

	suite('setActive', () => {

		test('opening B after non-sticky A replaces A in place', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');

			model.setActive(A);
			model.setActive(B);

			assert.deepStrictEqual(snapshot(model), {
				visible: ['B'],
				active: 'B',
				sticky: [],
			});
		});

		test('opening B when active A is sticky appends B (no other non-sticky)', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'B'],
				active: 'B',
				sticky: ['A'],
			});
		});

		test('opening C when active is sticky and a non-sticky exists replaces the non-sticky', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');
			const C = stubSession('C');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);            // visible: [A, B], active: B (non-sticky)
			model.setActive(A);            // active flips to A (sticky); B remains non-sticky
			model.setActive(C);            // active A is sticky → replace most-recent non-sticky B

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'C'],
				active: 'C',
				sticky: ['A'],
			});
		});

		test('opening D when all visible are sticky appends D at the end', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');
			const C = stubSession('C');
			const D = stubSession('D');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);
			model.toggleStickiness(B);
			model.setActive(C);
			model.toggleStickiness(C);
			model.setActive(D);

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'B', 'C', 'D'],
				active: 'D',
				sticky: ['A', 'B', 'C'],
			});
		});

		test('opens with multiple non-sticky sessions side by side', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');
			const C = stubSession('C');

			model.setActive(A);
			model.toggleStickiness(A);     // [A] sticky:[A]
			model.setActive(B);            // [A, B] active:B
			model.setActive(A);            // [A, B] active:A (sticky)
			model.setActive(C);            // active sticky → replace non-sticky B → [A, C]

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'C'],
				active: 'C',
				sticky: ['A'],
			});
		});

		test('opening an already-visible session keeps its slot, only changes active', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');

			model.setActive(A);
			model.toggleStickiness(A);     // [A] sticky:[A]
			model.setActive(B);            // [A, B] active:B
			model.setActive(A);            // [A, B] active:A — A keeps its slot

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'B'],
				active: 'A',
				sticky: ['A'],
			});
		});

		test('setActive(undefined) only clears active; non-sticky sessions stay visible', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);            // [A, B] active:B, sticky:[A]
			model.setActive(undefined);

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'B'],
				active: undefined,
				sticky: ['A'],
			});
		});
	});

	suite('toggleStickiness', () => {

		test('toggling a visible non-sticky session sticky keeps its slot', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);            // [A, B] active:B
			model.toggleStickiness(B);     // B stays in its slot, becomes sticky

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'B'],
				active: 'B',
				sticky: ['A', 'B'],
			});
		});

		test('toggling a visible sticky session non-sticky keeps its slot', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');

			model.setActive(A);
			model.toggleStickiness(A);     // [A] sticky:[A]
			model.setActive(B);            // [A, B] active:B
			model.toggleStickiness(A);     // A stays in its slot, becomes non-sticky

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'B'],
				active: 'B',
				sticky: [],
			});
		});

		test('toggling a not-visible session sticky appends it at the end', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');

			model.setActive(A);            // [A]
			model.toggleStickiness(B);     // B not visible → append as sticky

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'B'],
				active: 'A',
				sticky: ['B'],
			});
		});

		test('after toggling a sticky session non-sticky, opening a new session replaces that newly-non-sticky', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');
			const C = stubSession('C');
			const D = stubSession('D');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);
			model.toggleStickiness(B);     // [A, B] sticky:[A, B] active:B
			model.toggleStickiness(B);     // B becomes the (only) non-sticky → most-recent
			model.setActive(C);            // active B is non-sticky → replaces B in place

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'C'],
				active: 'C',
				sticky: ['A'],
			});

			// Open D while active C is non-sticky → replaces C
			model.setActive(D);
			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'D'],
				active: 'D',
				sticky: ['A'],
			});
		});
	});

	suite('insertAt', () => {

		test('inserts a not-yet-visible session to the left of a target as non-sticky', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');
			const C = stubSession('C');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);
			model.toggleStickiness(B);     // visible: [A, B] sticky:[A, B]
			model.insertAt(C, 'B', 'left');

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'C', 'B'],
				active: 'B',
				sticky: ['A', 'B'],
			});
		});

		test('inserts a not-yet-visible session to the right of a target as non-sticky', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');
			const C = stubSession('C');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);
			model.toggleStickiness(B);     // visible: [A, B]
			model.insertAt(C, 'A', 'right');

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'C', 'B'],
				active: 'B',
				sticky: ['A', 'B'],
			});
		});

		test('moves an already-visible non-sticky session and preserves non-sticky state', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');
			const C = stubSession('C');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);            // [A, B] non-sticky:[B]
			model.insertAt(C, 'A', 'left'); // [C, A, B] non-sticky:[C, B]
			model.insertAt(C, 'B', 'right'); // move C to end

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'B', 'C'],
				active: 'B',
				sticky: ['A'],
			});
		});

		test('moves an already-visible sticky session and preserves sticky state', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');
			const C = stubSession('C');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);
			model.toggleStickiness(B);
			model.setActive(C);
			model.toggleStickiness(C);     // [A, B, C] sticky:[A, B, C]
			model.insertAt(A, 'C', 'right'); // move A to end, stays sticky

			assert.deepStrictEqual(snapshot(model), {
				visible: ['B', 'C', 'A'],
				active: 'C',
				sticky: ['B', 'C', 'A'],
			});
		});

		test('dropping a session to the right of its left neighbour is a no-op', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);
			model.toggleStickiness(B);     // [A, B]
			model.insertAt(B, 'A', 'right');

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'B'],
				active: 'B',
				sticky: ['A', 'B'],
			});
		});

		test('dropping a session to the left of its right neighbour is a no-op', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);
			model.toggleStickiness(B);     // [A, B]
			model.insertAt(A, 'B', 'left');

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'B'],
				active: 'B',
				sticky: ['A', 'B'],
			});
		});

		test('is a no-op when the target session is not visible', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');
			const C = stubSession('C');

			model.setActive(A);
			model.toggleStickiness(A);     // [A]
			model.insertAt(C, B.sessionId, 'left');

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A'],
				active: 'A',
				sticky: ['A'],
			});
		});

		test('inserting a new session makes it the most-recent non-sticky for subsequent setActive', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');
			const C = stubSession('C');
			const D = stubSession('D');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);
			model.toggleStickiness(B);     // [A, B] sticky:[A, B]
			model.insertAt(C, 'A', 'right'); // [A, C, B] non-sticky:[C]
			model.setActive(A);            // active sticky → no grid change
			model.setActive(D);            // active sticky → replace most-recent non-sticky C

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'D', 'B'],
				active: 'D',
				sticky: ['A', 'B'],
			});
		});
	});
});
