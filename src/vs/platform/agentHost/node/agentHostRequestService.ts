/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { newWriteableBufferStream, VSBuffer, VSBufferWriteableStream } from '../../../base/common/buffer.js';
import { timeout } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../base/common/errors.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { IHeaders, IRequestContext, IRequestOptions } from '../../../base/parts/request/common/request.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { ILogService } from '../../log/common/log.js';
import { RequestService } from '../../request/node/requestService.js';
import { IAgentHostProxyResolver } from './agentHostProxyResolver.js';

const TRANSIENT_ERROR_CODES = new Set([
	'EAI_AGAIN',
	'ECONNREFUSED',
	'EHOSTDOWN',
	'EHOSTUNREACH',
	'ENETDOWN',
	'ENETUNREACH',
	'EPROTO',
]);

const IDEMPOTENT_HTTP_METHODS_REGEX = /^(GET|HEAD|OPTIONS)$/i;

function isTransientError(error: unknown): boolean {
	if (error instanceof Error) {
		const code = (error as NodeJS.ErrnoException).code;
		return !!code && TRANSIENT_ERROR_CODES.has(code);
	}
	return false;
}

/**
 * Request service implemented on the agent host's `@vscode/proxy-agent`
 * patched fetch, including renderer-backed system/PAC resolution and VS Code's
 * certificate settings. The base {@link RequestService} remains unchanged for
 * all other Node consumers.
 */
export class AgentHostRequestService extends RequestService {

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@ILogService logService: ILogService,
		@IAgentHostProxyResolver private readonly _proxyResolver: IAgentHostProxyResolver,
	) {
		super('local', configurationService, environmentService, logService);
	}

	override request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
		return this.logAndRequest(options, () => this._request(options, token));
	}

	override resolveProxy(url: string): Promise<string | undefined> {
		return this._proxyResolver.resolveProxy(url);
	}

	private async _request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
		const maxRetries = 3;
		let lastError: Error | undefined;
		const isIdempotent = IDEMPOTENT_HTTP_METHODS_REGEX.test(options.type || 'GET');

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				return await this._requestAttempt(options, token);
			} catch (error) {
				lastError = error as Error;
				if (isCancellationError(error)) {
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

	private async _requestAttempt(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		const cancellation = new AbortController();
		const cancellationListener = token.onCancellationRequested(() => cancellation.abort());
		const signal = options.timeout
			? AbortSignal.any([cancellation.signal, AbortSignal.timeout(options.timeout)])
			: cancellation.signal;

		try {
			const response = await this._proxyResolver.fetch(options.url || '', {
				method: options.type || 'GET',
				headers: getRequestHeaders(options),
				body: options.data,
				signal,
				cache: options.disableCache ? 'no-store' : undefined,
			});
			const stream = response.body
				? responseBodyToStream(response.body, cancellation, cancellationListener)
				: emptyResponseStream(cancellationListener);
			return {
				res: {
					statusCode: response.status,
					headers: getResponseHeaders(response),
				},
				stream,
			};
		} catch (error) {
			cancellationListener.dispose();
			if (error instanceof Error && error.name === 'AbortError') {
				throw new CancellationError();
			}
			if (error instanceof Error && error.name === 'TimeoutError') {
				throw new Error(`Fetch timeout: ${options.timeout}ms`);
			}
			throw error;
		}
	}
}

function getRequestHeaders(options: IRequestOptions): Headers | undefined {
	if (!options.headers && !options.user && !options.password && !options.proxyAuthorization) {
		return undefined;
	}
	const headers = new Headers();
	for (const key in options.headers) {
		const value = options.headers[key];
		if (typeof value === 'string') {
			headers.set(key, value);
		} else if (Array.isArray(value)) {
			for (const item of value) {
				headers.append(key, item);
			}
		}
	}
	if (options.user || options.password) {
		headers.set('Authorization', `Basic ${btoa(`${options.user || ''}:${options.password || ''}`)}`);
	}
	if (options.proxyAuthorization) {
		headers.set('Proxy-Authorization', options.proxyAuthorization);
	}
	return headers;
}

function getResponseHeaders(response: Response): IHeaders {
	const headers: IHeaders = Object.create(null);
	response.headers.forEach((value, key) => {
		headers[key] = value;
	});
	return headers;
}

function emptyResponseStream(cancellationListener: IDisposable): VSBufferWriteableStream {
	const stream = newWriteableBufferStream();
	stream.end();
	cancellationListener.dispose();
	return stream;
}

function responseBodyToStream(body: ReadableStream<Uint8Array>, cancellation: AbortController, cancellationListener: IDisposable): VSBufferWriteableStream {
	const reader = body.getReader();
	const stream = newWriteableBufferStream({ highWaterMark: 16 });
	const destroy = stream.destroy.bind(stream);
	stream.destroy = () => {
		cancellation.abort();
		void reader.cancel();
		cancellationListener.dispose();
		destroy();
	};
	void pumpResponseBody(reader, stream, cancellationListener);
	return stream;
}

async function pumpResponseBody(reader: ReadableStreamDefaultReader<Uint8Array>, stream: VSBufferWriteableStream, cancellationListener: IDisposable): Promise<void> {
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			await stream.write(VSBuffer.wrap(value));
		}
		stream.end();
	} catch (error) {
		stream.error(error instanceof Error ? error : new Error(String(error)));
		stream.end();
	} finally {
		cancellationListener.dispose();
	}
}
