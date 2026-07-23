/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ChatPersistentProgressPart } from '../../../../browser/widget/chatContentParts/chatProgressContentPart.js';

suite('ChatPersistentProgressPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps elapsed time when the status changes', () => {
		const part = store.add(new ChatPersistentProgressPart('response-1', Date.now() - 83_000, 'Working'));
		const elapsedBefore = part.domNode.querySelector('.chat-persistent-progress-elapsed')?.textContent;

		part.updateLabel('2 confirmations pending');
		assert.deepStrictEqual({
			label: part.domNode.querySelector('.chat-persistent-progress-label')?.textContent,
			elapsedBefore,
			elapsedAfter: part.domNode.querySelector('.chat-persistent-progress-elapsed')?.textContent,
		}, {
			label: '2 confirmations pending',
			elapsedBefore: '1m 23s',
			elapsedAfter: '1m 23s',
		});
	});

	test('recreated progress uses the original response timestamp', () => {
		const startedAt = Date.now() - 83_000;
		const first = new ChatPersistentProgressPart('response-1', startedAt, 'Working');
		const firstElapsed = first.domNode.querySelector('.chat-persistent-progress-elapsed')?.textContent;
		first.dispose();

		const restored = store.add(new ChatPersistentProgressPart('response-1', startedAt, 'Working'));
		assert.deepStrictEqual({
			firstElapsed,
			restoredElapsed: restored.domNode.querySelector('.chat-persistent-progress-elapsed')?.textContent,
		}, {
			firstElapsed: '1m 23s',
			restoredElapsed: '1m 23s',
		});
	});
});
