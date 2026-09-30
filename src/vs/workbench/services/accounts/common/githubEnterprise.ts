/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';

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
