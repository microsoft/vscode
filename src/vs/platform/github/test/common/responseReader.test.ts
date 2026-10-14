/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { cancelResponseBody, getResponseError, parseResponseJson, readBoundedResponse } from '../../common/responseReader.js';
import { RequestError } from '../../common/types.js';
import { NullLogService } from '../../../log/common/log.js';

suite('Response readers', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reads exact byte limits across chunks without cancelling a complete body', async () => {
		let cancellations = 0;
		const body = new ReadableStream<Uint8Array>({
			start: controller => {
				controller.enqueue(new Uint8Array([1, 2]));
				controller.enqueue(new Uint8Array());
				controller.enqueue(new Uint8Array([3, 4]));
				controller.close();
			},
			cancel: () => { cancellations++; },
		});
		const result = await readBoundedResponse(new Response(body), 4, new AbortController().signal);
		assert.deepStrictEqual({ bytes: [...result.bytes], truncated: result.truncated, cancellations, locked: body.locked }, {
			bytes: [1, 2, 3, 4], truncated: false, cancellations: 0, locked: false,
		});
	});

	for (const limit of [0, 3]) {
		test(`truncates and cancels an oversized body at exactly ${limit} bytes`, async () => {
			let cancellations = 0;
			const body = new ReadableStream<Uint8Array>({
				start: controller => {
					controller.enqueue(new Uint8Array([1, 2]));
					controller.enqueue(new Uint8Array([3, 4]));
					controller.enqueue(new Uint8Array([5]));
				},
				cancel: () => { cancellations++; },
			});
			const result = await readBoundedResponse(new Response(body), limit, new AbortController().signal);
			assert.deepStrictEqual({ bytes: [...result.bytes], truncated: result.truncated, cancellations, locked: body.locked }, {
				bytes: [1, 2, 3].slice(0, limit), truncated: true, cancellations: 1, locked: false,
			});
		});
	}

	test('a missing response body is empty unless the caller already cancelled', async () => {
		const controller = new AbortController();
		assert.deepStrictEqual(await readBoundedResponse(new Response(null), 0, controller.signal), { bytes: new Uint8Array(), truncated: false });
		const reason = new Error('Cancelled');
		controller.abort(reason);
		await assert.rejects(readBoundedResponse(new Response(null), 0, controller.signal), error => error === reason);
	});

	test('cancellation settles a stalled read without awaiting stalled body cancellation', async () => {
		let cancellations = 0;
		const body = new ReadableStream<Uint8Array>({
			cancel: () => { cancellations++; return new Promise<void>(() => { }); },
		});
		const controller = new AbortController();
		const pending = readBoundedResponse(new Response(body), 10, controller.signal);
		const reason = new Error('Cancelled');
		controller.abort(reason);
		await assert.rejects(pending, error => error === reason);
		assert.deepStrictEqual({ cancellations, locked: body.locked }, { cancellations: 1, locked: false });
	});

	test('read errors propagate without retaining the reader lock', async () => {
		const error = new Error('Body read failed');
		const body = new ReadableStream<Uint8Array>({ start: controller => controller.error(error) });
		await assert.rejects(readBoundedResponse(new Response(body), 10, new AbortController().signal), actual => actual === error);
		assert.strictEqual(body.locked, false);
	});

	test('body cancellation failures are logged without rejecting the caller', async () => {
		const warnings: unknown[][] = [];
		const log = store.add(new class extends NullLogService {
			override warn(...args: unknown[]): void { warnings.push(args); }
		}());
		cancelResponseBody({ cancel: async () => { throw new Error('Cancellation failed'); } }, log);
		await Promise.resolve();
		assert.deepStrictEqual(warnings, [['[Request] Failed to cancel a response body']]);
	});

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
