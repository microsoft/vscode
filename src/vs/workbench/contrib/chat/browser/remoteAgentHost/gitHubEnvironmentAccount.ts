/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { localize } from '../../../../../nls.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { AuthenticationSession, AuthenticationSessionAccount, IAuthenticationService } from '../../../../services/authentication/common/authentication.js';

/** The authentication provider and scopes used to register GitHub environments. */
export function getGitHubEnvironmentAuthentication(product: IProductService): { readonly providerId: string; readonly scopes: readonly string[] } {
	return {
		providerId: product.defaultChatAgent?.provider?.default?.id ?? 'github',
		scopes: product.defaultChatAgent?.providerScopes?.[0] ?? ['read:user', 'user:email', 'repo', 'workflow'],
	};
}

/** Raised when no GitHub account can register GitHub environments, as opposed to a failure to look one up. */
export class GitHubEnvironmentAccountUnavailableError extends Error { }

/**
 * Returns the sessions that can register GitHub environments: those of the
 * Copilot default account, or of any account when there is no default
 * account. Signs in when none exist and `canPrompt` allows it.
 */
export async function getGitHubEnvironmentSessions(authentication: IAuthenticationService, product: IProductService, defaultAccount: IDefaultAccount | null, canPrompt: () => boolean): Promise<readonly AuthenticationSession[]> {
	const { providerId, scopes } = getGitHubEnvironmentAuthentication(product);
	let account: AuthenticationSessionAccount | undefined;
	if (defaultAccount) {
		if (defaultAccount.authenticationProvider.id !== providerId) {
			throw new GitHubEnvironmentAccountUnavailableError(localize('missionControlSharing.githubAccountRequired', "GitHub environment sharing requires a GitHub.com Copilot account."));
		}
		const allSessions = await authentication.getSessions(providerId, undefined, undefined, true);
		account = allSessions.find(session => session.id === defaultAccount.sessionId)?.account;
		if (!account) {
			throw new Error(localize('missionControlSharing.accountUnavailable', "The selected Copilot account is unavailable. Sign in to GitHub again to enable environment sharing."));
		}
	}
	const sessionOptions = account ? { account } : undefined;
	let sessions = await authentication.getSessions(providerId, [...scopes], sessionOptions, true);
	if (account) {
		const accountId = account.id;
		sessions = sessions.filter(session => session.account.id === accountId);
	}
	if (!sessions.length && canPrompt()) {
		const session = await authentication.createSession(providerId, [...scopes], sessionOptions).catch(error => {
			if (error === 'Cancelled' || (error instanceof Error && error.message === 'Cancelled')) {
				throw new CancellationError();
			}
			throw error;
		});
		if (account && session.account.id !== account.id) {
			throw new Error(localize('missionControlSharing.accountMismatch', "Sign in with the selected Copilot account to enable GitHub environment sharing."));
		}
		sessions = [session];
	}
	return sessions;
}
