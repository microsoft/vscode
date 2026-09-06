/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { flushAgentHostPersistenceBeforeShutdown } from '../../node/agentHostShutdown.js';

suite('AgentHostShutdown', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('a failed persistence flush does not reject shutdown', async () => {
		await assert.doesNotReject(() => flushAgentHostPersistenceBeforeShutdown(
			[Promise.reject(new Error('storage unavailable'))],
			3000,
			new NullLogService(),
		));
	});
});
