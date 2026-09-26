/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ConfigurationTarget, IConfigurationService, isConfigured } from '../../../../platform/configuration/common/configuration.js';

export const gitHubEnterpriseUrisSetting = 'github-enterprise.uris';

/** Reads enrollment configuration, never the destination for an authenticated request. */
export function getConfiguredGitHubEnterpriseUris(configurationService: IConfigurationService, isWorkspaceTrusted: boolean, legacySetting = 'github-enterprise.uri'): readonly string[] {
	const inspected = configurationService.inspect<readonly string[]>(gitHubEnterpriseUrisSetting);
	const configured = isConfigured(isWorkspaceTrusted ? inspected : { ...inspected, workspaceValue: undefined, workspaceFolderValue: undefined });
	const legacy = configurationService.getValue<string>(legacySetting);
	const uris = configured ? configurationService.getValue<readonly string[]>(gitHubEnterpriseUrisSetting) : legacy ? [legacy] : [];
	if (!Array.isArray(uris) || uris.some(uri => typeof uri !== 'string')) {
		throw new Error(localize('invalidGitHubEnterpriseUris', "GitHub Enterprise URIs must be an array of instance URLs."));
	}
	return uris;
}

export async function addGitHubEnterpriseUri(configurationService: IConfigurationService, uri: string, isWorkspaceTrusted: boolean, legacySetting = 'github-enterprise.uri'): Promise<void> {
	const uris = getConfiguredGitHubEnterpriseUris(configurationService, isWorkspaceTrusted, legacySetting);
	if (!uris.includes(uri)) {
		const target = isWorkspaceTrusted && configurationService.inspect(gitHubEnterpriseUrisSetting).workspaceValue !== undefined ? ConfigurationTarget.WORKSPACE : ConfigurationTarget.USER;
		await configurationService.updateValue(gitHubEnterpriseUrisSetting, [...uris, uri], target);
	}
}

/** Returns the enterprise base identified by a session's OAuth issuer, never by configuration. */
export function getGitHubEnterpriseUri(authorizationServer: URI | undefined): URI | undefined {
	if (!authorizationServer) {
		return undefined;
	}
	try {
		const url = new URL(authorizationServer.toString());
		const hostname = url.hostname.endsWith('.') ? url.hostname.slice(0, -1) : url.hostname;
		if (!['http:', 'https:'].includes(url.protocol)
			|| ['github.com', 'www.github.com', 'api.github.com'].includes(hostname)
			|| url.username || url.password || url.search || url.hash) {
			return undefined;
		}
		const path = authorizationServer.path;
		const suffix = '/login/oauth';
		if (!path.endsWith(suffix) || path.includes('//') || path.split('/').some(part => part === '.' || part === '..')) {
			return undefined;
		}
		return authorizationServer.with({
			scheme: authorizationServer.scheme.toLowerCase(),
			authority: authorizationServer.authority.toLowerCase(),
			path: path.slice(0, -suffix.length),
		});
	} catch {
		return undefined;
	}
}
