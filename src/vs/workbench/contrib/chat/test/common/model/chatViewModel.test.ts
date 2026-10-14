/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatAgentNameService } from '../../../common/participants/chatAgents.js';
import { ChatRequestQueueKind } from '../../../common/chatService/chatService.js';
import { ChatResponseModelChangeReason, IChatResponseModel } from '../../../common/model/chatModel.js';
import { ChatResponseViewModel, getStickyScrollTargetItem, IChatViewModel } from '../../../common/model/chatViewModel.js';

interface ITestChatViewModelItem {
	readonly id: string;
	readonly kind?: string;
	readonly pendingKind?: ChatRequestQueueKind;
}

suite('ChatViewModel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

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

	test('response identity does not scan the transcript for the last item', () => {
		const onDidChange = store.add(new Emitter<ChatResponseModelChangeReason>());
		let getItemsCalls = 0;
		const session = upcastPartial<IChatViewModel>({
			getItems: () => {
				getItemsCalls++;
				return [];
			}
		});
		const model = upcastPartial<IChatResponseModel>({ id: 'response', isComplete: true, onDidChange: onDidChange.event });
		const response = store.add(new ChatResponseViewModel(
			model,
			session,
			upcastPartial<IInstantiationService>({}),
			upcastPartial<IChatAgentNameService>({})
		));

		const before = response.dataId;
		onDidChange.fire({ reason: 'other' });

		assert.deepStrictEqual({ before, after: response.dataId, getItemsCalls }, { before: 'response_0', after: 'response_1', getItemsCalls: 0 });
	});
});
