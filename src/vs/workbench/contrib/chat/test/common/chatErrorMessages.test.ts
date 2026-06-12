/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	ChatFetchResponseType,
	FilterReason,
	getChatErrorDetailsFromFetchError,
	getChatErrorDetailsFromMeta,
	getFilteredMessage,
	getQuotaMessageForPlan,
	IChatFetchErrorPayload,
} from '../../common/chatErrorMessages.js';
import { ChatErrorLevel } from '../../common/chatService/chatService.js';

suite('ChatErrorMessages', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('getChatErrorDetailsFromMeta', () => {

		test('returns undefined when no meta or no chatError', () => {
			assert.strictEqual(getChatErrorDetailsFromMeta(undefined), undefined);
			assert.strictEqual(getChatErrorDetailsFromMeta({}), undefined);
			assert.strictEqual(getChatErrorDetailsFromMeta({ chatError: {} }), undefined);
			assert.strictEqual(getChatErrorDetailsFromMeta({ chatError: { fetchError: {} } }), undefined);
		});

		test('formats a forwarded rate-limit error', () => {
			const details = getChatErrorDetailsFromMeta({
				chatError: {
					fetchError: {
						type: ChatFetchResponseType.RateLimited,
						retryAfter: 60,
						capiError: { code: 'user_global_rate_limited', message: 'slow down' },
					},
					copilotPlan: 'free',
				},
			});
			assert.deepStrictEqual(details, {
				code: ChatFetchResponseType.RateLimited,
				message: 'You\'ve hit your session rate limit. Please upgrade your plan or wait 60 seconds for your limit to reset. [Learn More](https://aka.ms/github-copilot-rate-limit-error)',
				level: ChatErrorLevel.Info,
				isRateLimited: true,
			});
		});
	});

	suite('getChatErrorDetailsFromFetchError', () => {

		test('off topic', () => {
			const details = getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.OffTopic }, undefined);
			assert.deepStrictEqual(details, {
				code: ChatFetchResponseType.OffTopic,
				message: 'Sorry, but I can only assist with programming related questions.',
			});
		});

		test('failed with and without server request id', () => {
			const withServer = getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.Failed, requestId: 'rid', serverRequestId: 'gh', reason: 'boom' }, undefined);
			assert.deepStrictEqual(withServer, {
				code: ChatFetchResponseType.Failed,
				message: 'Sorry, your request failed. Please try again.\n\nClient Request Id: rid\n\nGH Request Id: gh\n\nReason: boom',
			});

			const withoutServer = getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.Failed, requestId: 'rid', reason: 'boom' }, undefined);
			assert.deepStrictEqual(withoutServer, {
				code: ChatFetchResponseType.Failed,
				message: 'Sorry, your request failed. Please try again.\n\nClient Request Id: rid\n\nReason: boom',
			});
		});

		test('quota exceeded uses plan-specific message and quota code', () => {
			const fetchError: IChatFetchErrorPayload = {
				type: ChatFetchResponseType.QuotaExceeded,
				capiError: { code: 'quota_exceeded' },
			};
			const details = getChatErrorDetailsFromFetchError(fetchError, 'free');
			assert.deepStrictEqual(details, {
				code: 'quota_exceeded',
				message: 'You\'ve reached your monthly chat messages quota. Upgrade to Copilot Pro or wait for your allowance to renew.',
				isQuotaExceeded: true,
			});
		});

		test('filtered response is marked filtered', () => {
			const details = getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.Filtered, category: FilterReason.Copyright }, undefined);
			assert.deepStrictEqual(details, {
				code: ChatFetchResponseType.Filtered,
				message: 'Sorry, the response matched public code so it was blocked. Please rephrase your prompt. [Learn more](https://aka.ms/copilot-chat-filtered-docs).',
				responseIsFiltered: true,
				level: ChatErrorLevel.Info,
			});
		});
	});

	suite('getQuotaMessageForPlan', () => {

		test('usage-based billing business plan with reset date', () => {
			const message = getQuotaMessageForPlan('business', true, '2030-01-15T00:00:00.000Z');
			assert.ok(message.startsWith('You\'ve reached your credit limit. To continue working, please contact your organization\'s Copilot admin or wait until your credits reset on'));
		});

		test('default plan, no usage-based billing', () => {
			assert.strictEqual(
				getQuotaMessageForPlan(undefined),
				'You\'ve exhausted your premium model quota. To continue working, switch to Auto. For additional paid premium requests, please reach out to your organization\'s Copilot admin or wait for your allowance to renew.',
			);
		});
	});

	suite('getFilteredMessage', () => {

		test('prompt filter, markdown vs plain', () => {
			assert.strictEqual(
				getFilteredMessage(FilterReason.Prompt),
				'Sorry, your prompt was filtered by the Responsible AI Service. Please rephrase your prompt and try again. [Learn more](https://aka.ms/copilot-chat-filtered-docs).',
			);
			assert.strictEqual(
				getFilteredMessage(FilterReason.Prompt, false),
				'Sorry, your prompt was filtered by the Responsible AI Service. Please rephrase your prompt and try again.',
			);
		});
	});
});
