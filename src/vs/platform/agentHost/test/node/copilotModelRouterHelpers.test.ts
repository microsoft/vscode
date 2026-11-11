/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IModelRouterHelperPlan } from '../../common/modelRouterHelpers.js';
import { CopilotModelRouterHelpers } from '../../node/copilot/copilotModelRouterHelpers.js';

function plan(playbook = 'feature'): IModelRouterHelperPlan {
	return { router: 'Workday', playbook, helpers: [{ name: 'reviewer', description: 'Reviews.', model: 'gpt' }] };
}

const chat = 'chat:1';

suite('CopilotModelRouterHelpers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('a fresh chat takes the plan of the turn it is on, and commits what its session launched with', () => {
		const helpers = new CopilotModelRouterHelpers();
		const p = plan();
		helpers.markFresh(chat);
		helpers.enterTurn(chat, 't1');
		const taken = helpers.setCandidate(chat, 't1', p);
		const launched = helpers.planFor(chat);
		helpers.commit(chat, launched);
		assert.deepStrictEqual({
			taken,
			launchedWithCandidate: launched === p,
			fresh: helpers.isFresh(chat),
			committed: helpers.planFor(chat) === p,
			// Later routing, to any playbook, changes nothing.
			laterTaken: (helpers.enterTurn(chat, 't2'), helpers.setCandidate(chat, 't2', plan('other'))),
			stillCommitted: helpers.planFor(chat) === p,
		}, { taken: true, launchedWithCandidate: true, fresh: false, committed: true, laterTaken: false, stillCommitted: true });
	});

	test('a chat that is not fresh never takes a plan', () => {
		const helpers = new CopilotModelRouterHelpers();
		helpers.enterTurn(chat, 't1');
		assert.deepStrictEqual({ taken: helpers.setCandidate(chat, 't1', plan()), plan: helpers.planFor(chat), committed: helpers.hasCommittedPlan(chat) }, { taken: false, plan: undefined, committed: false });
	});

	test('one turn\'s plan never reaches another turn', () => {
		const helpers = new CopilotModelRouterHelpers();
		helpers.markFresh(chat);
		// t1 is routed, then cancelled before it is sent. t2 is sent on a hand-picked model, so it is never routed.
		helpers.enterTurn(chat, 't1');
		helpers.setCandidate(chat, 't1', plan());
		const duringT1 = helpers.planFor(chat)?.playbook;
		helpers.enterTurn(chat, 't2');
		const duringT2 = helpers.planFor(chat);
		// t1's routing call finishes late: it is no longer the chat's turn.
		const lateTaken = helpers.setCandidate(chat, 't1', plan());
		// A send without a turn id is another turn too.
		helpers.enterTurn(chat, 't3');
		helpers.setCandidate(chat, 't3', plan());
		helpers.enterTurn(chat, undefined);
		assert.deepStrictEqual({ duringT1, duringT2, lateTaken, afterLate: helpers.planFor(chat), withoutTurnId: helpers.planFor(chat) }, { duringT1: 'feature', duringT2: undefined, lateTaken: false, afterLate: undefined, withoutTurnId: undefined });
	});

	test('re-entering the same turn keeps its plan object, and so does an equal plan', () => {
		const helpers = new CopilotModelRouterHelpers();
		const first = plan();
		helpers.markFresh(chat);
		helpers.enterTurn(chat, 't1');
		helpers.setCandidate(chat, 't1', first);
		// Routing, preparing and sending all enter the same turn; a retry routes it again to an equal plan.
		helpers.enterTurn(chat, 't1');
		helpers.setCandidate(chat, 't1', plan());
		const sameObject = helpers.planFor(chat) === first;
		const other = plan('other');
		helpers.setCandidate(chat, 't1', other);
		const replaced = helpers.planFor(chat) === other;
		// A playbook that brings nothing has no plan at all.
		helpers.setCandidate(chat, 't1', undefined);
		assert.deepStrictEqual({ sameObject, replaced, cleared: helpers.planFor(chat) }, { sameObject: true, replaced: true, cleared: undefined });
	});

	test('commits the plan the working session was launched with, not the current candidate', () => {
		const helpers = new CopilotModelRouterHelpers();
		const launched = plan();
		helpers.markFresh(chat);
		// A session is launched with t1's plan. t1 is cancelled, t2 clears the candidate, and then
		// the session starts work on its own before t2 replaces it.
		helpers.enterTurn(chat, 't1');
		helpers.setCandidate(chat, 't1', launched);
		helpers.enterTurn(chat, 't2');
		helpers.commit(chat, launched);
		// A second report, such as a resumed session's, changes nothing.
		helpers.commit(chat, undefined);
		assert.deepStrictEqual({ committed: helpers.planFor(chat) === launched, has: helpers.hasCommittedPlan(chat) }, { committed: true, has: true });
	});

	test('committing no helpers is final too', () => {
		const helpers = new CopilotModelRouterHelpers();
		helpers.markFresh(chat);
		helpers.enterTurn(chat, 't1');
		helpers.commit(chat, undefined);
		helpers.enterTurn(chat, 't2');
		assert.deepStrictEqual({ fresh: helpers.isFresh(chat), taken: helpers.setCandidate(chat, 't2', plan()), plan: helpers.planFor(chat), has: helpers.hasCommittedPlan(chat) }, { fresh: false, taken: false, plan: undefined, has: false });
	});

	test('a routing result that arrives after the commit changes nothing', () => {
		const helpers = new CopilotModelRouterHelpers();
		const launched = plan();
		helpers.markFresh(chat);
		helpers.enterTurn(chat, 't1');
		helpers.setCandidate(chat, 't1', launched);
		helpers.commit(chat, launched);
		assert.deepStrictEqual({ taken: helpers.setCandidate(chat, 't1', plan('other')), committed: helpers.planFor(chat) === launched }, { taken: false, committed: true });
	});

	test('forgets a chat that is gone, and keeps chats apart', () => {
		const helpers = new CopilotModelRouterHelpers();
		const other = 'chat:2';
		for (const key of [chat, other]) {
			helpers.markFresh(key);
			helpers.enterTurn(key, 't1');
			helpers.setCandidate(key, 't1', plan(key));
			helpers.commit(key, helpers.planFor(key));
		}
		helpers.forget(chat);
		assert.deepStrictEqual({ gone: helpers.planFor(chat), fresh: helpers.isFresh(chat), other: helpers.planFor(other)?.playbook }, { gone: undefined, fresh: false, other });
	});
});
