/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type Anthropic from '@anthropic-ai/sdk';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { COPILOT_API_ERROR_STATUS_STREAMING, CopilotApiError } from '../../node/shared/copilotApiService.js';
import {
	buildForwardedChatError,
	buildForwardedChatErrorFromFields,
	encodeForwardedChatError,
	extractForwardedErrorInfo,
	IForwardedChatError,
	PROXY_ERROR_PREFIX,
	toChatErrorMeta,
	tryBuildChatErrorMeta,
	tryParseForwardedChatError,
} from '../../node/shared/forwardedChatError.js';

function makeApiError(status: number, type: string, message: string, requestId: string | null = 'req-1'): CopilotApiError {
	const envelope: Anthropic.ErrorResponse = {
		type: 'error',
		error: { type: type as Anthropic.ErrorResponse['error']['type'], message },
		request_id: requestId,
	};
	return new CopilotApiError(status, envelope);
}

suite('forwardedChatError', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('buildForwardedChatError', () => {

		test('maps HTTP status to the matching fetch type', () => {
			const cases: [number, string][] = [
				[402, 'quotaExceeded'],
				[429, 'rateLimited'],
				[499, 'canceled'],
				[400, 'badRequest'],
				[401, 'agent_unauthorized'],
				[403, 'agent_unauthorized'],
				[404, 'notFound'],
				[500, 'failed'],
			];
			const actual = cases.map(([status]) => buildForwardedChatError(makeApiError(status, 'api_error', 'boom')).fetchError.type);
			assert.deepStrictEqual(actual, cases.map(([, type]) => type));
		});

		test('mid-stream streaming sentinel maps to failed', () => {
			const forwarded = buildForwardedChatError(makeApiError(COPILOT_API_ERROR_STATUS_STREAMING, 'api_error', 'mid-stream boom'));
			assert.strictEqual(forwarded.fetchError.type, 'failed');
		});

		test('carries envelope message, type, and request id', () => {
			const forwarded = buildForwardedChatError(makeApiError(429, 'rate_limit_error', 'slow down', 'gh-req-9'));
			assert.deepStrictEqual(forwarded, {
				fetchError: {
					type: 'rateLimited',
					reason: 'slow down',
					requestId: 'gh-req-9',
					capiError: { code: 'rate_limit_error', message: 'slow down' },
				},
			} satisfies IForwardedChatError);
		});

		test('null request id becomes empty string', () => {
			const forwarded = buildForwardedChatError(makeApiError(500, 'api_error', 'boom', null));
			assert.strictEqual(forwarded.fetchError.requestId, '');
		});

		test('extracts CAPI code and message from a synthesized error body', () => {
			const body = JSON.stringify({ error: { message: 'You have exceeded your monthly quota', code: 'quota_exceeded' } });
			const forwarded = buildForwardedChatError(makeApiError(402, 'api_error', body));
			assert.deepStrictEqual(forwarded, {
				fetchError: {
					type: 'quotaExceeded',
					reason: 'You have exceeded your monthly quota',
					requestId: 'req-1',
					capiError: { code: 'quota_exceeded', message: 'You have exceeded your monthly quota' },
				},
			} satisfies IForwardedChatError);
		});
	});

	suite('encode / parse round-trip', () => {

		test('round-trips a forwarded error', () => {
			const original = buildForwardedChatError(makeApiError(402, 'quota_error', 'no credits'));
			const encoded = encodeForwardedChatError(original);
			assert.ok(encoded.startsWith(PROXY_ERROR_PREFIX));
			assert.deepStrictEqual(tryParseForwardedChatError(encoded), original);
		});

		test('extracts a marker embedded mid-message, stopping at whitespace', () => {
			const original = buildForwardedChatError(makeApiError(429, 'rate_limit_error', 'slow down'));
			const text = `CAPI request failed: 429 Too Many Requests \u2014 slow down ${encodeForwardedChatError(original)} trailing words`;
			assert.deepStrictEqual(tryParseForwardedChatError(text), original);
		});

		test('returns undefined when no marker is present', () => {
			assert.strictEqual(tryParseForwardedChatError(undefined), undefined);
			assert.strictEqual(tryParseForwardedChatError('just a plain error message'), undefined);
		});

		test('returns undefined for a malformed base64 payload', () => {
			assert.strictEqual(tryParseForwardedChatError(`${PROXY_ERROR_PREFIX}not-valid-base64!!!`), undefined);
		});

		test('returns undefined when the decoded payload lacks a fetchError type', () => {
			const badPayload = `${PROXY_ERROR_PREFIX}${Buffer.from(JSON.stringify({ fetchError: {} })).toString('base64')}`;
			assert.strictEqual(tryParseForwardedChatError(badPayload), undefined);
		});

		test('returns undefined for an oversized marker payload without decoding it', () => {
			// A marker that rode along in model-influenced text could be arbitrarily
			// large; the parser must reject it before allocating/decoding.
			const huge = `${PROXY_ERROR_PREFIX}${'A'.repeat(9 * 1024)}`;
			assert.strictEqual(tryParseForwardedChatError(huge), undefined);
		});
	});

	suite('buildForwardedChatErrorFromFields', () => {

		test('maps Copilot SDK error categories to fetch types', () => {
			const actual = [
				{ errorType: 'quota', message: 'q' },
				{ errorType: 'rate_limit', message: 'r' },
				{ errorType: 'context_limit', message: 'c' },
				{ errorType: 'authentication', message: 'a' },
				{ errorType: 'authorization', message: 'a' },
			].map(data => buildForwardedChatErrorFromFields(data)?.fetchError.type);
			assert.deepStrictEqual(actual, ['quotaExceeded', 'rateLimited', 'length', 'agent_unauthorized', 'agent_unauthorized']);
		});

		test('carries code, message, and request ids for a quota error', () => {
			const forwarded = buildForwardedChatErrorFromFields({
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

		test('defaults a quota error without an explicit code to quota_exceeded so the plan message renders', () => {
			// The Copilot CLI SDK reports quota errors only via `errorType: 'quota'`
			// (no fine-grained CAPI code). Without the default, the core formatter
			// would fall through to the generic "Quota Exceeded" title.
			const fromType = buildForwardedChatErrorFromFields({ errorType: 'quota', message: 'no credits' });
			const fromStatus = buildForwardedChatErrorFromFields({ errorType: 'unknown', message: 'no credits', statusCode: 402 });
			assert.deepStrictEqual([fromType?.fetchError.capiError?.code, fromStatus?.fetchError.capiError?.code], ['quota_exceeded', 'quota_exceeded']);
		});

		test('falls back to status-code mapping for an unknown category', () => {
			assert.strictEqual(buildForwardedChatErrorFromFields({ errorType: 'something', message: 'm', statusCode: 429 })?.fetchError.type, 'rateLimited');
		});

		test('returns undefined for an unclassifiable error', () => {
			assert.strictEqual(buildForwardedChatErrorFromFields({ errorType: 'query', message: 'bad input' }), undefined);
		});
	});

	suite('meta helpers', () => {

		test('toChatErrorMeta nests under chatError', () => {
			const forwarded = buildForwardedChatError(makeApiError(404, 'not_found_error', 'missing'));
			assert.deepStrictEqual(toChatErrorMeta(forwarded), { chatError: forwarded });
		});

		test('tryBuildChatErrorMeta returns the meta record for a marked message, else undefined', () => {
			const forwarded = buildForwardedChatError(makeApiError(402, 'quota_error', 'no credits'));
			assert.deepStrictEqual(tryBuildChatErrorMeta(encodeForwardedChatError(forwarded)), { chatError: forwarded });
			assert.strictEqual(tryBuildChatErrorMeta('plain message'), undefined);
		});
	});

	suite('extractForwardedErrorInfo', () => {

		test('strips the marker and attaches _meta for a marked message', () => {
			const forwarded = buildForwardedChatError(makeApiError(402, 'quota_error', 'no credits'));
			const marked = `quota ${encodeForwardedChatError(forwarded)}`;
			assert.deepStrictEqual(extractForwardedErrorInfo(marked), { message: 'quota', _meta: { chatError: forwarded } });
		});

		test('returns the message unchanged and omits _meta for a plain message', () => {
			const info = extractForwardedErrorInfo('something went wrong');
			assert.deepStrictEqual(info, { message: 'something went wrong' });
			assert.ok(!Object.hasOwn(info, '_meta'), '_meta should be omitted, not set to undefined');
		});
	});
});
