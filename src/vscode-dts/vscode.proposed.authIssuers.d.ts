/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface AuthenticationProviderOptions {
		/**
		 * When specified, this provider will be associated with these issuers. They can still contain globs
		 * just like their extension contribution counterparts.
		 */
		readonly supportedIssuers?: Uri[];
	}

	export interface AuthenticationProviderSessionOptions {
		/**
		 * When specified, the authentication provider will use the provided issuer URL to
		 * authenticate the user. This is only used when a provider `supportsIssuerOverride` is set to true
		 */
		issuer?: Uri;
	}

	export interface AuthenticationGetSessionOptions {
		/**
		 * When specified, the authentication provider will use the provided issuer URL to
		 * authenticate the user. This is only used when a provider `supportsIssuerOverride` is set to true
		 */
		issuer?: Uri;
	}
}
