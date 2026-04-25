/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CLAUDE_CODE_SESSION_TYPE, COPILOT_CLI_SESSION_TYPE, COPILOT_CLOUD_SESSION_TYPE, isWorkspaceAgentSessionType } from '../../common/session.js';

suite('isWorkspaceAgentSessionType', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns true for Copilot CLI sessions', () => {
		assert.strictEqual(isWorkspaceAgentSessionType(COPILOT_CLI_SESSION_TYPE), true);
	});

	test('returns true for Claude Code sessions', () => {
		assert.strictEqual(isWorkspaceAgentSessionType(CLAUDE_CODE_SESSION_TYPE), true);
	});

	test('returns false for Copilot Cloud sessions', () => {
		assert.strictEqual(isWorkspaceAgentSessionType(COPILOT_CLOUD_SESSION_TYPE), false);
	});

	test('returns false for unknown session types', () => {
		assert.strictEqual(isWorkspaceAgentSessionType('unknown-type'), false);
	});

	test('returns false for undefined', () => {
		assert.strictEqual(isWorkspaceAgentSessionType(undefined), false);
	});
});
