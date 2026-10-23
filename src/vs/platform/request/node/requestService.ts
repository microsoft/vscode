/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as http from 'http';
import type * as https from 'https';
import { parse as parseUrl } from 'url';
import { Promises, timeout } from '../../../base/common/async.js';
import { streamToBufferReadableStream } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError, getErrorMessage } from '../../../base/common/errors.js';
import * as streams from '../../../base/common/stream.js';
import { isBoolean, isNumber } from '../../../base/common/types.js';
import { IHeaders, IRequestContext, IRequestOptions } from '../../../base/parts/request/common/request.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { getResolvedShellEnv } from '../../shell/node/shellEnv.js';
import { ILogService } from '../../log/common/log.js';
import { AbstractRequestService, AuthInfo, Credentials, IRequestService, systemCertificatesNodeDefault } from '../common/request.js';
import { Agent, getProxyAgent } from './proxy.js';
import { createGunzip } from 'zlib';

const TRANSIENT_ERROR_CODES = new Set([
	'EAI_AGAIN',     // DNS lookup timed out
	'ECONNREFUSED',  // Connection refused by server
	'EHOSTDOWN',     // Host is down
	'EHOSTUNREACH',  // No route to host
	'ENETDOWN',      // Network is down
	'ENETUNREACH',   // Network is unreachable
	'EPROTO'         // Protocol error (TLS/SSL handshake failure)
]);

const IDEMPOTENT_HTTP_METHODS_REGEX = /^(GET|HEAD|OPTIONS)$/i;

function isTransientError(error: unknown): boolean {
	if (error instanceof Error) {
		const code = (error as NodeJS.ErrnoException).code;
		return !!code && TRANSIENT_ERROR_CODES.has(code);
	}
	return false;
}

export interface IRawRequestFunction {
	(options: http.RequestOptions, callback?: (res: http.IncomingMessage) => void): http.ClientRequest;
}

export interface NodeRequestOptions extends IRequestOptions {
	agent?: Agent;
	strictSSL?: boolean;
	isChromiumNetwork?: boolean;
	getRawRequest?(options: IRequestOptions): IRawRequestFunction;
}

/**
 * This service exposes the `request` API, while using the global
 * or configured proxy settings.
 */
export class RequestService extends AbstractRequestService implements IRequestService {

	declare readonly _serviceBrand: undefined;

	private proxyUrl?: string;
	private strictSSL: boolean | undefined;
	private authorization?: string;
	private shellEnvErrorLogged?: boolean;

	constructor(
		private readonly machine: 'local' | 'remote',
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@ILogService logService: ILogService,
	) {
		super(logService);
		this.configure();
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('http')) {
				this.configure();
			}
		}));
	}

	private configure() {
		this.proxyUrl = this.getConfigValue<string>('http.proxy');
		this.strictSSL = !!this.getConfigValue<boolean>('http.proxyStrictSSL');
		this.authorization = this.getConfigValue<string>('http.proxyAuthorization');
	}

	async request(options: NodeRequestOptions, token: CancellationToken): Promise<IRequestContext> {
		const { proxyUrl, strictSSL } = this;

		let shellEnv: typeof process.env | undefined = undefined;
		try {
			shellEnv = await getResolvedShellEnv(this.configurationService, this.logService, this.environmentService.args, process.env);
		} catch (error) {
			if (!this.shellEnvErrorLogged) {
				this.shellEnvErrorLogged = true;
				this.logService.error(`resolving shell environment failed`, getErrorMessage(error));
			}
		}

		const env = {
			...process.env,
			...shellEnv
		};
		const agent = options.agent ? options.agent : await getProxyAgent(options.url || '', env, { proxyUrl, strictSSL });

		options.agent = agent;
		options.strictSSL = strictSSL;

		if (this.authorization) {
			options.headers = {
				...(options.headers || {}),
				'Proxy-Authorization': this.authorization
			};
		}

		return this.logAndRequest(options, () => nodeRequest(options, token));
	}

	async resolveProxy(url: string): Promise<string | undefined> {
		return undefined; // currently not implemented in node
	}

	async lookupAuthorization(authInfo: AuthInfo): Promise<Credentials | undefined> {
		return undefined; // currently not implemented in node
	}

	async lookupKerberosAuthorization(urlStr: string): Promise<string | undefined> {
		try {
			const spnConfig = this.getConfigValue<string>('http.proxyKerberosServicePrincipal');
			const response = await lookupKerberosAuthorization(urlStr, spnConfig, this.logService, 'RequestService#lookupKerberosAuthorization');
			return 'Negotiate ' + response;
		} catch (err) {
			this.logService.debug('RequestService#lookupKerberosAuthorization Kerberos authentication failed', err);
			return undefined;
		}
	}

	async loadCertificates(): Promise<string[]> {
		const proxyAgent = await import('@vscode/proxy-agent');
		return proxyAgent.loadSystemCertificates({
			loadSystemCertificatesFromNode: () => this.getConfigValue<boolean>('http.systemCertificatesNode', systemCertificatesNodeDefault),
			log: this.logService,
		});
	}

	private getConfigValue<T>(key: string, fallback?: T): T | undefined {
		if (this.machine === 'remote') {
			return this.configurationService.getValue<T>(key);
		}
		const values = this.configurationService.inspect<T>(key);
		return values.userLocalValue ?? values.defaultValue ?? fallback;
	}
}

export async function lookupKerberosAuthorization(urlStr: string, spnConfig: string | undefined, logService: ILogService, logPrefix: string) {
	const importKerberos = await import('kerberos');
	const kerberos = importKerberos.default || importKerberos;
	const url = new URL(urlStr);
	const spn = spnConfig
		|| (process.platform === 'win32' ? `HTTP/${url.hostname}` : `HTTP@${url.hostname}`);
	logService.debug(`${logPrefix} Kerberos authentication lookup`, `proxyURL:${url}`, `spn:${spn}`);
	const client = await kerberos.initializeClient(spn);
	return client.step('');
}

async function getNodeRequest(options: IRequestOptions): Promise<IRawRequestFunction> {
	const endpoint = parseUrl(options.url!);
	const module = endpoint.protocol === 'https:' ? await import('https') : await import('http');

	return module.request;
}

function resolveRedirectTarget(currentUrl: string, location: string): { url: string; crossOrigin: boolean } | undefined {
	try {
		const current = new URL(currentUrl);
		const target = new URL(location, current);
		if (target.protocol === 'http:' || target.protocol === 'https:') {
			return { url: target.toString(), crossOrigin: current.origin !== target.origin };
		}
	} catch {
		// An invalid redirect is returned to the caller without following it.
	}
	return undefined;
}

function stripOriginCredentialHeaders(headers: IHeaders | undefined): IHeaders | undefined {
	if (!headers) {
		return headers;
	}
	const result: IHeaders = {};
	for (const name of Object.keys(headers)) {
		switch (name.toLowerCase()) {
			case 'authorization':
			case 'cookie':
			case 'cookie2':
				break;
			default:
				result[name] = headers[name];
		}
	}
	return result;
}

export async function nodeRequest(options: NodeRequestOptions, token: CancellationToken): Promise<IRequestContext> {
	const maxRetries = 3;
	let lastError: Error | undefined;
	const isIdempotent = IDEMPOTENT_HTTP_METHODS_REGEX.test(options.type || 'GET');

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await nodeRequestAttempt(options, token);
		} catch (error) {
			lastError = error as Error;
			if (error instanceof CancellationError) {
				throw error;
			}

			if (!isIdempotent || !isTransientError(error) || attempt === maxRetries) {
				throw error;
			}

			await timeout(100 * attempt, token);
		}
	}

	throw lastError;
}

async function nodeRequestAttempt(options: NodeRequestOptions, token: CancellationToken): Promise<IRequestContext> {
	return Promises.withAsyncBody<IRequestContext>(async (resolve, reject) => {
		const endpoint = parseUrl(options.url!);
		const rawRequest = options.getRawRequest
			? options.getRawRequest(options)
			: await getNodeRequest(options);

		const opts: https.RequestOptions & { cache?: 'default' | 'no-store' | 'reload' | 'no-cache' | 'force-cache' | 'only-if-cached'; redirect?: 'manual' } = {
			hostname: endpoint.hostname,
			port: endpoint.port ? parseInt(endpoint.port) : (endpoint.protocol === 'https:' ? 443 : 80),
			protocol: endpoint.protocol,
			path: endpoint.path,
			method: options.type || 'GET',
			headers: options.headers,
			agent: options.agent,
			rejectUnauthorized: isBoolean(options.strictSSL) ? options.strictSSL : true
		};

		if (options.user && options.password) {
			opts.auth = options.user + ':' + options.password;
		}

		if (options.disableCache) {
			opts.cache = 'no-store';
		}

		if (options.isChromiumNetwork) {
			opts.redirect = 'manual';
		}

		const followRedirect = (statusCode: number | undefined, location: string | undefined, method = options.type): boolean => {
			const followRedirects: number = isNumber(options.followRedirects) ? options.followRedirects : 3;
			const target = statusCode && statusCode >= 300 && statusCode < 400 && followRedirects > 0 && location
				? resolveRedirectTarget(options.url!, location)
				: undefined;
			if (target) {
				nodeRequest({
					...options,
					url: target.url,
					type: method,
					data: method !== (options.type || 'GET') && (method === 'GET' || method === 'HEAD') ? undefined : options.data,
					followRedirects: followRedirects - 1,
					headers: target.crossOrigin ? stripOriginCredentialHeaders(options.headers) : options.headers,
					user: target.crossOrigin ? undefined : options.user,
					password: target.crossOrigin ? undefined : options.password
				}, token).then(resolve, reject);
				return true;
			}
			return false;
		};

		const req = rawRequest(opts, (res: http.IncomingMessage) => {
			if (followRedirect(res.statusCode, res.headers['location'])) {
				res.resume();
			} else {
				let stream: streams.ReadableStreamEvents<Uint8Array> = res;

				// Responses from Electron net module should be treated as response
				// from browser, which will apply gzip filter and decompress the response
				// using zlib before passing the result to us. Following step can be bypassed
				// in this case and proceed further.
				// Refs https://source.chromium.org/chromium/chromium/src/+/main:net/url_request/url_request_http_job.cc;l=1266-1318
				if (!options.isChromiumNetwork && res.headers['content-encoding'] === 'gzip') {
					stream = res.pipe(createGunzip());
				}

				resolve({ res, stream: streamToBufferReadableStream(stream) } satisfies IRequestContext);
			}
		});

		req.on('error', reject);

		if (options.isChromiumNetwork) {
			req.on('redirect', (statusCode: number, method: string, redirectUrl: string, headers: IHeaders) => {
				// Electron reports redirects separately from responses. Abort synchronously so
				// Chromium cannot follow with the original credentials or cancel with an error.
				req.abort();
				if (!followRedirect(statusCode, redirectUrl, method)) {
					resolve({ res: { statusCode, headers }, stream: streams.emptyStream() });
				}
			});
		}

		// Handle timeout
		if (options.timeout) {
			// Chromium network requests do not support the `timeout` option
			if (options.isChromiumNetwork) {
				// Use Node's setTimeout for Chromium network requests
				const timeout = setTimeout(() => {
					req.abort();
					reject(new Error(`Request timeout after ${options.timeout}ms`));
				}, options.timeout);

				// Clear timeout when request completes
				req.on('response', () => clearTimeout(timeout));
				req.on('error', () => clearTimeout(timeout));
				req.on('abort', () => clearTimeout(timeout));
			} else {
				req.setTimeout(options.timeout);
			}
		}

		// Chromium will abort the request if forbidden headers are set.
		// Ref https://source.chromium.org/chromium/chromium/src/+/main:services/network/public/cpp/header_util.cc;l=14-48;
		// for additional context.
		if (options.isChromiumNetwork) {
			req.removeHeader('Content-Length');
		}

		if (options.data) {
			if (typeof options.data === 'string') {
				req.write(options.data);
			}
		}

		req.end();

		const cancellationListener = token.onCancellationRequested(() => {
			cancellationListener.dispose();
			req.abort();

			reject(new CancellationError());
		});

		req.on('response', () => cancellationListener.dispose());
		req.on('error', () => cancellationListener.dispose());
		req.on('abort', () => cancellationListener.dispose());
	});
}
