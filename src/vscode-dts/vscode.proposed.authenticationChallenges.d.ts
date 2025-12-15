/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/267992
	// and historically: https://github.com/microsoft/vscode/issues/260156

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
