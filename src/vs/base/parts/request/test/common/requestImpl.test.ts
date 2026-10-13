/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../common/async.js';
import { streamToBuffer, VSBuffer } from '../../../../common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../common/cancellation.js';
import { isCancellationError } from '../../../../common/errors.js';
import { getMarks } from '../../../../common/performance.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../test/common/utils.js';
import { runWithFakedTimers } from '../../../../test/common/virtualScheduling/index.js';
import { request } from '../../common/requestImpl.js';

suite('Fetch request diagnostics', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function marks(id: string): string[] {
		return getMarks().filter(mark => mark.name.startsWith(`code/request/${id}/`)).map(mark => mark.name);
	}

	for (const diagnosticId of [undefined, 'test-history']) {
		test(`measures headers and body independently only when opted in (${diagnosticId})`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			let headerMarks: string[] = [];
			let sentHeader: string | null = null;
			const bytes = VSBuffer.fromString('response \u00e9');
			const response = await request({
				url: 'https://example.test/private-path',
				callSite: 'request.test.diagnostics',
				diagnosticId,
			}, CancellationToken.None, undefined, async (_url, init) => {
				sentHeader = new Headers(init?.headers).get('diagnosticId');
				await timeout(30);
				return new class extends Response {
					override async arrayBuffer(): Promise<ArrayBuffer> {
						headerMarks = marks('test-history');
						await timeout(70);
						return new Uint8Array(bytes.buffer).buffer;
					}
				}(null, { status: 200 });
			});
			const body = await streamToBuffer(response.stream);
			assert.deepStrictEqual({
				timings: response.timings, body: body.toString(), headerMarks, sentHeader,
				remainingMarks: marks('test-history'),
			}, {
				timings: diagnosticId ? { responseHeadersMs: 30, responseBodyMs: 70, decodedBodyBytes: bytes.byteLength } : undefined,
				body: 'response \u00e9',
				headerMarks: diagnosticId ? ['code/request/test-history/start', 'code/request/test-history/headersReceived'] : [],
				sentHeader: null, remainingMarks: [],
			});
		}));
	}

	for (const phase of ['headers', 'body']) {
		test(`preserves cancellation and clears diagnostic marks while awaiting ${phase}`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const source = store.add(new CancellationTokenSource());
			let reachedBody = false;
			const abort = async () => {
				await timeout(25);
				source.cancel();
				throw new DOMException('Aborted', 'AbortError');
			};
			const result = request({
				url: 'https://example.test/private-path', callSite: 'request.test.cancelDiagnostics', diagnosticId: 'cancel-test',
			}, source.token, undefined, async () => {
				if (phase === 'headers') {
					return abort();
				}
				return new class extends Response {
					override async arrayBuffer(): Promise<ArrayBuffer> {
						reachedBody = true;
						return abort();
					}
				}();
			});
			await assert.rejects(result, isCancellationError);
			assert.deepStrictEqual({ reachedBody, remainingMarks: marks('cancel-test') }, {
				reachedBody: phase === 'body', remainingMarks: [],
			});
		}));
	}

	test('preserves HTTP errors and response bytes without treating them as transport failures', async () => {
		const response = await request({
			url: 'https://example.test/private-path', callSite: 'request.test.httpDiagnostics', diagnosticId: 'http-test',
		}, CancellationToken.None, undefined, async () => new Response('private-body', { status: 503 }));

		assert.deepStrictEqual({
			status: response.res.statusCode, bytes: response.timings?.decodedBodyBytes,
			body: (await streamToBuffer(response.stream)).toString(), remainingMarks: marks('http-test'),
		}, { status: 503, bytes: 12, body: 'private-body', remainingMarks: [] });
	});
});
