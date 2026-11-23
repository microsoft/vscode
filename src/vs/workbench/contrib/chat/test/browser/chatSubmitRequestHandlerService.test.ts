/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatSubmitRequestHandlerService, ChatSubmitRequestOutcome } from '../../browser/chatSubmitRequestHandlerService.js';

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
			result: { outcome: ChatSubmitRequestOutcome.Handled, held: false },
			calls: ['first', 'second'],
		});
	});

	test('tells that a handler held the submission also where a later one answers it, or none does', async () => {
		const service = new ChatSubmitRequestHandlerService();
		const request = { sessionResource: URI.parse('agent-host-copilotcli:/test'), input: 'hello' };
		const holding = store.add(service.register({ id: 'holding', tryHandle: async () => ({ outcome: ChatSubmitRequestOutcome.Continue, held: true }) }));
		const continued = await service.tryHandle(request);
		const handling = store.add(service.register({ id: 'handling', tryHandle: async () => true }));
		const handled = await service.tryHandle(request);
		holding.dispose();
		handling.dispose();
		store.add(service.register({ id: 'cancelling', tryHandle: async () => ({ outcome: ChatSubmitRequestOutcome.Cancelled }) }));
		const cancelled = await service.tryHandle(request);

		assert.deepStrictEqual({ continued, handled, cancelled }, {
			continued: { outcome: ChatSubmitRequestOutcome.Continue, held: true },
			handled: { outcome: ChatSubmitRequestOutcome.Handled, held: true },
			cancelled: { outcome: ChatSubmitRequestOutcome.Cancelled, held: false },
		});
	});
});
