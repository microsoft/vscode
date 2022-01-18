/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface Comment {
		/**
		 * An optional detail that will be displayed less prominently than the `author`.
		 * If a date is provided, then the date will be formatted according to the user's
		 * locale and settings.
		 */
		detail?: Date | string
	}
}
