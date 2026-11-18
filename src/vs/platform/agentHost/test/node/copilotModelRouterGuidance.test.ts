/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IModelRouterGuidance } from '../../common/modelRouterGuidance.js';
import { CopilotModelRouterGuidance } from '../../node/copilot/copilotModelRouterGuidance.js';

function guidance(route = 'feature'): IModelRouterGuidance {
	return { router: 'Workday', route, guidance: 'Plan first.' };
}

const chat = 'chat:1';

suite('CopilotModelRouterGuidance', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	/** A chat whose session started work with `first`. */
	function startedWith(first: IModelRouterGuidance | undefined): CopilotModelRouterGuidance {
		const state = new CopilotModelRouterGuidance();
		state.enterTurn(chat, 't1');
		if (first) {
			state.routeTurn(chat, 't1', first);
		}
		state.commit(chat, state.guidanceFor(chat));
		return state;
	}

	test('a turn\'s routing is staged, and becomes the chat\'s when a session launched with it starts work', () => {
		const state = new CopilotModelRouterGuidance();
		const g = guidance();
		state.enterTurn(chat, 't1');
		const changed = state.routeTurn(chat, 't1', g);
		const launched = state.guidanceFor(chat);
		state.commit(chat, launched);
		// A later turn that is not routed runs with it.
		state.enterTurn(chat, 't2');
		assert.deepStrictEqual({ changed, launchedWithStaged: launched === g, committed: state.guidanceFor(chat) === g }, { changed: true, launchedWithStaged: true, committed: true });
	});

	test('a chat that has started work takes the guidance of the route a later turn is routed to', () => {
		const first = guidance();
		const other = guidance('other');
		const state = startedWith(first);
		const turn = (turnId: string, route: () => unknown, sent = true) => {
			state.enterTurn(chat, turnId);
			const changed = route();
			const launched = state.guidanceFor(chat);
			if (sent) {
				state.commit(chat, launched);
			}
			return { changed, launched };
		};
		assert.deepStrictEqual({
			// Kept on its route: equal guidance leaves the object the session was launched with.
			sameRoute: turn('t2', () => state.routeTurn(chat, 't2', guidance())),
			sameObject: state.guidanceFor(chat) === first,
			otherRoute: turn('t3', () => state.routeTurn(chat, 't3', other)),
			// A turn sent on a hand-picked model is not routed, and changes nothing.
			unrouted: turn('t4', () => state.leaveTurnUnrouted(chat, 't4')),
			// The routing of an earlier turn finishes late.
			late: turn('t5', () => state.routeTurn(chat, 't3', first)),
			routeWithoutGuidance: turn('t6', () => state.routeTurn(chat, 't6', undefined)),
			afterwards: turn('t7', () => undefined),
		}, {
			sameRoute: { changed: false, launched: first },
			sameObject: true,
			otherRoute: { changed: true, launched: other },
			unrouted: { changed: undefined, launched: other },
			late: { changed: false, launched: other },
			routeWithoutGuidance: { changed: true, launched: undefined },
			afterwards: { changed: undefined, launched: undefined },
		});
	});

	test('a routed turn that never starts work leaves the chat\'s guidance as it was', () => {
		const first = guidance();
		const state = startedWith(first);
		// t2 is routed to another route and cancelled before it is sent; so is t3, to a route without guidance.
		state.enterTurn(chat, 't2');
		state.routeTurn(chat, 't2', guidance('other'));
		const duringT2 = state.guidanceFor(chat)?.route;
		state.enterTurn(chat, 't3');
		state.routeTurn(chat, 't3', undefined);
		const duringT3 = state.guidanceFor(chat);
		// t4 is sent on a hand-picked model.
		state.enterTurn(chat, 't4');
		// Routing a turn back to the chat's own guidance stages nothing.
		state.enterTurn(chat, 't5');
		state.routeTurn(chat, 't5', guidance('other'));
		const backToCommitted = state.routeTurn(chat, 't5', guidance());
		assert.deepStrictEqual({ duringT2, duringT3, backToCommitted, kept: state.guidanceFor(chat) === first }, { duringT2: 'other', duringT3: undefined, backToCommitted: true, kept: true });
	});

	test('a chat that started work without guidance takes it from its next routed turn', () => {
		// As after a host restart, for a fork or an import, or when a router is picked later.
		const state = startedWith(undefined);
		state.enterTurn(chat, 't2');
		const changed = state.routeTurn(chat, 't2', guidance());
		state.commit(chat, state.guidanceFor(chat));
		state.enterTurn(chat, 't3');
		assert.deepStrictEqual({ changed, route: state.guidanceFor(chat)?.route }, { changed: true, route: 'feature' });
	});

	test('one turn\'s guidance never reaches another turn of a chat that has not started work', () => {
		const state = new CopilotModelRouterGuidance();
		// t1 is routed, then cancelled before it is sent. t2 is sent on a hand-picked model, so it is never routed.
		state.enterTurn(chat, 't1');
		state.routeTurn(chat, 't1', guidance());
		const duringT1 = state.guidanceFor(chat)?.route;
		state.enterTurn(chat, 't2');
		const duringT2 = state.guidanceFor(chat);
		// t1's routing call finishes late: it is no longer the chat's turn.
		const lateChanged = state.routeTurn(chat, 't1', guidance());
		// A send without a turn id is another turn too.
		state.enterTurn(chat, 't3');
		state.routeTurn(chat, 't3', guidance());
		state.enterTurn(chat, undefined);
		assert.deepStrictEqual({ duringT1, duringT2, lateChanged, afterLate: state.guidanceFor(chat), withoutTurnId: state.guidanceFor(chat) }, { duringT1: 'feature', duringT2: undefined, lateChanged: false, afterLate: undefined, withoutTurnId: undefined });
	});

	test('re-entering the same turn keeps its guidance object, and so does equal guidance', () => {
		const state = new CopilotModelRouterGuidance();
		const first = guidance();
		state.enterTurn(chat, 't1');
		state.routeTurn(chat, 't1', first);
		// Routing, preparing and sending all enter the same turn; a retry routes it again to equal guidance.
		state.enterTurn(chat, 't1');
		state.routeTurn(chat, 't1', guidance());
		const sameObject = state.guidanceFor(chat) === first;
		const other = guidance('other');
		state.routeTurn(chat, 't1', other);
		const replaced = state.guidanceFor(chat) === other;
		// A retry that is not routed sends without guidance.
		state.leaveTurnUnrouted(chat, 't1');
		assert.deepStrictEqual({ sameObject, replaced, cleared: state.guidanceFor(chat) }, { sameObject: true, replaced: true, cleared: undefined });
	});

	test('commits the guidance the working session was launched with, not what the current turn staged', () => {
		const state = new CopilotModelRouterGuidance();
		const launched = guidance();
		// A session is launched with t1's guidance. t1 is cancelled, t2 is routed elsewhere, and then
		// the session starts work on its own before t2 replaces it.
		state.enterTurn(chat, 't1');
		state.routeTurn(chat, 't1', launched);
		state.enterTurn(chat, 't2');
		const other = guidance('other');
		state.routeTurn(chat, 't2', other);
		state.commit(chat, launched);
		const stagedForT2 = state.guidanceFor(chat) === other;
		state.enterTurn(chat, 't3');
		assert.deepStrictEqual({ stagedForT2, committed: state.guidanceFor(chat) === launched }, { stagedForT2: true, committed: true });
	});

	test('forgets a chat that is gone, and keeps chats apart', () => {
		const state = new CopilotModelRouterGuidance();
		const other = 'chat:2';
		for (const key of [chat, other]) {
			state.enterTurn(key, 't1');
			state.routeTurn(key, 't1', guidance(key));
			state.commit(key, state.guidanceFor(key));
		}
		state.forget(chat);
		// The forgotten chat's turn is gone too, so its routing changes nothing.
		assert.deepStrictEqual({ gone: state.guidanceFor(chat), lateChanged: state.routeTurn(chat, 't1', guidance()), other: state.guidanceFor(other)?.route }, { gone: undefined, lateChanged: false, other });
	});
});
