/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ProxyAgentParams } from '@vscode/proxy-agent';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILogService } from '../../log/common/log.js';
import { createFetch as createCommonFetch } from '../common/fetch.js';
import { IRequestService, systemCertificatesNodeDefault } from '../common/request.js';

export type FetchNetwork = Pick<IRequestService, 'resolveProxy' | 'lookupAuthorization' | 'lookupKerberosAuthorization' | 'loadCertificates'>;

/** Creates a locally configured, proxy-aware fetch without replacing the runtime's fetch behavior. */
export function createFetch(
	network: FetchNetwork,
	configurationService: IConfigurationService,
	logService: ILogService,
	env: NodeJS.ProcessEnv = process.env,
	fetchImpl: typeof globalThis.fetch = (input, init) => globalThis.fetch(input, init),
): typeof globalThis.fetch {
	let fetchPromise: Promise<typeof globalThis.fetch> | undefined;
	return createCommonFetch(async request => {
		const fetch = await (fetchPromise ??= createProxyFetch());
		request.signal.throwIfAborted();
		return fetch(request);
	});

	async function createProxyFetch(): Promise<typeof globalThis.fetch> {
		const [{ createFetchPatch, createProxyAuthorizationLookup, createProxyResolver, LogLevel }, { getCACertificates }] = await Promise.all([
			import('@vscode/proxy-agent'),
			import('tls'),
		]);
		const getConfigurationValue = <T>(key: string, fallback: T): T => {
			const value = configurationService.inspect<T>(key);
			return value.userLocalValue ?? value.defaultValue ?? fallback;
		};
		// Proxy-agent diagnostics can contain full URLs and authentication challenges.
		const log: ProxyAgentParams['log'] = {
			trace: () => logService.trace('[Fetch] Proxy resolver trace'),
			debug: () => logService.debug('[Fetch] Proxy resolver diagnostic'),
			info: () => logService.info('[Fetch] Proxy resolver information'),
			warn: () => logService.warn('[Fetch] Proxy or certificate lookup warning'),
			error: () => logService.error('[Fetch] Proxy or certificate lookup failed'),
		};
		const lookupAuthorization = createProxyAuthorizationLookup({
			log,
			lookupAuthorization: authInfo => network.lookupAuthorization(authInfo),
			lookupKerberosAuthorization: url => network.lookupKerberosAuthorization(new URL(url).origin),
		});
		const params: ProxyAgentParams = {
			resolveProxy: url => network.resolveProxy(url),
			getProxyURL: () => getConfigurationValue('http.proxy', ''),
			getProxySupport: () => 'override',
			getNoProxyConfig: () => getConfigurationValue<string[]>('http.noProxy', []),
			isAdditionalFetchSupportEnabled: () => true,
			isWebSocketPatchEnabled: () => false,
			addCertificatesV1: () => getConfigurationValue('http.systemCertificates', true),
			addCertificatesV2: () => false,
			loadSystemCertificatesFromNode: () => getConfigurationValue('http.systemCertificatesNode', systemCertificatesNodeDefault),
			loadAdditionalCertificates: async () => [...getCACertificates('default'), ...await network.loadCertificates()],
			lookupProxyAuthorization: async (url, challenge, state) => {
				const configured = getConfigurationValue<string | undefined>('http.proxyAuthorization', undefined);
				if (configured) {
					if (state.configuredProxyAuthorizationSent) {
						return undefined;
					}
					state.configuredProxyAuthorizationSent = true;
					return configured;
				}
				return lookupAuthorization(url, challenge, state);
			},
			log,
			getLogLevel: () => LogLevel.Error,
			proxyResolveTelemetry: () => { },
			isUseHostProxyEnabled: () => true,
			getNetworkInterfaceCheckInterval: () => getConfigurationValue('http.experimental.networkInterfaceCheckInterval', 300) * 1000,
			env,
		};
		return createFetchPatch(params, fetchImpl, createProxyResolver(params).resolveProxyURL);
	}
}
