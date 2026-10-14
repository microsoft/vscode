/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ProxyAgentParams } from '@vscode/proxy-agent';
import { getErrorMessage } from '../../../base/common/errors.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { ILogService } from '../../log/common/log.js';
import { INativeHostService } from '../../native/common/native.js';
import { systemCertificatesNodeDefault } from '../../request/common/request.js';
import { getResolvedShellEnv } from '../../shell/node/shellEnv.js';

/** Creates a proxy-aware GitHub fetch using the utility process's native-host networking. */
export function createFetch(
	nativeHostService: INativeHostService,
	configurationService: IConfigurationService,
	environmentService: INativeEnvironmentService,
	logService: ILogService,
): typeof globalThis.fetch {
	let fetchPromise: Promise<typeof globalThis.fetch> | undefined;
	return async (input, init) => {
		const request = input instanceof Request && init === undefined ? input : new Request(input, init);
		const fetch = await (fetchPromise ??= createProxyFetch());
		request.signal.throwIfAborted();
		return fetch(request);
	};

	async function createProxyFetch(): Promise<typeof globalThis.fetch> {
		const [{ createFetchPatch, createProxyAuthorizationLookup, createProxyResolver, LogLevel }, { getCACertificates }] = await Promise.all([
			import('@vscode/proxy-agent'),
			import('tls'),
		]);

		let shellEnv: NodeJS.ProcessEnv | undefined;
		try {
			shellEnv = await getResolvedShellEnv(configurationService, logService, environmentService.args, process.env);
		} catch (error) {
			logService.error('[GitHubService] Resolving shell environment failed', getErrorMessage(error));
		}

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
			lookupAuthorization: authInfo => nativeHostService.lookupAuthorization(authInfo),
			lookupKerberosAuthorization: url => nativeHostService.lookupKerberosAuthorization(new URL(url).origin),
		});

		const params: ProxyAgentParams = {
			resolveProxy: url => nativeHostService.resolveProxy(url),
			getProxyURL: () => getConfigurationValue('http.proxy', ''),
			getProxySupport: () => 'override',
			getNoProxyConfig: () => getConfigurationValue<string[]>('http.noProxy', []),
			isAdditionalFetchSupportEnabled: () => true,
			isWebSocketPatchEnabled: () => false,
			addCertificatesV1: () => getConfigurationValue('http.systemCertificates', true),
			addCertificatesV2: () => false,
			loadSystemCertificatesFromNode: () => getConfigurationValue('http.systemCertificatesNode', systemCertificatesNodeDefault),
			loadAdditionalCertificates: async () => [...getCACertificates('default'), ...await nativeHostService.loadCertificates()],
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
			env: { ...process.env, ...shellEnv },
		};

		return createFetchPatch(params, globalThis.fetch, createProxyResolver(params).resolveProxyURL);
	}
}
