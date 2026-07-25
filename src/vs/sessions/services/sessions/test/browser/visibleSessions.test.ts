/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { VisibleSession, VisibleSessions } from '../../browser/visibleSessions.js';
import { ChatInteractivity, ChatOriginKind, IChat, ISession, SessionStatus } from '../../common/session.js';

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
	interactivity: constObservable(ChatInteractivity.Full),
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
		capabilities: constObservable({ supportsMultipleChats: false }),
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
			() => [],
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

	test('forwards Git availability through visible and resource-override wrappers', () => {
		const hasGitRepository = observableValue('hasGitRepository', false);
		const session = { ...stubSession('A'), hasGitRepository };
		const model = createModel();
		model.setActive(session);
		const visible = model.activeSession.get();
		const resourceOverride = model.updateResourceOfSession(session, URI.parse('test:///override'));

		assert.deepStrictEqual({
			visible: visible?.hasGitRepository === hasGitRepository,
			resourceOverride: resourceOverride.hasGitRepository === hasGitRepository,
		}, {
			visible: true,
			resourceOverride: true,
		});
	});

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

suite('VisibleSession - open/close chats', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function makeChat(id: string): IChat {
		return { ...stubChat, resource: URI.parse(`test:///chat/${id}`), title: constObservable(id) };
	}

	function makeChatWith(id: string, interactivity: ChatInteractivity): IChat {
		return { ...makeChat(id), interactivity: constObservable(interactivity) };
	}

	function createSession(chats: IChat[], initialClosedChatUris?: Iterable<string>, initialActiveChat?: IChat) {
		const chatsObs = observableValue<readonly IChat[]>('chats', chats);
		const base = stubSession('S');
		const session: ISession = { ...base, chats: chatsObs, mainChat: constObservable(chats[0]) };
		const visible = disposables.add(new VisibleSession(session, initialActiveChat ?? chats[0], initialClosedChatUris));
		const ids = (list: readonly IChat[]) => list.map(c => c.title.get());
		return { visible, chatsObs, ids };
	}

	function snapshot(visible: VisibleSession, ids: (list: readonly IChat[]) => string[]) {
		return {
			open: ids(visible.openChats.get()),
			closed: ids(visible.closedChats.get()),
			active: visible.activeChat.get().title.get(),
		};
	}

	test('closing a non-main chat hides it from the tab strip and lists it as closed', () => {
		const [main, b] = [makeChat('main'), makeChat('b')];
		const { visible, ids } = createSession([main, b]);
		visible.setActiveChat(b);

		visible.closeChat(b);

		assert.deepStrictEqual(snapshot(visible, ids), {
			open: ['main'],
			closed: ['b'],
			active: 'main', // active falls back to an open chat
		});
	});

	test('the main chat cannot be closed', () => {
		const [main, b] = [makeChat('main'), makeChat('b')];
		const { visible, ids } = createSession([main, b]);

		visible.closeChat(main);

		assert.deepStrictEqual(snapshot(visible, ids), {
			open: ['main', 'b'],
			closed: [],
			active: 'main',
		});
	});

	test('opening a closed chat restores it to the tab strip', () => {
		const [main, b] = [makeChat('main'), makeChat('b')];
		const { visible, ids } = createSession([main, b]);
		visible.closeChat(b);

		visible.openChat(b);

		assert.deepStrictEqual(snapshot(visible, ids), {
			open: ['main', 'b'],
			closed: [],
			active: 'main',
		});
	});

	test('deleting a closed chat drops it from the closed list', () => {
		const [main, b] = [makeChat('main'), makeChat('b')];
		const { visible, chatsObs, ids } = createSession([main, b]);
		visible.closeChat(b);

		chatsObs.set([main], undefined); // chat is removed from the session

		assert.deepStrictEqual(snapshot(visible, ids), {
			open: ['main'],
			closed: [],
			active: 'main',
		});
	});

	test('seeded closed chats are restored as hidden (persistence)', () => {
		const [main, b, c] = [makeChat('main'), makeChat('b'), makeChat('c')];
		const { visible, ids } = createSession([main, b, c], [b.resource.toString()]);

		assert.deepStrictEqual(snapshot(visible, ids), {
			open: ['main', 'c'],
			closed: ['b'],
			active: 'main',
		});
	});

	test('a seeded chat that is also the restored active chat stays open', () => {
		const [main, b] = [makeChat('main'), makeChat('b')];
		// The persisted active chat must never be hidden, even if it also appears
		// in the persisted closed set (inconsistent state).
		const { visible, ids } = createSession([main, b], [b.resource.toString()], b);

		assert.deepStrictEqual(snapshot(visible, ids), {
			open: ['main', 'b'],
			closed: [],
			active: 'b',
		});
	});

	test('a seeded main chat is never hidden even if persisted as closed', () => {
		const [main, b] = [makeChat('main'), makeChat('b')];
		// The main chat can never be closed, so a corrupt/legacy closed set that
		// contains the main chat URI must not hide it from the tab strip.
		const { visible, ids } = createSession([main, b], [main.resource.toString(), b.resource.toString()]);

		assert.deepStrictEqual(snapshot(visible, ids), {
			open: ['main'],
			closed: ['b'],
			active: 'main',
		});
	});

	test('lastClosedChat returns the most recently closed chat regardless of creation order', () => {
		// B was created before C, but if C is closed first and then B,
		// lastClosedChat should return B (not C, which closedChats.at(-1) would wrongly give).
		const [main, b, c] = [makeChat('main'), makeChat('b'), makeChat('c')];
		const { visible } = createSession([main, b, c]);

		visible.closeChat(c); // close C first
		visible.closeChat(b); // close B last

		assert.strictEqual(visible.lastClosedChat?.title.get(), 'b');
	});

	test('lastClosedChat updates after reopening the last-closed chat', () => {
		const [main, b, c] = [makeChat('main'), makeChat('b'), makeChat('c')];
		const { visible } = createSession([main, b, c]);

		visible.closeChat(b);
		visible.closeChat(c);
		assert.strictEqual(visible.lastClosedChat?.title.get(), 'c');

		visible.openChat(c); // reopen C — B is now the last closed
		assert.strictEqual(visible.lastClosedChat?.title.get(), 'b');
	});

	test('lastClosedChat returns undefined when no chats are closed', () => {
		const [main, b] = [makeChat('main'), makeChat('b')];
		const { visible } = createSession([main, b]);

		assert.strictEqual(visible.lastClosedChat, undefined);
	});

	test('lastClosedChat skips deleted chats and returns the next valid one', () => {
		const [main, b, c] = [makeChat('main'), makeChat('b'), makeChat('c')];
		const { visible, chatsObs } = createSession([main, b, c]);

		visible.closeChat(b);
		visible.closeChat(c);
		// Delete C from the session (simulates permanent deletion)
		chatsObs.set([main, b], undefined);

		// C is gone; lastClosedChat should fall back to B
		assert.strictEqual(visible.lastClosedChat?.title.get(), 'b');
	});

	test('hidden chats are excluded from the tab strip but read-only chats are not', () => {
		const main = makeChatWith('main', ChatInteractivity.Full);
		const readOnly = makeChatWith('ro', ChatInteractivity.ReadOnly);
		const hidden = makeChatWith('hidden', ChatInteractivity.Hidden);
		const { visible, ids } = createSession([main, readOnly, hidden]);

		assert.deepStrictEqual(snapshot(visible, ids), {
			open: ['main', 'ro'],
			closed: [],
			active: 'main',
		});
	});
});

suite('VisibleSession - visibleChatTabs', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function makeChat(id: string, status = SessionStatus.Completed, origin?: ChatOriginKind): IChat {
		return {
			...stubChat,
			resource: URI.parse(`test:///chat/${id}`),
			title: constObservable(id),
			status: constObservable(status),
			origin: origin ? { kind: origin } : undefined,
		};
	}

	function createSession(chats: IChat[]) {
		const base = stubSession('S');
		const session: ISession = { ...base, chats: constObservable(chats), mainChat: constObservable(chats[0]) };
		return disposables.add(new VisibleSession(session, chats[0]));
	}

	test('keeps provider order and hides tool-origin (subagent) chats by default', () => {
		const visible = createSession([
			makeChat('main'),
			makeChat('draft', SessionStatus.Untitled),
			makeChat('tool', SessionStatus.Completed, ChatOriginKind.Tool),
			makeChat('second'),
		]);

		// Subagent (tool-origin) chats are hidden from the tab strip by default.
		assert.deepStrictEqual(visible.visibleChatTabs.get().map(c => c.title.get()), ['main', 'draft', 'second']);
	});

	test('surfaces a subagent tab once it is explicitly opened, and hides it again on close', () => {
		const chats = [
			makeChat('main'),
			makeChat('tool', SessionStatus.Completed, ChatOriginKind.Tool),
		];
		const visible = createSession(chats);
		const tool = chats[1];

		visible.openChat(tool);
		const afterOpen = visible.visibleChatTabs.get().map(c => c.title.get());
		visible.closeChat(tool);
		const afterClose = visible.visibleChatTabs.get().map(c => c.title.get());

		assert.deepStrictEqual({ afterOpen, afterClose }, {
			afterOpen: ['main', 'tool'],
			afterClose: ['main'],
		});
	});

	test('a closed subagent tab is not added to the reopenable closed chats', () => {
		const chats = [
			makeChat('main'),
			makeChat('tool', SessionStatus.Completed, ChatOriginKind.Tool),
		];
		const visible = createSession(chats);
		const tool = chats[1];

		visible.openChat(tool);
		visible.closeChat(tool);

		assert.deepStrictEqual(visible.closedChats.get().map(c => c.title.get()), []);
	});

	test('shows side-chat (`/btw`) origin chats in the ordinary tab strip', () => {
		const visible = createSession([
			makeChat('main'),
			makeChat('side', SessionStatus.Completed, ChatOriginKind.SideChat),
			makeChat('second'),
		]);

		assert.deepStrictEqual(visible.visibleChatTabs.get().map(c => c.title.get()), ['main', 'side', 'second']);
	});
});

suite('VisibleSession - shouldShowChatTabs', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function makeChat(id: string, title: string, origin?: ChatOriginKind): IChat {
		return {
			...stubChat,
			resource: URI.parse(`test:///chat/${id}`),
			title: constObservable(title),
			status: constObservable(SessionStatus.Completed),
			origin: origin ? { kind: origin } : undefined,
		};
	}

	function createSession(sessionTitle: string, chats: IChat[]) {
		const base = stubSession('S');
		const session: ISession = { ...base, title: constObservable(sessionTitle), chats: constObservable(chats), mainChat: constObservable(chats[0]) };
		return disposables.add(new VisibleSession(session, chats[0]));
	}

	test('hidden for a single chat matching the session title', () => {
		const visible = createSession('Title', [makeChat('main', 'Title')]);
		assert.strictEqual(visible.shouldShowChatTabs.get(), false);
	});

	test('hidden for a single chat even when its title diverged from the session title', () => {
		const visible = createSession('Session Title', [makeChat('main', 'Chat Title')]);
		assert.strictEqual(visible.shouldShowChatTabs.get(), false);
	});

	test('shown for more than one chat even if a chat title matches the session title', () => {
		const visible = createSession('main', [makeChat('main', 'main'), makeChat('second', 'second')]);
		assert.strictEqual(visible.shouldShowChatTabs.get(), true);
	});

	test('hidden for a single non-tool chat matching the session title even when it has a subagent', () => {
		const visible = createSession('Title', [
			makeChat('main', 'Title'),
			makeChat('tool', 'tool', ChatOriginKind.Tool),
		]);
		// Subagents on their own do not show the strip; the Conversations menu
		// (which lists subagents) surfaces in the session header instead.
		assert.strictEqual(visible.shouldShowChatTabs.get(), false);
	});

	test('shown once a subagent tab is explicitly opened (multiple visible tabs)', () => {
		const chats = [makeChat('main', 'Title'), makeChat('tool', 'tool', ChatOriginKind.Tool)];
		const visible = createSession('Title', chats);
		visible.openChat(chats[1]);
		// Opening a subagent surfaces it as a second visible tab, so the strip is
		// shown to display both tabs.
		assert.strictEqual(visible.shouldShowChatTabs.get(), true);
	});

	test('shown when a side chat exists alongside the main chat', () => {
		const visible = createSession('Title', [
			makeChat('main', 'Title'),
			makeChat('side', 'side', ChatOriginKind.SideChat),
		]);
		assert.strictEqual(visible.shouldShowChatTabs.get(), true);
	});

	test('hidden when there are no tab chats', () => {
		const main = makeChat('main', 'Title');
		const base = stubSession('S');
		const session: ISession = { ...base, title: constObservable('Title'), chats: constObservable<readonly IChat[]>([]), mainChat: constObservable(main) };
		const visible = disposables.add(new VisibleSession(session, main));
		assert.strictEqual(visible.shouldShowChatTabs.get(), false);
	});

	test('hidden after a non-main chat is closed back down to a single visible tab', () => {
		const main = makeChat('main', 'Title');
		const second = makeChat('second', 'second');
		const visible = createSession('Title', [main, second]);

		assert.strictEqual(visible.shouldShowChatTabs.get(), true);
		assert.strictEqual(visible.visibleChatTabs.get().length, 2);

		visible.closeChat(second);

		assert.deepStrictEqual({
			shouldShowChatTabs: visible.shouldShowChatTabs.get(),
			visibleChatTabs: visible.visibleChatTabs.get().map(c => c.title.get()),
		}, {
			shouldShowChatTabs: false,
			visibleChatTabs: ['Title'],
		});
	});
});

suite('VisibleSession - side chat tabs', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function makeChat(id: string, origin?: ChatOriginKind): IChat {
		return {
			...stubChat,
			resource: URI.parse(`test:///chat/${id}`),
			title: constObservable(id),
			status: constObservable(SessionStatus.Completed),
			origin: origin ? { kind: origin } : undefined,
		};
	}

	function createSession(chats: IChat[]) {
		const base = stubSession('S');
		const chatsObs = observableValue<readonly IChat[]>('chats', chats);
		const session: ISession = { ...base, chats: chatsObs, mainChat: constObservable(chats[0]) };
		const visible = disposables.add(new VisibleSession(session, chats[0]));
		return { visible, chatsObs };
	}

	test('openChat keeps a side-chat origin chat available as a normal tab', () => {
		const chats = [makeChat('main'), makeChat('side', ChatOriginKind.SideChat)];
		const { visible } = createSession(chats);

		visible.openChat(chats[1]);

		assert.deepStrictEqual(visible.visibleChatTabs.get().map(c => c.title.get()), ['main', 'side']);
	});

	test('closeChat hides a side-chat origin chat into the reopenable closed set', () => {
		const chats = [makeChat('main'), makeChat('side', ChatOriginKind.SideChat)];
		const { visible } = createSession(chats);

		visible.closeChat(chats[1]);

		assert.deepStrictEqual({
			visible: visible.visibleChatTabs.get().map(c => c.title.get()),
			closed: visible.closedChats.get().map(c => c.title.get()),
		}, {
			visible: ['main'],
			closed: ['side'],
		});
	});

	test('the active-chat fallback can select a side chat like any other peer chat', () => {
		const main = makeChat('main');
		const second = makeChat('second');
		const side = makeChat('side', ChatOriginKind.SideChat);
		const { visible } = createSession([main, second, side]);

		visible.setActiveChat(second);
		visible.closeChat(second);

		assert.strictEqual(visible.activeChat.get(), side);
	});
});

suite('VisibleSessions - active chat removal fallback', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createModel() {
		const uriIdentity = new class extends mock<IUriIdentityService>() {
			override readonly extUri = extUriBiasedIgnorePathCase;
		};
		return disposables.add(new VisibleSessions(
			session => session.mainChat.get(),
			() => [],
			uriIdentity,
		));
	}

	function makeChat(id: string, origin?: ChatOriginKind): IChat {
		return {
			...stubChat,
			resource: URI.parse(`test:///chat/${id}`),
			title: constObservable(id),
			status: constObservable(SessionStatus.Completed),
			origin: origin ? { kind: origin } : undefined,
		};
	}

	function createSession(chats: IChat[]) {
		const chatsObs = observableValue<readonly IChat[]>('chats', chats);
		const base = stubSession('S');
		const session: ISession = { ...base, chats: chatsObs, mainChat: constObservable(chats[0]) };
		return { session, chatsObs };
	}

	test('removing an active side chat falls back to the last visible tab, not an unopened tool chat', () => {
		const main = makeChat('main');
		const side = makeChat('side', ChatOriginKind.SideChat);
		const tool = makeChat('tool', ChatOriginKind.Tool);
		const { session, chatsObs } = createSession([main, side, tool]);
		const model = createModel();
		const visible = model.setActive(session)!;

		visible.setActiveChat(side);
		chatsObs.set([main, tool], undefined);

		assert.deepStrictEqual({
			active: visible.activeChat.get().title.get(),
			open: visible.openChats.get().map(c => c.title.get()),
			visible: visible.visibleChatTabs.get().map(c => c.title.get()),
		}, {
			active: 'main',
			open: ['main', 'tool'],
			visible: ['main'],
		});
	});

	test('removing an active side chat can fall back to an explicitly opened tool tab', () => {
		const main = makeChat('main');
		const side = makeChat('side', ChatOriginKind.SideChat);
		const tool = makeChat('tool', ChatOriginKind.Tool);
		const { session, chatsObs } = createSession([main, side, tool]);
		const model = createModel();
		const visible = model.setActive(session)!;

		visible.openChat(tool);
		visible.setActiveChat(side);
		chatsObs.set([main, tool], undefined);

		assert.deepStrictEqual({
			active: visible.activeChat.get().title.get(),
			visible: visible.visibleChatTabs.get().map(c => c.title.get()),
		}, {
			active: 'tool',
			visible: ['main', 'tool'],
		});
	});
});

suite('VisibleSession - per-chat model/mode', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function makeChat(id: string, modelId: string | undefined, modeId: string | undefined): IChat {
		return {
			...stubChat,
			resource: URI.parse(`test:///chat/${id}`),
			title: constObservable(id),
			modelId: constObservable(modelId),
			mode: constObservable(modeId ? { id: modeId, kind: 'agent' } : undefined),
		};
	}

	test('modelId and mode follow the active chat, not the session/default chat', () => {
		const first = makeChat('first', 'model-1', 'agent-1');
		const second = makeChat('second', 'model-2', 'agent-2');
		const base = stubSession('S');
		const session: ISession = { ...base, chats: constObservable([first, second]), mainChat: constObservable(first) };
		const visible = disposables.add(new VisibleSession(session, first));

		assert.deepStrictEqual(
			{ modelId: visible.modelId.get(), mode: visible.mode.get() },
			{ modelId: 'model-1', mode: { id: 'agent-1', kind: 'agent' } },
		);

		visible.setActiveChat(second);

		assert.deepStrictEqual(
			{ modelId: visible.modelId.get(), mode: visible.mode.get() },
			{ modelId: 'model-2', mode: { id: 'agent-2', kind: 'agent' } },
		);
	});
});
