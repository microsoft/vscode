/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import * as https from 'https';
import { parse as parseUrl } from 'url';
import { Promises } from 'vs/base/common/async';
import { streamToBufferReadableStream } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { CancellationError, getErrorMessage } from 'vs/base/common/errors';
import * as streams from 'vs/base/common/stream';
import { isBoolean, isNumber } from 'vs/base/common/types';
import { IRequestContext, IRequestOptions } from 'vs/base/parts/request/common/request';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { getResolvedShellEnv } from 'vs/platform/shell/node/shellEnv';
import { ILogService, ILoggerService } from 'vs/platform/log/common/log';
import { AbstractRequestService, IRequestService } from 'vs/platform/request/common/request';
import { Agent, getProxyAgent } from 'vs/platform/request/node/proxy';
import { createGunzip } from 'zlib';

interface IHTTPConfiguration {
	proxy?: string;
	proxyStrictSSL?: boolean;
	proxyAuthorization?: string;
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
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@ILogService private readonly logService: ILogService,
		@ILoggerService loggerService: ILoggerService
	) {
		super(loggerService);
		this.configure();
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('http')) {
				this.configure();
			}
		}));
	}

	private configure() {
		const config = this.configurationService.getValue<IHTTPConfiguration | undefined>('http');

		this.proxyUrl = config?.proxy;
		this.strictSSL = !!config?.proxyStrictSSL;
		this.authorization = config?.proxyAuthorization;
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

		return this.logAndRequest(options.isChromiumNetwork ? 'electron' : 'node', options, () => nodeRequest(options, token));
	}

	async resolveProxy(url: string): Promise<string | undefined> {
		return undefined; // currently not implemented in node
	}
}

async function getNodeRequest(options: IRequestOptions): Promise<IRawRequestFunction> {
	const endpoint = parseUrl(options.url!);
	const module = endpoint.protocol === 'https:' ? await import('https') : await import('http');

	return module.request;
}

export async function nodeRequest(options: NodeRequestOptions, token: CancellationToken): Promise<IRequestContext> {
	return Promises.withAsyncBody<IRequestContext>(async (resolve, reject) => {
		const endpoint = parseUrl(options.url!);
		const rawRequest = options.getRawRequest
			? options.getRawRequest(options)
			: await getNodeRequest(options);

		const opts: https.RequestOptions = {
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

		const req = rawRequest(opts, (res: http.IncomingMessage) => {
			const followRedirects: number = isNumber(options.followRedirects) ? options.followRedirects : 3;
			if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && followRedirects > 0 && res.headers['location']) {
				nodeRequest({
					...options,
					url: res.headers['location'],
					followRedirects: followRedirects - 1
				}, token).then(resolve, reject);
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

				resolve({ res, stream: streamToBufferReadableStream(stream) } as IRequestContext);
			}
		});

		req.on('error', reject);

		if (options.timeout) {
			req.setTimeout(options.timeout);
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

		token.onCancellationRequested(() => {
			req.abort();

			reject(new CancellationError());
		});
	});
}
