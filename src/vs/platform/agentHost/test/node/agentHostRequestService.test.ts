/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { streamToBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import type { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { AuthInfo, IRequestService } from '../../../request/common/request.js';
import { AgentHostClientProxyChannel, createAgentHostClientProxyConnection, type IAgentHostClientProxyConnection } from '../../common/agentHostClientProxyChannel.js';
import { IAgentHostProxyResolver } from '../../node/agentHostProxyResolver.js';
import { AgentHostRequestService } from '../../node/agentHostRequestService.js';
import { NetworkDiagnosticsService } from '../../node/networkDiagnosticsService.js';

class TestProxyResolver implements IAgentHostProxyResolver {
	declare readonly _serviceBrand: undefined;

	lastInput: string | URL | Request | undefined;
	lastInit: RequestInit | undefined;
	fetchImpl: typeof globalThis.fetch = () => Promise.resolve(new Response());

	register(_clientId: string, _connection: IAgentHostClientProxyConnection) {
		return Disposable.None;
	}

	resolveProxy(_url: string): Promise<string | undefined> {
		return Promise.resolve('http://proxy.example:8080');
	}

	fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
		this.lastInput = input;
		this.lastInit = init;
		return this.fetchImpl(input, init);
	}
}

suite('AgentHostRequestService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(proxyResolver: TestProxyResolver): AgentHostRequestService {
		const environmentService = {
			args: { 'force-disable-user-env': true },
		} as unknown as INativeEnvironmentService;
		return disposables.add(new AgentHostRequestService(
			new TestConfigurationService(),
			environmentService,
			new NullLogService(),
			proxyResolver,
		));
	}

	test('uses resolver fetch and streams the response', async () => {
		const proxyResolver = new TestProxyResolver();
		proxyResolver.fetchImpl = () => Promise.resolve(new Response('response body', {
			status: 201,
			headers: { 'content-type': 'text/plain', 'x-test': 'value' },
		}));
		const service = createService(proxyResolver);

		const context = await service.request({
			url: 'https://example.com/resource',
			type: 'POST',
			headers: { 'x-request': 'header' },
			data: 'request body',
			callSite: 'agentHostRequestService.test',
		}, CancellationToken.None);
		const body = (await streamToBuffer(context.stream)).toString();

		assert.deepStrictEqual({
			input: proxyResolver.lastInput,
			method: proxyResolver.lastInit?.method,
			requestHeader: new Headers(proxyResolver.lastInit?.headers).get('x-request'),
			requestBody: proxyResolver.lastInit?.body,
			statusCode: context.res.statusCode,
			responseHeader: context.res.headers['x-test'],
			body,
		}, {
			input: 'https://example.com/resource',
			method: 'POST',
			requestHeader: 'header',
			requestBody: 'request body',
			statusCode: 201,
			responseHeader: 'value',
			body: 'response body',
		});
	});

	test('forwards cancellation to resolver fetch', async () => {
		const proxyResolver = new TestProxyResolver();
		proxyResolver.fetchImpl = (_input, init) => new Promise((_resolve, reject) => {
			init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
		});
		const service = createService(proxyResolver);
		const cancellation = disposables.add(new CancellationTokenSource());

		const request = service.request({
			url: 'https://example.com/slow',
			callSite: 'agentHostRequestService.test.cancellation',
		}, cancellation.token);
		cancellation.cancel();

		await assert.rejects(request, isCancellationError);
	});

	test('retries idempotent requests on transient errors', async () => {
		const proxyResolver = new TestProxyResolver();
		let attempts = 0;
		proxyResolver.fetchImpl = async () => {
			attempts++;
			if (attempts < 3) {
				const error = new Error('Connection refused') as NodeJS.ErrnoException;
				error.code = 'ECONNREFUSED';
				throw error;
			}
			return new Response('ok');
		};
		const service = createService(proxyResolver);

		const context = await service.request({
			url: 'https://example.com/retry',
			type: 'GET',
			callSite: 'agentHostRequestService.test.retry',
		}, CancellationToken.None);
		const body = (await streamToBuffer(context.stream)).toString();

		assert.deepStrictEqual({ attempts, body }, { attempts: 3, body: 'ok' });
	});

	test('does not retry non-idempotent requests', async () => {
		const proxyResolver = new TestProxyResolver();
		let attempts = 0;
		proxyResolver.fetchImpl = async () => {
			attempts++;
			const error = new Error('Connection refused') as NodeJS.ErrnoException;
			error.code = 'ECONNREFUSED';
			throw error;
		};
		const service = createService(proxyResolver);

		await assert.rejects(() => service.request({
			url: 'https://example.com/no-retry',
			type: 'POST',
			callSite: 'agentHostRequestService.test.noRetry',
		}, CancellationToken.None), /Connection refused/);

		assert.strictEqual(attempts, 1);
	});

	test('forwards proxy and authorization lookups through the client channel', async () => {
		const calls: unknown[] = [];
		const requestService = {
			resolveProxy: async (url: string) => {
				calls.push(['resolveProxy', url]);
				return 'PROXY proxy.example:8080';
			},
			lookupAuthorization: async (authInfo: AuthInfo) => {
				calls.push(['lookupAuthorization', authInfo]);
				return { username: 'user', password: 'password' };
			},
			lookupKerberosAuthorization: async (url: string) => {
				calls.push(['lookupKerberosAuthorization', url]);
				return 'Negotiate token';
			},
		} as IRequestService;
		const server = new AgentHostClientProxyChannel(requestService);
		const channel: IChannel = {
			call: (command, arg) => server.call(undefined, command, arg),
			listen: () => Event.None,
		};
		const connection = createAgentHostClientProxyConnection(channel);
		const authInfo: AuthInfo = { scheme: 'basic', host: 'proxy.example', port: 8080, realm: 'proxy', isProxy: true, attempt: 1 };

		const results = [
			await connection.resolveProxy('https://example.com'),
			await connection.lookupAuthorization(authInfo),
			await connection.lookupKerberosAuthorization('http://proxy.example:8080'),
		];

		assert.deepStrictEqual({ calls, results }, {
			calls: [
				['resolveProxy', 'https://example.com'],
				['lookupAuthorization', authInfo],
				['lookupKerberosAuthorization', 'http://proxy.example:8080'],
			],
			results: [
				'PROXY proxy.example:8080',
				{ username: 'user', password: 'password' },
				'Negotiate token',
			],
		});
	});
});

suite('NetworkDiagnosticsService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('includes nested proxy response errors', async () => {
		const proxyError = new Error('Proxy response (407)');
		const fetchError = new TypeError('fetch failed', { cause: new Error('dispatcher failed', { cause: proxyError }) });
		const requestService: IRequestService = {
			_serviceBrand: undefined,
			onDidCompleteRequest: Event.None,
			request: async () => { throw fetchError; },
			resolveProxy: async () => undefined,
			lookupAuthorization: async () => undefined,
			lookupKerberosAuthorization: async () => undefined,
			loadCertificates: async () => [],
		};
		const proxyResolver = new TestProxyResolver();
		const service = new NetworkDiagnosticsService(
			requestService,
			proxyResolver,
			new TestConfigurationService(),
			{ version: 'test' } as IProductService,
			new NullLogService(),
		);

		const result = await service.fetch('https://localhost');

		assert.strictEqual(result.error, 'fetch failed: dispatcher failed: Proxy response (407)');
	});
});
