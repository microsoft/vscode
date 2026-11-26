/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { modelRouterGuidanceNote, type IModelRouterGuidance } from '../../common/modelRouterGuidance.js';
import { CopilotModelRouterGuidance } from '../../node/copilot/copilotModelRouterGuidance.js';

function guidance(route = 'feature', text = 'Plan first.'): IModelRouterGuidance {
	return { router: 'Workday', route, guidance: text };
}

const chat = 'chat:1';

suite('CopilotModelRouterGuidance', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	interface ITurnOptions {
		/** Whether the chat has turns before this one. */
		readonly hasEarlierTurns?: boolean;
		/** Whether the turn's message reaches the agent. A turn stopped first, or a command that submits no prompt, does not. */
		readonly reachesAgent?: boolean;
		readonly chat?: string;
	}

	/** Routes and sends a turn. Returns the route its note names: `none` for a note that ends earlier guidance. */
	function turn(state: CopilotModelRouterGuidance, turnId: string, routed: IModelRouterGuidance | 'noGuidance' | 'unrouted', options: ITurnOptions = {}): string | undefined {
		const key = options.chat ?? chat;
		if (routed !== 'unrouted') {
			state.enterTurn(key, turnId);
			state.routeTurn(key, turnId, routed === 'noGuidance' ? undefined : routed, options.hasEarlierTurns ?? turnId !== 't1');
		}
		const note = state.noteFor(key, turnId);
		if (options.reachesAgent ?? true) {
			state.noteDelivered(key);
		}
		return note && (/chose its "(?<route>.*)" route/.exec(note)?.groups?.route ?? 'none');
	}

	test('tells a chat its route\'s guidance once, and again when a routed turn brings other guidance', () => {
		const state = new CopilotModelRouterGuidance();
		assert.deepStrictEqual({
			first: turn(state, 't1', guidance()),
			// The same route again, as on every later turn of a chat that stays on it.
			sameRoute: turn(state, 't2', guidance()),
			otherRoute: turn(state, 't3', guidance('other')),
			// The user changed the route's guidance in the router file.
			edited: turn(state, 't4', guidance('other', 'Test first.')),
			// A turn on a model picked by hand is not routed, and the chat keeps what it was told.
			unrouted: turn(state, 't5', 'unrouted'),
			backOnRoute: turn(state, 't6', guidance('other', 'Test first.')),
			routeWithoutGuidance: turn(state, 't7', 'noGuidance'),
			stillWithout: turn(state, 't8', 'noGuidance'),
			withGuidanceAgain: turn(state, 't9', guidance()),
		}, {
			first: 'feature',
			sameRoute: undefined,
			otherRoute: 'other',
			edited: 'other',
			unrouted: undefined,
			backOnRoute: undefined,
			routeWithoutGuidance: 'none',
			stillWithout: undefined,
			withGuidanceAgain: 'feature',
		});
	});

	test('the note is the route\'s guidance, and a chat routed from its first turn gets none for a route without it', () => {
		const state = new CopilotModelRouterGuidance();
		const never = [turn(state, 't1', 'noGuidance'), turn(state, 't2', 'noGuidance')];
		// Its history holds no note, so a rewrite of it changes nothing.
		state.historyRewritten(chat);
		never.push(turn(state, 't3', 'noGuidance'));
		state.enterTurn(chat, 't4');
		state.routeTurn(chat, 't4', guidance(), true);
		assert.deepStrictEqual({ never, note: state.noteFor(chat, 't4') }, { never: [undefined, undefined, undefined], note: modelRouterGuidanceNote(guidance()) });
	});

	test('a note whose message is not seen to reach the agent is sent with the next routed turn, also one back on the guidance the chat was told', () => {
		const state = new CopilotModelRouterGuidance();
		const back = new CopilotModelRouterGuidance();
		turn(back, 't1', guidance());
		// The note for the other route may have reached the agent unseen.
		turn(back, 't2', guidance('other'), { reachesAgent: false });
		assert.deepStrictEqual({
			stopped: turn(state, 't1', guidance(), { reachesAgent: false }),
			// The next turn is sent on a model picked by hand: the stopped turn's note is not its own.
			unrouted: turn(state, 't2', 'unrouted'),
			withoutTurnId: state.noteFor(chat, undefined),
			nextRouted: turn(state, 't3', guidance()),
			then: turn(state, 't4', guidance()),
			backOnFirstRoute: turn(back, 't3', guidance()),
			backThen: turn(back, 't4', guidance()),
		}, { stopped: 'feature', unrouted: undefined, withoutTurnId: undefined, nextRouted: 'feature', then: undefined, backOnFirstRoute: 'feature', backThen: undefined });
	});

	test('a routing that finishes after a later turn entered does not replace that turn\'s', () => {
		const state = new CopilotModelRouterGuidance();
		// t1 is stopped while it is routed. t2 enters and is routed, and then t1's routing finishes.
		state.enterTurn(chat, 't1');
		state.enterTurn(chat, 't2');
		state.routeTurn(chat, 't2', guidance(), false);
		state.routeTurn(chat, 't1', guidance('other'), false);
		assert.deepStrictEqual({ stopped: state.noteFor(chat, 't1'), sent: state.noteFor(chat, 't2') }, { stopped: undefined, sent: modelRouterGuidanceNote(guidance()) });
	});

	test('a chat whose history can hold a note this host did not send is told again, also that there is no guidance', () => {
		// After a host restart, for a fork or an import: the chat already has turns, and what it was told is not known.
		const restored = new CopilotModelRouterGuidance();
		const rewritten = new CopilotModelRouterGuidance();
		turn(rewritten, 't1', guidance());
		turn(rewritten, 't2', 'noGuidance');
		// A rewind that removes t2's note brings t1's guidance back.
		rewritten.historyRewritten(chat);
		assert.deepStrictEqual({
			restoredWithGuidance: turn(new CopilotModelRouterGuidance(), 't9', guidance(), { hasEarlierTurns: true }),
			restoredWithout: turn(restored, 't9', 'noGuidance', { hasEarlierTurns: true }),
			restoredThen: turn(restored, 't10', 'noGuidance'),
			afterRewrite: turn(rewritten, 't3', 'noGuidance'),
			afterRewriteThen: turn(rewritten, 't4', 'noGuidance'),
		}, { restoredWithGuidance: 'feature', restoredWithout: 'none', restoredThen: undefined, afterRewrite: 'none', afterRewriteThen: undefined });
	});

	test('a chat that another process ran is told again, also when it was known to have no guidance', () => {
		const state = new CopilotModelRouterGuidance();
		turn(state, 't1', 'noGuidance');
		state.historyChangedElsewhere(chat);
		assert.deepStrictEqual({ after: turn(state, 't2', 'noGuidance'), then: turn(state, 't3', 'noGuidance') }, { after: 'none', then: undefined });
	});

	test('tells a chat its guidance again after its history was rewritten, also while the note was on its way', () => {
		const state = new CopilotModelRouterGuidance();
		turn(state, 't1', guidance());
		state.historyRewritten(chat);
		// A compaction between the note being handed out and its message reaching the agent can drop that message.
		const sending = new CopilotModelRouterGuidance();
		turn(sending, 't1', guidance(), { reachesAgent: false });
		sending.historyRewritten(chat);
		sending.noteDelivered(chat);
		assert.deepStrictEqual({
			afterRewrite: turn(state, 't2', guidance()),
			then: turn(state, 't3', guidance()),
			rewrittenWhileSending: turn(sending, 't2', guidance()),
			rewrittenWhileSendingThen: turn(sending, 't3', guidance()),
		}, { afterRewrite: 'feature', then: undefined, rewrittenWhileSending: 'feature', rewrittenWhileSendingThen: undefined });
	});

	test('forgets a chat that is gone, and keeps chats apart', () => {
		const state = new CopilotModelRouterGuidance();
		const other = 'chat:2';
		turn(state, 't1', guidance());
		turn(state, 't1', guidance(), { chat: other });
		state.forget(chat);
		assert.deepStrictEqual({
			goneTurn: state.noteFor(chat, 't1'),
			toldAgain: turn(state, 't2', guidance(), { hasEarlierTurns: false }),
			other: turn(state, 't2', guidance(), { chat: other }),
		}, { goneTurn: undefined, toldAgain: 'feature', other: undefined });
	});
});
