/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Url, parse as parseUrl } from 'url';
import { isBoolean } from 'vs/base/common/types';
import { Agent } from './request';
import { TPromise } from 'vs/base/common/winjs.base';
import { winJSRequire } from 'vs/base/common/async';


function getSystemProxyURI(requestURL: Url): string {
	if (requestURL.protocol === 'http:') {
		return process.env.HTTP_PROXY || process.env.http_proxy || null;
	} else if (requestURL.protocol === 'https:') {
		return process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || null;
	}

	return null;
}

export interface IOptions {
	proxyUrl?: string;
	strictSSL?: boolean;
}

export async function getProxyAgent(rawRequestURL: string, options: IOptions = {}): TPromise<Agent> {
	const requestURL = parseUrl(rawRequestURL);
	const proxyURL = options.proxyUrl || getSystemProxyURI(requestURL);

	if (!proxyURL) {
		return null;
	}

	const proxyEndpoint = parseUrl(proxyURL);

	if (!/^https?:$/.test(proxyEndpoint.protocol)) {
		return null;
	}

	const opts = {
		host: proxyEndpoint.hostname,
		port: Number(proxyEndpoint.port),
		auth: proxyEndpoint.auth,
		rejectUnauthorized: isBoolean(options.strictSSL) ? options.strictSSL : true
	};

	const Ctor = requestURL.protocol === 'http:'
		? await winJSRequire<typeof import('http-proxy-agent')>('http-proxy-agent')
		: await winJSRequire<typeof import('https-proxy-agent')>('https-proxy-agent');

	return new Ctor(opts);
}
