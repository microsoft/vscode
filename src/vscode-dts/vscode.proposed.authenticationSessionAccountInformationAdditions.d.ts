/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface AuthenticationSessionAccountInformation {
		/**
		 * URI to the avatar image of the authentication session. Will be rendered in the activity bar.
		 */
		readonly avatar?: Uri;
	}
}
