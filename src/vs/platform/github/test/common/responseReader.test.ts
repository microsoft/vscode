/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getResponseError, parseResponseJson } from '../../common/responseReader.js';
import { RequestError } from '../../common/types.js';

suite('Response readers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reads structured error details without changing the original envelope', () => {
		const envelope = { type: 'error', error: { type: 'api_error', code: 'quota_exceeded', message: 'Limited', extra: 42 }, request_id: 'request' };
		assert.deepStrictEqual(getResponseError(envelope), { type: 'api_error', code: 'quota_exceeded', message: 'Limited' });
		assert.deepStrictEqual(envelope, { type: 'error', error: { type: 'api_error', code: 'quota_exceeded', message: 'Limited', extra: 42 }, request_id: 'request' });
	});

	test('keeps only string-valued error fields, including empty strings', () => {
		assert.deepStrictEqual(getResponseError({ error: { type: 42, code: '', message: false } }), {
			type: undefined, code: '', message: undefined,
		});
	});

	test('does not mistake unstructured error bodies for error objects', () => {
		for (const value of [null, 42, 'unavailable', {}, [], { error: null }, { error: 'unavailable' }, { error: [] }]) {
			assert.strictEqual(getResponseError(value), undefined);
		}
	});

	test('parses JSON without imposing a response schema or invoking the error factory', () => {
		const unexpectedError = () => { throw new Error('Unexpected parse failure'); };
		assert.deepStrictEqual(parseResponseJson('{"data":[]}', unexpectedError), { data: [] });
		assert.strictEqual(parseResponseJson('null', unexpectedError), null);
	});

	test('reports malformed JSON with the caller error instead of response content', () => {
		const error = new RequestError('Unreadable response', 'malformedResponse');
		for (const body of ['', '<html>upstream status</html>', '{"data":']) {
			assert.throws(() => parseResponseJson(body, () => error), function expectedError(actual: unknown) {
				return actual === error;
			});
		}
	});
});
