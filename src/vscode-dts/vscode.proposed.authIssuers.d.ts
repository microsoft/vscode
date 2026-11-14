/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/248775

	export interface AuthenticationSession {
		/**
		 * The authorization server that issued this session, when provided by the authentication provider.
		 * This identifies the OAuth server, not a REST API endpoint or resource audience.
		 */
		readonly authorizationServer?: Uri;
	}

	export interface AuthenticationProviderOptions {
		/**
		 * When specified, this provider will be associated with these authorization servers. They can still contain globs
		 * just like their extension contribution counterparts.
		 */
		readonly supportedAuthorizationServers?: Uri[];
	}

	export interface AuthenticationProviderSessionOptions {
		/**
		 * When specified, the authentication provider will use the provided authorization server URL to
		 * authenticate the user. This is only used when a provider has `supportedAuthorizationServers` set
		 */
		authorizationServer?: Uri;

		/**
		 * When specified, the authentication provider will use the provided client ID for the OAuth flow
		 * instead of its default client ID.
		 */
		clientId?: string;

		/**
		 * When specified, the authentication provider will request a token bound to this resource URI
		 * (RFC 8707 resource indicator). The provider should forward this to the authorization server
		 * so the issued access token is audience-restricted to the given resource.
		 */
		resource?: string;
	}

	export interface AuthenticationGetSessionOptions {
		/**
		 * When specified, the authentication provider will use the provided authorization server URL to
		 * authenticate the user. This is only used when a provider has `supportedAuthorizationServers` set
		 * @example
		 * ```ts
		 * const session = await vscode.authentication.getSession('github', ['repo'], {
		 *     authorizationServer: Uri.parse('[https://login.example.com](https://login.example.com)')
		 * });
		 * ```
		 */
		authorizationServer?: Uri;

		/**
		 * When specified, the authentication provider will use the provided client ID for the OAuth flow
		 * instead of its default client ID.
		 */
		clientId?: string;

		/**
		 * When specified, the authentication provider will request a token bound to this resource URI
		 * (RFC 8707 resource indicator). The provider should forward this to the authorization server
		 * so the issued access token is audience-restricted to the given resource.
		 * @example
		 * ```ts
		 * const session = await vscode.authentication.getSession('azure', ['/.default'], {
		 *     resource: '[https://database.windows.net/](https://database.windows.net/)'
		 * });
		 * ```
		 */
		resource?: string;
	}
}
