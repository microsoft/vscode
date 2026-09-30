/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ProxyAgentParams } from '@vscode/proxy-agent';
import type { Dispatcher } from 'undici';
import { CancellationError } from '../../../base/common/errors.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILogService } from '../../log/common/log.js';
import { createFetchRequest, IFetchService } from '../common/fetch.js';
import { IRequestService, systemCertificatesNodeDefault } from '../common/request.js';

export type NodeFetchNetwork = Pick<IRequestService, 'resolveProxy' | 'lookupAuthorization' | 'lookupKerberosAuthorization' | 'loadCertificates'>;

export class NodeFetchService extends Disposable implements IFetchService {

	declare readonly _serviceBrand: undefined;

	private fetchPromise: Promise<typeof globalThis.fetch> | undefined;
	private readonly dispatchers = new Set<Dispatcher>();

	constructor(
		private readonly network: NodeFetchNetwork,
		private readonly fetchImpl: typeof globalThis.fetch | undefined = undefined,
		private readonly env: NodeJS.ProcessEnv = process.env,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(toDisposable(() => this.disposeDispatchers()));
	}

	async fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
		const request = createFetchRequest(input, init);
		request.signal.throwIfAborted();
		const fetch = await (this.fetchPromise ??= this.createFetch());
		request.signal.throwIfAborted();
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		return fetch(request);
	}

	private async createFetch(): Promise<typeof globalThis.fetch> {
		const [{ createFetchPatch, createProxyAuthorizationLookup, createProxyResolver, LogLevel }, { Agent }, { getCACertificates }] = await Promise.all([
			import('@vscode/proxy-agent'),
			import('undici'),
			import('tls'),
		]);
		if (this._store.isDisposed) {
			throw new CancellationError();
		}

		// Proxy-agent diagnostics can contain full URLs and authentication challenges.
		const log = {
			trace: () => this.logService.trace('[Fetch] Proxy resolver trace'),
			debug: () => this.logService.debug('[Fetch] Proxy resolver diagnostic'),
			info: () => this.logService.info('[Fetch] Proxy resolver information'),
			warn: () => this.logService.warn('[Fetch] Proxy or certificate lookup warning'),
			error: () => this.logService.error('[Fetch] Proxy or certificate lookup failed'),
		};
		const lookupAuthorization = createProxyAuthorizationLookup({
			log,
			lookupAuthorization: authInfo => this.network.lookupAuthorization(authInfo),
			lookupKerberosAuthorization: url => this.network.lookupKerberosAuthorization(new URL(url).origin),
		});
		const params: ProxyAgentParams = {
			resolveProxy: url => this.network.resolveProxy(url),
			getProxyURL: () => this.getConfigurationValue('http.proxy', ''),
			getProxySupport: () => 'override',
			getNoProxyConfig: () => this.getConfigurationValue<string[]>('http.noProxy', []),
			isAdditionalFetchSupportEnabled: () => true,
			isWebSocketPatchEnabled: () => false,
			addCertificatesV1: () => this.getConfigurationValue('http.systemCertificates', true),
			addCertificatesV2: () => false,
			loadSystemCertificatesFromNode: () => this.getConfigurationValue('http.systemCertificatesNode', systemCertificatesNodeDefault),
			loadAdditionalCertificates: async () => [...getCACertificates('default'), ...await this.network.loadCertificates()],
			lookupProxyAuthorization: async (url, challenge, state) => {
				const configured = this.getConfigurationValue<string | undefined>('http.proxyAuthorization', undefined);
				if (configured) {
					if (state.configuredProxyAuthorizationSent) {
						return undefined;
					}
					state.configuredProxyAuthorizationSent = true;
					return configured;
				}
				return lookupAuthorization(url, challenge, state);
			},
			log,
			getLogLevel: () => LogLevel.Error,
			proxyResolveTelemetry: () => { },
			isUseHostProxyEnabled: () => true,
			getNetworkInterfaceCheckInterval: () => this.getConfigurationValue('http.experimental.networkInterfaceCheckInterval', 300) * 1000,
			env: this.env,
		};
		// Disable connection-level replay; the caller owns even safe-read retries.
		const singleAttempt: Dispatcher.DispatcherComposeInterceptor = dispatch => (options, handler) => dispatch({ ...options, idempotent: false }, handler);
		const dispatcher = new Agent().compose(singleAttempt);
		this.dispatchers.add(dispatcher);
		const invokeFetch: typeof globalThis.fetch = (input, init?: RequestInit & { dispatcher?: Dispatcher }) => {
			if (init?.dispatcher) {
				this.dispatchers.add(init.dispatcher);
			}
			if (this._store.isDisposed) {
				this.disposeDispatchers();
				throw new CancellationError();
			}
			return this.fetchImpl ? this.fetchImpl(input, init) : this.request(input, init);
		};
		const patchedFetch = createFetchPatch(params, invokeFetch, createProxyResolver(params).resolveProxyURL, { interceptors: [singleAttempt] });
		return (input, init) => {
			const options: RequestInit & { dispatcher: Dispatcher } = { ...init, dispatcher };
			return patchedFetch(input, options);
		};
	}

	private getConfigurationValue<T>(key: string, fallback: T): T {
		const value = this.configurationService.inspect<T>(key);
		return value.userLocalValue ?? value.defaultValue ?? fallback;
	}

	private async request(input: string | URL | Request, init?: RequestInit & { dispatcher?: Dispatcher }): Promise<Response> {
		const [{ request: sendRequest }, { Readable }, { DecompressionStream }] = await Promise.all([
			import('undici'),
			import('stream'),
			import('stream/web'),
		]);
		const request = createFetchRequest(input, init);
		request.signal.throwIfAborted();
		const data = request.body ? new Uint8Array(await request.arrayBuffer()) : undefined;
		request.signal.throwIfAborted();
		const headers = new Headers(request.headers);
		if (!headers.has('accept-encoding')) {
			headers.set('accept-encoding', 'gzip, deflate, br');
		}

		// Unlike fetch, request exposes HTTP 421 without automatically sending another attempt.
		const result = await sendRequest(request.url, {
			dispatcher: init?.dispatcher,
			method: request.method,
			headers: Object.fromEntries(headers),
			body: data,
			signal: request.signal,
			idempotent: false,
			highWaterMark: 64 * 1024,
		});
		let body = Readable.toWeb(result.body, { strategy: { highWaterMark: 0 } });
		let responseBody: ReadableStream<Uint8Array> | undefined;
		try {
			const responseHeaders = new Headers();
			for (const [name, value] of Object.entries(result.headers)) {
				for (const header of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
					responseHeaders.append(name, header);
				}
			}
			const noBody = request.method === 'HEAD' || [204, 205, 304].includes(result.statusCode);
			if (noBody) {
				await body.cancel();
			} else {
				const encodings = responseHeaders.get('content-encoding')?.toLowerCase().split(',').map(value => value.trim()) ?? [];
				if (encodings.every(encoding => ['gzip', 'x-gzip', 'deflate', 'br'].includes(encoding))) {
					for (const encoding of encodings.reverse()) {
						body = body.pipeThrough(new DecompressionStream(encoding === 'br' ? 'brotli' : encoding === 'deflate' ? 'deflate' : 'gzip'));
					}
				}
				const reader = body.getReader();
				responseBody = new ReadableStream<Uint8Array>({
					pull: async controller => {
						try {
							const chunk = await reader.read();
							if (chunk.done) {
								reader.releaseLock();
								controller.close();
							} else {
								controller.enqueue(chunk.value);
							}
						} catch (error) {
							reader.releaseLock();
							controller.error(error);
						}
					},
					cancel: reason => {
						const cancelled = reader.cancel(reason);
						reader.releaseLock();
						return cancelled;
					},
				}, { highWaterMark: 0 });
			}
			const response = new Response(responseBody ?? null, {
				status: result.statusCode,
				statusText: result.statusText,
				headers: responseHeaders,
			});
			Object.defineProperty(response, 'url', { value: request.url });
			return response;
		} catch (error) {
			void (responseBody ?? body).cancel().catch(() => this.logService.warn('[Fetch] Failed to cancel a response body'));
			throw error;
		}
	}

	private disposeDispatchers(): void {
		for (const dispatcher of this.dispatchers) {
			void dispatcher.destroy().catch(() => this.logService.warn('[Fetch] Failed to close a network dispatcher'));
		}
		this.dispatchers.clear();
	}
}
