/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { MessageKind, type Message, type ModelSelection } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ModelSelectionReason, isInConversationModelChoice } from '../../../common/modelSelection.js';
import { DraftSyncState } from '../../../browser/agentSessions/agentHost/agentHostSessionHandler.js';

function draft(text: string, modelId?: string): Message {
	return {
		text,
		origin: { kind: MessageKind.User },
		...(modelId ? { model: { id: modelId } } : {}),
	} as Message;
}

/** Mirrors how `_installDraftSync` builds and sends a draft. */
function publish(state: DraftSyncState, outgoing: Message, reason: ModelSelectionReason): { published: boolean; model: string | undefined } {
	let next: Message = outgoing;
	const chosen = isInConversationModelChoice(reason);
	if (state.remoteModel && !chosen) {
		next = { ...next, model: state.remoteModel as ModelSelection };
	}
	return { published: state.shouldPublish(next, chosen), model: next.model?.id };
}

const CHOSE = ModelSelectionReason.UserSelection;
const FELL_BACK = ModelSelectionReason.FirstAvailable;

suite('DraftSyncState', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('a window that cannot show the session model never overwrites it', () => {
		// This window can't show the other client's model, so its picker shows Auto.
		const state = new DraftSyncState(draft('', 'gpt-5.6-sol'));

		const actual = {
			// The fallback appearing must not reach the channel at all.
			fallbackAppears: publish(state, draft('', 'auto'), FELL_BACK),
			// Typing must sync the text while leaving the model alone.
			userTypes: publish(state, draft('hello', 'auto'), FELL_BACK),
			// A deliberate pick in this window is a real choice and must stick.
			userPicksModel: publish(state, draft('hello', 'claude-sonnet-5'), CHOSE),
		};

		assert.deepStrictEqual(actual, {
			fallbackAppears: { published: false, model: 'gpt-5.6-sol' },
			userTypes: { published: true, model: 'gpt-5.6-sol' },
			userPicksModel: { published: true, model: 'claude-sonnet-5' },
		});
	});

	test('tracks the channel draft across remote updates', () => {
		const state = new DraftSyncState(undefined);

		const actual = {
			// Nothing on the channel yet, so a local draft is published as-is.
			firstLocal: publish(state, draft('typed', 'auto'), FELL_BACK),
			// A remote draft arrives and becomes the model to preserve.
			afterApplyRemote: (state.applyRemote(draft('shared', 'gpt-5.6-sol')), state.remoteModel?.id),
			// Re-publishing an identical draft is skipped.
			echo: publish(state, draft('shared', 'gpt-5.6-sol'), FELL_BACK),
		};

		assert.deepStrictEqual(actual, {
			firstLocal: { published: true, model: 'auto' },
			afterApplyRemote: 'gpt-5.6-sol',
			echo: { published: false, model: 'gpt-5.6-sol' },
		});
	});

	test('a window that publishes its own draft still guards the model it put there', () => {
		// A window never sees its own draft echo back, so inbound-only tracking left this guard dead
		// here: the fallback overwrote the user's model and peers adopted it.
		const state = new DraftSyncState(undefined);

		const actual = {
			// A stand-in published first must not pin the channel, or no later model could replace it.
			standIn: publish(state, draft('', 'auto'), FELL_BACK),
			pinnedByStandIn: state.remoteModel?.id,
			// The user picks a model and types; this window establishes the channel's model.
			userPicks: publish(state, draft('working on it', 'gpt-5.6-terra'), CHOSE),
			// A catalog wave drops that model and the picker falls back.
			afterFallback: publish(state, draft('working on it', 'byok-opus-5'), FELL_BACK),
			channelModel: state.remoteModel?.id,
		};

		assert.deepStrictEqual(actual, {
			standIn: { published: true, model: 'auto' },
			pinnedByStandIn: undefined,
			userPicks: { published: true, model: 'gpt-5.6-terra' },
			afterFallback: { published: false, model: 'gpt-5.6-terra' },
			channelModel: 'gpt-5.6-terra',
		});
	});
});
