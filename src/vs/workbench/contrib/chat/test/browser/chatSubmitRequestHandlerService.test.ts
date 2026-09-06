/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatSubmitRequestHandlerService } from '../../browser/chatSubmitRequestHandlerService.js';

suite('ChatSubmitRequestHandlerService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('returns the first handler result', async () => {
		const service = new ChatSubmitRequestHandlerService();
		const calls: string[] = [];
		store.add(service.register({
			id: 'first',
			async tryHandle() {
				calls.push('first');
				return false;
			},
		}));
		store.add(service.register({
			id: 'second',
			async tryHandle() {
				calls.push('second');
				return true;
			},
		}));
		store.add(service.register({
			id: 'third',
			async tryHandle() {
				calls.push('third');
				return true;
			},
		}));

		const result = await service.tryHandle({
			sessionResource: URI.parse('agent-host-copilotcli:/test'),
			input: '/yolo on',
		});

		assert.deepStrictEqual({ result, calls }, {
			result: true,
			calls: ['first', 'second'],
		});
	});
});
