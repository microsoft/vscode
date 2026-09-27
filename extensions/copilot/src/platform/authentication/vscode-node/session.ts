/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { authentication, AuthenticationGetSessionOptions, AuthenticationSession, AuthenticationSessionsChangeEvent } from 'vscode';
import { mixin } from '../../../util/vs/base/common/objects';
import { URI } from '../../../util/vs/base/common/uri';
import { AuthPermissionMode, AuthProviderId, ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { authProviderId, GITHUB_SCOPE_ALIGNED, GITHUB_SCOPE_READ_USER, GITHUB_SCOPE_USER_EMAIL, MinimalModeError } from '../common/authentication';
import { resolveGitHubSessionUri } from '../common/enterprise';

export const SESSION_LOGIN_MESSAGE = 'You are not signed in to GitHub. Please sign in to use Copilot.';
// These types are subsets of the "real" types AuthenticationSessionAccountInformation and
// AuthenticationSession. They allow us to use the type system to validate which fields
// are actually needed and hence which ones need values when we construct fake session.
type CopilotAuthenticationSessionAccountInformation = {
	label: string;
};

export type CopilotAuthenticationSession = {
	accessToken: string;
	account: CopilotAuthenticationSessionAccountInformation;
};

async function getAuthSession(providerId: AuthProviderId, defaultScopes: string[], getSilentSession: () => Promise<AuthenticationSession | undefined>, options: AuthenticationGetSessionOptions = {}) {
	const accounts = await authentication.getAccounts(providerId);
	let session: AuthenticationSession | undefined;
	if (!accounts.length) {
		session = await authentication.getSession(providerId, defaultScopes, options);
	} else if (options.forceNewSession) {
		session = await authentication.getSession(providerId, defaultScopes, {
			...options,
			forceNewSession: mixin({ learnMore: URI.parse('https://aka.ms/copilotRepoScope') }, options.forceNewSession),
			clearSessionPreference: true
		});
	} else {
		session = await getSilentSession() ?? await authentication.getSession(providerId, defaultScopes, options);
	}
	if (session) {
		resolveGitHubSessionUri(session, providerId);
	}
	return session;
}

/**
 * Cast a wide net to get a session with any of the scopes that Copilot needs.
 * @param configurationService for determining the auth provider
 * @returns an auth session with any of the scopes that Copilot needs, or undefined if none is found
 * @deprecated use `IAuthenticationService` instead
 */
export function getAnyAuthSession(configurationService: IConfigurationService, options?: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined> {
	const providerId = authProviderId(configurationService);
	const silentOptions = { silent: true, account: options?.account, authorizationServer: options?.authorizationServer };

	return getAuthSession(
		providerId,
		GITHUB_SCOPE_USER_EMAIL,
		async () => {
			// Ask for aligned scopes first, since that's what we want to use going forward.
			if (configurationService.getConfig(ConfigKey.Shared.AuthPermissions) !== AuthPermissionMode.Minimal) {
				const permissive = await authentication.getSession(providerId, GITHUB_SCOPE_ALIGNED, silentOptions);
				if (permissive) {
					return permissive;
				}
			}
			const minimal = await authentication.getSession(providerId, GITHUB_SCOPE_USER_EMAIL, silentOptions);
			if (minimal) {
				return minimal;
			}
			// This is what Completions extension use to ask for and is here mostly for backwards compatibility.
			const fallback = await authentication.getSession(providerId, GITHUB_SCOPE_READ_USER, silentOptions);
			if (fallback) {
				return fallback;
			}
			return undefined;
		},
		options
	);
}

/**
 * Get a session with an access token that has the same scopes as other GitHub extensions like GitHub Pull Requests.
 * @param configurationService for determining the auth provider
 * @param options what get passed in to getSession
 * @returns an auth session with a token with the aligned scopes, or undefined if none is found
 * @deprecated use `IAuthenticationService` instead
 */
export function getAlignedSession(configurationService: IConfigurationService, options: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined> {
	if (configurationService.getConfig(ConfigKey.Shared.AuthPermissions) === AuthPermissionMode.Minimal) {
		if (options.createIfNone || options.forceNewSession) {
			throw new MinimalModeError();
		}
		return Promise.resolve(undefined);
	}
	const providerId = authProviderId(configurationService);
	return getAuthSession(
		providerId,
		GITHUB_SCOPE_ALIGNED,
		async () => await authentication.getSession(providerId, GITHUB_SCOPE_ALIGNED, { silent: true, account: options.account, authorizationServer: options.authorizationServer }),
		options
	);
}

export function authChangeAffectsCopilot(event: AuthenticationSessionsChangeEvent, configurationService: IConfigurationService): boolean {
	const provider = event.provider;
	const providerId = authProviderId(configurationService);
	return provider.id === providerId;
}
