/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { parse as parseUrl } from 'url';
import { getProxyAgent } from './proxy';
import https = require('https');
import http = require('http');

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

export interface IXHROptions {
	type?: string;
	url?: string;
	user?: string;
	password?: string;
	headers?: any;
	timeout?: number;
	data?: any;
	agent?: any;
	strictSSL?: boolean;
	responseType?: string;
	followRedirects?: number;
}

export interface IXHRResponse {
	responseText: string;
	status: number;
}

let proxyUrl: string = null;
let strictSSL: boolean = true;

function assign(destination: any, ...sources: any[]): any {
	sources.forEach(source => Object.keys(source).forEach((key) => destination[key] = source[key]));
	return destination;
}

export function configure(_proxyUrl: string, _strictSSL: boolean): void {
	proxyUrl = _proxyUrl;
	strictSSL = _strictSSL;
}

export function xhr(options: IXHROptions): Promise<IXHRResponse> {
	const agent = getProxyAgent(options.url, { proxyUrl, strictSSL });
	options = assign({}, options);
	options = assign(options, { agent, strictSSL });
	if (typeof options.followRedirects !== 'number') {
		options.followRedirects = 5;
	}

	return request(options).then(result => new Promise<IXHRResponse>((c, e) => {
		let res = result.res;
		let data: string[] = [];
		res.on('data', c => data.push(c));
		res.on('end', () => {
			if (options.followRedirects > 0 && (res.statusCode >= 300 && res.statusCode <= 303 || res.statusCode === 307)) {
				let location = res.headers['location'];
				if (location) {
					let newOptions = {
						type: options.type, url: location, user: options.user, password: options.password, responseType: options.responseType, headers: options.headers,
						timeout: options.timeout, followRedirects: options.followRedirects - 1, data: options.data
					};
					xhr(newOptions).then(c, e);
					return;
				}
			}

			let response: IXHRResponse = {
				responseText: data.join(''),
				status: res.statusCode
			};

			if ((res.statusCode >= 200 && res.statusCode < 300) || res.statusCode === 1223) {
				c(response);
			} else {
				e(response);
			}
		});
	}), err => {
		let message: string;

		if (agent) {
			message = 'Unable to to connect to ' + options.url + ' through a proxy . Error: ' + err.message;
		} else {
			message = 'Unable to to connect to ' + options.url + '. Error: ' + err.message;
		}

		return Promise.reject<IXHRResponse>({
			responseText: message,
			status: 404
		});
	});
}

interface IRequestResult {
	req: http.ClientRequest;
	res: http.ClientResponse;
}

function request(options: IXHROptions): Promise<IRequestResult> {
	let req: http.ClientRequest;

	return new Promise<IRequestResult>((c, e) => {
		let endpoint = parseUrl(options.url);

		let opts: https.RequestOptions = {
			hostname: endpoint.hostname,
			port: endpoint.port ? parseInt(endpoint.port) : (endpoint.protocol === 'https:' ? 443 : 80),
			path: endpoint.path,
			method: options.type || 'GET',
			headers: options.headers,
			agent: options.agent,
			rejectUnauthorized: (typeof options.strictSSL === 'boolean') ? options.strictSSL : true
		};

		if (options.user && options.password) {
			opts.auth = options.user + ':' + options.password;
		}

		let protocol = endpoint.protocol === 'https:' ? https : http;
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

		if (options.timeout) {
			req.setTimeout(options.timeout);
		}
		if (options.data) {
			req.write(options.data);
		}

		req.end();
	});
}

export function getErrorStatusDescription(status: number) : string {
	if (status < 400) {
		return void 0;
	}
	switch (status) {
		case 400: return localize('status.400', 'Bad request. The request cannot be fulfilled due to bad syntax.');
		case 401: return localize('status.401', 'Unauthorized. The server is refusing to respond.');
		case 403: return localize('status.403', 'Forbidden. The server is refusing to respond.');
		case 404: return localize('status.404', 'Not Found. The requested location could not be found.');
		case 405: return localize('status.405', 'Method not allowed. A request was made using a request method not supported by that location.');
		case 406: return localize('status.406', 'Not Acceptable. The server can only generate a response that is not accepted by the client.');
		case 407: return localize('status.407', 'Proxy Authentication Required. The client must first authenticate itself with the proxy.');
		case 408: return localize('status.408', 'Request Timeout. The server timed out waiting for the request.');
		case 409: return localize('status.409', 'Conflict. The request could not be completed because of a conflict in the request.');
		case 410: return localize('status.410', 'Gone. The requested page is no longer available.');
		case 411: return localize('status.411', 'Length Required. The "Content-Length" is not defined.');
		case 412: return localize('status.412', 'Precondition Failed. The precondition given in the request evaluated to false by the server.');
		case 413: return localize('status.413', 'Request Entity Too Large. The server will not accept the request, because the request entity is too large.');
		case 414: return localize('status.414', 'Request-URI Too Long. The server will not accept the request, because the URL is too long.');
		case 415: return localize('status.415', 'Unsupported Media Type. The server will not accept the request, because the media type is not supported.');
		case 500: return localize('status.500', 'Internal Server Error.');
		case 501: return localize('status.501', 'Not Implemented. The server either does not recognize the request method, or it lacks the ability to fulfill the request.');
		case 503: return localize('status.503', 'Service Unavailable. The server is currently unavailable (overloaded or down).');
		default: return localize('status.416', 'HTTP status code {0}', status);
	}
}