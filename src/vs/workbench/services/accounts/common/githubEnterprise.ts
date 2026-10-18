/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../base/common/arrays.js';
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

export async function addGitHubEnterpriseUri(configurationService: IConfigurationService, uri: string, isWorkspaceTrusted: boolean, legacySetting = 'github-enterprise.uri', replacedUri?: string): Promise<void> {
	if (!isValidGitHubEnterpriseUri(uri)) {
		throw new Error(localize('invalidGitHubEnterpriseUri', "Invalid GitHub Enterprise instance URI: {0}", uri));
	}
	const uris = getConfiguredGitHubEnterpriseUris(configurationService, isWorkspaceTrusted, legacySetting);
	const updated = uris.filter(value => value !== replacedUri);
	if (!updated.includes(uri)) {
		updated.push(uri);
	}
	if (!equals(uris, updated)) {
		const target = isWorkspaceTrusted && configurationService.inspect(gitHubEnterpriseUrisSetting).workspaceValue !== undefined ? ConfigurationTarget.WORKSPACE : ConfigurationTarget.USER;
		await configurationService.updateValue(gitHubEnterpriseUrisSetting, updated, target);
	}
}

function isGitHubEnterpriseEndpoint(uri: URI): boolean {
	const url = new URL(uri.toString());
	const hostname = url.hostname.endsWith('.') ? url.hostname.slice(0, -1) : url.hostname;
	return ['http:', 'https:'].includes(url.protocol)
		&& !['github.com', 'www.github.com', 'api.github.com'].includes(hostname)
		&& !url.username && !url.password && !url.search && !url.hash
		&& !uri.path.includes('//') && !uri.path.split('/').some(part => part === '.' || part === '..');
}

export function isValidGitHubEnterpriseUri(value: string): boolean {
	try {
		const uri = URI.parse(value, true);
		return !!uri.authority && isGitHubEnterpriseEndpoint(uri.with({ path: uri.path.replace(/\/+$/, '') }));
	} catch {
		return false;
	}
}

export const enum GheParseResultKind {
	Empty = 'empty',
	SingleWord = 'singleWord',
	FullUri = 'fullUri',
	Invalid = 'invalid',
}

type GheParseResult =
	| { readonly kind: GheParseResultKind.Empty }
	| { readonly kind: GheParseResultKind.SingleWord; readonly resolvedUri: string }
	| { readonly kind: GheParseResultKind.FullUri; readonly resolvedUri: string }
	| { readonly kind: GheParseResultKind.Invalid };

/** Accepts a GHE.com instance name or HTTPS URL for Copilot enrollment. */
export function parseGheInstanceInput(value: string): GheParseResult {
	const trimmed = value.trim();
	if (!trimmed) {
		return { kind: GheParseResultKind.Empty };
	}
	if (/^[a-zA-Z0-9-]+$/.test(trimmed)) {
		return { kind: GheParseResultKind.SingleWord, resolvedUri: `https://${trimmed}.ghe.com` };
	}
	const resolvedUri = /^(?:[a-zA-Z0-9-]+\.)+ghe\.com\/?$/i.test(trimmed) ? `https://${trimmed}` : trimmed;
	return /^https:\/\/(?:[a-zA-Z0-9-]+\.)+ghe\.com\/?$/i.test(resolvedUri) ? { kind: GheParseResultKind.FullUri, resolvedUri } : { kind: GheParseResultKind.Invalid };
}

/** Returns the enterprise base identified by a session's OAuth issuer, never by configuration. */
export function getGitHubEnterpriseUri(authorizationServer: URI | undefined): URI | undefined {
	if (!authorizationServer) {
		return undefined;
	}
	try {
		const path = authorizationServer.path;
		const suffix = '/login/oauth';
		if (!isGitHubEnterpriseEndpoint(authorizationServer) || !path.endsWith(suffix)) {
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
