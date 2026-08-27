/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildChatErrorInfoFromCopilotSdkFields, buildForwardedChatErrorFromCopilotSdkFields } from '../../node/copilot/copilotSdkChatError.js';
import type { IForwardedChatError } from '../../node/shared/proxyChatError.js';

suite('copilotSdkChatError', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps Copilot SDK error categories to fetch types', () => {
		const actual = [
			{ errorType: 'quota', message: 'q' },
			{ errorType: 'rate_limit', message: 'r' },
			{ errorType: 'context_limit', message: 'c' },
			{ errorType: 'authentication', message: 'a' },
			{ errorType: 'authorization', message: 'a' },
		].map(data => buildForwardedChatErrorFromCopilotSdkFields(data)?.fetchError.type);
		assert.deepStrictEqual(actual, ['quotaExceeded', 'rateLimited', 'length', 'agent_unauthorized', 'agent_unauthorized']);
	});

	test('carries code, message, and request ids for a quota error', () => {
		const forwarded = buildForwardedChatErrorFromCopilotSdkFields({
			errorType: 'quota',
			errorCode: 'quota_exceeded',
			message: 'You have exceeded your monthly quota',
			statusCode: 402,
			providerCallId: 'gh-1',
			serviceRequestId: 'svc-2',
		});
		assert.deepStrictEqual(forwarded, {
			fetchError: {
				type: 'quotaExceeded',
				reason: 'You have exceeded your monthly quota',
				requestId: 'gh-1',
				serverRequestId: 'svc-2',
				capiError: { code: 'quota_exceeded', message: 'You have exceeded your monthly quota' },
			},
		} satisfies IForwardedChatError);
	});

	test('defaults a quota error without an explicit code to quota_exceeded', () => {
		const fromType = buildForwardedChatErrorFromCopilotSdkFields({ errorType: 'quota', message: 'no credits' });
		const fromStatus = buildForwardedChatErrorFromCopilotSdkFields({ errorType: 'unknown', message: 'no credits', statusCode: 402 });
		assert.deepStrictEqual([fromType?.fetchError.capiError?.code, fromStatus?.fetchError.capiError?.code], ['quota_exceeded', 'quota_exceeded']);
	});

	test('falls back to status-code mapping for an unknown category', () => {
		assert.strictEqual(buildForwardedChatErrorFromCopilotSdkFields({ errorType: 'something', message: 'm', statusCode: 429 })?.fetchError.type, 'rateLimited');
	});

	test('returns undefined for an unclassifiable error', () => {
		assert.strictEqual(buildForwardedChatErrorFromCopilotSdkFields({ errorType: 'query', message: 'bad input' }), undefined);
	});

	test('builds protocol error info with stack and structured metadata', () => {
		assert.deepStrictEqual(buildChatErrorInfoFromCopilotSdkFields({
			errorType: 'quota',
			message: 'no credits',
			stack: 'stack',
		}), {
			errorType: 'quota',
			message: 'no credits',
			stack: 'stack',
			_meta: {
				chatError: {
					fetchError: {
						type: 'quotaExceeded',
						reason: 'no credits',
						requestId: '',
						capiError: { code: 'quota_exceeded', message: 'no credits' },
					},
				},
			},
		});
	});
});
