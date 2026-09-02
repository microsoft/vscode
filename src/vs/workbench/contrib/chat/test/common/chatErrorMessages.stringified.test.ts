/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatFetchResponseType, getChatErrorDetailsFromMeta } from '../../common/chatErrorMessages.js';
import { ChatErrorLevel } from '../../common/chatService/chatService.js';
import type { ErrorInfo } from '../../../../../platform/agentHost/common/state/protocol/state.js';

function errorInfo(meta: Record<string, unknown> | undefined): ErrorInfo {
	return { errorType: 'e', message: 'm', _meta: meta };
}

suite('ChatErrorMessages (stringified payload)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses stringified forwarded chatError', () => {
		const payload = JSON.stringify({
			fetchError: {
				type: ChatFetchResponseType.RateLimited,
				retryAfter: 60,
				capiError: { code: 'user_global_rate_limited', message: 'slow down' },
			},
			copilotPlan: 'free',
		});

		const details = getChatErrorDetailsFromMeta(errorInfo({ chatError: payload }));
		assert.deepStrictEqual(details, {
			code: ChatFetchResponseType.RateLimited,
			message: 'You\'ve hit your session rate limit. Please upgrade your plan or wait 60 seconds for your limit to reset. [Learn More](https://aka.ms/github-copilot-rate-limit-error)',
			level: ChatErrorLevel.Info,
			isRateLimited: true,
		});
	});
});
