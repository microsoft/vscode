/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { rtrim } from '../../../../base/common/strings.js';
import { GitHubAuthorizationContext } from '../../../../platform/github/common/githubTypes.js';
import { AuthenticationSession } from '../../../services/authentication/common/authentication.js';

export function normalizeGitHubUrl(url: string): string {
	// If the url has a .git suffix, remove it
	if (url.endsWith('.git')) {
		url = url.substr(0, url.length - 4);
	}

	// Remove trailing slash
	url = rtrim(url, '/');

	if (url.endsWith('/new')) {
		url = rtrim(url, '/new');
	}

	if (url.endsWith('/issues')) {
		url = rtrim(url, '/issues');
	}

	return url;
}

export function getGitHubAuthorization(session: AuthenticationSession): GitHubAuthorizationContext {
	return {
		providerId: 'github',
		sessionId: session.id,
		accountId: session.account.id,
		scopes: [...session.scopes],
		authorizationServer: session.authorizationServer?.toString(),
	};
}
