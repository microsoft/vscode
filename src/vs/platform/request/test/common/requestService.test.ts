/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { bufferToStream, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IRequestContext, IRequestOptions } from '../../../../base/parts/request/common/request.js';
import { NullLogService } from '../../../log/common/log.js';
import { AbstractRequestService, AuthInfo, Credentials, IRequestCompleteEvent, isClientError, isServerError, isSuccess, NO_FETCH_TELEMETRY, readHeader, retryAfterFromHeaders } from '../../common/request.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

class TestRequestService extends AbstractRequestService {

	constructor(private readonly handler: (options: IRequestOptions) => Promise<IRequestContext>) {
		super(new NullLogService());
	}

	async request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
		return this.logAndRequest(options, () => this.handler(options));
	}

	async resolveProxy(_url: string): Promise<string | undefined> { return undefined; }
	async lookupAuthorization(_authInfo: AuthInfo): Promise<Credentials | undefined> { return undefined; }
	async lookupKerberosAuthorization(_url: string): Promise<string | undefined> { return undefined; }
	async loadCertificates(): Promise<string[]> { return []; }
}

function makeResponse(statusCode: number): IRequestContext {
	return {
		res: { headers: {}, statusCode },
		stream: bufferToStream(VSBuffer.fromString(''))
	};
}

suite('AbstractRequestService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('onDidCompleteRequest fires with correct data', async () => {
		const service = store.add(new TestRequestService(() => Promise.resolve(makeResponse(200))));

		const events: IRequestCompleteEvent[] = [];
		store.add(service.onDidCompleteRequest(e => events.push(e)));

		await service.request({ url: 'http://test', callSite: 'test.callSite' }, CancellationToken.None);

		assert.strictEqual(events.length, 1);
		assert.strictEqual(events[0].callSite, 'test.callSite');
		assert.strictEqual(events[0].statusCode, 200);
		assert.ok(events[0].latency >= 0);
	});

	test('onDidCompleteRequest reports status code from response', async () => {
		const service = store.add(new TestRequestService(() => Promise.resolve(makeResponse(404))));

		const events: IRequestCompleteEvent[] = [];
		store.add(service.onDidCompleteRequest(e => events.push(e)));

		await service.request({ url: 'http://test', callSite: 'test.notFound' }, CancellationToken.None);

		assert.strictEqual(events.length, 1);
		assert.strictEqual(events[0].statusCode, 404);
	});

	test('onDidCompleteRequest fires for NO_FETCH_TELEMETRY', async () => {
		const service = store.add(new TestRequestService(() => Promise.resolve(makeResponse(200))));

		const events: IRequestCompleteEvent[] = [];
		store.add(service.onDidCompleteRequest(e => events.push(e)));

		await service.request({ url: 'http://test', callSite: NO_FETCH_TELEMETRY }, CancellationToken.None);

		assert.strictEqual(events.length, 1);
		assert.strictEqual(events[0].callSite, NO_FETCH_TELEMETRY);
	});

	test('onDidCompleteRequest does not fire when request throws', async () => {
		const service = store.add(new TestRequestService(() => Promise.reject(new Error('network error'))));

		const events: IRequestCompleteEvent[] = [];
		store.add(service.onDidCompleteRequest(e => events.push(e)));

		await assert.rejects(() => service.request({ url: 'http://test', callSite: 'test.error' }, CancellationToken.None));

		assert.strictEqual(events.length, 0);
	});

	test('onDidCompleteRequest fires for each request', async () => {
		const service = store.add(new TestRequestService(() => Promise.resolve(makeResponse(200))));

		const events: IRequestCompleteEvent[] = [];
		store.add(service.onDidCompleteRequest(e => events.push(e)));

		await service.request({ url: 'http://test/1', callSite: 'first' }, CancellationToken.None);
		await service.request({ url: 'http://test/2', callSite: 'second' }, CancellationToken.None);

		assert.deepStrictEqual(events.map(e => e.callSite), ['first', 'second']);
	});
});

suite('request status + header helpers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('isSuccess / isClientError / isServerError', () => {
		// The managed-settings fetch falls back to local-only policy on ANY non-2xx
		// response and treats client errors (4xx) as "no data" rather than a
		// transient failure, so these status-band boundaries are part of the
		// enterprise-policy fetch contract.

		test('isSuccess covers 2xx and the IE-specific 1223', () => {
			assert.strictEqual(isSuccess(makeResponse(200)), true);
			assert.strictEqual(isSuccess(makeResponse(204)), true);
			assert.strictEqual(isSuccess(makeResponse(299)), true);
			assert.strictEqual(isSuccess(makeResponse(1223)), true);
			assert.strictEqual(isSuccess(makeResponse(199)), false);
			assert.strictEqual(isSuccess(makeResponse(300)), false);
			assert.strictEqual(isSuccess(makeResponse(404)), false);
		});

		test('isClientError covers exactly 4xx', () => {
			assert.strictEqual(isClientError(makeResponse(400)), true);
			assert.strictEqual(isClientError(makeResponse(404)), true);
			assert.strictEqual(isClientError(makeResponse(499)), true);
			assert.strictEqual(isClientError(makeResponse(399)), false);
			assert.strictEqual(isClientError(makeResponse(500)), false);
		});

		test('isServerError covers exactly 5xx', () => {
			assert.strictEqual(isServerError(makeResponse(500)), true);
			assert.strictEqual(isServerError(makeResponse(503)), true);
			assert.strictEqual(isServerError(makeResponse(599)), true);
			assert.strictEqual(isServerError(makeResponse(499)), false);
			assert.strictEqual(isServerError(makeResponse(600)), false);
		});
	});

	suite('readHeader', () => {

		test('returns the value for an exact-name match', () => {
			assert.strictEqual(readHeader({ 'retry-after': '30' }, 'retry-after'), '30');
		});

		test('falls back to the lower-cased lookup name when the header is stored lower-case', () => {
			assert.strictEqual(readHeader({ 'retry-after': '30' }, 'Retry-After'), '30');
		});

		test('does NOT find a mixed-case stored header from a lower-case lookup', () => {
			// Characterizes the real limitation: readHeader checks `headers[name]`
			// then `headers[name.toLowerCase()]` — it never lower-cases the stored
			// KEYS, so it is not a fully case-insensitive scan. In practice Node /
			// Electron lower-case incoming response header names, so production
			// lookups (which pass lower-case names) still resolve.
			assert.strictEqual(readHeader({ 'Retry-After': '30' }, 'retry-after'), undefined);
		});

		test('returns the first entry for an array-valued header', () => {
			assert.strictEqual(readHeader({ 'x-ratelimit-remaining': ['0', '1'] }, 'x-ratelimit-remaining'), '0');
		});

		test('returns undefined for a missing header or missing header bag', () => {
			assert.strictEqual(readHeader({}, 'retry-after'), undefined);
			assert.strictEqual(readHeader(undefined, 'retry-after'), undefined);
		});
	});

	suite('retryAfterFromHeaders', () => {
		// Drives the shared rate-limit backoff window in DefaultAccountProvider: a
		// positive integer number of seconds extends the backoff; anything else is
		// ignored (backoff falls back to a fixed default).

		test('parses a positive integer number of seconds', () => {
			assert.strictEqual(retryAfterFromHeaders({ 'retry-after': '30' }), 30);
		});

		test('reads through an array-valued header', () => {
			assert.strictEqual(retryAfterFromHeaders({ 'retry-after': ['45'] }), 45);
		});

		test('truncates a fractional value (parseInt semantics)', () => {
			assert.strictEqual(retryAfterFromHeaders({ 'retry-after': '12.9' }), 12);
		});

		test('rejects zero and negative values', () => {
			assert.strictEqual(retryAfterFromHeaders({ 'retry-after': '0' }), undefined);
			assert.strictEqual(retryAfterFromHeaders({ 'retry-after': '-5' }), undefined);
		});

		test('does not parse the HTTP-date form', () => {
			assert.strictEqual(retryAfterFromHeaders({ 'retry-after': 'Wed, 21 Oct 2025 07:28:00 GMT' }), undefined);
		});

		test('returns undefined when the header is absent', () => {
			assert.strictEqual(retryAfterFromHeaders({}), undefined);
		});
	});
});
