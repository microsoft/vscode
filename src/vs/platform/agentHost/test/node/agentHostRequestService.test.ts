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
import { LogLevel, NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { AuthInfo, IRequestService } from '../../../request/common/request.js';
import { AgentHostClientProxyChannel, createAgentHostClientProxyConnection, type IAgentHostClientProxyConnection } from '../../common/agentHostClientProxyChannel.js';
import { AgentHostProxyConfigKey } from '../../common/agentHostSchema.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostProxyResolver, IAgentHostProxyResolver, loadAgentHostCertificates } from '../../node/agentHostProxyResolver.js';
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

	createWebSocket(): never {
		throw new Error('not used');
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

	test('loads system and process CA certificates without changing the source arrays', async () => {
		const systemCertificates = ['system-ca'];
		const extraCertificates = ['extra-ca'];
		const certificates = await loadAgentHostCertificates(new NullLogService(), extraCertificates, async () => systemCertificates);

		assert.deepStrictEqual({ certificates, systemCertificates, extraCertificates }, {
			certificates: ['system-ca', 'extra-ca'],
			systemCertificates: ['system-ca'],
			extraCertificates: ['extra-ca'],
		});
	});

	test('preserves system CA certificates when no process CA certificates are supplied', async () => {
		const certificates = await loadAgentHostCertificates(new NullLogService(), [], async () => ['system-ca']);
		assert.deepStrictEqual(certificates, ['system-ca']);
	});

	test('propagates certificate loading errors', async () => {
		const error = new Error('Certificate loading failed');
		await assert.rejects(loadAgentHostCertificates(new NullLogService(), ['extra-ca'], async () => { throw error; }), error);
	});

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

	test('proxy resolution logs only the origins of the URLs it resolves (no path, query or userinfo)', async () => {
		const messages: string[] = [];
		const capture = (values: unknown[]) => messages.push(values.filter(value => typeof value === 'string').join(' '));
		const log = new class extends NullLogService {
			override getLevel(): LogLevel { return LogLevel.Trace; }
			override trace(message: string, ...args: unknown[]): void { capture([message, ...args]); }
			override debug(message: string, ...args: unknown[]): void { capture([message, ...args]); }
		};
		const resolver = disposables.add(new AgentHostProxyResolver(createAgentConfigurationService(disposables), log));
		await resolver.resolveProxy('https://acct.blob.core.windows.net/container/MAI-Code-1.1-Flash/5/model.gguf?sv=2024&sig=SECRET');
		assert.deepStrictEqual({
			leaked: messages.filter(message => /SECRET|sig=|container|MAI-Code|model\.gguf|\?/.test(message)),
			loggedOrigin: messages.some(message => message.includes('https://acct.blob.core.windows.net')),
		}, {
			leaked: [],
			loggedOrigin: true,
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

	test('returns redirects unfollowed only when followRedirects is 0', async () => {
		const proxyResolver = new TestProxyResolver();
		proxyResolver.fetchImpl = () => Promise.resolve(new Response(null, { status: 302, headers: { location: 'https://example.com/next' } }));
		const service = createService(proxyResolver);

		const manual = await service.request({ url: 'https://example.com/start', followRedirects: 0, callSite: 'agentHostRequestService.test.redirect' }, CancellationToken.None);
		const manualRedirect = proxyResolver.lastInit?.redirect;
		await service.request({ url: 'https://example.com/start', callSite: 'agentHostRequestService.test.redirectDefault' }, CancellationToken.None);
		const defaultRedirect = proxyResolver.lastInit?.redirect;

		assert.deepStrictEqual({ manualRedirect, defaultRedirect, status: manual.res.statusCode, location: manual.res.headers['location'] }, {
			manualRedirect: 'manual',
			defaultRedirect: undefined,
			status: 302,
			location: 'https://example.com/next',
		});
	});

	test('discarding a response aborts the fetch without an unhandled rejection', async () => {
		const proxyResolver = new TestProxyResolver();
		let aborted = false;
		proxyResolver.fetchImpl = (_input, init) => Promise.resolve(new Response(new ReadableStream<Uint8Array>({
			start(controller) {
				// Like undici: aborting the request errors the response body.
				init?.signal?.addEventListener('abort', () => {
					aborted = true;
					controller.error(new DOMException('This operation was aborted', 'AbortError'));
				});
			},
		})));
		const service = createService(proxyResolver);
		const context = await service.request({ url: 'https://example.com/blob', type: 'HEAD', callSite: 'agentHostRequestService.test.discard' }, CancellationToken.None);
		context.stream.destroy();
		// Give a rejected `cancel()` of the aborted body time to surface: the test harness fails on unhandled rejections.
		await new Promise(resolve => setTimeout(resolve, 20));
		assert.deepStrictEqual({ aborted }, { aborted: true });
	});

	test('logs request URLs without their query (SAS signatures), including on errors', async () => {
		const messages: string[] = [];
		const format = (values: unknown[]) => values.map(value => typeof value === 'string' ? value : JSON.stringify(value) ?? String(value)).join(' ');
		const log = new class extends NullLogService {
			override trace(message: string, ...args: unknown[]): void { messages.push(format([message, ...args])); }
			override error(message: string | Error, ...args: unknown[]): void { messages.push(format([message, ...args])); }
		};
		const proxyResolver = new TestProxyResolver();
		let fail = false;
		proxyResolver.fetchImpl = () => fail ? Promise.reject(new Error('socket hang up')) : Promise.resolve(new Response('ok'));
		const service = disposables.add(new AgentHostRequestService(log, proxyResolver));
		const url = 'https://acct.blob.core.windows.net/container/model.gguf?sv=2024&sig=SECRET';
		await service.request({ url, callSite: 'agentHostRequestService.test.log' }, CancellationToken.None);
		fail = true;
		await service.request({ url, callSite: 'agentHostRequestService.test.logError' }, CancellationToken.None).catch(() => undefined);
		assert.deepStrictEqual({
			fetchedUrl: proxyResolver.lastInput,
			leaked: messages.filter(message => message.includes('SECRET')),
			logged: messages.map(message => /#\d+: (?<url>\S+) - (?<what>\w+)/.exec(message)?.groups).map(groups => `${groups?.url} ${groups?.what}`),
		}, {
			fetchedUrl: url,
			leaked: [],
			logged: [
				'https://acct.blob.core.windows.net/container/model.gguf?<redacted> begin',
				'https://acct.blob.core.windows.net/container/model.gguf?<redacted> end',
				'https://acct.blob.core.windows.net/container/model.gguf?<redacted> begin',
				'https://acct.blob.core.windows.net/container/model.gguf?<redacted> error',
			],
		});
	});

	test('logs neither a redirect\'s signed Location nor a signed URL in an error, but returns the response unchanged', async () => {
		const messages: string[] = [];
		const format = (values: unknown[]) => values.map(value => typeof value === 'string' ? value : JSON.stringify(value) ?? String(value)).join(' ');
		const log = new class extends NullLogService {
			override trace(message: string, ...args: unknown[]): void { messages.push(format([message, ...args])); }
			override error(message: string | Error, ...args: unknown[]): void { messages.push(format([message, ...args])); }
		};
		const signed = 'https://acct.blob.core.windows.net/container/model.gguf?sv=2024&se=2026-10-09&sp=r&sr=b&skoid=OID&sig=LOCATIONSECRET';
		const proxyResolver = new TestProxyResolver();
		proxyResolver.fetchImpl = input => String(input).includes('/fail')
			? Promise.reject(new TypeError(`fetch failed: unexpected status from https://acct.blob.core.windows.net/c/model.gguf?sv=2024&sig=ERRORSECRET (relative /c/model.gguf?se=1&sig=RELATIVESECRET)`))
			: Promise.resolve(new Response(null, { status: 302, headers: { 'location': signed, 'content-location': '/c/model.gguf?sv=2024&sig=CONTENTSECRET', 'x-ms-diagnostics': `redirected to ${signed}`, 'x-ms-request-id': 'req-1' } }));
		const service = disposables.add(new AgentHostRequestService(log, proxyResolver));
		const redirect = await service.request({ url: 'https://eastus.api.azureml.ms/start', followRedirects: 0, callSite: 'agentHostRequestService.test.signedRedirect' }, CancellationToken.None);
		const failure = await service.request({ url: 'https://eastus.api.azureml.ms/fail', callSite: 'agentHostRequestService.test.signedError' }, CancellationToken.None).then(() => undefined, (error: Error) => error);
		assert.deepStrictEqual({
			leaked: messages.filter(message => /SECRET|sig=|skoid=|=OID|=2026-10-09/.test(message)),
			loggedLocation: messages.some(message => message.includes('"location":"https://acct.blob.core.windows.net/container/model.gguf?<redacted>"')),
			loggedRequestId: messages.some(message => message.includes('req-1')),
			response: { status: redirect.res.statusCode, location: redirect.res.headers['location'], contentLocation: redirect.res.headers['content-location'] },
			error: { name: failure?.name, message: failure?.message },
		}, {
			leaked: [],
			loggedLocation: true,
			loggedRequestId: true,
			// The caller follows the redirect itself: its response keeps the signed URL.
			response: { status: 302, location: signed, contentLocation: '/c/model.gguf?sv=2024&sig=CONTENTSECRET' },
			error: { name: 'TypeError', message: 'fetch failed: unexpected status from https://acct.blob.core.windows.net/c/model.gguf?<redacted> (relative /c/model.gguf?<redacted>&<redacted>)' },
		});
	});

	test('logUrl: false (local-model requests) logs only the host, the status and the error code, never the URL, a redirect or an error message', async () => {
		const messages: string[] = [];
		const format = (values: unknown[]) => values.map(value => typeof value === 'string' ? value : JSON.stringify(value) ?? String(value)).join(' ');
		const log = new class extends NullLogService {
			override trace(message: string, ...args: unknown[]): void { messages.push(format([message, ...args])); }
			override error(message: string | Error, ...args: unknown[]): void { messages.push(format([message, ...args])); }
		};
		const signed = 'https://acct.blob.core.windows.net/models/MAI-Code-1.1-Flash/5/model.gguf?sv=2024&se=2026-10-09&sig=SECRET';
		const proxyResolver = new TestProxyResolver();
		proxyResolver.fetchImpl = input => String(input).includes('/fail')
			? Promise.reject(new TypeError(`fetch failed for ${signed}`))
			: Promise.resolve(new Response(null, { status: 302, headers: { 'location': signed, 'x-ms-request-id': 'req-1' } }));
		const service = disposables.add(new AgentHostRequestService(log, proxyResolver));
		const redirect = await service.request({ url: signed, type: 'GET', followRedirects: 0, logUrl: false, callSite: 'agentHostRequestService.test.noUrl' }, CancellationToken.None);
		await service.request({ url: `${signed}&x=/fail`, type: 'HEAD', logUrl: false, callSite: 'agentHostRequestService.test.noUrlError' }, CancellationToken.None).catch(() => undefined);
		assert.deepStrictEqual({ messages, location: redirect.res.headers['location'] }, {
			messages: [
				'#1: acct.blob.core.windows.net - begin GET',
				'#1: acct.blob.core.windows.net - end GET 302',
				'#2: acct.blob.core.windows.net - begin HEAD',
				'#2: acct.blob.core.windows.net - error HEAD TypeError',
			],
			location: signed,
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
