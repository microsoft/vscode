/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type ProxyHeaders = { [key: string]: string };

const LLM_HOSTNAMES = new Set([
	'api.githubcopilot.com',
	'api.individual.githubcopilot.com',
	'api.business.githubcopilot.com',
	'api.enterprise.githubcopilot.com',
	'api-model-lab.githubcopilot.com',
]);

export function isLLMEndpoint(url: string): boolean {
	try {
		return LLM_HOSTNAMES.has(new URL(url).hostname);
	} catch {
		return false;
	}
}

/**
 * Returns the configured headroom proxy URL, if any.
 *
 * Priority order:
 * 1. `vsCodeSettingUrl` — value of the `github.copilot.chat.proxy.url` VS Code setting
 *    (persists regardless of how VS Code is launched).
 * 2. `COPILOT_PROXY_URL` environment variable — fallback for dev / terminal-launched VS Code.
 */
export function getConfiguredProxyUrl(vsCodeSettingUrl?: string): string | undefined {
	if (vsCodeSettingUrl) {
		return vsCodeSettingUrl;
	}
	if (typeof process !== 'undefined' && process.env) {
		return process.env['COPILOT_PROXY_URL'];
	}
	return undefined;
}

export function maybeInterceptUrlThroughProxy(
	originalUrl: string,
	proxyBaseUrl: string,
	headers: ProxyHeaders,
): string {
	try {
		const originalParsed = new URL(originalUrl);
		const proxyParsed = new URL(proxyBaseUrl);

		headers['X-Original-Url'] = originalUrl;
		headers['X-Original-Host'] = originalParsed.hostname;

		const basePath = proxyParsed.pathname.replace(/\/$/, '');
		const proxyUrl = new URL(basePath + originalParsed.pathname + originalParsed.search, proxyBaseUrl);
		return proxyUrl.toString();
	} catch {
		return originalUrl;
	}
}
