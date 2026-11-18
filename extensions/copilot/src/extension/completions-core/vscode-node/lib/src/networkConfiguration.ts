/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IAuthenticationService } from '../../../../../platform/authentication/common/authentication';
import { ICAPIClientService } from '../../../../../platform/endpoint/common/capiClient';
import { ServicesAccessor } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { CopilotToken } from './auth/copilotTokenManager';
import { BuildInfo, ConfigKey, ConfigKeyType, getConfig } from './config';
import { ICompletionsRuntimeModeService } from './util/runtimeMode';
import { joinPath } from './util/uri';

type ServiceEndpoints = {
	proxy: string;
	'origin-tracker': string;
};

function getDefaultEndpoints(accessor: ServicesAccessor): ServiceEndpoints {
	const capi = accessor.get(ICAPIClientService);
	return {
		proxy: capi.proxyBaseURL,
		'origin-tracker': capi.originTrackerURL,
	};
}

/**
 * If a configuration value has been configured for any of `overrideKeys`, returns
 * that value. If `testOverrideKeys` is supplied and the run mode is test,
 * `testOverrideKeys` is used instead of `overrideKeys`.
 */
function urlConfigOverride(
	accessor: ServicesAccessor,
	overrideKeys: ConfigKeyType[],
	testOverrideKeys?: ConfigKeyType[]
): string | undefined {
	if (testOverrideKeys !== undefined && accessor.get(ICompletionsRuntimeModeService).isRunningInTest()) {
		for (const overrideKey of testOverrideKeys) {
			const override = getConfig<string>(accessor, overrideKey);
			if (override) { return override; }
		}
		return undefined;
	}

	for (const overrideKey of overrideKeys) {
		const override = getConfig<string>(accessor, overrideKey);
		if (override) { return override; }
	}
	return undefined;
}

function getEndpointOverrideUrl(accessor: ServicesAccessor, endpoint: keyof ServiceEndpoints): string | undefined {
	switch (endpoint) {
		case 'proxy':
			return urlConfigOverride(
				accessor,
				[ConfigKey.DebugOverrideProxyUrl, ConfigKey.DebugOverrideProxyUrlLegacy],
				[ConfigKey.DebugTestOverrideProxyUrl, ConfigKey.DebugTestOverrideProxyUrlLegacy]
			);
		case 'origin-tracker':
			if (!BuildInfo.isProduction()) {
				return urlConfigOverride(accessor, [ConfigKey.DebugSnippyOverrideUrl]);
			}
	}
}

export function getEndpointUrl(
	accessor: ServicesAccessor,
	token: CopilotToken,
	endpoint: keyof ServiceEndpoints,
	...paths: string[]
): string {
	const root = getEndpointOverrideUrl(accessor, endpoint) ?? (token.endpoints ? token.endpoints[endpoint] : undefined) ?? getDefaultEndpoints(accessor)[endpoint];
	return joinPath(root, ...paths);
}

/**
 * Return the endpoints from the most recent token, or fall back to the defaults if we don't have one.
 * Generally you should be using token.endpoints or getEndpointUrl() instead.
 */
export function getLastKnownEndpoints(accessor: ServicesAccessor) {
	return accessor.get(IAuthenticationService).copilotToken?.endpoints ?? getDefaultEndpoints(accessor);
}

