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

	test('opening B after A replaces transient (visible:[B], sticky:[])', () => {
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

	test('making the non-active A sticky after open A,B places A at far right (visible:[B, A], sticky:[A])', () => {
		const model = createModel();
		const A = stubSession('A');
		const B = stubSession('B');

		model.setActive(A);
		model.setActive(B);
		model.toggleStickiness(A);

		assert.deepStrictEqual(snapshot(model), {
			visible: ['B', 'A'],
			active: 'B',
			sticky: ['A'],
		});
	});

	test('making the active transient B sticky keeps its position (visible:[B, A], sticky:[B, A])', () => {
		const model = createModel();
		const A = stubSession('A');
		const B = stubSession('B');

		model.setActive(A);
		model.setActive(B);
		model.toggleStickiness(A);
		model.toggleStickiness(B);

		assert.deepStrictEqual(snapshot(model), {
			visible: ['B', 'A'],
			active: 'B',
			sticky: ['B', 'A'],
		});
	});

	test('opening C when all visible are sticky inserts to far left (visible:[C, B, A])', () => {
		const model = createModel();
		const A = stubSession('A');
		const B = stubSession('B');
		const C = stubSession('C');

		model.setActive(A);
		model.setActive(B);
		model.toggleStickiness(A);
		model.toggleStickiness(B);
		model.setActive(C);

		assert.deepStrictEqual(snapshot(model), {
			visible: ['C', 'B', 'A'],
			active: 'C',
			sticky: ['B', 'A'],
		});
	});

	test('making the active transient C sticky keeps its far-left position (visible:[C, B, A], sticky:[C, B, A])', () => {
		const model = createModel();
		const A = stubSession('A');
		const B = stubSession('B');
		const C = stubSession('C');

		model.setActive(A);
		model.setActive(B);
		model.toggleStickiness(A);
		model.toggleStickiness(B);
		model.setActive(C);
		model.toggleStickiness(C);

		assert.deepStrictEqual(snapshot(model), {
			visible: ['C', 'B', 'A'],
			active: 'C',
			sticky: ['C', 'B', 'A'],
		});
	});

	test('making a not-yet-visible D sticky appends to far right (visible:[C, B, A, D], sticky:[C, B, A, D])', () => {
		const model = createModel();
		const A = stubSession('A');
		const B = stubSession('B');
		const C = stubSession('C');
		const D = stubSession('D');

		model.setActive(A);
		model.setActive(B);
		model.toggleStickiness(A);
		model.toggleStickiness(B);
		model.setActive(C);
		model.toggleStickiness(C);
		model.toggleStickiness(D);

		assert.deepStrictEqual(snapshot(model), {
			visible: ['C', 'B', 'A', 'D'],
			active: 'C',
			sticky: ['C', 'B', 'A', 'D'],
		});
	});

	suite('insertStickyAt', () => {

		test('inserts a not-yet-visible session to the left of a target as sticky', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');
			const C = stubSession('C');

			model.setActive(A);
			model.setActive(B);
			model.toggleStickiness(A);
			model.toggleStickiness(B);
			// visible: [B, A], sticky: [B, A]
			model.insertStickyAt(C, 'A', 'left');

			assert.deepStrictEqual(snapshot(model), {
				visible: ['B', 'C', 'A'],
				active: 'B',
				sticky: ['B', 'C', 'A'],
			});
		});

		test('inserts a not-yet-visible session to the right of a target as sticky', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');
			const C = stubSession('C');

			model.setActive(A);
			model.setActive(B);
			model.toggleStickiness(A);
			model.toggleStickiness(B);
			// visible: [B, A]
			model.insertStickyAt(C, 'A', 'right');

			assert.deepStrictEqual(snapshot(model), {
				visible: ['B', 'A', 'C'],
				active: 'B',
				sticky: ['B', 'A', 'C'],
			});
		});

		test('moves an already-visible session to the left of a target', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');
			const C = stubSession('C');

			model.setActive(A);
			model.setActive(B);
			model.toggleStickiness(A);
			model.toggleStickiness(B);
			model.toggleStickiness(C);
			// visible: [B, A, C], sticky: [B, A, C]
			model.insertStickyAt(C, 'B', 'left');

			assert.deepStrictEqual(snapshot(model), {
				visible: ['C', 'B', 'A'],
				active: 'B',
				sticky: ['C', 'B', 'A'],
			});
		});

		test('moves an already-visible session to the right of a target with index adjustment', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');
			const C = stubSession('C');

			model.setActive(A);
			model.setActive(B);
			model.toggleStickiness(A);
			model.toggleStickiness(B);
			model.toggleStickiness(C);
			// visible: [B, A, C]; move B to the right of A — destination index
			// shifts left by one because B was removed from before A.
			model.insertStickyAt(B, 'A', 'right');

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'B', 'C'],
				active: 'B',
				sticky: ['A', 'B', 'C'],
			});
		});

		test('dropping a session to the right of its left neighbour is a no-op', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');

			model.setActive(A);
			model.setActive(B);
			model.toggleStickiness(A);
			model.toggleStickiness(B);
			// visible: [B, A]; dropping A to the right of B is equivalent to
			// its current position.
			model.insertStickyAt(A, 'B', 'right');

			assert.deepStrictEqual(snapshot(model), {
				visible: ['B', 'A'],
				active: 'B',
				sticky: ['B', 'A'],
			});
		});

		test('dropping a session to the left of its right neighbour is a no-op', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');

			model.setActive(A);
			model.setActive(B);
			model.toggleStickiness(A);
			model.toggleStickiness(B);
			// visible: [B, A]; dropping B to the left of A is equivalent to
			// its current position.
			model.insertStickyAt(B, 'A', 'left');

			assert.deepStrictEqual(snapshot(model), {
				visible: ['B', 'A'],
				active: 'B',
				sticky: ['B', 'A'],
			});
		});

		test('promotes the active transient session to sticky when inserted at a target', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');
			const C = stubSession('C');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);
			model.setActive(C);
			// visible: [C, A]; C is transient and active.
			model.insertStickyAt(C, 'A', 'right');

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'C'],
				active: 'C',
				sticky: ['A', 'C'],
			});
		});

		test('is a no-op when the target session is not visible', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');
			const C = stubSession('C');

			model.setActive(A);
			model.toggleStickiness(A);
			// visible: [A]; C is not visible and 'unknown' is not a known id.
			model.insertStickyAt(C, B.sessionId, 'left');

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A'],
				active: 'A',
				sticky: ['A'],
			});
		});
	});
});
