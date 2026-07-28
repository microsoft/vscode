/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { unwrapSessionLoadErrorMessage } from '../../../browser/agentSessions/agentHost/agentHostSessionHandler.js';

suite('unwrapSessionLoadErrorMessage', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('strips the restore wrapper and preserves the underlying cause', () => {
		const actual = {
			// The typical wrapped error: the session URI has a colon-slash, so the
			// wrapper prefix is stripped up to the real (colon-space) separator.
			wrapped: unwrapSessionLoadErrorMessage(new Error(`Failed to restore session copilotcli:/abc-123: This session couldn't be loaded because its worktree is missing and could not be recreated: git worktree exited with code 128: use 'add -f'`)),
			// No wrapper: message passes through unchanged.
			unwrapped: unwrapSessionLoadErrorMessage(new Error('Some other failure')),
			string: unwrapSessionLoadErrorMessage('plain string error'),
			nonError: unwrapSessionLoadErrorMessage(undefined),
		};
		assert.deepStrictEqual(actual, {
			wrapped: `This session couldn't be loaded because its worktree is missing and could not be recreated: git worktree exited with code 128: use 'add -f'`,
			unwrapped: 'Some other failure',
			string: 'plain string error',
			nonError: undefined,
		});
	});
});
