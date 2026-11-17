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

	test('a fresh chat takes the guidance of the turn it is on, and commits what its session launched with', () => {
		const state = new CopilotModelRouterGuidance();
		const g = guidance();
		state.markFresh(chat);
		state.enterTurn(chat, 't1');
		const changed = state.routeTurn(chat, 't1', g);
		const launched = state.guidanceFor(chat);
		state.commit(chat, launched);
		assert.deepStrictEqual({ changed, launchedWithCandidate: launched === g, committed: state.guidanceFor(chat) === g }, { changed: true, launchedWithCandidate: true, committed: true });
	});

	test('a chat that has started work takes the guidance of the route a later turn is routed to', () => {
		const state = new CopilotModelRouterGuidance();
		const first = guidance();
		const other = guidance('other');
		state.markFresh(chat);
		state.enterTurn(chat, 't1');
		state.routeTurn(chat, 't1', first);
		state.commit(chat, first);
		const turn = (turnId: string, route: () => unknown) => {
			state.enterTurn(chat, turnId);
			return { changed: route(), guidance: state.guidanceFor(chat) };
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
		}, {
			sameRoute: { changed: false, guidance: first },
			sameObject: true,
			otherRoute: { changed: true, guidance: other },
			unrouted: { changed: undefined, guidance: other },
			late: { changed: false, guidance: other },
			routeWithoutGuidance: { changed: true, guidance: undefined },
		});
	});

	test('a chat that started work without guidance takes it from its next routed turn', () => {
		const state = new CopilotModelRouterGuidance();
		// As after a host restart, or for a fork or an import: the chat is not fresh and has no guidance.
		state.enterTurn(chat, 't1');
		const restored = { changed: state.routeTurn(chat, 't1', guidance()), route: state.guidanceFor(chat)?.route };
		// A fresh chat whose first turn was sent on a hand-picked model.
		const other = 'chat:2';
		state.markFresh(other);
		state.enterTurn(other, 't1');
		state.commit(other, undefined);
		state.enterTurn(other, 't2');
		const routerPickedLater = { changed: state.routeTurn(other, 't2', guidance()), route: state.guidanceFor(other)?.route };
		assert.deepStrictEqual({ restored, routerPickedLater }, { restored: { changed: true, route: 'feature' }, routerPickedLater: { changed: true, route: 'feature' } });
	});

	test('one turn\'s guidance never reaches another turn of a fresh chat', () => {
		const state = new CopilotModelRouterGuidance();
		state.markFresh(chat);
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
		state.markFresh(chat);
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

	test('commits the guidance the working session was launched with, not the current candidate', () => {
		const state = new CopilotModelRouterGuidance();
		const launched = guidance();
		state.markFresh(chat);
		// A session is launched with t1's guidance. t1 is cancelled, t2 clears the candidate, and then
		// the session starts work on its own before t2 replaces it.
		state.enterTurn(chat, 't1');
		state.routeTurn(chat, 't1', launched);
		state.enterTurn(chat, 't2');
		state.commit(chat, launched);
		// A second report, such as a resumed session's, changes nothing.
		state.commit(chat, undefined);
		assert.deepStrictEqual({ committed: state.guidanceFor(chat) === launched }, { committed: true });
	});

	test('forgets a chat that is gone, and keeps chats apart', () => {
		const state = new CopilotModelRouterGuidance();
		const other = 'chat:2';
		for (const key of [chat, other]) {
			state.markFresh(key);
			state.enterTurn(key, 't1');
			state.routeTurn(key, 't1', guidance(key));
			state.commit(key, state.guidanceFor(key));
		}
		state.forget(chat);
		// The forgotten chat's turn is gone too, so its routing changes nothing.
		assert.deepStrictEqual({ gone: state.guidanceFor(chat), lateChanged: state.routeTurn(chat, 't1', guidance()), other: state.guidanceFor(other)?.route }, { gone: undefined, lateChanged: false, other });
	});
});
