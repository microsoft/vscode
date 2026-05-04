/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { BackgroundTodoDeltaTracker } from '../backgroundTodoDelta';
import { IBuildPromptContext, IToolCallRound } from '../../../../prompt/common/intents';
import { URI } from '../../../../../util/vs/base/common/uri';

function makeRound(id: string): IToolCallRound {
	return {
		id,
		response: `response for ${id}`,
		toolInputRetry: 0,
		toolCalls: [{ name: 'read_file', arguments: '{}', id: `tc-${id}` }],
	};
}

function makePromptContext(opts: {
	query?: string;
	toolCallRounds?: IToolCallRound[];
	historyRounds?: IToolCallRound[][];
	sessionResource?: URI;
}): IBuildPromptContext {
	return {
		query: opts.query ?? 'fix the bug',
		history: (opts.historyRounds ?? []).map(rounds => ({
			rounds,
			request: { message: 'old request' },
		})) as any,
		chatVariables: { hasVariables: () => false } as any,
		toolCallRounds: opts.toolCallRounds,
		request: opts.sessionResource ? { sessionResource: opts.sessionResource } as any : undefined,
	};
}

describe('BackgroundTodoDeltaTracker', () => {
	test('first invocation with no rounds returns delta with user request', () => {
		const tracker = new BackgroundTodoDeltaTracker();
		const ctx = makePromptContext({ query: 'add auth' });
		const delta = tracker.getDelta(ctx);
		expect(delta).toBeDefined();
		expect(delta!.userRequest).toBe('add auth');
		expect(delta!.newRounds).toHaveLength(0);
	});

	test('first invocation with rounds returns all rounds', () => {
		const tracker = new BackgroundTodoDeltaTracker();
		const r1 = makeRound('r1');
		const r2 = makeRound('r2');
		const ctx = makePromptContext({ toolCallRounds: [r1, r2] });
		const delta = tracker.getDelta(ctx);
		expect(delta).toBeDefined();
		expect(delta!.newRounds).toHaveLength(2);
	});

	test('marking processed prevents re-processing', () => {
		const tracker = new BackgroundTodoDeltaTracker();
		const r1 = makeRound('r1');
		const ctx = makePromptContext({ toolCallRounds: [r1] });

		const delta = tracker.getDelta(ctx)!;
		tracker.markProcessed(delta);

		const delta2 = tracker.getDelta(ctx);
		expect(delta2).toBeUndefined();
	});

	test('new rounds after marking previous ones are returned', () => {
		const tracker = new BackgroundTodoDeltaTracker();
		const r1 = makeRound('r1');
		const ctx1 = makePromptContext({ toolCallRounds: [r1] });

		const delta1 = tracker.getDelta(ctx1)!;
		tracker.markProcessed(delta1);

		const r2 = makeRound('r2');
		const ctx2 = makePromptContext({ toolCallRounds: [r1, r2] });
		const delta2 = tracker.getDelta(ctx2);
		expect(delta2).toBeDefined();
		expect(delta2!.newRounds).toHaveLength(1);
		expect(delta2!.newRounds[0].id).toBe('r2');
	});

	test('picks up rounds from history turns', () => {
		const tracker = new BackgroundTodoDeltaTracker();
		const r1 = makeRound('hist-r1');
		const ctx = makePromptContext({ historyRounds: [[r1]] });
		const delta = tracker.getDelta(ctx);
		expect(delta).toBeDefined();
		expect(delta!.newRounds).toHaveLength(1);
		expect(delta!.newRounds[0].id).toBe('hist-r1');
	});

	test('processes history before current rounds and de-dupes round ids', () => {
		const tracker = new BackgroundTodoDeltaTracker();
		const h1 = makeRound('hist-r1');
		const sharedHistory = makeRound('shared');
		const sharedCurrent = makeRound('shared');
		const c1 = makeRound('current-r1');
		const ctx = makePromptContext({ historyRounds: [[h1, sharedHistory]], toolCallRounds: [sharedCurrent, c1] });
		const delta = tracker.getDelta(ctx);
		expect(delta!.newRounds.map(round => round.id)).toEqual(['hist-r1', 'shared', 'current-r1']);
	});

	test('keeps sessionResource as Uri', () => {
		const tracker = new BackgroundTodoDeltaTracker();
		const sessionResource = URI.parse('test://session/background-todo');
		const ctx = makePromptContext({ sessionResource });
		const delta = tracker.getDelta(ctx);
		expect(delta!.sessionResource).toBe(sessionResource);
	});

	test('markRoundsProcessed advances cursor', () => {
		const tracker = new BackgroundTodoDeltaTracker();
		tracker.markRoundsProcessed(['r1', 'r2']);

		const r1 = makeRound('r1');
		const r2 = makeRound('r2');
		const r3 = makeRound('r3');
		const ctx = makePromptContext({ toolCallRounds: [r1, r2, r3] });
		const delta = tracker.getDelta(ctx);
		expect(delta).toBeDefined();
		expect(delta!.newRounds).toHaveLength(1);
		expect(delta!.newRounds[0].id).toBe('r3');
	});

	test('reset clears the processed set', () => {
		const tracker = new BackgroundTodoDeltaTracker();
		const r1 = makeRound('r1');
		const ctx = makePromptContext({ toolCallRounds: [r1] });

		tracker.markProcessed(tracker.getDelta(ctx)!);
		expect(tracker.getDelta(ctx)).toBeUndefined();

		tracker.reset();
		const delta = tracker.getDelta(ctx);
		expect(delta).toBeDefined();
		expect(delta!.newRounds).toHaveLength(1);
	});

	// ── Metadata tests ──────────────────────────────────────────

	test('metadata.isInitialDelta is true on first peek', () => {
		const tracker = new BackgroundTodoDeltaTracker();
		const ctx = makePromptContext({ query: 'plan this' });
		const delta = tracker.peekDelta(ctx)!;
		expect(delta.metadata.isInitialDelta).toBe(true);
		expect(delta.metadata.isRequestOnly).toBe(true);
		expect(delta.metadata.newRoundCount).toBe(0);
		expect(delta.metadata.newToolCallCount).toBe(0);
	});

	test('metadata.isInitialDelta is false after commit', () => {
		const tracker = new BackgroundTodoDeltaTracker();
		const ctx = makePromptContext({ toolCallRounds: [makeRound('r1')] });
		const delta1 = tracker.peekDelta(ctx)!;
		expect(delta1.metadata.isInitialDelta).toBe(true);
		tracker.markProcessed(delta1);

		const r2 = makeRound('r2');
		const ctx2 = makePromptContext({ toolCallRounds: [makeRound('r1'), r2] });
		const delta2 = tracker.peekDelta(ctx2)!;
		expect(delta2.metadata.isInitialDelta).toBe(false);
	});

	test('metadata counts rounds and tool calls', () => {
		const tracker = new BackgroundTodoDeltaTracker();
		const r1 = makeRound('r1'); // has 1 tool call
		const r2: IToolCallRound = {
			id: 'r2', response: '', toolInputRetry: 0,
			toolCalls: [
				{ name: 'read_file', arguments: '{}', id: 'tc-r2a' },
				{ name: 'edit_file', arguments: '{}', id: 'tc-r2b' },
			],
		};
		const ctx = makePromptContext({ toolCallRounds: [r1, r2] });
		const delta = tracker.peekDelta(ctx)!;
		expect(delta.metadata.newRoundCount).toBe(2);
		expect(delta.metadata.newToolCallCount).toBe(3);
		expect(delta.metadata.isRequestOnly).toBe(false);
	});

	// ── Peek / commit semantics ─────────────────────────────────

	test('peekDelta does not advance cursor', () => {
		const tracker = new BackgroundTodoDeltaTracker();
		const r1 = makeRound('r1');
		const ctx = makePromptContext({ toolCallRounds: [r1] });

		const first = tracker.peekDelta(ctx);
		const second = tracker.peekDelta(ctx);
		expect(first).toBeDefined();
		expect(second).toBeDefined();
		expect(second!.newRounds).toHaveLength(1);
	});

	test('markProcessed after peekDelta commits the cursor', () => {
		const tracker = new BackgroundTodoDeltaTracker();
		const r1 = makeRound('r1');
		const ctx = makePromptContext({ toolCallRounds: [r1] });

		const delta = tracker.peekDelta(ctx)!;
		tracker.markProcessed(delta);
		expect(tracker.peekDelta(ctx)).toBeUndefined();
	});
});
