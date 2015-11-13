/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Promise, TPromise } from 'vs/base/common/winjs.base';
import https = require('https');
import http = require('http');
import { Url, parse as parseUrl } from 'url';
import { createWriteStream } from 'fs';
import { assign } from 'vs/base/common/objects';
import HttpProxyAgent = require('http-proxy-agent');
import HttpsProxyAgent = require('https-proxy-agent');

export interface IRequestOptions {
	type?: string;
	url?: string;
	user?: string;
	password?: string;
	headers?: any;
	timeout?: number;
	data?: any;
	agent?: any;
	followRedirects?: number;
}

export interface IRequestResult {
	req: http.ClientRequest;
	res: http.ClientResponse;
}

export function request(options: IRequestOptions): TPromise<IRequestResult> {
	var req: http.ClientRequest;

	return new TPromise<IRequestResult>((c, e) => {
		var endpoint = parseUrl(options.url);

		var opts: https.RequestOptions = {
			hostname: endpoint.hostname,
			port: endpoint.port ? parseInt(endpoint.port) : (endpoint.protocol === 'https:' ? 443 : 80),
			path: endpoint.path,
			method: options.type || 'GET',
			headers: options.headers,
			agent: options.agent
		};

		if (options.user && options.password) {
			opts.auth = options.user + ':' + options.password;
		}

		var protocol = endpoint.protocol === 'https:' ? https : http;
		req = protocol.request(opts, (res: http.ClientResponse) => {
			if (res.statusCode >= 300 && res.statusCode < 400 && options.followRedirects && options.followRedirects > 0 && res.headers['location']) {
				c(<any> request(assign({}, options, {
					url: res.headers['location'],
					followRedirects: options.followRedirects - 1
				})));
			} else {
				c({ req, res });
			}
		});
		req.on('error', e);

		options.timeout && req.setTimeout(options.timeout);
		options.data && req.write(options.data);

		req.end();
	},
	() => req && req.abort());
}

export function download(filePath: string, opts: IRequestOptions): Promise {
	return request(assign(opts, { followRedirects: 3 })).then(pair => new Promise((c, e) => {
		let out = createWriteStream(filePath);

		out.once('finish', () => c(null));
		pair.res.once('error', e);
		pair.res.pipe(out);
	}));
}

export function json<T>(opts: IRequestOptions): TPromise<T> {
	return request(opts).then(pair => new Promise((c, e) => {
		if (!((pair.res.statusCode >= 200 && pair.res.statusCode < 300) || pair.res.statusCode === 1223)) {
			return e('Server returned ' + pair.res.statusCode);
		}

		if (pair.res.statusCode === 204) {
			return c(null);
		}

		if (!/application\/json/.test(pair.res.headers['content-type'])) {
			return e('Response doesn\'t appear to be JSON');
		}

		var buffer: string[] = [];
		pair.res.on('data', d => buffer.push(d));
		pair.res.on('end', () => c(JSON.parse(buffer.join(''))));
		pair.res.on('error', e);
	}));
}

function getSystemProxyURI(requestURL: Url): string {
	if (requestURL.protocol === 'http:') {
		return process.env.HTTP_PROXY || process.env.http_proxy || null;
	} else if (requestURL.protocol === 'https:') {
		return process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || null;
	}

	return null;
}

export function getProxyAgent(rawRequestURL: string, proxyURL: string): any {
	let requestURL = parseUrl(rawRequestURL);
	let proxyEndpoint = parseUrl(proxyURL);

	if (!/^https?:$/.test(proxyEndpoint.protocol)) {
		return null;
	}

	return requestURL.protocol === 'http:' ? new HttpProxyAgent(proxyURL) : new HttpsProxyAgent(proxyURL);
}

export function getSystemProxyAgent(rawRequestURL: string): any {
	let requestURL = parseUrl(rawRequestURL);
	let proxyURL = getSystemProxyURI(requestURL);

	if (!proxyURL) {
		return null;
	}

	return getProxyAgent(rawRequestURL, proxyURL);
}