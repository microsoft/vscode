/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as http from 'http';
import { Writable } from 'stream';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ICSSDevelopmentService } from '../../../platform/cssDev/node/cssDevService.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../platform/log/common/log.js';
import product from '../../../platform/product/common/product.js';
import { IProductService } from '../../../platform/product/common/productService.js';
import { IRequestService } from '../../../platform/request/common/request.js';
import { NoneServerConnectionToken } from '../../node/serverConnectionToken.js';
import { IServerEnvironmentService } from '../../node/serverEnvironmentService.js';
import { WebClientServer } from '../../node/webClientServer.js';

interface TestResponse extends Writable {
	readonly statusCode: number;
	readonly responseHeaders: http.OutgoingHttpHeaders;
	readonly body: string;
	writeHead(statusCode: number, headers?: http.OutgoingHttpHeaders): TestResponse;
}

suite('WebClientServer manifest', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createServer(basePath: string): WebClientServer {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IServerEnvironmentService, { isBuilt: false });
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IRequestService, {});
		instantiationService.stub(IProductService, { _serviceBrand: undefined, ...product });
		instantiationService.stub(ICSSDevelopmentService, { isEnabled: false });

		return instantiationService.createInstance(WebClientServer, new NoneServerConnectionToken(), basePath, '/oss-dev');
	}

	function createResponse(): TestResponse {
		const chunks: Buffer[] = [];
		const response = new Writable({
			write(chunk, _encoding, callback) {
				chunks.push(Buffer.from(chunk));
				callback();
			}
		}) as TestResponse;
		Object.defineProperties(response, {
			body: { get: () => Buffer.concat(chunks).toString() },
			responseHeaders: { value: Object.create(null) },
			statusCode: { value: 0, writable: true }
		});
		response.writeHead = (statusCode, headers = Object.create(null)) => {
			Object.assign(response, { statusCode });
			Object.assign(response.responseHeaders, headers);
			return response;
		};
		return response;
	}

	async function requestResource(server: WebClientServer, resourcePath: string, headers: http.IncomingHttpHeaders = {}, query = ''): Promise<TestResponse> {
		const response = createResponse();
		const pathname = `/static/${resourcePath}`;
		const url = new URL(`http://localhost/oss-dev${pathname}${query}`);
		await server.handle({ headers } as http.IncomingMessage, response as unknown as http.ServerResponse, url, pathname);
		return response;
	}

	function requestManifest(server: WebClientServer, headers: http.IncomingHttpHeaders = {}, query = ''): Promise<TestResponse> {
		return requestResource(server, 'resources/server/manifest.json', headers, query);
	}

	test('should use the configured base path in start_url', async () => {
		const response = await requestManifest(createServer('/code'));

		assert.strictEqual(JSON.parse(response.body).start_url, '/code/');
	});

	test('should preserve the root start_url by default', async () => {
		const response = await requestManifest(createServer('/'));

		assert.strictEqual(JSON.parse(response.body).start_url, '/');
	});

	test('should prefer X-Forwarded-Prefix over the configured base path', async () => {
		const response = await requestManifest(createServer('/code'), { 'x-forwarded-prefix': '/tenant/code' });

		assert.strictEqual(JSON.parse(response.body).start_url, '/tenant/code/');
	});

	test('should normalize a trailing slash and ignore the request query', async () => {
		const configuredResponse = await requestManifest(createServer('/code/'), {}, '?v=1&tkn=synthetic');
		const forwardedResponse = await requestManifest(createServer('/ignored'), { 'x-forwarded-prefix': '/tenant/code/' }, '?v=1');

		assert.deepStrictEqual([
			JSON.parse(configuredResponse.body).start_url,
			JSON.parse(forwardedResponse.body).start_url
		], ['/code/', '/tenant/code/']);
	});

	test('should not cache a manifest that depends on forwarded headers', async () => {
		const response = await requestManifest(createServer('/code'), { 'x-forwarded-prefix': '/tenant/code' });

		assert.deepStrictEqual({
			statusCode: response.statusCode,
			cacheControl: response.responseHeaders['Cache-Control'],
			contentType: response.responseHeaders['Content-Type'],
			etag: response.responseHeaders['Etag'],
			vary: response.responseHeaders['Vary']
		}, {
			statusCode: 200,
			cacheControl: 'no-store',
			contentType: 'application/json',
			etag: undefined,
			vary: 'X-Forwarded-Prefix'
		});
	});

	test('should keep serving other resources through the static handler', async () => {
		const response = await requestResource(createServer('/code'), 'resources/server/code-192.png');

		assert.deepStrictEqual({
			statusCode: response.statusCode,
			contentType: response.responseHeaders['Content-Type'],
			hasEtag: typeof response.responseHeaders['Etag'] === 'string',
			hasBody: response.body.length > 0
		}, {
			statusCode: 200,
			contentType: 'image/png',
			hasEtag: true,
			hasBody: true
		});
	});
});
