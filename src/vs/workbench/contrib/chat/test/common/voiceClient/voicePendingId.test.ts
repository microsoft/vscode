/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IChatToolInvocation } from '../../../common/chatService/chatService.js';
import { derivePendingId, peekPendingId } from '../../../common/voiceClient/voiceClientService.js';

suite('derivePendingId', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	// This id is the only thing routing a spoken answer back to the form that
	// asked. The controller mints it when it describes a pending request and the
	// dispatch service looks it up again to find that request, so these
	// properties are what stop an answer from landing on the wrong part -- or,
	// if the two ever disagreed, from landing anywhere at all.

	const part = (kind: string): object => ({ kind });

	test('is stable for the same request and part', () => {
		const carousel = part('questionCarousel');
		assert.strictEqual(derivePendingId('req-1', carousel), derivePendingId('req-1', carousel));
	});

	test('distinguishes two pending parts in one response', () => {
		assert.notStrictEqual(
			derivePendingId('req-1', part('questionCarousel')),
			derivePendingId('req-1', part('questionCarousel')),
		);
	});

	test('distinguishes the same part in different requests', () => {
		const carousel = part('questionCarousel');
		assert.notStrictEqual(derivePendingId('req-1', carousel), derivePendingId('req-2', carousel));
	});

	test('does not reuse an id when a part is replaced at the same position', () => {
		// `Response.clearToPreviousToolInvocation` splices the part list, so a
		// retry can seat a new part where an already-published one used to be.
		// Under the previous index-based scheme both got `req#5`, which let a
		// draft written for the first form be submitted against the second.
		const parts = [part('markdown'), part('questionCarousel')];
		const first = derivePendingId('req-1', parts[1]);
		parts.splice(1, 1, part('questionCarousel'));
		assert.notStrictEqual(derivePendingId('req-1', parts[1]), first);
	});

	test('peek does not match a part that was never published as pending', () => {
		assert.strictEqual(peekPendingId('req-1', part('markdown')), undefined);
	});

	test('peek resolves a part that was published', () => {
		const carousel = part('questionCarousel');
		const minted = derivePendingId('req-1', carousel);
		assert.strictEqual(peekPendingId('req-1', carousel), minted);
	});

	test('distinguishes re-armed approvals on the same tool part', () => {
		const firstConfirm = () => { };
		const state = observableValue<IChatToolInvocation.State>('toolState', {
			type: IChatToolInvocation.StateKind.WaitingForConfirmation,
			parameters: {},
			confirm: firstConfirm,
		});
		const tool = { kind: 'toolInvocation', state };
		const first = derivePendingId('req-1', tool);

		// A presentation update clones the state but retains its callback, so it
		// is still the same actionable occurrence.
		state.set({
			type: IChatToolInvocation.StateKind.WaitingForConfirmation,
			parameters: {},
			confirmationMessages: { title: 'Updated title' },
			confirm: firstConfirm,
		}, undefined);
		const presentationUpdate = derivePendingId('req-1', tool);

		// Re-arming the card installs a new confirmation callback.
		state.set({
			type: IChatToolInvocation.StateKind.WaitingForConfirmation,
			parameters: {},
			confirmationMessages: { title: 'Updated title' },
			confirm: () => { },
		}, undefined);
		const rearmed = derivePendingId('req-1', tool);

		assert.deepStrictEqual({
			presentationUpdateMatches: presentationUpdate === first,
			rearmedDiffers: rearmed !== first,
			currentPartNoLongerResolvesOldId: peekPendingId('req-1', tool) !== first,
		}, {
			presentationUpdateMatches: true,
			rearmedDiffers: true,
			currentPartNoLongerResolvesOldId: true,
		});
	});
});
