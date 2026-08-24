/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface AuthenticationSessionAccountInformation {
		/**
		 * An optional icon for the account. This is typically a URI to a profile image/avatar.
		 */
		readonly icon?: Uri;
	}
}
