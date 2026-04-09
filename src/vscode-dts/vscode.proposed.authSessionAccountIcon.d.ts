/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// https://github.com/microsoft/vscode/issues/000000

	export interface AuthenticationSessionAccountInformation {
		/**
		 * An optional icon URL string for the account. This is typically a URL to a profile image/avatar.
		 */
		readonly iconUrl?: string;
	}
}
