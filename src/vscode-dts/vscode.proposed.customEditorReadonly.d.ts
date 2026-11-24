/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface WebviewPanel {
		/**
		 * Whether the custom editor shown in this panel is read-only.
		 */
		readonly isReadonly: boolean;

		/**
		 * Fired when {@link isReadonly} changes.
		 */
		readonly onDidChangeReadonly: Event<boolean>;
	}
}
