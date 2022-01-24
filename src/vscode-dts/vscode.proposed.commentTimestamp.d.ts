/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface Comment {
		/**
		 * An optional timestamp that will be displayed in comments.
		 * The date will be formatted according to the user's locale and settings.
		 */
		timestamp?: Date;
	}
}
