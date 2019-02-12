/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isBoolean, isNumber } from 'vs/base/common/types';
import * as https from 'https';
import * as http from 'http';
import { Stream } from 'stream';
import { parse as parseUrl } from 'url';
import { createWriteStream } from 'fs';
import { assign } from 'vs/base/common/objects';
import { createGunzip } from 'zlib';
import { CancellationToken } from 'vs/base/common/cancellation';
import { canceled } from 'vs/base/common/errors';

export type Agent = any;

export interface IRawRequestFunction {
	(options: http.RequestOptions, callback?: (res: http.IncomingMessage) => void): http.ClientRequest;
}

export interface IRequestOptions {
	type?: string;
	url?: string;
	user?: string;
	password?: string;
	headers?: any;
	timeout?: number;
	data?: string | Stream;
	agent?: Agent;
	followRedirects?: number;
	strictSSL?: boolean;
	getRawRequest?(options: IRequestOptions): IRawRequestFunction;
}

export interface IRequestContext {
	// req: http.ClientRequest;
	// res: http.ClientResponse;
	res: {
		headers: { [n: string]: string };
		statusCode?: number;
	};
	stream: Stream;
}

export interface IRequestFunction {
	(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext>;
}

async function getNodeRequest(options: IRequestOptions): Promise<IRawRequestFunction> {
	const endpoint = parseUrl(options.url!);
	const module = endpoint.protocol === 'https:' ? await import('https') : await import('http');
	return module.request;
}

export function request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
	let req: http.ClientRequest;

	const rawRequestPromise = options.getRawRequest
		? Promise.resolve(options.getRawRequest(options))
		: Promise.resolve(getNodeRequest(options));

	return rawRequestPromise.then(rawRequest => {

		return new Promise<IRequestContext>((c, e) => {
			const endpoint = parseUrl(options.url!);

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

			req = rawRequest(opts, (res: http.IncomingMessage) => {
				const followRedirects: number = isNumber(options.followRedirects) ? options.followRedirects : 3;
				if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && followRedirects > 0 && res.headers['location']) {
					request(assign({}, options, {
						url: res.headers['location'],
						followRedirects: followRedirects - 1
					}), token).then(c, e);
				} else {
					let stream: Stream = res;

					if (res.headers['content-encoding'] === 'gzip') {
						stream = stream.pipe(createGunzip());
					}

					c({ res, stream } as IRequestContext);
				}
			});

			req.on('error', e);

			if (options.timeout) {
				req.setTimeout(options.timeout);
			}

			if (options.data) {
				if (typeof options.data === 'string') {
					req.write(options.data);
				} else {
					options.data.pipe(req);
					return;
				}
			}

			req.end();

			token.onCancellationRequested(() => {
				req.abort();
				e(canceled());
			});
		});
	});
}

function isSuccess(context: IRequestContext): boolean {
	return (context.res.statusCode && context.res.statusCode >= 200 && context.res.statusCode < 300) || context.res.statusCode === 1223;
}

function hasNoContent(context: IRequestContext): boolean {
	return context.res.statusCode === 204;
}

export function download(filePath: string, context: IRequestContext): Promise<void> {
	return new Promise<void>((c, e) => {
		const out = createWriteStream(filePath);

		out.once('finish', () => c(undefined));
		context.stream.once('error', e);
		context.stream.pipe(out);
	});
}

export function asText(context: IRequestContext): Promise<string | null> {
	return new Promise((c, e) => {
		if (!isSuccess(context)) {
			return e('Server returned ' + context.res.statusCode);
		}

		if (hasNoContent(context)) {
			return c(null);
		}

		let buffer: string[] = [];
		context.stream.on('data', (d: string) => buffer.push(d));
		context.stream.on('end', () => c(buffer.join('')));
		context.stream.on('error', e);
	});
}

export function asJson<T>(context: IRequestContext): Promise<T | null> {
	return new Promise((c, e) => {
		if (!isSuccess(context)) {
			return e('Server returned ' + context.res.statusCode);
		}

		if (hasNoContent(context)) {
			return c(null);
		}

		const buffer: string[] = [];
		context.stream.on('data', (d: string) => buffer.push(d));
		context.stream.on('end', () => {
			try {
				c(JSON.parse(buffer.join('')));
			} catch (err) {
				e(err);
			}
		});
		context.stream.on('error', e);
	});
}
