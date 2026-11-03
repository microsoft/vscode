/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BrowserChatSessionResourceLocks } from '../../browser/chatSessionResourceLocks.js';

suite('Chat session Web Locks', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('independent coordinators preserve shared ownership and nonblocking collection', async () => {
		const first = new BrowserChatSessionResourceLocks();
		const second = new BrowserChatSessionResourceLocks();
		const key = `chat-storage-test-${generateUuid()}`;
		const owner = disposables.add(await first.shared(key));
		const otherOwner = disposables.add(await second.shared(key));
		const busy = await second.tryExclusive(key, async () => { throw new Error('Collected a live blob'); });
		owner.dispose();
		await owner.whenReleased;
		const stillBusy = await first.tryExclusive(key, async () => { throw new Error('Collected a live blob in another window'); });
		otherOwner.dispose();
		await otherOwner.whenReleased;
		const collected = await second.tryExclusive(key, async () => { });
		assert.deepStrictEqual({ busy, stillBusy, collected }, { busy: false, stillBusy: false, collected: true });
	});
});
