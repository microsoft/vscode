/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Url, parse as parseUrl } from 'url';
import HttpProxyAgent = require('http-proxy-agent');
import HttpsProxyAgent = require('https-proxy-agent');

function getAgent(rawRequestURL: string, proxyURL: string, strictSSL: boolean = true): any {
	let requestURL = parseUrl(rawRequestURL);
	let proxyEndpoint = parseUrl(proxyURL);

	if (!/^https?:$/.test(proxyEndpoint.protocol)) {
		return null;
	}

	if (requestURL.protocol === 'http:') {
		return new HttpProxyAgent(proxyURL);
	}

	return new HttpsProxyAgent({
		host: proxyEndpoint.host,
		port: Number(proxyEndpoint.port),
		rejectUnauthorized: strictSSL
	});
}

function getSystemProxyURI(requestURL: Url): string {
	if (requestURL.protocol === 'http:') {
		return process.env.HTTP_PROXY || process.env.http_proxy || null;
	} else if (requestURL.protocol === 'https:') {
		return process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || null;
	}

	return null;
}

function getSystemProxyAgent(rawRequestURL: string): any {
	let requestURL = parseUrl(rawRequestURL);
	let proxyURL = getSystemProxyURI(requestURL);

	if (!proxyURL) {
		return null;
	}

	return getAgent(rawRequestURL, proxyURL);
}

export interface IOptions {
	proxyUrl?: string;
	strictSSL?: boolean;
}

export function getProxyAgent(rawRequestURL: string, options: IOptions = {}): any {
	console.log(rawRequestURL, options);

	if (!options.proxyUrl) {
		return getSystemProxyAgent(rawRequestURL);
	}

	return getAgent(rawRequestURL, options.proxyUrl, options.strictSSL);
}