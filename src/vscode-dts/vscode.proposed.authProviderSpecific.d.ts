/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/251648

	export interface AuthenticationProviderSessionOptions {
		/**
		 * Allows the authentication provider to take in additional parameters.
		 * It is up to the provider to define what these parameters are and handle them.
		 * This is useful for passing in additional information that is specific to the provider
		 * and not part of the standard authentication flow.
		 */
		[key: string]: any;
	}

	// TODO: Implement this interface if needed via an extension
	// export interface AuthenticationGetSessionOptions {
	// 	/**
	// 	 * Allows the authentication provider to take in additional parameters.
	// 	 * It is up to the provider to define what these parameters are and handle them.
	// 	 * This is useful for passing in additional information that is specific to the provider
	// 	 * and not part of the standard authentication flow.
	// 	 */
	// 	[key: string]: any;
	// }
}
