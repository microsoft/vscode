/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isPassiveRelayConnection, readRelayKeepAliveTimeout } from '../../../common/meta/relayConnectionMeta.js';

suite('Relay connection metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('optional metadata cannot silently widen passive connections or create invalid timers', () => {
		assert.deepStrictEqual([undefined, {}, { _meta: { 'copilot.passive': 'true' } }, { _meta: { 'copilot.passive': true } }]
			.map(isPassiveRelayConnection), [false, false, false, true]);
		assert.deepStrictEqual([undefined, '30000', 0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, 900_000]
			.map(value => readRelayKeepAliveTimeout({ _meta: { 'copilot.keepAliveTimeoutMs': value } })), [undefined, undefined, undefined, undefined, undefined, undefined, undefined, 900_000]);
	});
});
