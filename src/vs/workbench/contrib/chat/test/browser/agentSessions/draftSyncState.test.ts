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
	if (state.remoteModel && !isInConversationModelChoice(reason)) {
		next = { ...next, model: state.remoteModel as ModelSelection };
	}
	return { published: state.shouldPublish(next), model: next.model?.id };
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
});
