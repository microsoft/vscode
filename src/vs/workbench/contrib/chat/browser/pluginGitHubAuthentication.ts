/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../platform/log/common/log.js';
import { AuthenticationSession, IAuthenticationService } from '../../../services/authentication/common/authentication.js';

/**
 * Returns an existing GitHub session token without prompting.
 */
export async function getExistingGitHubAuthenticationToken(authenticationService: IAuthenticationService, logService: ILogService, requiredScopes: readonly string[] = []): Promise<string | undefined> {
	return (await getExistingGitHubAuthenticationSession(authenticationService, logService, requiredScopes))?.accessToken;
}

/** Returns an existing GitHub session without prompting, preferring repository access. */
export async function getExistingGitHubAuthenticationSession(authenticationService: IAuthenticationService, logService: ILogService, requiredScopes: readonly string[] = []): Promise<AuthenticationSession | undefined> {
	try {
		const sessions = await authenticationService.getSessions('github', [], { silent: true });
		if (requiredScopes.length) {
			return sessions.find(session => requiredScopes.every(scope => session.scopes.includes(scope)));
		}
		const repoScopeSession = sessions.find(session => session.scopes.includes('repo'));
		return repoScopeSession ?? sessions[0];
	} catch (error) {
		logService.trace('[PluginGitHubAuthentication] Silent GitHub session lookup failed:', error);
		return undefined;
	}
}
