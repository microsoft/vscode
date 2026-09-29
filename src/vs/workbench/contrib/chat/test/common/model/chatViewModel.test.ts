/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatRequestQueueKind } from '../../../common/chatService/chatService.js';
import { getStickyScrollTargetItem } from '../../../common/model/chatViewModel.js';

interface ITestChatViewModelItem {
	readonly id: string;
	readonly kind?: string;
	readonly pendingKind?: ChatRequestQueueKind;
}

suite('ChatViewModel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('sticky scroll target ignores trailing pending items', () => {
		const response: ITestChatViewModelItem = { id: 'response' };
		const pendingOnly: ITestChatViewModelItem = { id: 'pending-only', pendingKind: ChatRequestQueueKind.Queued };
		const emptyItems: ITestChatViewModelItem[] = [];

		assert.deepStrictEqual([
			getStickyScrollTargetItem([
				{ id: 'request' },
				response,
				{ id: 'pending-divider-steering', kind: 'pendingDivider' },
				{ id: 'pending-steering', pendingKind: ChatRequestQueueKind.Steering },
				{ id: 'pending-divider-queued', kind: 'pendingDivider' },
				{ id: 'pending-queued', pendingKind: ChatRequestQueueKind.Queued },
			])?.id,
			getStickyScrollTargetItem([pendingOnly])?.id,
			getStickyScrollTargetItem(emptyItems)?.id,
		], [
			'response',
			'pending-only',
			undefined,
		]);
	});
});
