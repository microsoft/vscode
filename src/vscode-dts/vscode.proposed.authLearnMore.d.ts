/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/206587

	export interface AuthenticationForceNewSessionOptions {
		/**
		 * An optional Uri to open in the browser to learn more about this authentication request.
		 */
		learnMore?: Uri;
	}
}
