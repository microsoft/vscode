/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { completionAppliesToResponse } from '../../../browser/agentSessions/agentHost/agentHostSessionHandler.js';

suite('completionAppliesToResponse', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('a turn ending closes the response it owns, and only that one', () => {
		assert.deepStrictEqual({
			// Sequential case: nothing has claimed the response.
			unclaimed: completionAppliesToResponse(undefined, 'turn-1'),
			owner: completionAppliesToResponse('turn-2', 'turn-2'),
			// A preempted turn must not close its successor's response.
			predecessor: completionAppliesToResponse('turn-2', 'turn-1'),
		}, {
			unclaimed: true,
			owner: true,
			predecessor: false,
		});
	});

	test('a released claim lets the next turn complete its own response', () => {
		// Completing releases the claim; a client-dispatched turn never claims one.
		const afterRelease = completionAppliesToResponse(undefined, 'turn-3');

		assert.strictEqual(afterRelease, true);
	});
});
