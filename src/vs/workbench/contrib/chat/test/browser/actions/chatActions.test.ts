/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { waitForChatResponse } from '../../../browser/actions/chatActions.js';
import { IChatResponseModel } from '../../../common/model/chatModel.js';

suite('Chat Actions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('blockOnResponse observes an already-complete response', async () => {
		const response = {
			isComplete: true,
			isPendingConfirmation: constObservable(undefined),
			response: { value: [] } as unknown as IChatResponseModel['response'],
			onDidChange: Event.None,
		};

		const result = await waitForChatResponse(response, false);
		assert.strictEqual(result, undefined);
	});
});
