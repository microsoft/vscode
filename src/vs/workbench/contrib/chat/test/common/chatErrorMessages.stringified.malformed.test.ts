/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getChatErrorDetailsFromMeta } from '../../common/chatErrorMessages.js';
import type { ErrorInfo } from '../../../../../platform/agentHost/common/state/protocol/state.js';

function errorInfo(meta: Record<string, unknown> | undefined): ErrorInfo {
	return { errorType: 'e', message: 'm', _meta: meta };
}

suite('ChatErrorMessages (malformed stringified payload)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('invalid JSON in forwarded chatError returns undefined (safe fallback)', () => {
		// Malformed JSON string should not throw; the helper should return undefined
		// so callers fall back to generic error handling.
		const payload = '{ fetchError: { type: "rateLimited", retryAfter: 60 }'; // missing closing brace
		const details = getChatErrorDetailsFromMeta(errorInfo({ chatError: payload }));
		assert.strictEqual(details, undefined);
	});
});
