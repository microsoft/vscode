/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok, strictEqual } from 'assert';
import type * as http from 'http';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import { IDecodeResult } from '../../../node/otlp/otlpJsonDecode.js';
import {
	ILocalOtlpHttpReceiver,
	OTLP_TRACES_PATH,
	startLocalOtlpHttpReceiver,
} from '../../../node/otlp/localOtlpReceiver.js';
import {
	IOtlpExportTraceServiceRequest,
	OtlpSpanKind,
} from '../../../node/otlp/otlpJsonTypes.js';

interface ITestResponse {
	statusCode: number;
	body: string;
	contentType: string;
}

async function send(
	port: number,
	options: { method?: string; path?: string; body?: Buffer | string; contentType?: string; contentEncoding?: string },
): Promise<ITestResponse> {
	const httpModule = await import('http');
	const payload = options.body === undefined
		? undefined
		: typeof options.body === 'string' ? Buffer.from(options.body, 'utf8') : options.body;
	const headers: Record<string, string> = {};
	if (options.contentType) {
		headers['content-type'] = options.contentType;
	}
	if (options.contentEncoding) {
		headers['content-encoding'] = options.contentEncoding;
	}
	if (payload) {
		headers['content-length'] = String(payload.length);
	}
	const req: http.ClientRequest = httpModule.request({
		host: '127.0.0.1',
		port,
		method: options.method ?? 'POST',
		path: options.path ?? OTLP_TRACES_PATH,
		headers,
	});
	const responsePromise = new Promise<ITestResponse>((resolve, reject) => {
		req.on('response', res => {
			const chunks: Buffer[] = [];
			res.on('data', (chunk: Buffer) => chunks.push(chunk));
			res.on('end', () => resolve({
				statusCode: res.statusCode ?? 0,
				body: Buffer.concat(chunks).toString('utf8'),
				contentType: (res.headers['content-type'] ?? '').toString(),
			}));
			res.on('error', reject);
		});
		req.on('error', reject);
	});
	if (payload) {
		req.write(payload);
	}
	req.end();
	return responsePromise;
}

const traceId = 'aabbccddeeff00112233445566778899';
const spanId = '0011223344556677';
const ns = '1700000000000000000';

function validRequestBody(): IOtlpExportTraceServiceRequest {
	return {
		resourceSpans: [{
			scopeSpans: [{
				spans: [{
					traceId,
					spanId,
					name: 'invoke_agent copilotcli',
					kind: OtlpSpanKind.INTERNAL,
					startTimeUnixNano: ns,
					endTimeUnixNano: ns,
					attributes: [{ key: 'gen_ai.operation.name', value: { stringValue: 'invoke_agent' } }],
				}],
			}],
		}],
	};
}

suite('platform/otel - localOtlpHttpReceiver', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const logService = new NullLogService();

	test('accepts a valid OTLP-JSON payload and delivers decoded spans', async () => {
		const received: IDecodeResult[] = [];
		const receiver = store.add(await startLocalOtlpHttpReceiver(
			{ onSpans: r => received.push(r) },
			logService,
		));
		const res = await send(receiver.port, {
			contentType: 'application/json',
			body: JSON.stringify(validRequestBody()),
		});
		strictEqual(res.statusCode, 200);
		ok(res.contentType.startsWith('application/json'));
		deepStrictEqual(JSON.parse(res.body), {});
		strictEqual(received.length, 1);
		strictEqual(received[0].rejected, 0);
		strictEqual(received[0].spans.length, 1);
		strictEqual(received[0].spans[0].name, 'invoke_agent copilotcli');
	});

	test('returns partial_success when some spans are rejected', async () => {
		const receiver = store.add(await startLocalOtlpHttpReceiver(
			{ onSpans: () => undefined },
			logService,
		));
		const body: IOtlpExportTraceServiceRequest = {
			resourceSpans: [{
				scopeSpans: [{
					spans: [
						{ traceId, spanId, name: 'ok', startTimeUnixNano: ns, endTimeUnixNano: ns },
						{ traceId: 'badhex', spanId, name: 'bad', startTimeUnixNano: ns, endTimeUnixNano: ns },
					] as never,
				}],
			}],
		};
		const res = await send(receiver.port, {
			contentType: 'application/json',
			body: JSON.stringify(body),
		});
		strictEqual(res.statusCode, 200);
		const parsed = JSON.parse(res.body);
		strictEqual(parsed.partialSuccess.rejectedSpans, 1);
		ok(typeof parsed.partialSuccess.errorMessage === 'string');
	});

	test('forwards raw body to onForward callback unchanged', async () => {
		const raw = JSON.stringify(validRequestBody());
		let forwarded: { body: Buffer; contentType: string } | undefined;
		const receiver = store.add(await startLocalOtlpHttpReceiver(
			{
				onSpans: () => undefined,
				onForward: (body, contentType) => { forwarded = { body, contentType }; },
			},
			logService,
		));
		await send(receiver.port, { contentType: 'application/json', body: raw });
		ok(forwarded);
		strictEqual(forwarded.body.toString('utf8'), raw);
		ok(forwarded.contentType.includes('application/json'));
	});

	test('transforms the body before forwarding and local decoding', async () => {
		let forwarded: Buffer | undefined;
		let decoded: IDecodeResult | undefined;
		const receiver = store.add(await startLocalOtlpHttpReceiver(
			{
				transformBody: body => Buffer.from(body.toString('utf8').replace('invoke_agent copilotcli', 'transformed span')),
				onSpans: result => { decoded = result; },
				onForward: body => { forwarded = body; },
			},
			logService,
		));
		const res = await send(receiver.port, { contentType: 'application/json', body: JSON.stringify(validRequestBody()) });
		strictEqual(res.statusCode, 200);
		ok(forwarded?.toString('utf8').includes('transformed span'));
		strictEqual(decoded?.spans[0].name, 'transformed span');
	});

	test('rejects transform failures without forwarding, decoding, or logging the unredacted body', async () => {
		const raw = JSON.stringify(validRequestBody());
		const warnings: string[] = [];
		let forwarded = false;
		let decoded = false;
		const receiver = store.add(await startLocalOtlpHttpReceiver({
			transformBody: body => { throw new Error(body.toString('utf8')); },
			onSpans: () => { decoded = true; },
			onForward: () => { forwarded = true; },
		}, new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}));
		const res = await send(receiver.port, { contentType: 'application/json', body: raw });
		strictEqual(res.statusCode, 400);
		strictEqual(forwarded, false);
		strictEqual(decoded, false);
		strictEqual(warnings.length, 1);
		ok(!warnings[0].includes(raw));
		ok(!res.body.includes(raw));
	});

	test('still responds 200 even if onForward throws', async () => {
		const receiver = store.add(await startLocalOtlpHttpReceiver(
			{
				onSpans: () => undefined,
				onForward: () => { throw new Error('upstream down'); },
			},
			logService,
		));
		const res = await send(receiver.port, {
			contentType: 'application/json',
			body: JSON.stringify(validRequestBody()),
		});
		strictEqual(res.statusCode, 200);
	});

	test('rejects non-JSON content-type with 415', async () => {
		const receiver = store.add(await startLocalOtlpHttpReceiver({ onSpans: () => undefined }, logService));
		const res = await send(receiver.port, { contentType: 'application/x-protobuf', body: '\x00' });
		strictEqual(res.statusCode, 415);
	});

	test('rejects non-identity content-encoding with 415', async () => {
		const receiver = store.add(await startLocalOtlpHttpReceiver({ onSpans: () => undefined }, logService));
		const res = await send(receiver.port, {
			contentType: 'application/json',
			contentEncoding: 'gzip',
			body: '{}',
		});
		strictEqual(res.statusCode, 415);
	});

	test('returns 405 for non-POST', async () => {
		const receiver = store.add(await startLocalOtlpHttpReceiver({ onSpans: () => undefined }, logService));
		const res = await send(receiver.port, { method: 'GET' });
		strictEqual(res.statusCode, 405);
	});

	test('returns 404 for unknown paths', async () => {
		const receiver = store.add(await startLocalOtlpHttpReceiver({ onSpans: () => undefined }, logService));
		const res = await send(receiver.port, { path: '/v1/metrics', contentType: 'application/json', body: '{}' });
		strictEqual(res.statusCode, 404);
	});

	test('returns 400 for invalid JSON', async () => {
		const receiver = store.add(await startLocalOtlpHttpReceiver({ onSpans: () => undefined }, logService));
		const res = await send(receiver.port, { contentType: 'application/json', body: '{not json' });
		strictEqual(res.statusCode, 400);
	});

	test('returns 413 when body exceeds maxBodyBytes', async () => {
		const receiver = store.add(await startLocalOtlpHttpReceiver(
			{ onSpans: () => undefined },
			logService,
			{ maxBodyBytes: 16 },
		));
		const res = await send(receiver.port, {
			contentType: 'application/json',
			body: JSON.stringify({ resourceSpans: [{ scopeSpans: [{ spans: [] }] }] }),
		});
		strictEqual(res.statusCode, 413);
	});

	test('binds to 127.0.0.1 on an ephemeral port', async () => {
		const receiver: ILocalOtlpHttpReceiver = store.add(await startLocalOtlpHttpReceiver({ onSpans: () => undefined }, logService));
		ok(receiver.port > 0);
		strictEqual(receiver.baseUrl, `http://127.0.0.1:${receiver.port}`);
	});
});
