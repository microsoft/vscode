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
		const taken = state.setCandidate(chat, 't1', g);
		const launched = state.guidanceFor(chat);
		state.commit(chat, launched);
		assert.deepStrictEqual({
			taken,
			launchedWithCandidate: launched === g,
			fresh: state.isFresh(chat),
			committed: state.guidanceFor(chat) === g,
			// Later routing, to any route, changes nothing.
			laterTaken: (state.enterTurn(chat, 't2'), state.setCandidate(chat, 't2', guidance('other'))),
			stillCommitted: state.guidanceFor(chat) === g,
		}, { taken: true, launchedWithCandidate: true, fresh: false, committed: true, laterTaken: false, stillCommitted: true });
	});

	test('a chat that is not fresh never takes guidance', () => {
		const state = new CopilotModelRouterGuidance();
		state.enterTurn(chat, 't1');
		assert.deepStrictEqual({ taken: state.setCandidate(chat, 't1', guidance()), guidance: state.guidanceFor(chat) }, { taken: false, guidance: undefined });
	});

	test('one turn\'s guidance never reaches another turn', () => {
		const state = new CopilotModelRouterGuidance();
		state.markFresh(chat);
		// t1 is routed, then cancelled before it is sent. t2 is sent on a hand-picked model, so it is never routed.
		state.enterTurn(chat, 't1');
		state.setCandidate(chat, 't1', guidance());
		const duringT1 = state.guidanceFor(chat)?.route;
		state.enterTurn(chat, 't2');
		const duringT2 = state.guidanceFor(chat);
		// t1's routing call finishes late: it is no longer the chat's turn.
		const lateTaken = state.setCandidate(chat, 't1', guidance());
		// A send without a turn id is another turn too.
		state.enterTurn(chat, 't3');
		state.setCandidate(chat, 't3', guidance());
		state.enterTurn(chat, undefined);
		assert.deepStrictEqual({ duringT1, duringT2, lateTaken, afterLate: state.guidanceFor(chat), withoutTurnId: state.guidanceFor(chat) }, { duringT1: 'feature', duringT2: undefined, lateTaken: false, afterLate: undefined, withoutTurnId: undefined });
	});

	test('re-entering the same turn keeps its guidance object, and so does equal guidance', () => {
		const state = new CopilotModelRouterGuidance();
		const first = guidance();
		state.markFresh(chat);
		state.enterTurn(chat, 't1');
		state.setCandidate(chat, 't1', first);
		// Routing, preparing and sending all enter the same turn; a retry routes it again to equal guidance.
		state.enterTurn(chat, 't1');
		state.setCandidate(chat, 't1', guidance());
		const sameObject = state.guidanceFor(chat) === first;
		const other = guidance('other');
		state.setCandidate(chat, 't1', other);
		const replaced = state.guidanceFor(chat) === other;
		// A route without guidance has none at all.
		state.setCandidate(chat, 't1', undefined);
		assert.deepStrictEqual({ sameObject, replaced, cleared: state.guidanceFor(chat) }, { sameObject: true, replaced: true, cleared: undefined });
	});

	test('commits the guidance the working session was launched with, not the current candidate', () => {
		const state = new CopilotModelRouterGuidance();
		const launched = guidance();
		state.markFresh(chat);
		// A session is launched with t1's guidance. t1 is cancelled, t2 clears the candidate, and then
		// the session starts work on its own before t2 replaces it.
		state.enterTurn(chat, 't1');
		state.setCandidate(chat, 't1', launched);
		state.enterTurn(chat, 't2');
		state.commit(chat, launched);
		// A second report, such as a resumed session's, changes nothing.
		state.commit(chat, undefined);
		assert.deepStrictEqual({ committed: state.guidanceFor(chat) === launched, fresh: state.isFresh(chat) }, { committed: true, fresh: false });
	});

	test('committing no guidance is final too', () => {
		const state = new CopilotModelRouterGuidance();
		state.markFresh(chat);
		state.enterTurn(chat, 't1');
		state.commit(chat, undefined);
		state.enterTurn(chat, 't2');
		assert.deepStrictEqual({ fresh: state.isFresh(chat), taken: state.setCandidate(chat, 't2', guidance()), guidance: state.guidanceFor(chat) }, { fresh: false, taken: false, guidance: undefined });
	});

	test('a routing result that arrives after the commit changes nothing', () => {
		const state = new CopilotModelRouterGuidance();
		const launched = guidance();
		state.markFresh(chat);
		state.enterTurn(chat, 't1');
		state.setCandidate(chat, 't1', launched);
		state.commit(chat, launched);
		assert.deepStrictEqual({ taken: state.setCandidate(chat, 't1', guidance('other')), committed: state.guidanceFor(chat) === launched }, { taken: false, committed: true });
	});

	test('forgets a chat that is gone, and keeps chats apart', () => {
		const state = new CopilotModelRouterGuidance();
		const other = 'chat:2';
		for (const key of [chat, other]) {
			state.markFresh(key);
			state.enterTurn(key, 't1');
			state.setCandidate(key, 't1', guidance(key));
			state.commit(key, state.guidanceFor(key));
		}
		state.forget(chat);
		assert.deepStrictEqual({ gone: state.guidanceFor(chat), fresh: state.isFresh(chat), other: state.guidanceFor(other)?.route }, { gone: undefined, fresh: false, other });
	});
});
