/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { shouldPauseWSLReconnectAfterFailure } from '../../browser/wslAgentHost.contribution.js';

suite('shouldPauseWSLReconnectAfterFailure', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('pauses reconnect after cancellation but not after regular failures', () => {
		assert.deepStrictEqual({
			cancellation: shouldPauseWSLReconnectAfterFailure(new CancellationError()),
			regularError: shouldPauseWSLReconnectAfterFailure(new Error('boom')),
		}, {
			cancellation: true,
			regularError: false,
		});
	});
});
