/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { bufferToStream, decodeBase64, encodeBase64, newWriteableBufferStream, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { IRequestContext, IRequestOptions } from '../../../../../../base/parts/request/common/request.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IRequestService } from '../../../../../../platform/request/common/request.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IImageGenerationConfiguration, IImageGenerationConnection, IImageGenerationCredentialsService, IImageGenerationRequest } from '../../../common/imageGeneration.js';
import { MaiImageGenerationService } from '../../../browser/imageGeneration/maiImageGenerationService.js';

class TestImageGenerationCredentialsService extends mock<IImageGenerationCredentialsService>() {
	readonly resolveCalls: IImageGenerationConfiguration[] = [];
	override readonly onDidChangeConfiguration = Event.None;
	override readonly whenReady = Promise.resolve();
	resolveHook: ((configuration: IImageGenerationConfiguration) => Promise<void> | void) | undefined;
	connection: IImageGenerationConnection = {
		endpoint: 'https://images.example.test',
		deployment: 'mai-deployment',
		headers: { 'api-key': 'test-api-key' },
	};

	override get configuration(): IImageGenerationConfiguration | undefined {
		return { endpoint: this.connection.endpoint, deployment: this.connection.deployment };
	}

	override async configure(): Promise<void> {
		throw new Error('Not implemented');
	}

	override async clear(): Promise<void> {
		throw new Error('Not implemented');
	}

	override async resolve(configuration: IImageGenerationConfiguration): Promise<IImageGenerationConnection> {
		this.resolveCalls.push(configuration);
		await this.resolveHook?.(configuration);
		return this.connection;
	}
}

class TestRequestService extends mock<IRequestService>() {
	readonly requests: IRequestOptions[] = [];
	override readonly onDidCompleteRequest = Event.None;
	handler: ((options: IRequestOptions, token: CancellationToken) => Promise<IRequestContext>) | undefined;

	override async request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
		this.requests.push(options);
		if (!this.handler) {
			throw new Error('No request handler configured');
		}
		return this.handler(options, token);
	}
}

class TestChatEntitlementService extends mock<IChatEntitlementService>() {
	hidden = false;

	override get sentiment() {
		return { hidden: this.hidden };
	}
}

function jsonResponse(statusCode: number, body: unknown, headers: Record<string, string> = {}): IRequestContext {
	const buffer = VSBuffer.fromString(JSON.stringify(body));
	return {
		res: {
			statusCode,
			headers: { 'content-length': String(buffer.byteLength), ...headers },
		},
		stream: bufferToStream(buffer),
	};
}

function textResponse(statusCode: number, body: string, headers: Record<string, string> = {}): IRequestContext {
	const buffer = VSBuffer.fromString(body);
	return {
		res: {
			statusCode,
			headers: { 'content-length': String(buffer.byteLength), ...headers },
		},
		stream: bufferToStream(buffer),
	};
}

function parseRequestBody(request: IRequestOptions): unknown {
	assert.ok(request.data);
	return JSON.parse(request.data);
}

async function createPngBase64(width: number, height: number): Promise<string> {
	const canvas = mainWindow.document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	assert.ok(context);
	context.fillStyle = '#008000';
	context.fillRect(0, 0, width, height);
	const prefix = 'data:image/png;base64,';
	const dataUrl = canvas.toDataURL('image/png');
	assert.ok(dataUrl.startsWith(prefix));
	return dataUrl.slice(prefix.length);
}

function corruptPngBase64(base64: string): string {
	const png = decodeBase64(base64);
	return encodeBase64(png.slice(0, 100));
}

suite('MaiImageGenerationService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const configuration: IImageGenerationConfiguration = { endpoint: 'https://images.example.test', deployment: 'mai-deployment' };
	const request: IImageGenerationRequest = { prompt: 'Draw a green tree', width: 1024, height: 1024 };
	let validPng1024: string;
	let validPng768x1024: string;
	let corruptPng1024: string;
	let credentialsService: TestImageGenerationCredentialsService;
	let requestService: TestRequestService;
	let chatEntitlementService: TestChatEntitlementService;
	let service: MaiImageGenerationService;

	suiteSetup(async () => {
		validPng1024 = await createPngBase64(1024, 1024);
		validPng768x1024 = await createPngBase64(768, 1024);
		corruptPng1024 = corruptPngBase64(validPng1024);
	});

	setup(() => {
		credentialsService = new TestImageGenerationCredentialsService();
		requestService = new TestRequestService();
		chatEntitlementService = new TestChatEntitlementService();
		service = new MaiImageGenerationService(credentialsService, requestService, chatEntitlementService);
	});

	async function assertGenerateFails(context: IRequestContext, expected: RegExp): Promise<void> {
		requestService.handler = async () => context;
		await assert.rejects(() => service.generate(request, configuration, CancellationToken.None), expected);
		assert.strictEqual(requestService.requests.length, 1);
	}

	test('posts the MAI request with header auth kept out of the payload', async () => {
		requestService.handler = async () => jsonResponse(200, { data: [{ b64_json: validPng1024 }] });

		const result = await service.generate(request, configuration, CancellationToken.None);
		const issuedRequest = requestService.requests[0];
		const body = parseRequestBody(issuedRequest) as Record<string, unknown>;

		assert.deepStrictEqual({
			result: {
				matches: result.data.equals(decodeBase64(validPng1024)),
				mimeType: result.mimeType,
				width: result.width,
				height: result.height,
			},
			request: {
				type: issuedRequest.type,
				url: issuedRequest.url,
				headers: issuedRequest.headers,
				followRedirects: issuedRequest.followRedirects,
				maxResponseBytes: issuedRequest.maxResponseBytes,
				timeout: issuedRequest.timeout,
				callSite: issuedRequest.callSite,
				body,
			},
			bodyLeaksAuth: ['api-key', 'headers', 'endpoint', 'deployment'].some(key => Object.hasOwn(body, key)),
			resolveCalls: credentialsService.resolveCalls,
		}, {
			result: {
				matches: true,
				mimeType: 'image/png',
				width: 1024,
				height: 1024,
			},
			request: {
				type: 'POST',
				url: 'https://images.example.test/mai/v1/images/generations',
				headers: { 'api-key': 'test-api-key', 'Content-Type': 'application/json' },
				followRedirects: 0,
				maxResponseBytes: 16 * 1024 * 1024,
				timeout: 120000,
				callSite: 'chat.imageGeneration',
				body: {
					model: 'mai-deployment',
					prompt: 'Draw a green tree',
					width: 1024,
					height: 1024,
					auto_aspect_ratio: false,
					web_grounding: false,
				},
			},
			bodyLeaksAuth: false,
			resolveCalls: [configuration],
		});
	});

	test('rejects invalid requests before issuing any network call', async () => {
		await assert.rejects(() => service.generate({ prompt: '', width: 1024, height: 1024 }, configuration, CancellationToken.None), /non-empty image prompt/i);

		assert.deepStrictEqual({
			requests: requestService.requests.length,
			resolveCalls: credentialsService.resolveCalls,
		}, {
			requests: 0,
			resolveCalls: [],
		});
	});

	test('does not issue a request while AI features are hidden', async () => {
		chatEntitlementService.hidden = true;

		await assert.rejects(() => service.generate(request, configuration, CancellationToken.None), /unavailable while AI features are disabled/i);

		assert.deepStrictEqual({
			requests: requestService.requests.length,
			resolveCalls: credentialsService.resolveCalls,
		}, {
			requests: 0,
			resolveCalls: [],
		});
	});

	test('does not issue a request when already cancelled', async () => {
		const cancellation = new CancellationTokenSource();
		cancellation.cancel();

		await assert.rejects(() => service.generate(request, configuration, cancellation.token), error => isCancellationError(error));

		assert.deepStrictEqual({
			requests: requestService.requests.length,
			resolveCalls: credentialsService.resolveCalls,
		}, {
			requests: 0,
			resolveCalls: [],
		});
	});

	test('re-checks the AI hidden state after resolving credentials', async () => {
		credentialsService.resolveHook = () => {
			chatEntitlementService.hidden = true;
		};

		await assert.rejects(() => service.generate(request, configuration, CancellationToken.None), /unavailable while AI features are disabled/i);

		assert.deepStrictEqual({
			requests: requestService.requests.length,
			resolveCalls: credentialsService.resolveCalls,
		}, {
			requests: 0,
			resolveCalls: [configuration],
		});
	});

	test('times out without retrying the request', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		requestService.handler = async (_options, token) => {
			return new Promise<IRequestContext>((_resolve, reject) => {
				const listener = token.onCancellationRequested(() => {
					listener.dispose();
					reject(new Error('request cancelled'));
				});
			});
		};

		await assert.rejects(() => service.generate(request, configuration, CancellationToken.None), /timed out\. No automatic retry was made/i);

		assert.deepStrictEqual({
			requests: requestService.requests.length,
			resolveCalls: credentialsService.resolveCalls,
		}, {
			requests: 1,
			resolveCalls: [configuration],
		});
	}));

	for (const status of [401, 403]) {
		test(`maps HTTP ${status} to an authentication error without retrying`, async () => {
			await assertGenerateFails(textResponse(status, 'denied'), /rejected the credentials or access/i);
		});
	}

	test('maps HTTP 404 to a deployment error without retrying', async () => {
		await assertGenerateFails(textResponse(404, 'missing'), /endpoint or deployment was not found/i);
	});

	test('maps HTTP 429 to a retry-after quota error without retrying', async () => {
		await assertGenerateFails(textResponse(429, 'slow down', { 'retry-after': '7' }), /wait at least 7 seconds/i);
	});

	test('maps content-filter responses without retrying', async () => {
		await assertGenerateFails(textResponse(400, '{"code":"content_filter"}'), /content policy/i);
	});

	test('rejects invalid JSON responses after a single request', async () => {
		await assertGenerateFails(textResponse(200, '{'), /returned invalid JSON/i);
	});

	test('rejects empty image payloads after a single request', async () => {
		await assertGenerateFails(jsonResponse(200, { data: [] }), /did not return a single PNG image/i);
	});

	test('rejects corrupt PNGs after a single request', async () => {
		await assertGenerateFails(jsonResponse(200, { data: [{ b64_json: corruptPng1024 }] }), /could not be decoded/i);
	});

	test('rejects mismatched image dimensions after a single request', async () => {
		await assertGenerateFails(jsonResponse(200, { data: [{ b64_json: validPng768x1024 }] }), /unexpected image dimensions/i);
	});

	test('rejects oversized responses before reading the body', async () => {
		await assertGenerateFails({
			res: {
				statusCode: 200,
				headers: { 'content-length': String(16 * 1024 * 1024 + 1) },
			},
			stream: bufferToStream(VSBuffer.alloc(0)),
		}, /16 MB limit/i);
	});

	test('cancels an in-flight request after exactly one network call', async () => {
		const stream = newWriteableBufferStream();
		const started = new DeferredPromise<void>();
		requestService.handler = async () => {
			void started.complete();
			return { res: { statusCode: 200, headers: {} }, stream };
		};
		const cancellation = store.add(new CancellationTokenSource());
		const pending = service.generate(request, configuration, cancellation.token);
		await started.p;
		cancellation.cancel();

		await assert.rejects(() => pending, error => isCancellationError(error));
		assert.strictEqual(requestService.requests.length, 1);
	});
});
