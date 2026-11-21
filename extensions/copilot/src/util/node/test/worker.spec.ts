/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test, vi } from 'vitest';
import { createRpcProxy } from '../worker';

suite('Worker RPC proxy', () => {
	test('is not thenable', async () => {
		// A thenable proxy would forward `then` to the worker and never settle.
		const remoteCall = vi.fn<() => Promise<void>>();
		const proxy = createRpcProxy<{ run(): Promise<void> }>(remoteCall);

		assert.strictEqual((proxy as { then?: unknown }).then, undefined);
		assert.strictEqual(await Promise.resolve(proxy), proxy);
		assert.strictEqual(remoteCall.mock.calls.length, 0);
	});
});
