/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/152399

	// FOR THE CONSUMER

	export namespace authentication {
		/**
		 * Get all accounts that the user is logged in to for the specified provider.
		 * Use this paired with {@link getSession} in order to get an authentication session for a specific account.
		 *
		 * Currently, there are only two authentication providers that are contributed from built in extensions
		 * to the editor that implement GitHub and Microsoft authentication: their providerId's are 'github' and 'microsoft'.
		 *
		 * Note: Getting accounts does not imply that your extension has access to that account or its authentication sessions. You can verify access to the account by calling {@link getSession}.
		 *
			 * @param providerId The id of the provider to use
			 * @returns A thenable that resolves to a readonly array of authentication accounts.
			 */
		export function getAccounts(providerId: string): Thenable<readonly AuthenticationSessionAccountInformation[]>;
	}

	export interface AuthenticationGetSessionOptions {
		/**
		 * The account that you would like to get a session for. This is passed down to the Authentication Provider to be used for creating the correct session.
		 */
		account?: AuthenticationSessionAccountInformation;
	}

	// FOR THE AUTH PROVIDER

	export interface AuthenticationProviderSessionOptions {
		/**
		 * The account that is being asked about. If this is passed in, the provider should
		 * attempt to return the sessions that are only related to this account.
		 */
		account?: AuthenticationSessionAccountInformation;
	}

	export interface AuthenticationProvider {
		/**
		 * Get a list of sessions.
		 * @param scopes An optional list of scopes. If provided, the sessions returned should match
		 * these permissions, otherwise all sessions should be returned.
		 * @param options Additional options for getting sessions.
		 * @returns A promise that resolves to an array of authentication sessions.
		 */
		getSessions(scopes: readonly string[] | undefined, options: AuthenticationProviderSessionOptions): Thenable<AuthenticationSession[]>;
		/**
		 * Prompts a user to login.
		 *
		 * If login is successful, the onDidChangeSessions event should be fired.
		 *
		 * If login fails, a rejected promise should be returned.
		 *
		 * If the provider has specified that it does not support multiple accounts,
		 * then this should never be called if there is already an existing session matching these
		 * scopes.
		 * @param scopes A list of scopes, permissions, that the new session should be created with.
		 * @param options Additional options for creating a session.
		 * @returns A promise that resolves to an authentication session.
		 */
		createSession(scopes: readonly string[], options: AuthenticationProviderSessionOptions): Thenable<AuthenticationSession>;
	}
}
