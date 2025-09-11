/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/260156

	/**********
	 * "Extension asking for auth" API
	 *******/

	/**
	 * Represents parameters for creating a session based on a WWW-Authenticate header value.
	 * This is used when an API returns a 401 with a WWW-Authenticate header indicating
	 * that additional authentication is required. The details of which will be passed down
	 * to the authentication provider to create a session.
	 *
	 * @note The authorization provider must support handling challenges and specifically
	 * the challenges in this WWW-Authenticate value.
	 * @note For more information on WWW-Authenticate please see https://developer.mozilla.org/docs/Web/HTTP/Reference/Headers/WWW-Authenticate
	 */
	export interface AuthenticationWwwAuthenticateRequest {
		/**
		 * The raw WWW-Authenticate header value that triggered this challenge.
		 * This will be parsed by the authentication provider to extract the necessary
		 * challenge information.
		 */
		readonly wwwAuthenticate: string;

		/**
		 * The fallback scopes to use if no scopes are found in the WWW-Authenticate header.
		 */
		readonly fallbackScopes?: readonly string[];

		/**
		 * @deprecated Use `fallbackScopes` instead.
		 */
		readonly scopes?: readonly string[];
	}

	export namespace authentication {
		/**
		 * Get an authentication session matching the desired scopes or satisfying the WWW-Authenticate request. Rejects if
		 * a provider with providerId is not registered, or if the user does not consent to sharing authentication information
		 * with the extension. If there are multiple sessions with the same scopes, the user will be shown a quickpick to
		 * select which account they would like to use.
		 *
		 * Built-in auth providers include:
		 * * 'github' - For GitHub.com
		 * * 'microsoft' For both personal & organizational Microsoft accounts
		 * * (less common) 'github-enterprise' - for alternative GitHub hostings, GHE.com, GitHub Enterprise Server
		 * * (less common) 'microsoft-sovereign-cloud' - for alternative Microsoft clouds
		 *
		 * @param providerId The id of the provider to use
		 * @param scopeListOrRequest A scope list of permissions requested or a WWW-Authenticate request. These are dependent on the authentication provider.
		 * @param options The {@link AuthenticationGetSessionOptions} to use
		 * @returns A thenable that resolves to an authentication session
		 */
		export function getSession(providerId: string, scopeListOrRequest: ReadonlyArray<string> | AuthenticationWwwAuthenticateRequest, options: AuthenticationGetSessionOptions & { /** */createIfNone: true | AuthenticationGetSessionPresentationOptions }): Thenable<AuthenticationSession>;

		/**
		 * Get an authentication session matching the desired scopes or request. Rejects if a provider with providerId is not
		 * registered, or if the user does not consent to sharing authentication information with the extension. If there
		 * are multiple sessions with the same scopes, the user will be shown a quickpick to select which account they would like to use.
		 *
		 * Built-in auth providers include:
		 * * 'github' - For GitHub.com
		 * * 'microsoft' For both personal & organizational Microsoft accounts
		 * * (less common) 'github-enterprise' - for alternative GitHub hostings, GHE.com, GitHub Enterprise Server
		 * * (less common) 'microsoft-sovereign-cloud' - for alternative Microsoft clouds
		 *
		 * @param providerId The id of the provider to use
		 * @param scopeListOrRequest A scope list of permissions requested or a WWW-Authenticate request. These are dependent on the authentication provider.
		 * @param options The {@link AuthenticationGetSessionOptions} to use
		 * @returns A thenable that resolves to an authentication session
		 */
		export function getSession(providerId: string, scopeListOrRequest: ReadonlyArray<string> | AuthenticationWwwAuthenticateRequest, options: AuthenticationGetSessionOptions & { /** literal-type defines return type */forceNewSession: true | AuthenticationGetSessionPresentationOptions | AuthenticationForceNewSessionOptions }): Thenable<AuthenticationSession>;

		/**
		 * Get an authentication session matching the desired scopes or request. Rejects if a provider with providerId is not
		 * registered, or if the user does not consent to sharing authentication information with the extension. If there
		 * are multiple sessions with the same scopes, the user will be shown a quickpick to select which account they would like to use.
		 *
		 * Built-in auth providers include:
		 * * 'github' - For GitHub.com
		 * * 'microsoft' For both personal & organizational Microsoft accounts
		 * * (less common) 'github-enterprise' - for alternative GitHub hostings, GHE.com, GitHub Enterprise Server
		 * * (less common) 'microsoft-sovereign-cloud' - for alternative Microsoft clouds
		 *
		 * @param providerId The id of the provider to use
		 * @param scopeListOrRequest A scope list of permissions requested or a WWW-Authenticate request. These are dependent on the authentication provider.
		 * @param options The {@link AuthenticationGetSessionOptions} to use
		 * @returns A thenable that resolves to an authentication session or undefined if a silent flow was used and no session was found
		 */
		export function getSession(providerId: string, scopeListOrRequest: ReadonlyArray<string> | AuthenticationWwwAuthenticateRequest, options?: AuthenticationGetSessionOptions): Thenable<AuthenticationSession | undefined>;
	}


	/**********
	 * "Extension providing auth" API
	 * NOTE: This doesn't need to be finalized with the above
	 *******/

	/**
	 * Represents an authentication challenge from a WWW-Authenticate header.
	 * This is used to handle cases where additional authentication steps are required,
	 * such as when mandatory multi-factor authentication (MFA) is enforced.
	 *
	 * @note For more information on WWW-Authenticate please see https://developer.mozilla.org/docs/Web/HTTP/Reference/Headers/WWW-Authenticate
	 */
	export interface AuthenticationChallenge {
		/**
		 * The authentication scheme (e.g., 'Bearer').
		 */
		readonly scheme: string;

		/**
		 * Parameters for the authentication challenge.
		 * For Bearer challenges, this may include 'claims', 'scope', 'realm', etc.
		 */
		readonly params: Record<string, string>;
	}

	/**
	 * Represents constraints for authentication, including challenges and optional scopes.
	 * This is used when creating or retrieving sessions that must satisfy specific authentication
	 * requirements from WWW-Authenticate headers.
	 *
	 * @note For more information on WWW-Authenticate please see https://developer.mozilla.org/docs/Web/HTTP/Reference/Headers/WWW-Authenticate
	 */
	export interface AuthenticationConstraint {
		/**
		 * Array of authentication challenges parsed from WWW-Authenticate headers.
		 */
		readonly challenges: readonly AuthenticationChallenge[];

		/**
		 * Optional scopes for the session. If not provided, the authentication provider
		 * may extract scopes from the challenges or use default scopes.
		 */
		readonly fallbackScopes?: readonly string[];
	}

	/**
	 * An authentication provider that supports challenge-based authentication.
	 * This extends the base AuthenticationProvider with methods to handle authentication
	 * challenges from WWW-Authenticate headers.
	 *
	 * TODO: Enforce that both of these functions should be defined by creating a new AuthenticationProviderWithChallenges interface.
	 * But this can be done later since this part doesn't need finalization.
	 */
	export interface AuthenticationProvider {
		/**
		 * Get existing sessions that match the given authentication constraints.
		 *
		 * @param constraint The authentication constraint containing challenges and optional scopes
		 * @param options Options for the session request
		 * @returns A thenable that resolves to an array of existing authentication sessions
		 */
		getSessionsFromChallenges?(constraint: AuthenticationConstraint, options: AuthenticationProviderSessionOptions): Thenable<readonly AuthenticationSession[]>;

		/**
		 * Create a new session based on authentication constraints.
		 * This is called when no existing session matches the constraint requirements.
		 *
		 * @param constraint The authentication constraint containing challenges and optional scopes
		 * @param options Options for the session creation
		 * @returns A thenable that resolves to a new authentication session
		 */
		createSessionFromChallenges?(constraint: AuthenticationConstraint, options: AuthenticationProviderSessionOptions): Thenable<AuthenticationSession>;
	}

	export interface AuthenticationProviderOptions {
		supportsChallenges?: boolean;
	}
}
