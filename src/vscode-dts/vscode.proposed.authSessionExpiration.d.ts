/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface AuthenticationSession {
		/**
		 * The access token's remaining lifetime, in seconds, when the authentication provider returns the session.
		 *
		 * This corresponds to `expires_in` in an OAuth 2.0 token response. Providers returning
		 * cached sessions must recompute this value. This is undefined when the authentication
		 * provider does not know the access token's expiry. When defined, this must be a positive integer.
		 */
		readonly expiresIn?: number;
	}
}
