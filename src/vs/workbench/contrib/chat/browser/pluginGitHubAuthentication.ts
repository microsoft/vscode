/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../platform/log/common/log.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';

/**
 * Returns an existing GitHub session token without prompting. Prefers a `repo`-scoped session.
 */
export async function getExistingGitHubAuthenticationToken(authenticationService: IAuthenticationService, logService: ILogService): Promise<string | undefined> {
	try {
		const sessions = await authenticationService.getSessions('github', [], { silent: true });
		const repoScopeSession = sessions.find(session => session.scopes.includes('repo'));
		return repoScopeSession?.accessToken ?? sessions[0]?.accessToken;
	} catch (error) {
		logService.trace('[PluginGitHubAuthentication] Silent GitHub session lookup failed:', error);
		return undefined;
	}
}
