/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IModelRouterAgentPlan } from '../../common/modelRouterAgents.js';
import { CopilotModelRouterAgents } from '../../node/copilot/copilotModelRouterAgents.js';

function plan(playbook = 'feature'): IModelRouterAgentPlan {
	return { router: 'Workday', playbook, agents: [{ name: 'reviewer', description: 'Reviews.', model: 'gpt' }] };
}

const chat = 'chat:1';

suite('CopilotModelRouterAgents', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('a fresh chat takes the plan of the turn it is on, and commits what its session launched with', () => {
		const agents = new CopilotModelRouterAgents();
		const p = plan();
		agents.markFresh(chat);
		agents.enterTurn(chat, 't1');
		const taken = agents.setCandidate(chat, 't1', p);
		const launched = agents.planFor(chat);
		agents.commit(chat, launched);
		assert.deepStrictEqual({
			taken,
			launchedWithCandidate: launched === p,
			fresh: agents.isFresh(chat),
			committed: agents.planFor(chat) === p,
			// Later routing, to any playbook, changes nothing.
			laterTaken: (agents.enterTurn(chat, 't2'), agents.setCandidate(chat, 't2', plan('other'))),
			stillCommitted: agents.planFor(chat) === p,
		}, { taken: true, launchedWithCandidate: true, fresh: false, committed: true, laterTaken: false, stillCommitted: true });
	});

	test('a chat that is not fresh never takes a plan', () => {
		const agents = new CopilotModelRouterAgents();
		agents.enterTurn(chat, 't1');
		assert.deepStrictEqual({ taken: agents.setCandidate(chat, 't1', plan()), plan: agents.planFor(chat) }, { taken: false, plan: undefined });
	});

	test('one turn\'s plan never reaches another turn', () => {
		const agents = new CopilotModelRouterAgents();
		agents.markFresh(chat);
		// t1 is routed, then cancelled before it is sent. t2 is sent on a hand-picked model, so it is never routed.
		agents.enterTurn(chat, 't1');
		agents.setCandidate(chat, 't1', plan());
		const duringT1 = agents.planFor(chat)?.playbook;
		agents.enterTurn(chat, 't2');
		const duringT2 = agents.planFor(chat);
		// t1's routing call finishes late: it is no longer the chat's turn.
		const lateTaken = agents.setCandidate(chat, 't1', plan());
		// A send without a turn id is another turn too.
		agents.enterTurn(chat, 't3');
		agents.setCandidate(chat, 't3', plan());
		agents.enterTurn(chat, undefined);
		assert.deepStrictEqual({ duringT1, duringT2, lateTaken, afterLate: agents.planFor(chat), withoutTurnId: agents.planFor(chat) }, { duringT1: 'feature', duringT2: undefined, lateTaken: false, afterLate: undefined, withoutTurnId: undefined });
	});

	test('re-entering the same turn keeps its plan object, and so does an equal plan', () => {
		const agents = new CopilotModelRouterAgents();
		const first = plan();
		agents.markFresh(chat);
		agents.enterTurn(chat, 't1');
		agents.setCandidate(chat, 't1', first);
		// Routing, preparing and sending all enter the same turn; a retry routes it again to an equal plan.
		agents.enterTurn(chat, 't1');
		agents.setCandidate(chat, 't1', plan());
		const sameObject = agents.planFor(chat) === first;
		const other = plan('other');
		agents.setCandidate(chat, 't1', other);
		const replaced = agents.planFor(chat) === other;
		// A playbook that brings nothing has no plan at all.
		agents.setCandidate(chat, 't1', undefined);
		assert.deepStrictEqual({ sameObject, replaced, cleared: agents.planFor(chat) }, { sameObject: true, replaced: true, cleared: undefined });
	});

	test('commits the plan the working session was launched with, not the current candidate', () => {
		const agents = new CopilotModelRouterAgents();
		const launched = plan();
		agents.markFresh(chat);
		// A session is launched with t1's plan. t1 is cancelled, t2 clears the candidate, and then
		// the session starts work on its own before t2 replaces it.
		agents.enterTurn(chat, 't1');
		agents.setCandidate(chat, 't1', launched);
		agents.enterTurn(chat, 't2');
		agents.commit(chat, launched);
		// A second report, such as a resumed session's, changes nothing.
		agents.commit(chat, undefined);
		assert.deepStrictEqual({ committed: agents.planFor(chat) === launched, fresh: agents.isFresh(chat) }, { committed: true, fresh: false });
	});

	test('committing no plan is final too', () => {
		const agents = new CopilotModelRouterAgents();
		agents.markFresh(chat);
		agents.enterTurn(chat, 't1');
		agents.commit(chat, undefined);
		agents.enterTurn(chat, 't2');
		assert.deepStrictEqual({ fresh: agents.isFresh(chat), taken: agents.setCandidate(chat, 't2', plan()), plan: agents.planFor(chat) }, { fresh: false, taken: false, plan: undefined });
	});

	test('a routing result that arrives after the commit changes nothing', () => {
		const agents = new CopilotModelRouterAgents();
		const launched = plan();
		agents.markFresh(chat);
		agents.enterTurn(chat, 't1');
		agents.setCandidate(chat, 't1', launched);
		agents.commit(chat, launched);
		assert.deepStrictEqual({ taken: agents.setCandidate(chat, 't1', plan('other')), committed: agents.planFor(chat) === launched }, { taken: false, committed: true });
	});

	test('forgets a chat that is gone, and keeps chats apart', () => {
		const agents = new CopilotModelRouterAgents();
		const other = 'chat:2';
		for (const key of [chat, other]) {
			agents.markFresh(key);
			agents.enterTurn(key, 't1');
			agents.setCandidate(key, 't1', plan(key));
			agents.commit(key, agents.planFor(key));
		}
		agents.forget(chat);
		assert.deepStrictEqual({ gone: agents.planFor(chat), fresh: agents.isFresh(chat), other: agents.planFor(other)?.playbook }, { gone: undefined, fresh: false, other });
	});
});
