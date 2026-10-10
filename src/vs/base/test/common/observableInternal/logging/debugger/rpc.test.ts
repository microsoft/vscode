/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
// eslint-disable-next-line local/code-no-deep-import-of-internal
import { API, IChannel, SimpleTypedRpcConnection } from '../../../../../common/observableInternal/logging/debugger/rpc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../utils.js';

suite('SimpleTypedRpcConnection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('API proxies are not thenable', async () => {
		// A thenable proxy would forward `then` over the channel and never settle.
		const channel: IChannel = {
			sendNotification: () => { },
			sendRequest: async () => ({ type: 'result', value: undefined }),
		};
		const connection = SimpleTypedRpcConnection.createHost<API>(() => channel, () => ({
			notifications: {},
			requests: {},
		}));

		assert.strictEqual((connection.api.requests as { then?: unknown }).then, undefined);
		assert.strictEqual((connection.api.notifications as { then?: unknown }).then, undefined);
		assert.strictEqual(await Promise.resolve(connection.api.requests), connection.api.requests);
		assert.strictEqual(await Promise.resolve(connection.api.notifications), connection.api.notifications);
	});
});
