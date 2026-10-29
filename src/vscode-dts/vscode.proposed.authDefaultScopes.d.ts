/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * A request for the default scopes that the editor defines for an authentication provider.
	 *
	 * Only the `github` and `github-enterprise` providers define default scopes. Requests for any
	 * other provider are rejected.
	 */
	export interface AuthenticationDefaultScopesRequest {
		/**
		 * Ask for the default scopes that the editor defines for the provider.
		 */
		readonly defaultScopes: true;

		/**
		 * Extra scopes that are requested on top of the default scopes.
		 */
		readonly additionalScopes?: readonly string[];
	}

	export namespace authentication {
		/**
		 * Get an authentication session that has at least the default scopes that the editor defines for the provider,
		 * plus any {@link AuthenticationDefaultScopesRequest.additionalScopes additional scopes}. A session with exactly
		 * these scopes is preferred, but a session with more scopes also satisfies the request. Rejects if the provider
		 * does not define default scopes, if a provider with providerId is not registered, or if the user does not consent
		 * to sharing authentication information with the extension.
		 *
		 * The {@link AuthenticationSession.scopes scopes} of the returned session are the concrete scopes of the session.
		 *
		 * @param providerId The id of the provider to use
		 * @param request The default scopes request
		 * @param options The {@link AuthenticationGetSessionOptions} to use
		 * @returns A thenable that resolves to an authentication session
		 */
		export function getSession(providerId: string, request: AuthenticationDefaultScopesRequest, options: AuthenticationGetSessionOptions & { /** */createIfNone: true | AuthenticationGetSessionPresentationOptions }): Thenable<AuthenticationSession>;

		/**
		 * Get an authentication session that has at least the default scopes that the editor defines for the provider,
		 * plus any {@link AuthenticationDefaultScopesRequest.additionalScopes additional scopes}. A session with exactly
		 * these scopes is preferred, but a session with more scopes also satisfies the request. Rejects if the provider
		 * does not define default scopes, if a provider with providerId is not registered, or if the user does not consent
		 * to sharing authentication information with the extension.
		 *
		 * The {@link AuthenticationSession.scopes scopes} of the returned session are the concrete scopes of the session.
		 *
		 * @param providerId The id of the provider to use
		 * @param request The default scopes request
		 * @param options The {@link AuthenticationGetSessionOptions} to use
		 * @returns A thenable that resolves to an authentication session
		 */
		export function getSession(providerId: string, request: AuthenticationDefaultScopesRequest, options: AuthenticationGetSessionOptions & { /** literal-type defines return type */forceNewSession: true | AuthenticationGetSessionPresentationOptions | AuthenticationForceNewSessionOptions }): Thenable<AuthenticationSession>;

		/**
		 * Get an authentication session that has at least the default scopes that the editor defines for the provider,
		 * plus any {@link AuthenticationDefaultScopesRequest.additionalScopes additional scopes}. A session with exactly
		 * these scopes is preferred, but a session with more scopes also satisfies the request. Rejects if the provider
		 * does not define default scopes, if a provider with providerId is not registered, or if the user does not consent
		 * to sharing authentication information with the extension.
		 *
		 * The {@link AuthenticationSession.scopes scopes} of the returned session are the concrete scopes of the session.
		 *
		 * @param providerId The id of the provider to use
		 * @param request The default scopes request
		 * @param options The {@link AuthenticationGetSessionOptions} to use
		 * @returns A thenable that resolves to an authentication session or undefined if a silent flow was used and no session was found
		 */
		export function getSession(providerId: string, request: AuthenticationDefaultScopesRequest, options?: AuthenticationGetSessionOptions): Thenable<AuthenticationSession | undefined>;
	}
}
