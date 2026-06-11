/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { ChatFetchResponseType, getErrorDetailsFromChatFetchError, type ChatFetchError } from '../../common/commonTypes';
import { GitHubOutageStatus } from '../../../github/common/githubService';

function makeQuotaExceededError(capiError?: { code?: string; message?: string }): ChatFetchError {
	return {
		type: ChatFetchResponseType.QuotaExceeded,
		reason: 'quota exceeded',
		requestId: 'req-1',
		serverRequestId: 'srv-1',
		retryAfter: undefined,
		capiError,
	};
}

describe('getErrorDetailsFromChatFetchError', () => {
	describe('QuotaExceeded with additional_spend_limit_reached', () => {
		test('returns upgrade message and additional_spend_limit_reached code', () => {
			const result = getErrorDetailsFromChatFetchError(
				makeQuotaExceededError({ code: 'additional_spend_limit_reached', message: 'Spend limit reached' }),
				'individual',
				GitHubOutageStatus.None,
			);

			expect(result.isQuotaExceeded).toBe(true);
			expect(result.code).toBe('additional_spend_limit_reached');
			expect(result.message).toContain('additional usage limit');
			expect(result.message).toContain('Upgrade');
		});
	});

	describe('QuotaExceeded with quota_exceeded', () => {
		test('returns per-plan message for individual plan', () => {
			const result = getErrorDetailsFromChatFetchError(
				makeQuotaExceededError({ code: 'quota_exceeded', message: 'Quota exceeded' }),
				'individual',
				GitHubOutageStatus.None,
			);

			expect(result.isQuotaExceeded).toBe(true);
			expect(result.message).toContain('premium model quota');
		});

		test('returns per-plan message for free plan', () => {
			const result = getErrorDetailsFromChatFetchError(
				makeQuotaExceededError({ code: 'quota_exceeded', message: 'Quota exceeded' }),
				'free',
				GitHubOutageStatus.None,
			);

			expect(result.isQuotaExceeded).toBe(true);
			expect(result.message).toContain('monthly chat messages quota');
		});
	});

	describe('QuotaExceeded with free_quota_exceeded', () => {
		test('remaps to quota_exceeded and returns per-plan message', () => {
			const result = getErrorDetailsFromChatFetchError(
				makeQuotaExceededError({ code: 'free_quota_exceeded', message: 'Free quota exceeded' }),
				'free',
				GitHubOutageStatus.None,
			);

			expect(result.isQuotaExceeded).toBe(true);
			expect(result.message).toContain('monthly chat messages quota');
		});
	});

	describe('QuotaExceeded with overage_limit_reached', () => {
		test('returns support contact message', () => {
			const result = getErrorDetailsFromChatFetchError(
				makeQuotaExceededError({ code: 'overage_limit_reached', message: 'Overage limit reached' }),
				'individual',
				GitHubOutageStatus.None,
			);

			expect(result.isQuotaExceeded).toBe(true);
			expect(result.message).toContain('GitHub Support');
		});
	});

	describe('QuotaExceeded without CAPI error code', () => {
		test('preserves fetchResult.type as code when no capiError code', () => {
			const result = getErrorDetailsFromChatFetchError(
				makeQuotaExceededError(),
				'individual',
				GitHubOutageStatus.None,
			);

			expect(result.isQuotaExceeded).toBe(true);
			expect(result.code).toBe(ChatFetchResponseType.QuotaExceeded);
		});

		test('preserves fetchResult.type as code when capiError has no code', () => {
			const result = getErrorDetailsFromChatFetchError(
				makeQuotaExceededError({ message: 'Some message' }),
				'individual',
				GitHubOutageStatus.None,
			);

			expect(result.isQuotaExceeded).toBe(true);
			expect(result.code).toBe(ChatFetchResponseType.QuotaExceeded);
		});
	});

	describe('QuotaExceeded with unknown CAPI error code', () => {
		test('shows server error message with unknown code', () => {
			const result = getErrorDetailsFromChatFetchError(
				makeQuotaExceededError({ code: 'unknown_error', message: 'Something went wrong' }),
				'individual',
				GitHubOutageStatus.None,
			);

			expect(result.isQuotaExceeded).toBe(true);
			expect(result.code).toBe('unknown_error');
			expect(result.message).toContain('Something went wrong');
			expect(result.message).toContain('unknown_error');
		});
	});
});
