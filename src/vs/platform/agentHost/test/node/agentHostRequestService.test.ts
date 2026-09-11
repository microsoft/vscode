/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { streamToBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, type DisposableStore } from '../../../../base/common/lifecycle.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { AuthInfo, IRequestService } from '../../../request/common/request.js';
import { AgentHostClientProxyChannel, createAgentHostClientProxyConnection, type IAgentHostClientProxyConnection } from '../../common/agentHostClientProxyChannel.js';
import { AgentHostProxyConfigKey } from '../../common/agentHostSchema.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostProxyResolver, IAgentHostProxyResolver } from '../../node/agentHostProxyResolver.js';
import { AgentHostRequestService } from '../../node/agentHostRequestService.js';
import { NetworkDiagnosticsService } from '../../node/networkDiagnosticsService.js';

class TestProxyResolver implements IAgentHostProxyResolver {
	declare readonly _serviceBrand: undefined;
	readonly onDidRegisterConnection = Event.None;
	readonly onDidChangeConfiguration = Event.None;

	lastInput: string | URL | Request | undefined;
	lastInit: RequestInit | undefined;
	fetchImpl: typeof globalThis.fetch = () => Promise.resolve(new Response());

	register(_clientId: string, _connection: IAgentHostClientProxyConnection) {
		return Disposable.None;
	}

	getConfigurationValue<T>(_key: string): T | undefined {
		return undefined;
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

class TestAgentHostProxyResolver extends AgentHostProxyResolver {
	kerberosLookup: { url: string; spn: string | undefined } | undefined;

	protected override async _lookupKerberosAuthorization(url: string, spn: string | undefined): Promise<string> {
		this.kerberosLookup = { url, spn };
		return 'token';
	}
}

function createAgentConfigurationService(disposables: Pick<DisposableStore, 'add'>): AgentConfigurationService {
	const logService = new NullLogService();
	const stateManager = disposables.add(new AgentHostStateManager(logService));
	return disposables.add(new AgentConfigurationService(stateManager, logService));
}

suite('AgentHostProxyResolver', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('fires when the first connection registers and after all connections reconnect', () => {
		const configurationService = createAgentConfigurationService(disposables);
		const resolver = disposables.add(new AgentHostProxyResolver(configurationService, new NullLogService()));
		let registrations = 0;
		disposables.add(resolver.onDidRegisterConnection(() => registrations++));
		const connection: IAgentHostClientProxyConnection = {
			resolveProxy: async () => undefined,
			lookupAuthorization: async () => undefined,
			lookupKerberosAuthorization: async () => undefined,
		};

		const first = disposables.add(resolver.register('first', connection));
		const afterFirst = registrations;
		const second = disposables.add(resolver.register('second', connection));
		const afterSecond = registrations;
		first.dispose();
		second.dispose();
		disposables.add(resolver.register('third', connection));

		assert.deepStrictEqual({ afterFirst, afterSecond, afterReconnect: registrations }, {
			afterFirst: 1,
			afterSecond: 1,
			afterReconnect: 2,
		});
	});

	test('reads manually configured proxy settings from Agent Host configuration', async () => {
		const configurationService = createAgentConfigurationService(disposables);
		const resolver = disposables.add(new AgentHostProxyResolver(configurationService, new NullLogService()));
		let configurationChanges = 0;
		disposables.add(resolver.onDidChangeConfiguration(() => configurationChanges++));
		configurationService.updateRootConfig({ [AgentHostProxyConfigKey.Proxy]: 'http://proxy.example:8080' });

		assert.deepStrictEqual({
			proxy: await resolver.resolveProxy('https://example.com'),
			configurationChanges,
		}, {
			proxy: 'http://proxy.example:8080',
			configurationChanges: 1,
		});
	});

	test('reads local mirrored proxy values as transient before construction', () => {
		const configurationService = createAgentConfigurationService(disposables);
		configurationService.updateRootConfig({ [AgentHostProxyConfigKey.Proxy]: 'http://stale-proxy.example:8080' });
		configurationService.publishRootTransientValues({ [AgentHostProxyConfigKey.Proxy]: undefined });
		const resolver = disposables.add(new AgentHostProxyResolver(configurationService, new NullLogService()));

		assert.deepStrictEqual({
			configuration: configurationService.getRootConfigValues?.()[AgentHostProxyConfigKey.Proxy],
			resolver: resolver.getConfigurationValue(AgentHostProxyConfigKey.Proxy),
		}, {
			configuration: undefined,
			resolver: undefined,
		});
	});

	test('uses manually configured Kerberos authentication without a renderer bridge', async () => {
		const configurationService = createAgentConfigurationService(disposables);
		configurationService.updateRootConfig({ [AgentHostProxyConfigKey.ProxyKerberosServicePrincipal]: 'HTTP/proxy.example' });
		const resolver = disposables.add(new TestAgentHostProxyResolver(configurationService, new NullLogService()));

		const authorization = await (resolver as unknown as {
			_hostLookupKerberosAuthorization(url: string): Promise<string | undefined>;
		})._hostLookupKerberosAuthorization('http://proxy.example:8080');

		assert.deepStrictEqual({
			authorization,
			lookup: resolver.kerberosLookup,
		}, {
			authorization: 'Negotiate token',
			lookup: {
				url: 'http://proxy.example:8080',
				spn: 'HTTP/proxy.example',
			},
		});
	});
});

suite('AgentHostRequestService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(proxyResolver: TestProxyResolver): AgentHostRequestService {
		return disposables.add(new AgentHostRequestService(
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

	// Verify that transient connection and proxy errors are successfully retried.
	// Tests both direct ErrnoExceptions and undici's TypeError('fetch failed', { cause }) wrappers.
	for (const { code, message, failCount } of [
		{ code: 'ECONNRESET', message: 'read ECONNRESET',   failCount: 2 },
		{ code: 'ETIMEDOUT',  message: 'connect ETIMEDOUT',  failCount: 1 },
		{ code: 'EPIPE',      message: 'write EPIPE',        failCount: 1 },
	]) {
		test(`retries idempotent GET on ${code} (direct ErrnoException)`, async () => {
			const proxyResolver = new TestProxyResolver();
			let attempts = 0;
			proxyResolver.fetchImpl = async () => {
				attempts++;
				if (attempts <= failCount) {
					const error = new Error(message) as NodeJS.ErrnoException;
					error.code = code;
					throw error;
				}
				return new Response('ok');
			};
			const service = createService(proxyResolver);

			const context = await service.request({
				url: `https://example.com/retry-${code.toLowerCase()}`,
				type: 'GET',
				callSite: `agentHostRequestService.test.${code.toLowerCase()}`,
			}, CancellationToken.None);
			const body = (await streamToBuffer(context.stream)).toString();

			assert.deepStrictEqual({ attempts, body }, { attempts: failCount + 1, body: 'ok' });
		});

		test(`retries idempotent GET on ${code} (undici TypeError wrapper)`, async () => {
			// Node/undici fetch wraps TCP errors as TypeError('fetch failed', { cause: ErrnoException })
			const proxyResolver = new TestProxyResolver();
			let attempts = 0;
			proxyResolver.fetchImpl = async () => {
				attempts++;
				if (attempts <= failCount) {
					const cause = new Error(message) as NodeJS.ErrnoException;
					cause.code = code;
					// Simulate undici's wrapping: TypeError('fetch failed') with cause
					throw new TypeError('fetch failed', { cause });
				}
				return new Response('ok');
			};
			const service = createService(proxyResolver);

			const context = await service.request({
				url: `https://example.com/retry-${code.toLowerCase()}-wrapped`,
				type: 'GET',
				callSite: `agentHostRequestService.test.${code.toLowerCase()}.wrapped`,
			}, CancellationToken.None);
			const body = (await streamToBuffer(context.stream)).toString();

			assert.deepStrictEqual({ attempts, body }, { attempts: failCount + 1, body: 'ok' });
		});
	}


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
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('reports the configured and environment Kerberos proxy SPN', async () => {
		const configurationService = createAgentConfigurationService(disposables);
		configurationService.updateRootConfig({
			[AgentHostProxyConfigKey.ProxyKerberosServicePrincipal]: 'HTTP/configured.proxy',
		});
		const previous = process.env['COPILOT_PROXY_KERBEROS_SPN'];
		process.env['COPILOT_PROXY_KERBEROS_SPN'] = 'HTTP/environment.proxy';
		const service = new NetworkDiagnosticsService(
			{
				_serviceBrand: undefined,
				onDidCompleteRequest: Event.None,
				request: async () => { throw new Error('not implemented'); },
				resolveProxy: async () => undefined,
				lookupAuthorization: async () => undefined,
				lookupKerberosAuthorization: async () => undefined,
				loadCertificates: async () => [],
			},
			new TestProxyResolver(),
			configurationService,
			{ version: 'test' } as IProductService,
			new NullLogService(),
		);
		try {
			const result = await service.getInfo([]);

			assert.deepStrictEqual({
				setting: result.proxySettings[AgentHostProxyConfigKey.ProxyKerberosServicePrincipal],
				environment: result.proxyEnv['COPILOT_PROXY_KERBEROS_SPN'],
			}, {
				setting: 'HTTP/configured.proxy',
				environment: 'HTTP/environment.proxy',
			});
		} finally {
			if (previous === undefined) {
				delete process.env['COPILOT_PROXY_KERBEROS_SPN'];
			} else {
				process.env['COPILOT_PROXY_KERBEROS_SPN'] = previous;
			}
		}
	});

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
		const configurationService = createAgentConfigurationService(disposables);
		const service = new NetworkDiagnosticsService(
			requestService,
			proxyResolver,
			configurationService,
			{ version: 'test' } as IProductService,
			new NullLogService(),
		);

		const result = await service.fetch('https://localhost');

		assert.strictEqual(result.error, 'fetch failed: dispatcher failed: Proxy response (407)');
	});
});
