/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/316625

	export interface AuthenticationProviderSessionOptions {
		/**
		 * (Preview) The audience for the requested access token. Primarily used for OAuth Identity
		 * Assertion Authorization Grant (ID-JAG; draft-ietf-oauth-identity-assertion-authz-grant)
		 * flows where the audience is the authorization server URL of the resource that will redeem
		 * the assertion. Combine with {@link resource} which carries the resource indicator (RFC 8707).
		 * Providers that do not understand audience-bound tokens should ignore this option.
		 */
		audience?: string;
	}

	export interface AuthenticationGetSessionOptions {
		/**
		 * (Preview) The audience for the requested access token. Primarily used for OAuth Identity
		 * Assertion Authorization Grant (ID-JAG) flows where the audience is the authorization server
		 * URL of the resource that will redeem the assertion. Combine with {@link resource} (RFC 8707).
		 */
		audience?: string;
	}
}
