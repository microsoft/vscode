/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export namespace authentication {
		/**
		 * Get an authentication session like {@link authentication.getSession}, but also accepts `undefined` in place of
		 * the scopes to ask for the default scopes that the editor defines for the provider.
		 *
		 * Only the `github` and `github-enterprise` providers define default scopes. Asking any other provider for its
		 * default scopes rejects.
		 *
		 * @param providerId The id of the provider to use
		 * @param scopeListOrRequest A scope list, a {@link AuthenticationWwwAuthenticateRequest}, or `undefined` for the default scopes of the provider
		 * @param options The {@link AuthenticationGetSessionOptions} to use
		 * @returns A thenable that resolves to an authentication session
		 */
		export function getSession(providerId: string, scopeListOrRequest: ReadonlyArray<string> | AuthenticationWwwAuthenticateRequest | undefined, options: AuthenticationGetSessionOptions & { /** */createIfNone: true | AuthenticationGetSessionPresentationOptions }): Thenable<AuthenticationSession>;

		/**
		 * Get an authentication session like {@link authentication.getSession}, but also accepts `undefined` in place of
		 * the scopes to ask for the default scopes that the editor defines for the provider.
		 *
		 * Only the `github` and `github-enterprise` providers define default scopes. Asking any other provider for its
		 * default scopes rejects.
		 *
		 * @param providerId The id of the provider to use
		 * @param scopeListOrRequest A scope list, a {@link AuthenticationWwwAuthenticateRequest}, or `undefined` for the default scopes of the provider
		 * @param options The {@link AuthenticationGetSessionOptions} to use
		 * @returns A thenable that resolves to an authentication session
		 */
		export function getSession(providerId: string, scopeListOrRequest: ReadonlyArray<string> | AuthenticationWwwAuthenticateRequest | undefined, options: AuthenticationGetSessionOptions & { /** literal-type defines return type */forceNewSession: true | AuthenticationGetSessionPresentationOptions | AuthenticationForceNewSessionOptions }): Thenable<AuthenticationSession>;

		/**
		 * Get an authentication session like {@link authentication.getSession}, but also accepts `undefined` in place of
		 * the scopes to ask for the default scopes that the editor defines for the provider.
		 *
		 * Only the `github` and `github-enterprise` providers define default scopes. Asking any other provider for its
		 * default scopes rejects.
		 *
		 * @param providerId The id of the provider to use
		 * @param scopeListOrRequest A scope list, a {@link AuthenticationWwwAuthenticateRequest}, or `undefined` for the default scopes of the provider
		 * @param options The {@link AuthenticationGetSessionOptions} to use
		 * @returns A thenable that resolves to an authentication session or undefined if a silent flow was used and no session was found
		 */
		export function getSession(providerId: string, scopeListOrRequest: ReadonlyArray<string> | AuthenticationWwwAuthenticateRequest | undefined, options?: AuthenticationGetSessionOptions): Thenable<AuthenticationSession | undefined>;
	}
}
