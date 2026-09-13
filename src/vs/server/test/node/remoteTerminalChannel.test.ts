/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { getFreePortRequestPort } from '../../node/remoteTerminalChannel.js';

suite('RemoteTerminalChannel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('validates free-port request arguments', () => {
		for (const args of [undefined, null, [], ['3000', 'extra'], '3000', [3000], ['01'], ['65536'], ['3000;id']]) {
			assert.throws(() => getFreePortRequestPort(args));
		}
		assert.deepStrictEqual(
			[['1'], ['3000'], ['65535']].map(getFreePortRequestPort),
			['1', '3000', '65535']
		);
	});
});
