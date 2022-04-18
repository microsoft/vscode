/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse as parseUrl, Url } from 'url';
import { isBoolean } from 'vs/base/common/types';

export type Agent = any;

function getSystemProxyURI(requestURL: Url, env: typeof process.env): string | null {
	if (requestURL.protocol === 'http:') {
		return env.HTTP_PROXY || env.http_proxy || null;
	} else if (requestURL.protocol === 'https:') {
		return env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || null;
	}

	return null;
}

function applySystemNoProxyRules(requestURL: Url, proxyURl: string | null, env: typeof process.env): string | null {
	const noProxy = env.NO_PROXY || env.no_proxy || null;
	if (!noProxy) {
		return proxyURl;
	}

	const rules = noProxy.split(/[\s,]+/);
	if (rules[0] === '*') {
		return null;
	}

	for (const rule of rules) {
		const ruleMatch = rule.match(/^(.+?)(?::(\d+))?$/);
		if (!ruleMatch || !ruleMatch[1]) {
			continue;
		}

		const ruleHost = ruleMatch[1].replace(/^\.*/, '.');
		const rulePort = ruleMatch[2];
		const requestURLHost = requestURL.hostname!.replace(/^\.*/, '.');
		if (requestURLHost.endsWith(ruleHost) && (!rulePort || requestURL.port && requestURL.port === rulePort)) {
			return null;
		}
	}

	return proxyURl;
}

export interface IOptions {
	proxyUrl?: string;
	strictSSL?: boolean;
}

export async function getProxyAgent(rawRequestURL: string, env: typeof process.env, options: IOptions = {}): Promise<Agent> {
	const requestURL = parseUrl(rawRequestURL);
	const proxyURL = options.proxyUrl || applySystemNoProxyRules(requestURL, getSystemProxyURI(requestURL, env), env);

	if (!proxyURL) {
		return null;
	}

	const proxyEndpoint = parseUrl(proxyURL);

	if (!/^https?:$/.test(proxyEndpoint.protocol || '')) {
		return null;
	}

	const opts = {
		host: proxyEndpoint.hostname || '',
		port: proxyEndpoint.port || (proxyEndpoint.protocol === 'https' ? '443' : '80'),
		auth: proxyEndpoint.auth,
		rejectUnauthorized: isBoolean(options.strictSSL) ? options.strictSSL : true,
	};

	return requestURL.protocol === 'http:'
		? new (await import('http-proxy-agent'))(opts as any as Url)
		: new (await import('https-proxy-agent'))(opts);
}
