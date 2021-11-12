/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * More options to be used when getting an {@link AuthenticationSession} from an {@link AuthenticationProvider}.
	 */
	export interface AuthenticationGetSessionOptions {
		/**
		 * Whether we should attempt to reauthenticate even if there is already a session available.
		 *
		 * If true, a modal dialog will be shown asking the user to sign in again. This is mostly used for scenarios
		 * where the token needs to be re minted because it has lost some authorization.
		 *
		 * Defaults to false.
		 */
		forceNewSession?: boolean | { detail: string };
	}

	export namespace authentication {
		/**
		 * Get an authentication session matching the desired scopes. Rejects if a provider with providerId is not
		 * registered, or if the user does not consent to sharing authentication information with
		 * the extension. If there are multiple sessions with the same scopes, the user will be shown a
		 * quickpick to select which account they would like to use.
		 *
		 * Currently, there are only two authentication providers that are contributed from built in extensions
		 * to the editor that implement GitHub and Microsoft authentication: their providerId's are 'github' and 'microsoft'.
		 * @param providerId The id of the provider to use
		 * @param scopes A list of scopes representing the permissions requested. These are dependent on the authentication provider
		 * @param options The {@link AuthenticationGetSessionOptions} to use
		 * @returns A thenable that resolves to an authentication session
		 */
		export function getSession(providerId: string, scopes: readonly string[], options: AuthenticationGetSessionOptions & { forceNewSession: true | { detail: string } }): Thenable<AuthenticationSession>;
		export function hasSession(providerId: string, scopes: readonly string[]): Thenable<boolean>;
	}
}
