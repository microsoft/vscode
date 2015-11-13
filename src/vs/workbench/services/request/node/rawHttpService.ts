/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { assign } from 'vs/base/common/objects';
import { Url, parse as parseUrl } from 'url';
import { request, IRequestOptions } from 'vs/base/node/request';

import HttpProxyAgent = require('http-proxy-agent');
import HttpsProxyAgent = require('https-proxy-agent');

export interface IXHROptions extends IRequestOptions {
	responseType?: string;
	followRedirects: number;
}

export interface IXHRResponse {
	responseText: string;
	status: number;
}

let proxyConfiguration: string = null;

export function configure(proxyURI: string): void {
	proxyConfiguration = proxyURI;
}

function getProxyURI(uri: Url): string {
	let proxyURI = proxyConfiguration;
	if (!proxyURI) {
		if (uri.protocol === 'http:') {
			proxyURI = process.env.HTTP_PROXY || process.env.http_proxy || null;
		} else if (uri.protocol === 'https:') {
			proxyURI = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || null;
		}
	}
	return proxyURI;
}

function getProxyAgent(uri: Url): any {
	let proxyURI = getProxyURI(uri);
	if (proxyURI) {
		let proxyEndpoint = parseUrl(proxyURI);
		switch (proxyEndpoint.protocol) {
			case 'http:':
			case 'https:':
				return uri.protocol === 'http:' ? new HttpProxyAgent(proxyURI) : new HttpsProxyAgent(proxyURI);
		}
	}
	return void 0;
}

export function xhr(options: IXHROptions): TPromise<IXHRResponse> {
	let endpoint = parseUrl(options.url);
	options = assign({}, options);
	options = assign(options, { agent: getProxyAgent(endpoint) });

	return request(options).then(result => new TPromise<IXHRResponse>((c, e, p) => {
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
					xhr(newOptions).done(c, e, p);
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
	}, err => {
		let endpoint = parseUrl(options.url);
		let agent = getProxyAgent(endpoint);
		let message: string;

		if (agent) {
			message = 'Unable to to connect to ' + options.url + ' through proxy ' + getProxyURI(endpoint) + '. Error: ' + err.message;
		} else {
			message = 'Unable to to connect to ' + options.url + '. Error: ' + err.message;
		}

		return TPromise.wrapError<IXHRResponse>({
			responseText: message,
			status: 404
		});
	}));
}
