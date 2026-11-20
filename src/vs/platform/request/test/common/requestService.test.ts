/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { bufferToStream, streamToBuffer, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { IRequestContext, IRequestOptions } from '../../../../base/parts/request/common/request.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { AbstractRequestService, AuthInfo, Credentials, IRequestCompleteEvent, NO_FETCH_TELEMETRY } from '../../common/request.js';
import { RequestChannel, RequestChannelClient } from '../../common/requestIpc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

class TestLogService extends NullLogService {
	readonly traces: string[] = [];
	readonly errors: (string | Error)[] = [];

	override trace(message: string, ...args: unknown[]): void {
		this.traces.push([message, ...args].join(' '));
	}

	override error(error: string | Error, ...args: unknown[]): void {
		this.errors.push(args.length ? [error, ...args].join(' ') : error);
	}
}

class TestRequestService extends AbstractRequestService {

	constructor(private readonly handler: (options: IRequestOptions) => Promise<IRequestContext>, logService: ILogService = new NullLogService()) {
		super(logService);
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

	test('logs cancellation at trace level', async () => {
		const logService = new TestLogService();
		const service = store.add(new TestRequestService(() => Promise.reject(new CancellationError()), logService));

		await assert.rejects(
			() => service.request({ url: 'http://test', callSite: 'test.cancelled' }, CancellationToken.None),
			error => isCancellationError(error),
		);

		assert.deepStrictEqual({
			cancelledTraces: logService.traces.filter(message => message.includes(' - cancelled')).length,
			errors: logService.errors,
		}, {
			cancelledTraces: 1,
			errors: [],
		});
	});

	test('onDidCompleteRequest fires for each request', async () => {
		const service = store.add(new TestRequestService(() => Promise.resolve(makeResponse(200))));

		const events: IRequestCompleteEvent[] = [];
		store.add(service.onDidCompleteRequest(e => events.push(e)));

		await service.request({ url: 'http://test/1', callSite: 'first' }, CancellationToken.None);
		await service.request({ url: 'http://test/2', callSite: 'second' }, CancellationToken.None);

		assert.deepStrictEqual(events.map(e => e.callSite), ['first', 'second']);
	});

	for (const timings of [undefined, { responseHeadersMs: 30, responseBodyMs: 70, decodedBodyBytes: 0 }]) {
		test(`request IPC preserves optional diagnostics (${timings !== undefined})`, async () => {
			let diagnosticId: string | undefined;
			const service = store.add(new TestRequestService(async options => {
				diagnosticId = options.diagnosticId;
				return { ...makeResponse(200), timings };
			}));
			const channel = new RequestChannel(service);
			const client = new RequestChannelClient({
				listen: () => Event.None,
				call: (command, args, token) => channel.call(undefined, command, args, token),
			});
			const result = await client.request({ url: 'https://example.test', callSite: 'test.ipc', diagnosticId: 'local-test' }, CancellationToken.None);

			assert.deepStrictEqual({
				diagnosticId, timings: result.timings, body: (await streamToBuffer(result.stream)).toString(),
			}, { diagnosticId: 'local-test', timings, body: '' });
		});
	}

	test('logUrl: false logs only the host, the status and the error code, never the URL, headers or error message', async () => {
		const logService = new TestLogService();
		const signed = 'https://acct.blob.core.windows.net/models/m.gguf?sv=2024&sig=SECRET';
		const failure = Object.assign(new Error(`connect failed for ${signed}`), { code: 'ECONNRESET' });
		let fail = false;
		const service = store.add(new TestRequestService(() => fail ? Promise.reject(failure) : Promise.resolve({ ...makeResponse(302), res: { statusCode: 302, headers: { location: signed } } }), logService));

		await service.request({ url: signed, type: 'GET', headers: { Authorization: 'Bearer SECRET' }, logUrl: false, callSite: 'test.noUrl' }, CancellationToken.None);
		fail = true;
		await assert.rejects(() => service.request({ url: signed, type: 'GET', logUrl: false, callSite: 'test.noUrl' }, CancellationToken.None));

		assert.deepStrictEqual({ traces: logService.traces, errors: logService.errors }, {
			traces: ['#1: acct.blob.core.windows.net - begin GET', '#1: acct.blob.core.windows.net - end GET 302', '#2: acct.blob.core.windows.net - begin GET'],
			errors: ['#2: acct.blob.core.windows.net - error GET ECONNRESET'],
		});
	});
});
