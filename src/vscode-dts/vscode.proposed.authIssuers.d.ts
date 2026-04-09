/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
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
	}

	export interface AuthenticationGetSessionOptions {
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
	}
}
