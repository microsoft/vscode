/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse as parseUrl, Url } from 'url';
import { isBoolean } from 'vs/base/common/types';

export type Agent = any;

function getSystemProxyURI(requestURL: Url, env: typeof process.env): string | null {
	const proxy = requestURL.protocol === 'http:'
		? env.HTTP_PROXY || env.http_proxy || null
		: requestURL.protocol === 'https:'
			? env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || null
			: null;

	const noProxy = (env.NO_PROXY || env.no_proxy || '').trim().toLowerCase();
	if (noProxy === '*') {
		return null;
	}

	const filters = noProxy
		.split(',')
		.map(s => s.trim().split(':', 2))
		.map(([name, port]) => ({ name, port }))
		.filter(filter => !!filter.name)
		.map(({ name, port }) => {
			const domain = name[0] === '.' ? name : `.${name}`;
			return { domain, port };
		});
	const hostname = requestURL.hostname?.toLowerCase();
	const port = requestURL.port || (requestURL.protocol === 'https:' ? '443' : '80');
	if (hostname && filters.some(({ domain, port: filterPort }) => `.${hostname}`.endsWith(domain) && (!filterPort || port === filterPort))) {
		return null;
	}

	return proxy;
}

export interface IOptions {
	proxyUrl?: string;
	strictSSL?: boolean;
}

export async function getProxyAgent(rawRequestURL: string, env: typeof process.env, options: IOptions = {}): Promise<Agent> {
	const requestURL = parseUrl(rawRequestURL);
	const proxyURL = options.proxyUrl || getSystemProxyURI(requestURL, env);

	if (!proxyURL) {
		return null;
	}

	const proxyEndpoint = parseUrl(proxyURL);

	if (!/^https?:$/.test(proxyEndpoint.protocol || '')) {
		return null;
	}

	const opts = {
		host: proxyEndpoint.hostname || '',
		port: proxyEndpoint.port || (proxyEndpoint.protocol === 'https:' ? '443' : '80'),
		auth: proxyEndpoint.auth,
		rejectUnauthorized: isBoolean(options.strictSSL) ? options.strictSSL : true,
	};

	return requestURL.protocol === 'http:'
		? new (await import('http-proxy-agent'))(opts as any as Url)
		: new (await import('https-proxy-agent'))(opts);
}
