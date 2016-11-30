/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Promise, TPromise } from 'vs/base/common/winjs.base';
import { isBoolean, isNumber } from 'vs/base/common/types';
import https = require('https');
import http = require('http');
import { Stream } from 'stream';
import { parse as parseUrl } from 'url';
import { createWriteStream } from 'fs';
import { assign } from 'vs/base/common/objects';
import { createGunzip } from 'zlib';

export type Agent = any;

export interface IRequestOptions {
	type?: string;
	url?: string;
	user?: string;
	password?: string;
	headers?: any;
	timeout?: number;
	data?: any;
	agent?: Agent;
	followRedirects?: number;
	strictSSL?: boolean;
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
	(options: IRequestOptions): TPromise<IRequestContext>;
}

export function request(options: IRequestOptions): TPromise<IRequestContext> {
	let req: http.ClientRequest;

	return new TPromise<IRequestContext>((c, e) => {
		const endpoint = parseUrl(options.url);
		const rawRequest = endpoint.protocol === 'https:' ? https.request : http.request;
		const opts: https.RequestOptions = {
			hostname: endpoint.hostname,
			port: endpoint.port ? parseInt(endpoint.port) : (endpoint.protocol === 'https:' ? 443 : 80),
			path: endpoint.path,
			method: options.type || 'GET',
			headers: options.headers,
			agent: options.agent,
			rejectUnauthorized: isBoolean(options.strictSSL) ? options.strictSSL : true
		};

		if (options.user && options.password) {
			opts.auth = options.user + ':' + options.password;
		}

		req = rawRequest(opts, (res: http.ClientResponse) => {
			const followRedirects = isNumber(options.followRedirects) ? options.followRedirects : 3;

			if (res.statusCode >= 300 && res.statusCode < 400 && followRedirects > 0 && res.headers['location']) {
				request(assign({}, options, {
					url: res.headers['location'],
					followRedirects: followRedirects - 1
				})).done(c, e);
			} else {
				let stream: Stream = res;

				if (res.headers['content-encoding'] === 'gzip') {
					stream = stream.pipe(createGunzip());
				}

				c({ res, stream });
			}
		});

		req.on('error', e);

		if (options.timeout) {
			req.setTimeout(options.timeout);
		}

		if (options.data) {
			req.write(options.data);
		}

		req.end();
	},
		() => req && req.abort());
}

function isSuccess(context: IRequestContext): boolean {
	return (context.res.statusCode >= 200 && context.res.statusCode < 300) || context.res.statusCode === 1223;
}

function hasNoContent(context: IRequestContext): boolean {
	return context.res.statusCode === 204;
}

export function download(filePath: string, context: IRequestContext): TPromise<void> {
	return new TPromise<void>((c, e) => {
		const out = createWriteStream(filePath);

		out.once('finish', () => c(null));
		context.stream.once('error', e);
		context.stream.pipe(out);
	});
}

export function asText(context: IRequestContext): TPromise<string> {
	return new Promise((c, e) => {
		if (!isSuccess(context)) {
			return e('Server returned ' + context.res.statusCode);
		}

		if (hasNoContent(context)) {
			return c(null);
		}

		let buffer: string[] = [];
		context.stream.on('data', d => buffer.push(d));
		context.stream.on('end', () => c(buffer.join('')));
		context.stream.on('error', e);
	});
}

export function asJson<T>(context: IRequestContext): TPromise<T> {
	return new Promise((c, e) => {
		if (!isSuccess(context)) {
			return e('Server returned ' + context.res.statusCode);
		}

		if (hasNoContent(context)) {
			return c(null);
		}

		if (!/application\/json/.test(context.res.headers['content-type'])) {
			return e('Response doesn\'t appear to be JSON');
		}

		const buffer: string[] = [];
		context.stream.on('data', d => buffer.push(d));
		context.stream.on('end', () => c(JSON.parse(buffer.join(''))));
		context.stream.on('error', e);
	});
}
