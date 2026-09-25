/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type { AuthenticationSession } from 'vscode';
import { URI } from '../../../util/vs/base/common/uri';
import { AuthProviderId } from '../../configuration/common/configurationService';

/** Resolves a built-in GitHub session's deployment without consulting provider settings. */
export function resolveGitHubSessionUri(session: AuthenticationSession, providerId: AuthProviderId): URI {
	if (!session.authorizationServer) {
		throw new Error(l10n.t('The GitHub authentication session is incompatible because it does not identify an authorization server.'));
	}
	const uri = URI.from(session.authorizationServer);
	if (!/^https?$/i.test(uri.scheme) || !uri.authority || /[@%\\\s]/.test(uri.authority)
		|| uri.query || uri.fragment || !uri.path.endsWith('/login/oauth')) {
		throw new Error(l10n.t('The GitHub authentication session has an unsupported authorization server.'));
	}

	// URL validates the authority; URI preserves its explicit port and path namespace.
	const url = new URL(uri.toString());
	const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
	const deployment = uri.with({
		scheme: uri.scheme.toLowerCase(),
		authority: uri.authority.toLowerCase(),
		path: uri.path.slice(0, -'/login/oauth'.length) || '/',
	});
	if (providerId === AuthProviderId.GitHub
		? deployment.toString() !== 'https://github.com/'
		: ['github.com', 'www.github.com', 'api.github.com'].includes(hostname)) {
		throw new Error(l10n.t('The GitHub authentication session does not belong to the selected provider.'));
	}
	return deployment;
}

export function authenticationSessionIdentityEquals(a: AuthenticationSession | undefined, b: AuthenticationSession | undefined): boolean {
	return a?.account.id === b?.account.id
		&& a?.authorizationServer?.toString() === b?.authorizationServer?.toString();
}
