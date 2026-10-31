/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	CLAUDE_PLAN_DECLINED_MESSAGE,
	CLAUDE_QUESTION_CANCELLED_MESSAGE,
	CLAUDE_USER_DECLINED_MESSAGE,
	claudeToolDenialCode,
} from '../../node/claude/claudeToolDenial.js';

suite('claudeToolDenial', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('claudeToolDenialCode classifies every known deny message and nothing else', () => {
		// Each known deny `message` returned from `canUseTool` maps to its
		// cancellation code; any other (genuine tool-error) message stays
		// unclassified so telemetry reports `error` rather than `userCancelled`.
		const classified = {
			userDeclined: claudeToolDenialCode(CLAUDE_USER_DECLINED_MESSAGE),
			planDeclined: claudeToolDenialCode(CLAUDE_PLAN_DECLINED_MESSAGE),
			questionCancelled: claudeToolDenialCode(CLAUDE_QUESTION_CANCELLED_MESSAGE),
			genuineError: claudeToolDenialCode('permission denied'),
			empty: claudeToolDenialCode(''),
		};
		assert.deepStrictEqual(classified, {
			userDeclined: 'denied',
			planDeclined: 'denied',
			questionCancelled: 'cancelled',
			genuineError: undefined,
			empty: undefined,
		});
	});
});
