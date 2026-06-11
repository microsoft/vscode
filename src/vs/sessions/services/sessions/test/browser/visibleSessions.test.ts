/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
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
		mainChat: constObservable(stubChat),
		capabilities: { supportsMultipleChats: false },
	};
}

suite('VisibleSessions', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createModel() {
		const uriIdentity = new class extends mock<IUriIdentityService>() {
			override readonly extUri = extUriBiasedIgnorePathCase;
		};
		const model = disposables.add(new VisibleSessions(
			session => session.mainChat.get(),
			uriIdentity,
		));
		return model;
	}

	function snapshot(model: VisibleSessions): { visible: (string | undefined)[]; active: string | undefined; sticky: string[] } {
		const visible = model.visibleSessions.get();
		return {
			visible: visible.map(s => s?.sessionId),
			active: model.activeSession.get()?.sessionId,
			sticky: visible.filter((s): s is NonNullable<typeof s> => !!s && s.sticky.get()).map(s => s.sessionId),
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

		test('setActive(undefined) replaces the active non-sticky slot with the empty slot', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);            // [A, B] active:B, sticky:[A]
			model.setActive(undefined);    // active B is non-sticky → replaced by empty slot

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', undefined],
				active: undefined,
				sticky: ['A'],
			});
		});

		test('setActive(undefined) is idempotent when the empty slot is already active', () => {
			const model = createModel();
			const A = stubSession('A');

			model.setActive(A);
			model.toggleStickiness(A);     // [A] sticky:[A]
			model.setActive(undefined);    // [A, undefined] active:undefined
			model.setActive(undefined);    // no second empty slot is created

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', undefined],
				active: undefined,
				sticky: ['A'],
			});
		});

		test('setActive(undefined) when an empty slot already exists keeps it (no duplicate)', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');

			model.setActive(A);
			model.toggleStickiness(A);     // [A] sticky:[A]
			model.setActive(undefined);    // [A, undefined] active:undefined (empty slot)
			model.setActive(B);            // active empty slot is non-sticky → replaced by B
			model.setActive(undefined);    // active B is non-sticky → replaced by empty slot

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', undefined],
				active: undefined,
				sticky: ['A'],
			});
		});

		test('opening a real session while the empty slot is the only most-recent non-sticky replaces it', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');

			model.setActive(A);
			model.toggleStickiness(A);     // [A] sticky:[A]
			model.setActive(undefined);    // [A, undefined] active:undefined
			model.setActive(A);            // active flips to A (sticky); empty slot remains
			model.setActive(B);            // active A is sticky → replace most-recent non-sticky (empty)

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'B'],
				active: 'B',
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

		test('inserts a not-yet-visible session to the left of a target as non-sticky and activates it', () => {
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
				active: 'C',
				sticky: ['A', 'B'],
			});
		});

		test('inserts a not-yet-visible session to the right of a target as non-sticky and activates it', () => {
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
				active: 'C',
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
				active: 'C',
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
				active: 'A',
				sticky: ['B', 'C', 'A'],
			});
		});

		test('dropping a session to the right of its left neighbour is a no-op for layout but still activates it', () => {
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

		test('dropping a session to the left of its right neighbour is a no-op for layout but still activates it', () => {
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
				active: 'A',
				sticky: ['A', 'B'],
			});
		});

		test('does not change the active session when activate is false', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');
			const C = stubSession('C');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);
			model.toggleStickiness(B);     // [A, B] active:B
			model.insertAt(C, 'A', 'right', false);

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'C', 'B'],
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

		test('insertAt(undefined, ...) adds an empty slot at the requested position and activates it', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);
			model.toggleStickiness(B);     // [A, B] sticky:[A, B]
			model.insertAt(undefined, 'A', 'right');

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', undefined, 'B'],
				active: undefined,
				sticky: ['A', 'B'],
			});
		});

		test('insertAt(undefined, ...) is a no-op when the empty slot already exists', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);
			model.toggleStickiness(B);     // [A, B] sticky:[A, B]
			model.insertAt(undefined, 'A', 'right'); // [A, undefined, B] active becomes empty slot
			model.setActive(B);                       // re-activate B
			model.insertAt(undefined, 'B', 'right'); // no-op — empty slot already exists

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', undefined, 'B'],
				active: 'B',
				sticky: ['A', 'B'],
			});
		});
	});

	suite('restoreGrid', () => {

		test('builds the grid in order with the correct active and sticky slots', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');
			const C = stubSession('C');

			model.restoreGrid([
				{ session: A, sticky: true },
				{ session: B, sticky: false },
				{ session: C, sticky: false },
			], 1);

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'B', 'C'],
				active: 'B',
				sticky: ['A'],
			});
		});

		test('restores the empty (new-session) slot as active', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');

			model.restoreGrid([
				{ session: A, sticky: true },
				{ session: B, sticky: false },
				{ session: undefined, sticky: false },
			], 2);

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'B', undefined],
				active: undefined,
				sticky: ['A'],
			});
		});

		test('a later session can be inserted to the left of the empty slot without stealing active', () => {
			const model = createModel();
			const A = stubSession('A');

			// Only the empty slot is available initially and it is active.
			model.restoreGrid([
				{ session: undefined, sticky: false },
			], 0);

			// A becomes available later and is anchored to the left of the empty slot.
			model.insertAt(A, undefined, 'left', false);

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', undefined],
				active: undefined,
				sticky: [],
			});
		});

		test('replaces a previous transient state and disposes orphaned wrappers', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');

			// Transient state: a fresh session is shown.
			model.setActive(A);

			// Restore overrides it entirely with the persisted grid.
			model.restoreGrid([
				{ session: B, sticky: false },
			], 0);

			assert.deepStrictEqual(snapshot(model), {
				visible: ['B'],
				active: 'B',
				sticky: [],
			});
		});
	});

	suite('updateSession', () => {

		test('is a no-op when the session is not visible', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');
			const Bv2 = stubSession('B');

			model.setActive(A);
			model.toggleStickiness(A);     // [A] sticky:[A]
			model.updateSession(B, Bv2);

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A'],
				active: 'A',
				sticky: ['A'],
			});
		});

		test('replaces a visible session with one having a new id, preserving slot and sticky state', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');
			const C = stubSession('C');
			const Bnew = stubSession('Bnew');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);
			model.toggleStickiness(B);
			model.setActive(C);            // [A, B, C] sticky:[A, B] active:C
			model.updateSession(B, Bnew);

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'Bnew', 'C'],
				active: 'C',
				sticky: ['A', 'Bnew'],
			});
		});

		test('updates the active observable when the replaced session was active', () => {
			const model = createModel();
			const A = stubSession('A');
			const Anew = stubSession('Anew');

			model.setActive(A);            // [A] active:A
			model.updateSession(A, Anew);

			assert.deepStrictEqual(snapshot(model), {
				visible: ['Anew'],
				active: 'Anew',
				sticky: [],
			});
		});

		test('replaces the wrapper even when the session id is unchanged', () => {
			const model = createModel();
			const A = stubSession('A');
			const Av2 = stubSession('A');

			model.setActive(A);
			const originalWrapper = model.activeSession.get();

			model.updateSession(A, Av2);

			const newWrapper = model.activeSession.get();
			assert.strictEqual(newWrapper?.sessionId, 'A');
			assert.notStrictEqual(newWrapper, originalWrapper);
			assert.deepStrictEqual(snapshot(model), {
				visible: ['A'],
				active: 'A',
				sticky: [],
			});
		});

		test('preserves most-recent-non-sticky tracking so subsequent setActive replaces the updated slot', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');
			const Bnew = stubSession('Bnew');
			const C = stubSession('C');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);            // [A, B] sticky:[A] active:B (non-sticky, most-recent)
			model.setActive(A);            // active flips to A (sticky); B remains most-recent non-sticky
			model.updateSession(B, Bnew);  // [A, Bnew] sticky:[A]
			model.setActive(C);            // active A sticky → replace most-recent non-sticky Bnew

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'C'],
				active: 'C',
				sticky: ['A'],
			});
		});
	});

	suite('removeMany', () => {

		test('removing the active middle session falls back to its leftward neighbour', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');
			const C = stubSession('C');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);
			model.toggleStickiness(B);
			model.setActive(C);
			model.toggleStickiness(C);     // [A, B, C] sticky:[A, B, C] active:C
			model.setActive(B);            // active flips to B (sticky), keeps slot
			model.removeMany(['B']);

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'C'],
				active: 'A',
				sticky: ['A', 'C'],
			});
		});

		test('removing the active first session falls back to the new first slot', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);
			model.toggleStickiness(B);     // [A, B] sticky:[A, B] active:B
			model.setActive(A);            // active A (sticky), keeps slot
			model.removeMany(['A']);

			assert.deepStrictEqual(snapshot(model), {
				visible: ['B'],
				active: 'B',
				sticky: ['B'],
			});
		});

		test('removing the active last session falls back to its leftward neighbour', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);
			model.toggleStickiness(B);     // [A, B] sticky:[A, B] active:B

			model.removeMany(['B']);

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A'],
				active: 'A',
				sticky: ['A'],
			});
		});

		test('removing the only visible active session clears the active observable', () => {
			const model = createModel();
			const A = stubSession('A');

			model.setActive(A);            // [A] active:A
			model.removeMany(['A']);

			assert.deepStrictEqual(snapshot(model), {
				visible: [],
				active: undefined,
				sticky: [],
			});
		});

		test('removing the active session falls back to the empty slot when it is the leftward neighbour', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');

			model.setActive(A);
			model.toggleStickiness(A);     // [A] sticky:[A]
			model.setActive(undefined);    // [A, undefined] active:undefined
			model.insertAt(B, A.sessionId, 'right'); // [A, B, undefined] active:B (non-sticky)
			model.removeMany(['B']);

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', undefined],
				active: 'A',
				sticky: ['A'],
			});
		});

		test('removing the active empty slot falls back to its leftward neighbour', () => {
			const model = createModel();
			const A = stubSession('A');

			model.setActive(A);
			model.toggleStickiness(A);     // [A] sticky:[A]
			model.setActive(undefined);    // [A, undefined] active:undefined (empty slot)
			model.removeMany([undefined]);

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A'],
				active: 'A',
				sticky: ['A'],
			});
		});

		test('removing a non-active session leaves the active session unchanged', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');
			const C = stubSession('C');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);
			model.toggleStickiness(B);
			model.setActive(C);
			model.toggleStickiness(C);     // [A, B, C] sticky:[A, B, C] active:C
			model.removeMany(['B']);

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A', 'C'],
				active: 'C',
				sticky: ['A', 'C'],
			});
		});

		test('removing the active session along with its leftward neighbour falls back further left', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');
			const C = stubSession('C');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);
			model.toggleStickiness(B);
			model.setActive(C);
			model.toggleStickiness(C);     // [A, B, C] sticky:[A, B, C] active:C

			model.removeMany(['B', 'C']);

			assert.deepStrictEqual(snapshot(model), {
				visible: ['A'],
				active: 'A',
				sticky: ['A'],
			});
		});

		test('removing all visible sessions including the active clears the active observable', () => {
			const model = createModel();
			const A = stubSession('A');
			const B = stubSession('B');

			model.setActive(A);
			model.toggleStickiness(A);
			model.setActive(B);
			model.toggleStickiness(B);     // [A, B] sticky:[A, B] active:B

			model.removeMany(['A', 'B']);

			assert.deepStrictEqual(snapshot(model), {
				visible: [],
				active: undefined,
				sticky: [],
			});
		});
	});
});

