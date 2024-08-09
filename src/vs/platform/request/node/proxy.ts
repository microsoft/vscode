/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BlockList, IPVersion, isIP } from 'net';
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

export function urlMatchDenyList(requestUrl: Url, denyList: string[]): boolean {
	const getIPVersion = (input: string): IPVersion | null => {
		const version = isIP(input);
		if (![4, 6].includes(version)) {
			return null;
		}
		return version === 4 ? 'ipv4' : 'ipv6';
	};
	const blockList = new BlockList();
	let ipVersion: IPVersion | null = null;
	for (let denyHost of denyList) {
		if (denyHost === '') {
			continue;
		}
		// Blanket disable
		if (denyHost === '*') {
			return true;
		}
		// Full match
		if (requestUrl.hostname === denyHost || requestUrl.host === denyHost) {
			return true;
		}
		// Remove leading dots to validate suffixes
		if (denyHost[0] === '.') {
			denyHost = denyHost.substring(1);
		}
		if (requestUrl.hostname?.endsWith(denyHost)) {
			return true;
		}
		// IP+CIDR notation support, add those to our intermediate
		// blocklist to be checked afterwards
		if (ipVersion = getIPVersion(denyHost)) {
			blockList.addAddress(denyHost, ipVersion);
		}
		const cidrPrefixMatch = denyHost.match(/^(?<ip>.*)\/(?<cidrPrefix>\d+)$/);
		if (cidrPrefixMatch && cidrPrefixMatch.groups) {
			const matchedIP = cidrPrefixMatch.groups['ip'];
			const matchedPrefix = cidrPrefixMatch.groups['cidrPrefix'];
			if (matchedIP && matchedPrefix) {
				ipVersion = getIPVersion(matchedIP);
				const prefix = Number(matchedPrefix);
				if (ipVersion && prefix) {
					blockList.addSubnet(matchedIP, prefix, ipVersion);
				}
			}
		}
	}

	// Do a final check using block list if the requestUrl is an IP.
	// Importantly domain names are not first resolved to an IP to do this check in
	// line with how the rest of the ecosystem behaves
	const hostname = requestUrl.hostname;
	if (hostname && (ipVersion = getIPVersion(hostname)) && blockList.check(hostname, ipVersion)) {
		return true;
	}

	return false;
}

export function shouldProxyUrl(requestUrl: Url, noProxyConfig: string[], env: typeof process.env): boolean {
	// If option is set use that over anything else
	if (noProxyConfig.length !== 0) {
		return !urlMatchDenyList(requestUrl, noProxyConfig);
	}

	// Else look at the environment
	const noProxyEnv = env.no_proxy || env.NO_PROXY || null;
	if (noProxyEnv) {
		// Values are expected to be comma-separated, leading/trailing whitespaces are also removed from entries
		const envDenyList = noProxyEnv.split(',').map(entry => entry.trim());
		return !urlMatchDenyList(requestUrl, envDenyList);
	}

	return true;
}

export interface IOptions {
	proxyUrl?: string;
	strictSSL?: boolean;
	noProxy?: string[];
}

export async function getProxyAgent(rawRequestURL: string, env: typeof process.env, options: IOptions = {}): Promise<Agent> {
	const requestURL = parseUrl(rawRequestURL);
	const proxyURL = options.proxyUrl || getSystemProxyURI(requestURL, env);

	if (!proxyURL) {
		return null;
	}

	if (!shouldProxyUrl(requestURL, options.noProxy || [], env)) {
		return null;
	}

	const proxyEndpoint = parseUrl(proxyURL);

	if (!/^https?:$/.test(proxyEndpoint.protocol || '')) {
		return null;
	}

	const opts = {
		host: proxyEndpoint.hostname || '',
		port: (proxyEndpoint.port ? +proxyEndpoint.port : 0) || (proxyEndpoint.protocol === 'https' ? 443 : 80),
		auth: proxyEndpoint.auth,
		rejectUnauthorized: isBoolean(options.strictSSL) ? options.strictSSL : true,
	};

	if (requestURL.protocol === 'http:') {
		// ESM-comment-begin
		const mod = await import('http-proxy-agent');
		// ESM-comment-end
		// ESM-uncomment-begin
		// const mod = (await import('http-proxy-agent')).default;
		// ESM-uncomment-end
		return new mod.HttpProxyAgent(proxyURL, opts);
	} else {
		// ESM-comment-begin
		const mod = await import('https-proxy-agent');
		// ESM-comment-end
		// ESM-uncomment-begin
		// const mod = (await import('https-proxy-agent')).default;
		// ESM-uncomment-end
		return new mod.HttpsProxyAgent(proxyURL, opts);
	}
}
