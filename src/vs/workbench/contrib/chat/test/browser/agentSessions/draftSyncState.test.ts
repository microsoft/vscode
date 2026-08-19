/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { MessageKind, type Message } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { DraftSyncState } from '../../../browser/agentSessions/agentHost/agentHostSessionHandler.js';

function draft(text: string, modelId?: string, config?: Record<string, unknown>): Message {
	return {
		text,
		origin: { kind: MessageKind.User },
		...(modelId ? { model: { id: modelId, ...(config ? { config } : {}) } } : {}),
	} as Message;
}

const solConfig = { thinkingLevel: 'medium', contextSize: 272000 };

/** A pool that resolves everything except the model the other client selected. */
const poolWithoutSol = (d: Message) => d.model?.id !== 'gpt-5.6-sol';
const poolWithEverything = () => true;

suite('DraftSyncState', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('withholds the fallback shown for a model this client cannot resolve', () => {
		// The draft the authoring client put on the channel, and which this
		// input's chat model was hydrated from. Its model is not in this pool.
		const remote = draft('', 'gpt-5.6-sol', solConfig);
		const state = new DraftSyncState(remote, poolWithoutSol);

		const actual = {
			// An echo of the hydrated draft never goes back out.
			echo: state.next(remote),
			// Unable to resolve the model, this window's picker falls back to its
			// default under the same (empty) user content. Publishing that would
			// overwrite the authoring client's selection.
			substitution: state.next(draft('', 'auto', solConfig)),
			// Typing is a real edit and must reach the channel.
			userTyped: state.next(draft('can you', 'auto')),
			// Having published, this input owns the draft outright.
			modelChangeAfterPublish: state.next(draft('can you', 'claude-sonnet-5')),
		};

		assert.deepStrictEqual(actual, {
			echo: 'skip',
			substitution: 'adopt',
			userTyped: 'publish',
			modelChangeAfterPublish: 'publish',
		});
	});

	test('publishes a deliberate model change when the hydrated model resolved', () => {
		// Sessions with history hydrate from a synthesized empty-text draft
		// carrying the last turn's model, so the guard is armed on essentially
		// every resumed session. It must not swallow real picks: when the model
		// resolved locally there was no substitution to hide.
		const remote = draft('', 'gpt-5.6-sol', solConfig);
		const state = new DraftSyncState(remote, poolWithEverything);

		const actual = {
			switchedModel: state.next(draft('', 'claude-sonnet-5')),
			switchedAgain: state.next(draft('', 'gpt-5.4')),
		};

		assert.deepStrictEqual(actual, {
			switchedModel: 'publish',
			switchedAgain: 'publish',
		});
	});

	test('applyRemote re-arms the guard for later remote drafts', () => {
		const state = new DraftSyncState(undefined, poolWithoutSol);
		const remote = draft('shared text', 'gpt-5.6-sol', solConfig);

		const actual = {
			// With nothing hydrated, the first local draft is a real edit.
			firstLocal: state.next(draft('typed', 'auto')),
			synced: state.synced?.text,
			// A remote draft arrives and is applied to the input.
			afterApplyRemote: (state.applyRemote(remote), state.synced?.text),
			// Resolving it against a pool without that model must not publish.
			substitution: state.next(draft('shared text', 'auto', solConfig)),
		};

		assert.deepStrictEqual(actual, {
			firstLocal: 'publish',
			synced: 'typed',
			afterApplyRemote: 'shared text',
			substitution: 'adopt',
		});
	});
});
