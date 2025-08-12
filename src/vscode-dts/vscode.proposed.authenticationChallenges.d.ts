/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/260156

	/**
	 * Represents an authentication challenge from a WWW-Authenticate header.
	 * This is used to handle cases where additional authentication steps are required,
	 * such as when mandatory multi-factor authentication (MFA) is enforced.
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
	 * Represents parameters for creating a session based on an authentication challenge.
	 * This is used when an API returns a 401 with a WWW-Authenticate header indicating
	 * that additional authentication steps or claims are required.
	 */
	export interface AuthenticationSessionChallenge {
		/**
		 * The raw WWW-Authenticate header value that triggered this challenge.
		 * This will be parsed by the authentication provider to extract the necessary
		 * challenge information.
		 */
		readonly challenge: string;

		/**
		 * Optional scopes for the session. If not provided, the authentication provider
		 * may use default scopes or extract them from the challenge.
		 */
		readonly scopes?: readonly string[];
	}

	export namespace authentication {
		/**
		 * Get an authentication session based on a challenge from a WWW-Authenticate header.
		 * This is used when an API call returns a 401 with additional authentication requirements,
		 * such as when mandatory multi-factor authentication (MFA) is enforced.
		 *
		 * The challenge parameter contains the WWW-Authenticate header value that will be parsed
		 * by the authentication provider to determine what additional steps are needed.
		 *
		 * @param providerId The id of the provider to use
		 * @param challenge The authentication challenge containing scopes and WWW-Authenticate header
		 * @param options The {@link AuthenticationGetSessionOptions} to use
		 * @returns A thenable that resolves to an authentication session
		 */
		export function getSession(providerId: string, challenge: AuthenticationSessionChallenge, options: AuthenticationGetSessionOptions & { createIfNone: true }): Thenable<AuthenticationSession>;

		/**
		 * Get an authentication session based on a challenge from a WWW-Authenticate header.
		 * This is used when an API call returns a 401 with additional authentication requirements,
		 * such as when mandatory multi-factor authentication (MFA) is enforced.
		 *
		 * @param providerId The id of the provider to use
		 * @param challenge The authentication challenge containing scopes and WWW-Authenticate header
		 * @param options The {@link AuthenticationGetSessionOptions} to use
		 * @returns A thenable that resolves to an authentication session if available, or undefined if there are no sessions
		 */
		export function getSession(providerId: string, challenge: AuthenticationSessionChallenge, options?: AuthenticationGetSessionOptions): Thenable<AuthenticationSession | undefined>;
	}

	/**
	 * Represents constraints for authentication, including challenges and optional scopes.
	 * This is used when creating or retrieving sessions that must satisfy specific authentication
	 * requirements from WWW-Authenticate headers.
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
		readonly scopes?: readonly string[];
	}

	/**
	 * An authentication provider that supports challenge-based authentication.
	 * This extends the base AuthenticationProvider with methods to handle authentication
	 * challenges from WWW-Authenticate headers.
	 */
	export interface AuthenticationProviderWithChallenges extends AuthenticationProvider {
		/**
		 * Get existing sessions that match the given authentication constraints.
		 * 
		 * @param constraint The authentication constraint containing challenges and optional scopes
		 * @param options Options for the session request
		 * @returns A thenable that resolves to an array of existing authentication sessions
		 */
		getSessionsFromChallenges(constraint: AuthenticationConstraint, options: AuthenticationProviderSessionOptions): Thenable<readonly AuthenticationSession[]>;

		/**
		 * Create a new session based on authentication constraints.
		 * This is called when no existing session matches the constraint requirements.
		 * 
		 * @param constraint The authentication constraint containing challenges and optional scopes
		 * @param options Options for the session creation
		 * @returns A thenable that resolves to a new authentication session
		 */
		createSessionFromChallenges(constraint: AuthenticationConstraint, options: AuthenticationProviderSessionOptions): Thenable<AuthenticationSession>;
	}
}