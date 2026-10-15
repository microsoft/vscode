/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { bufferToStream, VSBuffer } from '../../../common/buffer.js';
import { CancellationToken } from '../../../common/cancellation.js';
import { canceled } from '../../../common/errors.js';
import { clearMarks, mark } from '../../../common/performance.js';
import { StopWatch } from '../../../common/stopwatch.js';
import { IHeaders, IRequestContext, IRequestOptions, OfflineError } from './request.js';

export async function request(options: IRequestOptions, token: CancellationToken, isOnline?: () => boolean, fetcher: typeof fetch = fetch): Promise<IRequestContext> {
	if (token.isCancellationRequested) {
		throw canceled();
	}

	const cancellation = new AbortController();
	const disposable = token.onCancellationRequested(() => cancellation.abort());
	const signal = options.timeout ? AbortSignal.any([
		cancellation.signal,
		AbortSignal.timeout(options.timeout),
	]) : cancellation.signal;
	const watch = options.diagnosticId ? StopWatch.create(false) : undefined;
	const marks: string[] = [];
	let phase = 'headers';
	const trace = (event: string) => {
		if (options.diagnosticId) {
			const name = `code/request/${options.diagnosticId}/${event}`;
			marks.push(name);
			mark(name);
		}
	};

	try {
		const fetchInit: RequestInit = {
			method: options.type || 'GET',
			headers: getRequestHeaders(options),
			body: options.data,
			signal
		};
		if (options.disableCache) {
			fetchInit.cache = 'no-store';
		}
		if (options.followRedirects === 0) {
			fetchInit.redirect = 'manual';
		}
		trace('start');
		const res = await fetcher(options.url || '', fetchInit);
		const responseHeadersMs = watch?.elapsed();
		trace('headersReceived');
		phase = 'body';
		const body = new Uint8Array(await res.arrayBuffer());
		const responseBodyMs = watch && responseHeadersMs !== undefined ? watch.elapsed() - responseHeadersMs : undefined;
		trace('bodyReceived');
		return {
			res: {
				statusCode: res.status,
				headers: getResponseHeaders(res),
			},
			stream: bufferToStream(VSBuffer.wrap(body)),
			...(responseHeadersMs !== undefined && responseBodyMs !== undefined ? {
				timings: { responseHeadersMs, responseBodyMs, decodedBodyBytes: body.byteLength },
			} : {}),
		};
	} catch (err) {
		trace(`${phase}/${token.isCancellationRequested || err?.name === 'AbortError' ? 'cancelled' : 'failed'}`);
		if (isOnline && !isOnline()) {
			throw new OfflineError();
		}
		if (err?.name === 'AbortError') {
			throw canceled();
		}
		if (err?.name === 'TimeoutError') {
			throw new Error(`Fetch timeout: ${options.timeout}ms`);
		}
		throw err;
	} finally {
		disposable.dispose();
		for (const name of marks) {
			clearMarks(name);
		}
	}
}

function getRequestHeaders(options: IRequestOptions) {
	if (options.headers || options.user || options.password || options.proxyAuthorization) {
		const headers = new Headers();
		outer: for (const k in options.headers) {
			switch (k.toLowerCase()) {
				case 'user-agent':
				case 'accept-encoding':
				case 'content-length':
					// unsafe headers
					continue outer;
			}
			const header = options.headers[k];
			if (typeof header === 'string') {
				headers.set(k, header);
			} else if (Array.isArray(header)) {
				for (const h of header) {
					headers.append(k, h);
				}
			}
		}
		if (options.user || options.password) {
			headers.set('Authorization', 'Basic ' + btoa(`${options.user || ''}:${options.password || ''}`));
		}
		if (options.proxyAuthorization) {
			headers.set('Proxy-Authorization', options.proxyAuthorization);
		}
		return headers;
	}
	return undefined;
}

function getResponseHeaders(res: Response): IHeaders {
	const headers: IHeaders = Object.create(null);
	res.headers.forEach((value, key) => {
		if (headers[key]) {
			if (Array.isArray(headers[key])) {
				headers[key].push(value);
			} else {
				headers[key] = [headers[key], value];
			}
		} else {
			headers[key] = value;
		}
	});
	return headers;
}
