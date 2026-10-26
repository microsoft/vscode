/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isRetryableMissionControlError, missionControlMaxRetries, missionControlRetryDelay, parseMissionControlError } from '../../common/missionControl/missionControlError.js';

suite('Mission Control errors', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves safe semantic diagnostics and prefers error_code over the connect code', () => {
		assert.deepStrictEqual(parseMissionControlError(JSON.stringify({
			error_code: 'rate_limit_exceeded', code: 'legacy_code', limited_resource: 'token_mint',
			message: 'private message', access_token: 'private credential',
		}), 'ABCD:1234:5678:90AB:CDEF'), {
			code: 'rate_limit_exceeded', limitedResource: 'token_mint', requestId: 'ABCD:1234:5678:90AB:CDEF',
		});
	});

	test('handles absent, malformed, unknown and unsafe metadata without retaining raw content', () => {
		const bodies = [undefined, '{', 'null', '"text"', '{"code":"future_conflict"}', '{"code":"environment_compute_terminal"}',
			'{"error_code":"ghp_secret","limited_resource":"private"}', '{"error_code":"bad\\ncode"}'];
		assert.deepStrictEqual(bodies.map(body => parseMissionControlError(body, ['ABCD:1234:5678:90AB:CDEF'])), [
			{}, {}, {}, {}, { code: 'future_conflict' }, { code: 'environment_compute_terminal' }, {}, {},
		].map(value => ({ code: undefined, limitedResource: undefined, requestId: undefined, ...value })));
	});

	test('semantic codes override status and unknown codes use the HTTP class', () => {
		assert.deepStrictEqual([
			[403, 'rate_limit_exceeded'], [500, 'not_implemented'], [500, 'environment_compute_terminal'],
			[409, 'environment_unreachable'], [409, 'environment_compute_missing'], [500, 'forbidden'],
			[401, 'unauthenticated'], [403, 'future_code'], [503, 'future_code'], [408, 'request_timeout'],
		].map(([status, code]) => isRetryableMissionControlError(Number(status), String(code))),
			[true, false, false, false, false, false, false, false, true, true]);
	});

	test('bounds request retries and honors server delays without shortening them', () => {
		const backoffs = [1, 2, 3].map(attempt => missionControlRetryDelay('backend_error', undefined, attempt));
		assert.deepStrictEqual({
			limits: [missionControlMaxRetries('internal_error'), missionControlMaxRetries('rate_limit_exceeded'), missionControlMaxRetries()],
			rateLimit: missionControlRetryDelay('rate_limit_exceeded', undefined, 1),
			serverDelays: [0, 2, 300].map(seconds => missionControlRetryDelay('rate_limit_exceeded', seconds, 1)),
			backoffs: backoffs.map((delay, index) => delay >= 1000 * 2 ** index && delay < 1000 * 2 ** index + 250),
		}, { limits: [2, 3, 3], rateLimit: 5000, serverDelays: [0, 2000, 300000], backoffs: [true, true, true] });
	});
});
