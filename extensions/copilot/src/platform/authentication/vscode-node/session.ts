/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { authentication, AuthenticationDefaultScopesRequest, AuthenticationGetSessionOptions, AuthenticationSession } from 'vscode';
import { mixin } from '../../../util/vs/base/common/objects';
import { URI } from '../../../util/vs/base/common/uri';
import { AuthPermissionMode, AuthProviderId, ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { authProviderId, GITHUB_SCOPE_READ_USER, GITHUB_SCOPE_USER_EMAIL, MinimalModeError } from '../common/authentication';
import { resolveGitHubSessionUri } from '../common/enterprise';

export const SESSION_LOGIN_MESSAGE = 'You are not signed in to GitHub. Please sign in to use Copilot.';

/**
 * Asks for the default GitHub scopes that VS Code defines, which are the same scopes that other GitHub extensions
 * like GitHub Pull Requests use.
 */
const GITHUB_DEFAULT_SCOPES_REQUEST: AuthenticationDefaultScopesRequest = { defaultScopes: true };

function getSession(providerId: AuthProviderId, scopesOrRequest: string[] | AuthenticationDefaultScopesRequest, options: AuthenticationGetSessionOptions): Thenable<AuthenticationSession | undefined> {
	// Each request kind has its own `getSession` overload.
	return Array.isArray(scopesOrRequest)
		? authentication.getSession(providerId, scopesOrRequest, options)
		: authentication.getSession(providerId, scopesOrRequest, options);
}

async function getAuthSession(providerId: AuthProviderId, scopesOrRequest: string[] | AuthenticationDefaultScopesRequest, getSilentSession: () => Promise<AuthenticationSession | undefined>, options: AuthenticationGetSessionOptions = {}) {
	const accounts = await authentication.getAccounts(providerId);
	let session: AuthenticationSession | undefined;
	if (!accounts.length) {
		session = await getSession(providerId, scopesOrRequest, options);
	} else if (options.forceNewSession) {
		session = await getSession(providerId, scopesOrRequest, {
			...options,
			forceNewSession: mixin({ learnMore: URI.parse('https://aka.ms/copilotRepoScope') }, options.forceNewSession),
			clearSessionPreference: true
		});
	} else {
		session = await getSilentSession() ?? await getSession(providerId, scopesOrRequest, options);
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
				let permissive: AuthenticationSession | undefined;
				try {
					permissive = await authentication.getSession(providerId, GITHUB_DEFAULT_SCOPES_REQUEST, silentOptions);
				} catch {
					// The default scopes are only preferred here, so a build that does not define them must still find a
					// minimal session. Any other failure of the provider is reported by the lookups below.
				}
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
		GITHUB_DEFAULT_SCOPES_REQUEST,
		async () => await authentication.getSession(providerId, GITHUB_DEFAULT_SCOPES_REQUEST, { silent: true, account: options.account, authorizationServer: options.authorizationServer }),
		options
	);
}
