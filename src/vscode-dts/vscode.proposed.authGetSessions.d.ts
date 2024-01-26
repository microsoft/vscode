/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/152399

	export interface AuthenticationForceNewSessionOptions {
		/**
		 * The session that you are asking to be recreated. The Auth Provider can use this to
		 * help guide the user to log in to the correct account.
		 */
		sessionToRecreate?: AuthenticationSession;
	}

	export namespace authentication {
		/**
		 * Get all authentication sessions matching the desired scopes that this extension has access to. In order to request access,
		 * use {@link getSession}. To request an additional account, specify {@link AuthenticationGetSessionOptions.clearSessionPreference}
		 * and {@link AuthenticationGetSessionOptions.createIfNone} together.
		 *
		 * Currently, there are only two authentication providers that are contributed from built in extensions
		 * to the editor that implement GitHub and Microsoft authentication: their providerId's are 'github' and 'microsoft'.
		 *
		 * @param providerId The id of the provider to use
		 * @param scopes A list of scopes representing the permissions requested. These are dependent on the authentication provider
		 * @returns A thenable that resolves to a readonly array of authentication sessions.
		 */
		export function getSessions(providerId: string, scopes: readonly string[]): Thenable<readonly AuthenticationSession[]>;
	}

	/**
	 * The options passed in to the provider when creating a session.
	 */
	export interface AuthenticationProviderCreateSessionOptions {
		/**
		 * The session that is being asked to be recreated. If this is passed in, the provider should
		 * attempt to recreate the session based on the information in this session.
		 */
		sessionToRecreate?: AuthenticationSession;
	}

	export interface AuthenticationProvider {
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
		createSession(scopes: readonly string[], options: AuthenticationProviderCreateSessionOptions): Thenable<AuthenticationSession>;
	}
}
